import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, BUCKET_NAME, PRESIGN_EXPIRES_SECONDS } from "./client";

/**
 * Presigned PUT URL: the browser uploads bytes straight to S3 — they never pass
 * through Lambda, which sidesteps the 6 MB Lambda payload limit and is cheaper.
 */
export const presignUpload = (key: string, contentType?: string): Promise<string> =>
  getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS },
  );

/** Presigned GET URL for downloading the stored object. */
export const presignDownload = (key: string): Promise<string> =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });
