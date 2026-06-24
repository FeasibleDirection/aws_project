import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { z } from "zod";
import { AppError, ErrorCode, type ApiErrorBody } from "@app/shared";

const JSON_HEADERS = { "content-type": "application/json" } as const;

export const json = (
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

export const ok = <T>(data: T, statusCode = 200) =>
  json(statusCode, { ok: true, data });

export const noContent = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 204,
  body: "",
});

/** Parse + validate a JSON request body against a Zod schema (→ 422 on failure). */
export function parseBody<T>(
  event: APIGatewayProxyEventV2,
  schema: z.ZodType<T>,
): T {
  let raw: unknown;
  try {
    const body =
      event.body && event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
    raw = body ? JSON.parse(body) : {};
  } catch {
    throw new AppError(ErrorCode.VALIDATION, "Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError(
      ErrorCode.VALIDATION,
      "Request validation failed",
      result.error.issues,
    );
  }
  return result.data;
}

/** Central error → typed envelope mapping (the only place errors become HTTP). */
export function errorToResponse(
  err: unknown,
): APIGatewayProxyStructuredResultV2 {
  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
    return json(err.statusCode, body);
  }
  if (err instanceof z.ZodError) {
    const body: ApiErrorBody = {
      ok: false,
      error: {
        code: ErrorCode.VALIDATION,
        message: "Request validation failed",
        details: err.issues,
      },
    };
    return json(422, body);
  }
  const body: ApiErrorBody = {
    ok: false,
    error: { code: ErrorCode.INTERNAL, message: "Internal server error" },
  };
  return json(500, body);
}
