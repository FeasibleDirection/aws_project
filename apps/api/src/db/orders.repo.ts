import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  AppError,
  ErrorCode,
  newOrderId,
  nowIso,
  TABLE_PK,
  type Order,
  type CreateOrderInput,
  type UpdateOrderInput,
  type Page,
} from "@app/shared";
import { ddb, TABLE_NAME } from "./client";

const isConditionalCheckFailed = (err: unknown): boolean =>
  !!err &&
  typeof err === "object" &&
  (err as { name?: string }).name === "ConditionalCheckFailedException";

const sumTotal = (items: CreateOrderInput["items"]): number =>
  items.reduce((sum, i) => sum + i.qty * i.price, 0);

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const now = nowIso();
  const order: Order = {
    id: newOrderId(),
    customerId: input.customerId,
    items: input.items,
    status: "PENDING",
    total: sumTotal(input.items),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: order,
        // idempotent create: never silently overwrite an existing order
        ConditionExpression: "attribute_not_exists(#pk)",
        ExpressionAttributeNames: { "#pk": TABLE_PK },
      }),
    );
  } catch (err) {
    if (isConditionalCheckFailed(err)) throw AppError.conflict("Order already exists");
    throw err;
  }
  return order;
}

export async function getOrder(id: string): Promise<Order> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { [TABLE_PK]: id } }),
  );
  if (!res.Item) throw AppError.notFound(`Order ${id} not found`);
  return res.Item as Order;
}

/**
 * Phase 1 uses Scan because the simple single-key table has no partition to
 * Query. The talking-point doc explains why Scan does not scale and how a GSI
 * (e.g. GSI1PK = customerId) turns this into a Query.
 */
export async function listOrders(
  limit: number,
  cursor?: string,
): Promise<Page<Order>> {
  const res = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      Limit: limit,
      ExclusiveStartKey: decodeCursor(cursor),
    }),
  );
  return {
    items: (res.Items ?? []) as Order[],
    nextCursor: encodeCursor(res.LastEvaluatedKey),
  };
}

export async function updateOrder(
  id: string,
  input: UpdateOrderInput,
): Promise<Order> {
  const sets: string[] = ["updatedAt = :updatedAt"];
  const names: Record<string, string> = { "#pk": TABLE_PK };
  const values: Record<string, unknown> = { ":updatedAt": nowIso() };

  if (input.items !== undefined) {
    sets.push("#items = :items", "#total = :total");
    names["#items"] = "items";
    names["#total"] = "total";
    values[":items"] = input.items;
    values[":total"] = sumTotal(input.items);
  }
  if (input.status !== undefined) {
    sets.push("#status = :status");
    names["#status"] = "status"; // 'status' is a DynamoDB reserved word
    values[":status"] = input.status;
  }

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { [TABLE_PK]: id },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(#pk)", // 404, don't resurrect
        ReturnValues: "ALL_NEW",
      }),
    );
    return res.Attributes as Order;
  } catch (err) {
    if (isConditionalCheckFailed(err)) throw AppError.notFound(`Order ${id} not found`);
    throw err;
  }
}

export async function deleteOrder(id: string): Promise<void> {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { [TABLE_PK]: id },
        ConditionExpression: "attribute_exists(#pk)",
        ExpressionAttributeNames: { "#pk": TABLE_PK },
      }),
    );
  } catch (err) {
    if (isConditionalCheckFailed(err)) throw AppError.notFound(`Order ${id} not found`);
    throw err;
  }
}

// --- opaque cursor helpers (base64url of the DynamoDB LastEvaluatedKey) ---

function encodeCursor(key?: Record<string, unknown>): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

function decodeCursor(cursor?: string): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new AppError(ErrorCode.VALIDATION, "Invalid pagination cursor");
  }
}
