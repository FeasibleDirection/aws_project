import { AppError, ErrorCode, UpdateOrderSchema } from "@app/shared";
import { withHandler } from "../common/middleware";
import { parseBody, ok } from "../common/http";
import { getUserSub } from "../common/auth";
import { updateOrder } from "../db/orders.repo";

export const handler = withHandler(async (event) => {
  const sub = getUserSub(event);
  const id = event.pathParameters?.id;
  if (!id) throw new AppError(ErrorCode.VALIDATION, "Missing path parameter: id");
  const input = parseBody(event, UpdateOrderSchema);
  return ok(await updateOrder(sub, id, input));
});
