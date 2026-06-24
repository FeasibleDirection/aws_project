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

const SUB = "user-1";

const ev = (
  over: Partial<APIGatewayProxyEventV2>,
  sub: string | null = SUB,
): APIGatewayProxyEventV2 =>
  ({
    version: "2.0",
    routeKey: "$default",
    rawPath: "/",
    rawQueryString: "",
    headers: {},
    isBase64Encoded: false,
    requestContext: {
      http: { method: "GET", path: "/" },
      ...(sub ? { authorizer: { jwt: { claims: { sub }, scopes: [] } } } : {}),
    },
    ...over,
  }) as unknown as APIGatewayProxyEventV2;

const ctx = {} as Context;

describe("POST /orders", () => {
  it("201 + envelope, customerId taken from the JWT sub", async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await createH(
      ev({ body: JSON.stringify({ items: [{ sku: "A", qty: 1, price: 2 }] }) }),
      ctx,
    );
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(2);
    expect(body.data.customerId).toBe(SUB);
  });

  it("401 when there is no authenticated user", async () => {
    const res = await createH(
      ev({ body: JSON.stringify({ items: [{ sku: "A", qty: 1, price: 2 }] }) }, null),
      ctx,
    );
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body as string).error.code).toBe("UNAUTHORIZED");
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
