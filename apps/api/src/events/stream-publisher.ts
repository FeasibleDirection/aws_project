import type { DynamoDBStreamEvent, DynamoDBBatchResponse } from "aws-lambda";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { logger } from "../common/powertools";

/**
 * Change-data-capture: DynamoDB Streams → EventBridge. Emitting events FROM the
 * committed stream (instead of dual-writing in the create handler) means no lost
 * events and the API code never changes. Returns partial-batch failures so one
 * bad record doesn't replay the whole batch.
 */
const eb = new EventBridgeClient({});
const BUS = process.env.EVENT_BUS_NAME ?? "default";

export const handler = async (
  event: DynamoDBStreamEvent,
): Promise<DynamoDBBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    const seq = record.dynamodb?.SequenceNumber;
    try {
      if (record.eventName !== "INSERT" || !record.dynamodb?.NewImage) continue;
      const order = unmarshall(
        record.dynamodb.NewImage as Record<string, AttributeValue>,
      );
      await eb.send(
        new PutEventsCommand({
          Entries: [
            {
              EventBusName: BUS,
              Source: "orders.api",
              DetailType: "order.created",
              Detail: JSON.stringify(order),
            },
          ],
        }),
      );
    } catch (err) {
      logger.error("stream-publisher failed", { error: err, seq });
      if (seq) batchItemFailures.push({ itemIdentifier: seq });
    }
  }

  return { batchItemFailures };
};
