import { S3Client } from "@aws-sdk/client-s3";

/** Module-scope S3 client, reused across warm invocations. */
export const s3 = new S3Client({});

export const BUCKET_NAME = process.env.BUCKET_NAME ?? "orders-attachments";

/** Presigned URLs are valid for 15 minutes. */
export const PRESIGN_EXPIRES_SECONDS = 900;
