import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  createOrder,
  getOrder,
  updateOrder,
  deleteOrder,
  listOrders,
} from "../src/db/orders.repo";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const conditionalFail = () => {
  const e = new Error("conditional");
  (e as { name: string }).name = "ConditionalCheckFailedException";
  return e;
};

describe("createOrder", () => {
  it("puts with attribute_not_exists and computes total", async () => {
    ddbMock.on(PutCommand).resolves({});
    const order = await createOrder({
      customerId: "c1",
      items: [{ sku: "A", qty: 2, price: 5 }],
    });
    expect(order.total).toBe(10);
    expect(order.status).toBe("PENDING");
    expect(order.id).toMatch(/^ord_/);
    const input = ddbMock.commandCalls(PutCommand)[0]!.args[0].input;
    expect(input.ConditionExpression).toBe("attribute_not_exists(#pk)");
    expect(input.ExpressionAttributeNames).toEqual({ "#pk": "id" });
  });

  it("maps ConditionalCheckFailed → 409", async () => {
    ddbMock.on(PutCommand).rejects(conditionalFail());
    await expect(
      createOrder({ customerId: "c1", items: [{ sku: "A", qty: 1, price: 1 }] }),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
  });
});

describe("getOrder", () => {
  it("returns the item", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: "x", status: "PENDING" } });
    expect(await getOrder("x")).toMatchObject({ id: "x" });
  });
  it("throws 404 when missing", async () => {
    ddbMock.on(GetCommand).resolves({});
    await expect(getOrder("nope")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("updateOrder", () => {
  it("aliases reserved word 'status', conditions on existence, returns ALL_NEW", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { id: "x", status: "PAID" } });
    const res = await updateOrder("x", { status: "PAID" });
    expect(res.status).toBe("PAID");
    const input = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(input.ExpressionAttributeNames?.["#status"]).toBe("status");
    expect(input.ConditionExpression).toBe("attribute_exists(#pk)");
    expect(input.ReturnValues).toBe("ALL_NEW");
  });
  it("maps ConditionalCheckFailed → 404", async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalFail());
    await expect(updateOrder("x", { status: "PAID" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("deleteOrder", () => {
  it("maps ConditionalCheckFailed → 404", async () => {
    ddbMock.on(DeleteCommand).rejects(conditionalFail());
    await expect(deleteOrder("x")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("listOrders", () => {
  it("returns items and an opaque cursor", async () => {
    ddbMock
      .on(ScanCommand)
      .resolves({ Items: [{ id: "a" }], LastEvaluatedKey: { id: "a" } });
    const page = await listOrders(10);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTypeOf("string");
  });
  it("returns null cursor on last page", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const page = await listOrders(10);
    expect(page.nextCursor).toBeNull();
  });
});
