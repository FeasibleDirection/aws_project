import { z } from "zod";

/**
 * ISO-8601 timestamp. Kept as a plain string (server-generated, always valid)
 * to stay portable across Zod minor versions; described for OpenAPI output.
 */
export const Iso8601 = z.string().describe("ISO 8601 timestamp");

export const NonEmptyString = z.string().min(1);
