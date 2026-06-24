import { AppError, ErrorCode } from "@app/shared";
import { withHandler } from "../common/middleware";
import { noContent } from "../common/http";
import { deleteOrder } from "../db/orders.repo";

export const handler = withHandler(async (event) => {
  const id = event.pathParameters?.id;
  if (!id) throw new AppError(ErrorCode.VALIDATION, "Missing path parameter: id");
  await deleteOrder(id);
  return noContent();
});
