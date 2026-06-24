import { AppError, ErrorCode, AttachmentRequestSchema } from "@app/shared";
import { withHandler } from "../common/middleware";
import { parseBody, ok } from "../common/http";
import { getUserSub } from "../common/auth";
import { attachToOrder } from "../db/orders.repo";
import { presignUpload } from "../storage/presign";

// POST /orders/{id}/attachment -> presigned PUT URL (browser uploads to S3 directly)
export const handler = withHandler(async (event) => {
  const sub = getUserSub(event);
  const id = event.pathParameters?.id;
  if (!id) throw new AppError(ErrorCode.VALIDATION, "Missing path parameter: id");
  const body = parseBody(event, AttachmentRequestSchema);

  const key = `attachments/${sub}/${id}/${globalThis.crypto.randomUUID()}`;
  // ownership-checked write; 404 if the order is missing or not the caller's
  await attachToOrder(sub, id, key);
  const uploadUrl = await presignUpload(key, body.contentType);
  return ok({ uploadUrl, key });
});
