import { CreateOrderSchema } from "@app/shared";
import { withHandler } from "../common/middleware";
import { parseBody, ok } from "../common/http";
import { createOrder } from "../db/orders.repo";

export const handler = withHandler(async (event) => {
  const input = parseBody(event, CreateOrderSchema);
  const order = await createOrder(input);
  return ok(order, 201);
});
