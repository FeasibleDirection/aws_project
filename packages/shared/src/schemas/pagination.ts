import { z } from "zod";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "../constants";

/** Query string for list endpoints: ?limit&cursor (coerced from strings). */
export const ListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().optional(),
});

export type ListQuery = z.infer<typeof ListQuerySchema>;
