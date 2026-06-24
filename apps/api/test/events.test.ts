import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import type { DynamoDBStreamEvent, SQSEvent } from "aws-lambda";
import { handler as cleanupH } from "../src/events/stale-cleanup";
import { handler as publisherH } from "../src/events/stream-publisher";
import { handler as consumerH } from "../src/events/order-consumer";

const ddbMock = mockClient(DynamoDBDocumentClient);
const ebMock = mockClient(EventBridgeClient);
const snsMock = mockClient(SNSClient);

beforeEach(() => {
  ddbMock.reset();
  ebMock.reset();
  snsMock.reset();
});

describe("stale-cleanup", () => {
  it("cancels each stale PENDING order it scans", async () => {
    ddbMock
      .on(ScanCommand)
      .resolves({ Items: [{ id: "old-1" }, { id: "old-2" }] });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await cleanupH();
    expect(res.cancelled).toBe(2);
    const first = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(first.ExpressionAttributeValues?.[":cancelled"]).toBe("CANCELLED");
    expect(first.ExpressionAttributeNames?.["#s"]).toBe("status");
  });
});

describe("stream-publisher", () => {
  it("publishes order.created to EventBridge for INSERTs only", async () => {
    ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
    const event = {
      Records: [
        {
          eventName: "INSERT",
          dynamodb: {
            SequenceNumber: "1",
            NewImage: {
              id: { S: "ord_1" },
              total: { N: "10" },
              status: { S: "PENDING" },
            },
          },
        },
        { eventName: "MODIFY", dynamodb: { SequenceNumber: "2", NewImage: {} } },
      ],
    } as unknown as DynamoDBStreamEvent;

    const res = await publisherH(event);
    expect(res.batchItemFailures).toHaveLength(0);
    const calls = ebMock.commandCalls(PutEventsCommand);
    expect(calls).toHaveLength(1); // only the INSERT
    const entry = calls[0]!.args[0].input.Entries![0]!;
    expect(entry.DetailType).toBe("order.created");
    expect(JSON.parse(entry.Detail!)).toMatchObject({ id: "ord_1", total: 10 });
  });
});

describe("order-consumer", () => {
  it("publishes an SNS notification for each SQS message", async () => {
    snsMock.on(PublishCommand).resolves({ MessageId: "m1" });
    const event = {
      Records: [
        {
          messageId: "1",
          body: JSON.stringify({ detail: { id: "ord_1", total: 10 } }),
        },
      ],
    } as unknown as SQSEvent;

    const res = await consumerH(event);
    expect(res.batchItemFailures).toHaveLength(0);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
  });

  it("reports a failed message instead of throwing", async () => {
    const event = {
      Records: [{ messageId: "bad", body: "not-json" }],
    } as unknown as SQSEvent;
    const res = await consumerH(event);
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: "bad" }]);
  });
});
