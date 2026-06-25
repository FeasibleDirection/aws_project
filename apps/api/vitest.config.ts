import { defineConfig } from "vitest/config";

// Silence the structured logger during tests, and provide async env defaults
// so module-scope reads (TOPIC_ARN, EVENT_BUS_NAME) are populated.
export default defineConfig({
  test: {
    env: {
      LOG_LEVEL: "SILENT",
      TOPIC_ARN: "arn:aws:sns:us-east-1:000000000000:test-topic",
      EVENT_BUS_NAME: "test-bus",
      POWERTOOLS_TRACE_ENABLED: "false", // no X-Ray segment outside Lambda
      POWERTOOLS_METRICS_DISABLED: "true", // no EMF output noise in tests
    },
  },
});
