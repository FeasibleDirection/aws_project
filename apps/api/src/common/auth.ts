import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AppError, ErrorCode } from "@app/shared";

/**
 * Extract the authenticated user id (Cognito `sub`) that the HTTP API JWT
 * authorizer placed on the request context. The Lambda never sees an
 * unauthenticated request (the authorizer rejects those at the gateway), but we
 * defensively 401 if the claim is somehow absent. This `sub` becomes the
 * DynamoDB partition for per-user data isolation.
 */
export function getUserSub(event: APIGatewayProxyEventV2): string {
  const authorizer = (
    event.requestContext as unknown as {
      authorizer?: { jwt?: { claims?: Record<string, unknown> } };
    }
  ).authorizer;
  const sub = authorizer?.jwt?.claims?.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new AppError(ErrorCode.UNAUTHORIZED, "Missing authenticated user");
  }
  return sub;
}
