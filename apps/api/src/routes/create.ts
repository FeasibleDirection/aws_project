import { MetricUnit } from "@aws-lambda-powertools/metrics";
import { CreateOrderSchema } from "@app/shared";
import { withHandler } from "../common/middleware";
import { parseBody, ok } from "../common/http";
import { getUserSub } from "../common/auth";
import { metrics } from "../common/powertools";
import { createOrder } from "../db/orders.repo";

export const handler = withHandler(async (event) => {
  const sub = getUserSub(event);
  const input = parseBody(event, CreateOrderSchema);
  const order = await createOrder(sub, input);
  metrics.addMetric("OrdersCreated", MetricUnit.Count, 1); // EMF custom metric
  return ok(order, 201);
});
