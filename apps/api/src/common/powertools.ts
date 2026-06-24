import { Logger } from "@aws-lambda-powertools/logger";

/**
 * Structured JSON logger. Created once at module scope so it is reused across
 * warm Lambda invocations. (Phase 6 adds Tracer + Metrics + Middy on top.)
 */
export const logger = new Logger({
  serviceName: process.env.POWERTOOLS_SERVICE_NAME ?? "orders-api",
});
