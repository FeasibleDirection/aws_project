import { defineConfig } from "vitest/config";

// Silence the structured logger during tests — the negative-path tests
// intentionally trigger errors that the wrapper logs before mapping to HTTP.
export default defineConfig({
  test: {
    env: { LOG_LEVEL: "SILENT" },
  },
});
