import { z } from "zod";
import {
  OrderSchema,
  CreateOrderSchema,
  UpdateOrderSchema,
  AttachmentRequestSchema,
  ApiErrorSchema,
} from "@app/shared";

/**
 * The OpenAPI document is a deterministic PROJECTION of the Zod single source
 * of truth — OpenAPI 3.1 is JSON-Schema-based, and Zod v4 emits JSON Schema
 * natively via z.toJSONSchema(), so docs can never drift from runtime behavior.
 */

type JsonSchema = Record<string, unknown>;

const toJson = (schema: z.ZodType, io: "input" | "output"): JsonSchema =>
  z.toJSONSchema(schema, { io, unrepresentable: "any" }) as JsonSchema;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const jsonBody = (schemaName: string) => ({
  required: true,
  content: { "application/json": { schema: ref(schemaName) } },
});

const jsonResponse = (description: string, schemaName?: string) => ({
  description,
  ...(schemaName
    ? { content: { "application/json": { schema: ref(schemaName) } } }
    : {}),
});

export function buildDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Orders API",
      version: "1.0.0",
      description:
        "Serverless CRUD for Orders (API Gateway HTTP API → Lambda → DynamoDB). " +
        "Every schema is projected from the Zod single source of truth.",
    },
    servers: [
      { url: "http://localhost:3000", description: "local http shim" },
      {
        url: "https://{apiId}.execute-api.{region}.amazonaws.com",
        description: "deployed HTTP API",
        variables: {
          apiId: { default: "your-api-id" },
          region: { default: "us-east-1" },
        },
      },
    ],
    // Every route requires a Cognito JWT (bearer). Paste an ID token in Scalar.
    security: [{ bearerAuth: [] }],
    paths: {
      "/orders": {
        get: {
          summary: "List orders",
          operationId: "listOrders",
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: "cursor",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Opaque pagination cursor from a previous response.",
            },
          ],
          responses: {
            "200": jsonResponse("A page of orders"),
            "422": jsonResponse("Validation error", "ApiError"),
          },
        },
        post: {
          summary: "Create an order",
          operationId: "createOrder",
          requestBody: jsonBody("CreateOrder"),
          responses: {
            "201": jsonResponse("Created order", "Order"),
            "409": jsonResponse("Order already exists", "ApiError"),
            "422": jsonResponse("Validation error", "ApiError"),
          },
        },
      },
      "/orders/{id}": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        get: {
          summary: "Get an order by id",
          operationId: "getOrder",
          responses: {
            "200": jsonResponse("The order", "Order"),
            "404": jsonResponse("Not found", "ApiError"),
          },
        },
        patch: {
          summary: "Update an order",
          operationId: "updateOrder",
          requestBody: jsonBody("UpdateOrder"),
          responses: {
            "200": jsonResponse("Updated order", "Order"),
            "404": jsonResponse("Not found", "ApiError"),
            "422": jsonResponse("Validation error", "ApiError"),
          },
        },
        delete: {
          summary: "Delete an order",
          operationId: "deleteOrder",
          responses: {
            "204": jsonResponse("Deleted"),
            "404": jsonResponse("Not found", "ApiError"),
          },
        },
      },
      "/orders/{id}/attachment": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        post: {
          summary: "Get a presigned upload URL for an order attachment",
          operationId: "presignUpload",
          requestBody: {
            required: false,
            content: { "application/json": { schema: ref("AttachmentRequest") } },
          },
          responses: {
            "200": {
              description: "Presigned PUT URL + object key",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { uploadUrl: { type: "string" }, key: { type: "string" } },
                    required: ["uploadUrl", "key"],
                  },
                },
              },
            },
            "404": jsonResponse("Order not found", "ApiError"),
          },
        },
        get: {
          summary: "Get a presigned download URL for an order attachment",
          operationId: "presignDownload",
          responses: {
            "200": {
              description: "Presigned GET URL",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { downloadUrl: { type: "string" } },
                    required: ["downloadUrl"],
                  },
                },
              },
            },
            "404": jsonResponse("No attachment / order not found", "ApiError"),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Order: toJson(OrderSchema, "output"),
        CreateOrder: toJson(CreateOrderSchema, "input"),
        UpdateOrder: toJson(UpdateOrderSchema, "input"),
        AttachmentRequest: toJson(AttachmentRequestSchema, "input"),
        ApiError: toJson(ApiErrorSchema, "output"),
      },
    },
  };
}
