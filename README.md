# aws-crud-suite

一个用来准备 **后端 / 平台工程 / 云** 方向 AWS 面试的"全套" CRUD demo。
单一 TypeScript monorepo,业务域是 **Orders 订单**,主干是 **API Gateway HTTP API → Lambda → DynamoDB**,基建全用 **AWS CDK (TypeScript)**。每个 AWS 模块都配一篇 [`docs/`](./docs) 讲稿(service → 考点)。

> 完整规划见 `C:\Users\Administrator\.claude\plans\plan-keen-hippo.md`。当前已完成 **Phase 1(核心 CRUD 主干)**。

## 结构

```
packages/shared   @app/shared   — Zod v4 单一真源(类型 + 运行时校验),前后端共享
packages/openapi  @app/openapi  — 从 Zod 投影出 openapi.json(z.toJSONSchema,无额外依赖)
apps/api          @app/api      — 5 个 per-route Lambda handler + DynamoDB repo + 本地 http shim
apps/web          @app/web      — 极简"print API"页 + Scalar 可执行文档(无框架)
infra             @app/infra    — CDK app:CrudFunction(L3)+ CoreApiStack(per-route 最小权限 IAM)
docs              面试讲稿(service → 考点)
```

## 前置工具

- Node 22+(本机 24)、pnpm(`corepack enable pnpm`)
- 部署需要:**AWS CLI v2** + 已配置凭证(`aws configure` 或 SSO)
- 本地 DynamoDB 需要:**Docker Desktop**(仅 `pnpm --filter @app/api dev` 用到)

## 本地开发(成本 $0)

```bash
pnpm install
pnpm openapi:gen            # 生成 openapi.json
pnpm typecheck             # 全部包类型检查
pnpm test                  # 单测 + CDK 断言(不部署,零成本)

# 跑本地 API(需 Docker)
docker compose up -d                       # DynamoDB Local :8000
pnpm --filter @app/api dev                 # http://localhost:3000/orders (IS_LOCAL=1)
# 建表:见 docs/01,或在 DynamoDB Local 建一张 PK=id 的 Orders 表

# 看前端
pnpm --filter @app/web build && pnpm --filter @app/web preview   # http://localhost:5173
```

## 部署到真实 AWS(us-east-1)

```bash
# 一次性
export CDK_DEFAULT_REGION=us-east-1
pnpm --filter @app/infra bootstrap         # cdk bootstrap(每账号每区域一次)

# 部署（AuthStack + CoreApiStack,常开 ~$0/月:Cognito/DynamoDB/Lambda/HTTP API 都在免费层）
pnpm --filter @app/infra synth                          # 看 CloudFormation
pnpm --filter @app/infra run deploy -- --all --require-approval never

# 用完销毁
pnpm --filter @app/infra run destroy -- --all
```
输出会有:`AuthStack.UserPoolId`、`AuthStack.UserPoolClientId`、`CoreApiStack.ApiUrl`。

### Phase 2:拿 Cognito token 测(路由现在都要 JWT)
```powershell
$POOL="<UserPoolId>"; $CLIENT="<UserPoolClientId>"; $api="<ApiUrl>"
aws cognito-idp admin-create-user --user-pool-id $POOL --username demo@example.com --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id $POOL --username demo@example.com --password "Passw0rd!23" --permanent
$TOKEN = (aws cognito-idp initiate-auth --client-id $CLIENT --auth-flow USER_PASSWORD_AUTH `
  --auth-parameters "USERNAME=demo@example.com,PASSWORD=Passw0rd!23" --query "AuthenticationResult.IdToken" --output text)

curl.exe -s "$api/orders"                                   # 无 token → 401
curl.exe -s "$api/orders" -H "authorization: Bearer $TOKEN" # 带 token → 200,只看到自己的订单
curl.exe -s -X POST "$api/orders" -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{\"items\":[{\"sku\":\"A\",\"qty\":2,\"price\":9.99}]}'
```
前端 print 页:`apps/web` 页面顶部填 **API base** + 把 `$TOKEN` 粘进 **JWT** 框;Scalar `docs.html` 右上角 Authorize 里粘 token。

## 成本守则

- 核心栈走 **DynamoDB on-demand + Lambda + HTTP API**,demo 规模基本 **$0**。
- 每个 Lambda 日志组固定 **7 天保留**(`CrudFunction` 默认),避免日志隐形账单。
- 后续昂贵模块(VPC/Aurora/RDS Proxy/ElastiCache)将放在**独立按需栈**,用完 `cdk destroy`。
- 部署前建一个 **AWS Budgets $5/$10/$20 告警**(Phase 8 会用 CDK 自动建)。

## 阶段路线

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1 | 核心 CRUD 主干 | ✅ |
| 2 | Cognito 认证 + JWT authorizer + 按用户隔离(GSI) | ✅ |
| 3 | S3 presigned 上传/下载(订单附件) | ✅ |
| 4 | 异步:Streams→EventBridge→SQS+DLQ→SNS + 定时清理 | ✅ |
| 5 | Step Functions 履约 saga(Retry/Catch/补偿) | ✅ |
| 6 | 可观测:Powertools+X-Ray+CloudWatch Dashboard/告警+Budget | ✅ |
| 7 | Aurora SLv2 + RDS Proxy + ElastiCache + 零NAT VPC(按需·计费) | ✅ |
| 8 | ConfigStack:KMS CMK + SSM 配置 + Secrets(CMK 加密)+ Aurora 轮换 | ✅ |
| 9 | CI/CD:GitHub Actions + OIDC（无长期密钥）+ 最小权限部署角色 | ✅ |
