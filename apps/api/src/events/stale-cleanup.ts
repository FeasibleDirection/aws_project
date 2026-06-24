import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_PK, nowIso } from "@app/shared";
import { ddb, TABLE_NAME } from "../db/client";
import { logger } from "../common/powertools";

/**
 * Scheduled job: cancel PENDING orders older than STALE_DAYS. A full-table Scan
 * is acceptable here because this is an infrequent batch job, not a hot path —
 * the canonical "when Scan is OK" answer.
 */
const STALE_DAYS = Number(process.env.STALE_DAYS ?? "7");

export const handler = async (): Promise<{ cancelled: number }> => {
  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();
  let cancelled = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "#s = :pending AND createdAt < :cutoff",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":pending": "PENDING", ":cutoff": cutoff },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    for (const item of res.Items ?? []) {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { [TABLE_PK]: (item as { id: string }).id },
          UpdateExpression: "SET #s = :cancelled, updatedAt = :u",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":cancelled": "CANCELLED", ":u": nowIso() },
        }),
      );
      cancelled++;
    }
    exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  logger.info("stale-cleanup done", { cancelled, cutoff });
  return { cancelled };
};
