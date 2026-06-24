# 03 · 对象存储与 presigned URL(S3 附件)

对应代码:`infra/lib/stacks/storage-stack.ts`、`apps/api/src/storage/*`、`apps/api/src/routes/attachment-upload.ts`、`attachment-download.ts`、`infra/lib/stacks/core-api-stack.ts`(grants + 路由)。

## 一句话

> "订单附件用 **presigned URL** 直传 S3:Lambda 只负责签发短时 URL(15 分钟),字节流**绕过 Lambda**直接进桶,既避开 Lambda 6MB 负载上限又更便宜。桶 Block Public Access + SSE 加密,客户端永远不直接碰桶。"

## 流程

- 上传:`POST /orders/{id}/attachment` → Lambda 校验订单归属(UpdateItem 条件 `customerId=:cid`)、生成 key `attachments/{sub}/{id}/{uuid}`、把 key 写到订单的 `attachmentKey`、用 `s3:PutObject` 签一个 **presigned PUT URL** 返回 `{ uploadUrl, key }`。浏览器拿 uploadUrl 直接 PUT 文件到 S3。
- 下载:`GET /orders/{id}/attachment` → 校验归属(GetItem)、若有 `attachmentKey` 用 `s3:GetObject` 签一个 **presigned GET URL** 返回。

## 考点

- **为什么不让文件走 Lambda**:Lambda 同步负载上限 6MB;presigned URL 让客户端与 S3 直连,省带宽/省钱/可大文件。SDK v3 里 `getSignedUrl(s3, new PutObjectCommand(...), { expiresIn })`。
- **桶安全**:`BlockPublicAccess.BLOCK_ALL` + `BucketEncryption.S3_MANAGED`(SSE-S3)+ `enforceSSL`。绝不开公共读;一切通过签名 URL。经典面试坑:公开桶是最常见泄露源。
- **CORS**:浏览器要直接 PUT/GET S3,所以桶上配 CORS(允许 PUT/GET)。这跟 API Gateway 的 CORS 是两层,别混。
- **最小权限**:upload 函数只有 `s3:PutObject` + `dynamodb:UpdateItem`;download 函数只有 `s3:GetObject` + `dynamodb:GetItem`。读函数签不出上传 URL。
- **归属仍然在数据层**:presign 之前用 DynamoDB 条件/读校验订单属于调用者,别人的订单 404。
- **生命周期/成本**:demo 桶配 7 天过期的 lifecycle rule,自动清理;`autoDeleteObjects` 让 `cdk destroy` 能清空桶。
- **SSE-S3 vs SSE-KMS**:本期用 S3 托管 key(免费);需要自管 key/审计再上 SSE-KMS(Phase 8 的 KMS 讲稿)。

## 本地

本地 shim 也路由了 `/orders/{id}/attachment`,但 presign 需要真实 S3 桶 + 凭证,所以附件功能主要在真实 AWS 上验证。

相关:[[02-auth]]、下一步 [[04-async-sqs-eventbridge]]
