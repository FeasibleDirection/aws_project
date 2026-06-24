import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { handler as createH } from "../src/routes/create";
import { handler as getH } from "../src/routes/get";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const ev = (over: Partial<APIGatewayProxyEventV2>): APIGatewayProxyEventV2 =>
  ({
    version: "2.0",
    routeKey: "$default",
    rawPath: "/",
    rawQueryString: "",
    headers: {},
    isBase64Encoded: false,
    requestContext: { http: { method: "GET", path: "/" } },
    ...over,
  }) as unknown as APIGatewayProxyEventV2;

const ctx = {} as Context;

describe("POST /orders", () => {
  it("201 + envelope on valid body", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await createH(
      ev({ body: JSON.stringify({ items: [{ sku: "A", qty: 1, price: 2 }] }) }),
      ctx,
    );
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(2);
  });

  it("422 on invalid body", async () => {
    const res = await createH(ev({ body: JSON.stringify({ items: [] }) }), ctx);
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body as string).error.code).toBe("VALIDATION");
  });
});

describe("GET /orders/{id}", () => {
  it("404 envelope when missing", async () => {
    ddbMock.on(GetCommand).resolves({});
    const res = await getH(ev({ pathParameters: { id: "nope" } }), ctx);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body as string).error.code).toBe("NOT_FOUND");
  });
});
