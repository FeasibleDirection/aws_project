import { z } from "zod";

/** Error half of the API response envelope (also projected into OpenAPI). */
export const ApiErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: "ApiError", description: "Error response envelope" });

export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export type ApiResponse<T> = ApiOk<T> | ApiErrorBody;

/** Opaque-cursor pagination page returned by list endpoints. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
