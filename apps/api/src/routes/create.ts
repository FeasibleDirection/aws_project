import { CreateOrderSchema } from "@app/shared";
import { withHandler } from "../common/middleware";
import { parseBody, ok } from "../common/http";
import { getUserSub } from "../common/auth";
import { createOrder } from "../db/orders.repo";

export const handler = withHandler(async (event) => {
  const sub = getUserSub(event);
  const input = parseBody(event, CreateOrderSchema);
  const order = await createOrder(sub, input);
  return ok(order, 201);
});
