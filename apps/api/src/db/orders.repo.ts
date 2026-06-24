import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  AppError,
  ErrorCode,
  newOrderId,
  nowIso,
  TABLE_PK,
  GSI_BY_CUSTOMER,
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

/** customerId is always the authenticated caller — never client-supplied. */
export async function createOrder(
  callerId: string,
  input: CreateOrderInput,
): Promise<Order> {
  const now = nowIso();
  const order: Order = {
    id: newOrderId(),
    customerId: callerId,
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

export async function getOrder(callerId: string, id: string): Promise<Order> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { [TABLE_PK]: id } }),
  );
  const order = res.Item as Order | undefined;
  // 404 (not 403) on a foreign order so we don't leak its existence.
  if (!order || order.customerId !== callerId) {
    throw AppError.notFound(`Order ${id} not found`);
  }
  return order;
}

/**
 * Per-user list = Query the `byCustomer` GSI by the caller's id (newest first),
 * paginated. This is the access-pattern-driven GSI that replaces a full-table
 * Scan — the canonical DynamoDB modeling answer.
 */
export async function listOrders(
  callerId: string,
  limit: number,
  cursor?: string,
): Promise<Page<Order>> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI_BY_CUSTOMER,
      KeyConditionExpression: "customerId = :cid",
      ExpressionAttributeValues: { ":cid": callerId },
      ScanIndexForward: false,
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
  callerId: string,
  id: string,
  input: UpdateOrderInput,
): Promise<Order> {
  const sets: string[] = ["updatedAt = :updatedAt"];
  const names: Record<string, string> = { "#pk": TABLE_PK };
  const values: Record<string, unknown> = {
    ":updatedAt": nowIso(),
    ":cid": callerId,
  };

  if (input.items !== undefined) {
    sets.push("#items = :items", "#total = :total");
    names["#items"] = "items";
    names["#total"] = "total";
    values[":items"] = input.items;
    values[":total"] = sumTotal(input.items);
  }
  if (input.status !== undefined) {
    sets.push("#status = :status");
    names["#status"] = "status"; // reserved word
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
        // existence + ownership in one conditional → 404 on missing OR foreign
        ConditionExpression: "attribute_exists(#pk) AND customerId = :cid",
        ReturnValues: "ALL_NEW",
      }),
    );
    return res.Attributes as Order;
  } catch (err) {
    if (isConditionalCheckFailed(err)) throw AppError.notFound(`Order ${id} not found`);
    throw err;
  }
}

export async function deleteOrder(callerId: string, id: string): Promise<void> {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { [TABLE_PK]: id },
        ConditionExpression: "attribute_exists(#pk) AND customerId = :cid",
        ExpressionAttributeNames: { "#pk": TABLE_PK },
        ExpressionAttributeValues: { ":cid": callerId },
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
