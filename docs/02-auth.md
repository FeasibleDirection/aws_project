# 02 · 认证与按用户隔离(Cognito + JWT authorizer)

对应代码:`infra/lib/stacks/auth-stack.ts`、`infra/lib/stacks/core-api-stack.ts`(`HttpUserPoolAuthorizer` + GSI)、`apps/api/src/common/auth.ts`、`apps/api/src/db/orders.repo.ts`。

## 一句话

> "用 Cognito User Pool 做身份,HTTP API 的 **JWT authorizer** 在网关层校验 token,Lambda 永远收不到未认证请求;token 的 `sub` 直接当 DynamoDB 的 `customerId`,配一个 `byCustomer` GSI,每个用户只能 Query/读/改自己的订单。"

## 考点

- **User Pool vs Identity Pool**:User Pool 是**身份提供方**(登录、发 JWT);Identity Pool 是**发临时 AWS 凭证**让前端直接调 AWS。本项目只需要 User Pool。
- **三种 token**:`id`(身份,`aud`=client id,给应用看)、`access`(授权,带 scope,给 API 看)、`refresh`(换新 token)。HTTP API 的 `HttpUserPoolAuthorizer` 默认按 client id 校验 `aud`,所以**测试用 ID token**(`sub` 两种 token 都有)。
- **JWT authorizer vs Lambda authorizer**:JWT authorizer 是托管的、零代码、只验签+`iss`/`aud`;需要自定义逻辑(查 DB、第三方)才上 Lambda authorizer。
- **authn vs authz**:authorizer 解决"你是谁"(authentication);"你能不能动这条数据"(authorization)由我们在数据层做——`customerId == sub`。
- **按用户隔离怎么做**:
  - 写:`customerId` 只来自 token 的 `sub`,**绝不信 body**(`CreateOrderSchema` 里根本没有 customerId 字段)。
  - 读单条:`GetItem` 后比对 `customerId`,不是本人 → **404**(不是 403,避免泄露"这条存在")。
  - 改/删:`ConditionExpression: attribute_exists(#pk) AND customerId = :cid`,一条件同时管"存在"和"归属",失败统一 404。
  - 列表:**不能 Scan 全表再过滤**(慢且贵)。建 `byCustomer` GSI(PK=`customerId`,SK=`createdAt`),`Query` 出本人订单、按时间倒序、可分页 —— 这就是"按访问模式建 GSI"的标准答案。
- **最小权限不变**:list 函数只授 `dynamodb:Query`(CDK 的 `table.grant` 自动带上索引 ARN)。

## 本地怎么调

本地 http shim(`apps/api/src/local/server.ts`)会**伪造** authorizer 的 claims:默认 `sub=local-user`,或传 `x-user: alice` 头模拟不同用户。所以同一份 handler 代码本地照跑,不用起 Cognito。

## 部署后怎么拿 token 测(真实)

见 README "Phase 2 测试";要点:`aws cognito-idp admin-create-user` 建用户 → `admin-set-user-password ... --permanent` → `initiate-auth --auth-flow USER_PASSWORD_AUTH` 拿 `IdToken` → 请求带 `Authorization: Bearer <IdToken>`。不带 token 现在会被网关挡成 **401**。

相关:[[01-apigw-lambda-dynamodb]]、下一步 [[03-storage-s3]]
