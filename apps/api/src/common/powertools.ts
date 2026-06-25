import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { Metrics } from "@aws-lambda-powertools/metrics";

/**
 * Powertools singletons, created once at module scope (reused across warm
 * invocations). Logger = structured JSON logs, Tracer = X-Ray subsegments,
 * Metrics = EMF custom metrics. Wired into handlers via Middy in middleware.ts.
 */
const serviceName = process.env.POWERTOOLS_SERVICE_NAME ?? "orders-api";

export const logger = new Logger({ serviceName });
export const tracer = new Tracer({ serviceName });
export const metrics = new Metrics({
  namespace: process.env.POWERTOOLS_METRICS_NAMESPACE ?? "OrdersApi",
  serviceName,
});
