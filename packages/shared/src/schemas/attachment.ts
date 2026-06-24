import { z } from "zod";

/** Optional metadata a client may pass when requesting a presigned upload URL. */
export const AttachmentRequestSchema = z
  .object({
    filename: z.string().min(1).max(255).optional(),
    contentType: z.string().min(1).max(127).optional(),
  })
  .meta({ id: "AttachmentRequest" });

export type AttachmentRequest = z.infer<typeof AttachmentRequestSchema>;

export interface PresignUploadResult {
  uploadUrl: string;
  key: string;
}

export interface PresignDownloadResult {
  downloadUrl: string;
}
