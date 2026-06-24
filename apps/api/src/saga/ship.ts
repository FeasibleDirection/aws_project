import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_PK, nowIso } from "@app/shared";
import { ddb, TABLE_NAME } from "../db/client";
import { logger } from "../common/powertools";
import type { SagaState } from "./types";

// Forward step 3: ship + mark the order SHIPPED. Failing here triggers refund
// AND release-inventory compensation.
export const handler = async (event: SagaState): Promise<SagaState> => {
  if (event.simulateFailAt === "ship") throw new Error("carrier unavailable");
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { [TABLE_PK]: event.orderId },
      UpdateExpression: "SET #s = :shipped, updatedAt = :u",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":shipped": "SHIPPED", ":u": nowIso() },
    }),
  );
  logger.info("order shipped", { orderId: event.orderId });
  return { ...event, shipped: true };
};
