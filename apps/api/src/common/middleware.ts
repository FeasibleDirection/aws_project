import middy from "@middy/core";
import type { MiddlewareObj } from "@middy/core";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { logger, tracer, metrics } from "./powertools";
import { errorToResponse } from "./http";

export type RouteHandler = (
  event: APIGatewayProxyEventV2,
  context: Context,
) => Promise<APIGatewayProxyStructuredResultV2>;

/** Central error boundary: maps any thrown error to the typed API envelope. */
const errorMapper: MiddlewareObj<
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
> = {
  onError: (request) => {
    logger.error("Unhandled error in route", { error: request.error });
    request.response = errorToResponse(request.error);
  },
};

/**
 * Wraps a route with the full observability stack (structured logging, X-Ray
 * tracing, EMF metrics) + the central error mapper. Routes just throw; this
 * turns errors into envelopes and flushes metrics/traces.
 */
export const withHandler = (route: RouteHandler) =>
  middy(route)
    .use(injectLambdaContext(logger, { logEvent: false }))
    .use(captureLambdaHandler(tracer))
    .use(logMetrics(metrics))
    .use(errorMapper);
