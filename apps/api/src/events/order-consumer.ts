import type { SQSEvent, SQSBatchResponse } from "aws-lambda";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { logger } from "../common/powertools";

/**
 * Consumes the SQS buffer (fed by the EventBridge rule) and fans out a
 * notification via SNS. Returns SQSBatchResponse so only failed messages are
 * retried (partial batch). SQS is at-least-once, so real handlers must be
 * idempotent (dedupe on the order id / event id).
 */
const sns = new SNSClient({});
const TOPIC_ARN = process.env.TOPIC_ARN;

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      // EventBridge → SQS wraps the event; the order is in `detail`.
      const envelope = JSON.parse(record.body) as {
        detail?: { id?: string; total?: number };
        id?: string;
        total?: number;
      };
      const order = envelope.detail ?? envelope;
      logger.info("processing order.created", { orderId: order.id });

      if (TOPIC_ARN) {
        await sns.send(
          new PublishCommand({
            TopicArn: TOPIC_ARN,
            Subject: "Order received",
            Message: JSON.stringify({ orderId: order.id, total: order.total }),
          }),
        );
      }
    } catch (err) {
      logger.error("consumer failed", { error: err, messageId: record.messageId });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
