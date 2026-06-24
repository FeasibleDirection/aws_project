import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda";
import { logger } from "./powertools";
import { errorToResponse } from "./http";

export type RouteHandler = (
  event: APIGatewayProxyEventV2,
  context: Context,
) => Promise<APIGatewayProxyStructuredResultV2>;

/**
 * Wraps a route with logging + the central error boundary. Every route just
 * throws (AppError / ZodError / anything); this maps it to the API envelope.
 * Phase 6 swaps this for a Middy chain (Tracer + Metrics) around the same fns.
 */
export const withHandler =
  (route: RouteHandler): RouteHandler =>
  async (event, context) => {
    logger.addContext(context);
    try {
      return await route(event, context);
    } catch (err) {
      logger.error("Unhandled error in route", { error: err });
      return errorToResponse(err);
    }
  };
