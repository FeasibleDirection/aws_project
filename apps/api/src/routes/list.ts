import { ListQuerySchema } from "@app/shared";
import { withHandler } from "../common/middleware";
import { ok } from "../common/http";
import { listOrders } from "../db/orders.repo";

export const handler = withHandler(async (event) => {
  const q = ListQuerySchema.parse(event.queryStringParameters ?? {});
  return ok(await listOrders(q.limit, q.cursor));
});
