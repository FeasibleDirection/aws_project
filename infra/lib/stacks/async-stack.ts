import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Construct } from "constructs";
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import { EventBus, Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction, SqsQueue } from "aws-cdk-lib/aws-events-targets";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Topic } from "aws-cdk-lib/aws-sns";
import {
  DynamoEventSource,
  SqsEventSource,
} from "aws-cdk-lib/aws-lambda-event-sources";
import { FilterCriteria, FilterRule, StartingPosition } from "aws-cdk-lib/aws-lambda";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import { CrudFunction } from "../constructs/crud-function";

const here = dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = resolve(here, "../../../apps/api/src/events");

export interface AsyncStackProps extends StackProps {
  /** Orders table (from CoreApiStack) — its stream is the CDC source. */
  readonly table: Table;
}

/**
 * Event-driven half: DynamoDB Streams → publisher → EventBridge → SQS(+DLQ) →
 * consumer → SNS, plus a scheduled cleanup. Depends on CoreApiStack (the table).
 */
export class AsyncStack extends Stack {
  /** Exposed so OrchestrationStack can subscribe to order.created. */
  readonly bus: EventBus;

  constructor(scope: Construct, id: string, props: AsyncStackProps) {
    super(scope, id, props);
    const { table } = props;

    this.bus = new EventBus(this, "OrdersBus", { eventBusName: "orders-bus" });
    const bus = this.bus;
    const topic = new Topic(this, "OrderNotifications", {
      topicName: "order-notifications",
    });

    const dlq = new Queue(this, "OrderDLQ", { retentionPeriod: Duration.days(14) });
    const queue = new Queue(this, "OrderQueue", {
      visibilityTimeout: Duration.seconds(60),
      // poison messages move to the DLQ after 3 failed receives
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    // 1) DynamoDB Streams → publisher → EventBridge (CDC; avoids dual-write)
    const publisher = new CrudFunction(this, "StreamPublisherFn", {
      entry: resolve(EVENTS_DIR, "stream-publisher.ts"),
      environment: { EVENT_BUS_NAME: bus.eventBusName },
      description: "DynamoDB stream → EventBridge order.created",
    }).fn;
    publisher.addEventSource(
      new DynamoEventSource(table, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 10,
        retryAttempts: 3,
        bisectBatchOnError: true,
        reportBatchItemFailures: true,
        filters: [FilterCriteria.filter({ eventName: FilterRule.isEqual("INSERT") })],
      }),
    );
    bus.grantPutEventsTo(publisher);

    // 2) EventBridge rule: route order.created → SQS (durable buffer)
    new Rule(this, "OrderCreatedRule", {
      eventBus: bus,
      eventPattern: { source: ["orders.api"], detailType: ["order.created"] },
      targets: [new SqsQueue(queue)],
    });

    // 3) SQS consumer (partial-batch response) → SNS fan-out notification
    const consumer = new CrudFunction(this, "OrderConsumerFn", {
      entry: resolve(EVENTS_DIR, "order-consumer.ts"),
      environment: { TOPIC_ARN: topic.topicArn },
      description: "SQS consumer → SNS notification",
    }).fn;
    consumer.addEventSource(
      new SqsEventSource(queue, { batchSize: 10, reportBatchItemFailures: true }),
    );
    topic.grantPublish(consumer);

    // 4) Scheduled cleanup of stale PENDING orders (classic EventBridge rule)
    const cleanup = new CrudFunction(this, "StaleCleanupFn", {
      entry: resolve(EVENTS_DIR, "stale-cleanup.ts"),
      environment: { TABLE_NAME: table.tableName, STALE_DAYS: "7" },
      timeout: Duration.minutes(1),
      description: "Daily cancel of stale PENDING orders",
    }).fn;
    table.grant(cleanup, "dynamodb:Scan");
    table.grant(cleanup, "dynamodb:UpdateItem");
    new Rule(this, "DailyCleanup", {
      schedule: Schedule.rate(Duration.days(1)),
      targets: [new LambdaFunction(cleanup)],
    });

    new CfnOutput(this, "BusName", { value: bus.eventBusName });
    new CfnOutput(this, "QueueUrl", { value: queue.queueUrl });
    new CfnOutput(this, "TopicArn", { value: topic.topicArn });
  }
}
