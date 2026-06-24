import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Construct } from "constructs";
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import {
  EventBus,
  EventField,
  Rule,
  RuleTargetInput,
} from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import { CrudFunction } from "../constructs/crud-function";

const here = dirname(fileURLToPath(import.meta.url));
const SAGA_DIR = resolve(here, "../../../apps/api/src/saga");

export interface OrchestrationStackProps extends StackProps {
  readonly table: Table; // ship step updates the order status
  readonly bus: EventBus; // order.created triggers fulfillment
}

/**
 * Order-fulfillment SAGA as a Step Functions Standard state machine:
 * reserve → charge → ship, with Retry on charge and Catch → compensation
 * (refund + release inventory). Auto-started by the order.created event;
 * also startable manually from the console with {orderId, simulateFailAt} to
 * demo the compensation path on the visual graph.
 */
export class OrchestrationStack extends Stack {
  constructor(scope: Construct, id: string, props: OrchestrationStackProps) {
    super(scope, id, props);
    const { table, bus } = props;

    const task = (id: string, file: string, env?: Record<string, string>) =>
      new CrudFunction(this, id, {
        entry: resolve(SAGA_DIR, file),
        environment: env,
        description: id,
      }).fn;

    const reserveFn = task("ReserveFn", "reserve.ts");
    const chargeFn = task("ChargeFn", "charge.ts");
    const shipFn = task("ShipFn", "ship.ts", { TABLE_NAME: table.tableName });
    const releaseFn = task("ReleaseFn", "release-inventory.ts");
    const refundFn = task("RefundFn", "refund.ts");
    table.grant(shipFn, "dynamodb:UpdateItem");

    const invoke = (id: string, fn: IFunction) =>
      new LambdaInvoke(this, id, { lambdaFunction: fn, payloadResponseOnly: true });

    const failed = new sfn.Fail(this, "FulfillmentFailed", {
      error: "FulfillmentError",
      cause: "Order fulfillment failed",
    });
    const succeeded = new sfn.Succeed(this, "Fulfilled");

    // compensation chains (distinct states, both invoke releaseFn)
    const releaseAfterCharge = invoke("ReleaseInventoryAfterCharge", releaseFn).next(failed);
    const refundThenRelease = invoke("RefundPayment", refundFn).next(
      invoke("ReleaseInventoryAfterShip", releaseFn).next(failed),
    );

    const reserve = invoke("ReserveInventory", reserveFn);
    const charge = invoke("ChargePayment", chargeFn);
    const ship = invoke("ShipOrder", shipFn);

    charge.addRetry({
      errors: ["States.TaskFailed"],
      maxAttempts: 2,
      interval: Duration.seconds(1),
      backoffRate: 2,
    });
    charge.addCatch(releaseAfterCharge, { errors: ["States.ALL"], resultPath: "$.error" });
    ship.addCatch(refundThenRelease, { errors: ["States.ALL"], resultPath: "$.error" });

    const definition = reserve.next(charge).next(ship).next(succeeded);

    const machine = new sfn.StateMachine(this, "OrderFulfillment", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: Duration.minutes(5),
      tracingEnabled: true,
    });

    // Normalize the EventBridge event into the saga input shape.
    new Rule(this, "OrderCreatedFulfill", {
      eventBus: bus,
      eventPattern: { source: ["orders.api"], detailType: ["order.created"] },
      targets: [
        new SfnStateMachine(machine, {
          input: RuleTargetInput.fromObject({
            orderId: EventField.fromPath("$.detail.id"),
            customerId: EventField.fromPath("$.detail.customerId"),
          }),
        }),
      ],
    });

    new CfnOutput(this, "StateMachineArn", { value: machine.stateMachineArn });
  }
}
