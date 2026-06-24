import { AppError, ErrorCode } from "@app/shared";
import { withHandler } from "../common/middleware";
import { ok } from "../common/http";
import { getOrder } from "../db/orders.repo";

export const handler = withHandler(async (event) => {
  const id = event.pathParameters?.id;
  if (!id) throw new AppError(ErrorCode.VALIDATION, "Missing path parameter: id");
  return ok(await getOrder(id));
});
