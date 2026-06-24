import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  createOrder,
  getOrder,
  updateOrder,
  deleteOrder,
  listOrders,
  attachToOrder,
} from "../src/db/orders.repo";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const USER = "user-1";
const conditionalFail = () => {
  const e = new Error("conditional");
  (e as { name: string }).name = "ConditionalCheckFailedException";
  return e;
};

describe("createOrder", () => {
  it("stamps customerId from the caller and computes total", async () => {
    ddbMock.on(PutCommand).resolves({});
    const order = await createOrder(USER, {
      items: [{ sku: "A", qty: 2, price: 5 }],
    });
    expect(order.customerId).toBe(USER);
    expect(order.total).toBe(10);
    expect(order.status).toBe("PENDING");
    const input = ddbMock.commandCalls(PutCommand)[0]!.args[0].input;
    expect(input.ConditionExpression).toBe("attribute_not_exists(#pk)");
  });

  it("maps ConditionalCheckFailed → 409", async () => {
    ddbMock.on(PutCommand).rejects(conditionalFail());
    await expect(
      createOrder(USER, { items: [{ sku: "A", qty: 1, price: 1 }] }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("getOrder", () => {
  it("returns the order when the caller owns it", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: "x", customerId: USER } });
    expect(await getOrder(USER, "x")).toMatchObject({ id: "x" });
  });
  it("404 when the order belongs to someone else (no existence leak)", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: "x", customerId: "other" } });
    await expect(getOrder(USER, "x")).rejects.toMatchObject({ statusCode: 404 });
  });
  it("404 when missing", async () => {
    ddbMock.on(GetCommand).resolves({});
    await expect(getOrder(USER, "nope")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("listOrders", () => {
  it("queries the byCustomer GSI scoped to the caller, newest first", async () => {
    ddbMock
      .on(QueryCommand)
      .resolves({ Items: [{ id: "a", customerId: USER }], LastEvaluatedKey: { id: "a" } });
    const page = await listOrders(USER, 10);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTypeOf("string");
    const input = ddbMock.commandCalls(QueryCommand)[0]!.args[0].input;
    expect(input.IndexName).toBe("byCustomer");
    expect(input.KeyConditionExpression).toBe("customerId = :cid");
    expect(input.ExpressionAttributeValues).toMatchObject({ ":cid": USER });
    expect(input.ScanIndexForward).toBe(false);
  });
});

describe("updateOrder", () => {
  it("aliases reserved 'status', enforces existence + ownership, returns ALL_NEW", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { id: "x", status: "PAID" } });
    const res = await updateOrder(USER, "x", { status: "PAID" });
    expect(res.status).toBe("PAID");
    const input = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(input.ExpressionAttributeNames?.["#status"]).toBe("status");
    expect(input.ConditionExpression).toBe("attribute_exists(#pk) AND customerId = :cid");
    expect(input.ExpressionAttributeValues?.[":cid"]).toBe(USER);
    expect(input.ReturnValues).toBe("ALL_NEW");
  });
  it("maps ConditionalCheckFailed → 404 (missing or foreign)", async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalFail());
    await expect(updateOrder(USER, "x", { status: "PAID" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("deleteOrder", () => {
  it("enforces ownership in the condition", async () => {
    ddbMock.on(DeleteCommand).resolves({});
    await deleteOrder(USER, "x");
    const input = ddbMock.commandCalls(DeleteCommand)[0]!.args[0].input;
    expect(input.ConditionExpression).toBe("attribute_exists(#pk) AND customerId = :cid");
    expect(input.ExpressionAttributeValues?.[":cid"]).toBe(USER);
  });
  it("maps ConditionalCheckFailed → 404", async () => {
    ddbMock.on(DeleteCommand).rejects(conditionalFail());
    await expect(deleteOrder(USER, "x")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("attachToOrder", () => {
  it("sets attachmentKey with an ownership condition", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await attachToOrder(USER, "x", "attachments/u/x/abc");
    const input = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(input.UpdateExpression).toContain("attachmentKey = :k");
    expect(input.ConditionExpression).toBe("attribute_exists(#pk) AND customerId = :cid");
    expect(input.ExpressionAttributeValues?.[":cid"]).toBe(USER);
  });
  it("maps ConditionalCheckFailed → 404", async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalFail());
    await expect(attachToOrder(USER, "x", "k")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
