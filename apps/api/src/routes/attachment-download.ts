import { AppError, ErrorCode } from "@app/shared";
import { withHandler } from "../common/middleware";
import { ok } from "../common/http";
import { getUserSub } from "../common/auth";
import { getOrder } from "../db/orders.repo";
import { presignDownload } from "../storage/presign";

// GET /orders/{id}/attachment -> presigned GET URL (if the order has an attachment)
export const handler = withHandler(async (event) => {
  const sub = getUserSub(event);
  const id = event.pathParameters?.id;
  if (!id) throw new AppError(ErrorCode.VALIDATION, "Missing path parameter: id");
  const order = await getOrder(sub, id); // ownership-checked (404 on foreign/missing)
  if (!order.attachmentKey) {
    throw AppError.notFound("No attachment for this order");
  }
  const downloadUrl = await presignDownload(order.attachmentKey);
  return ok({ downloadUrl });
});
