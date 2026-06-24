import { ListQuerySchema } from "@app/shared";
import { withHandler } from "../common/middleware";
import { ok } from "../common/http";
import { getUserSub } from "../common/auth";
import { listOrders } from "../db/orders.repo";

export const handler = withHandler(async (event) => {
  const sub = getUserSub(event);
  const q = ListQuerySchema.parse(event.queryStringParameters ?? {});
  return ok(await listOrders(sub, q.limit, q.cursor));
});
