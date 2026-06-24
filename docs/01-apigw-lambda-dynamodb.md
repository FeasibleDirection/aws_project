# 01 · API Gateway + Lambda + DynamoDB(核心 CRUD 考点)

对应代码:`apps/api/src/routes/*`、`apps/api/src/db/orders.repo.ts`、`infra/lib/stacks/core-api-stack.ts`、`infra/lib/constructs/crud-function.ts`。

## API Gateway

- **HTTP API vs REST API**:HTTP 便宜(~$1 vs $3.5 / 百万)、延迟低、内建 JWT authorizer + CORS;REST 才有 API key/usage plan、请求校验、响应缓存、WAF、edge-optimized、私有端点。
- **payload v2 事件**:`event.requestContext.http.method`、`event.routeKey`(如 `"POST /orders"`)、`event.pathParameters.id`、`event.body`(可能 base64)。返回 `{ statusCode, headers, body: JSON.stringify(...) }`。
- **CORS** 配在 API 上,不要每个 Lambda 手写头(预检容易坏)。

## Lambda

- **冷启动**:client 放 **handler 外**(模块作用域)跨暖调用复用(见 `db/client.ts`);esbuild 打包 + ARM64 缩小体积;延迟敏感再上 provisioned concurrency / SnapStart。
- **运行时**:nodejs22.x(20.x 2026-04-30 EOL;24.x 已有但去掉了 callback handler)。
- **per-route vs lambdalith**:本项目用 per-route —— 每个函数 role 只授一个动作,blast radius 最小、可独立伸缩/监控;路由很多且配置一致时 lambdalith 更省冷启动,可作为对照讲。

## DynamoDB

- **CRUD → command**:Create=`PutCommand`、Read=`GetCommand`、List=`Query`(本期暂用 `Scan`)、Update=`UpdateCommand`、Delete=`DeleteCommand`。
- **幂等/条件写**:create 用 `attribute_not_exists(#pk)`(已存在→409);update/delete 用 `attribute_exists(#pk)`(不存在→404)。`ConditionalCheckFailedException` 在 repo 里映射成 `AppError`。
- **保留字**:`status` 是保留字,表达式必须用 `ExpressionAttributeNames`(`#status`),否则 ValidationException。
- **Query vs Scan**:Scan 读全表、随数据量变慢且按读取量计费;正式应建 GSI(如 `GSI1PK=customerId`)改用 Query。本期单键表演示 Scan 并讲清为何不可扩展。
- **分页**:单次 ≤1MB,必须基于 `LastEvaluatedKey` 游标循环;本项目把它 base64 成不透明 cursor 回给客户端。
- **一致性**:`GetItem` 默认最终一致;需要读己之所写用 `ConsistentRead:true`(2× RCU,GSI 不支持)。
- **SDK v3 坑**:DocumentClient 默认**不**去 `undefined`,必须 `marshallOptions.removeUndefinedValues:true`。

## IAM(最重要的后端/平台考点)

- 每个 Lambda 一个执行角色,`table.grant(fn, "dynamodb:GetItem")` 只授一个动作 —— 只读函数无法删数据。
- 绝不挂 `AmazonDynamoDBFullAccess`。CDK 断言测试(`infra/test/stack.test.ts`)校验了角色里出现的正是单一动作。

## 验证

```bash
pnpm test                          # repo 命令形状 + 条件表达式 + 保留字别名 + 路由状态码
pnpm --filter @app/infra synth     # 看生成的 IAM policy / Runtime / BillingMode
```

相关:[[00-architecture-overview]]、下一步 [[02-auth]](Cognito + JWT)
