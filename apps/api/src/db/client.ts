import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * One DynamoDB client per container, created at MODULE scope so it is reused
 * across warm invocations (cuts cold-start cost). IS_LOCAL=1 points it at
 * DynamoDB Local for $0 offline development.
 */
const isLocal = process.env.IS_LOCAL === "1";

const base = new DynamoDBClient(
  isLocal
    ? {
        endpoint: "http://localhost:8000",
        region: "local",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : {},
);

export const ddb = DynamoDBDocumentClient.from(base, {
  // v3 does NOT strip undefined by default — required or PutItem throws.
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE_NAME = process.env.TABLE_NAME ?? "Orders";
