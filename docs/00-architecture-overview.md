# 00 · 架构总览 与 面试主线

## 一句话

> "我用 AWS CDK(TypeScript)把一个订单 CRUD 做成全套 serverless:HTTP API → Lambda(nodejs22/ARM64)→ DynamoDB on-demand,Zod 做前后端单一真源,OpenAPI 由 Zod 投影、可在线 Try-it-out。基建按**生命周期/成本**拆栈,贵的资源按需起停,核心常开基本零成本。"

## 数据流

```
浏览器/Scalar ──HTTPS──> API Gateway HTTP API ──proxy(v2)──> Lambda(per-route)──> DynamoDB(on-demand)
                                  │                              │
                              CORS/JWT(P2)                  X-Ray / CloudWatch Logs
```

## 关键取舍(每个都是考点)

| 决策 | 选择 | 为什么 |
|---|---|---|
| API | HTTP API(非 REST API) | 便宜 ~71%、延迟更低、内建 JWT/CORS;需要 API key/usage plan/请求校验/WAF 才上 REST |
| 计算 | Lambda nodejs22.x + ARM64 | 22.x 当前 LTS;Graviton 便宜 ~20% |
| 存储 | DynamoDB on-demand | 零容量规划、闲置零成本 |
| 组织 | 一路由一函数(per-route) | **最小权限**:只读函数的 role 连 `DeleteItem` 都没有 |
| 类型 | Zod v4 单一真源 | 后端运行时校验 + 前端类型 + OpenAPI 全部从一处派生,永不漂移 |
| IaC | CDK v2(TS) | 基建与应用同语言;`grant(fn, action)` 把最小权限写进代码 |

## "全套" 如何分栈(按成本/生命周期,不按服务)

- **常开且便宜**(~$0/月):Config / CoreApi / Auth / Storage / Async / Orchestration / Observability / Web
- **昂贵且按需**(用完 `cdk destroy`):Network(VPC)/ Data(Aurora+RDS Proxy)/ Cache(ElastiCache)
- 跨栈边界用 **SSM Parameter Store** 解耦,避免 CloudFormation export 删除锁,从而让贵栈能独立销毁。

## 可能被追问

- **为什么 serverless 而不是 EC2/容器?** 按请求计费、自动伸缩、零运维;长任务(>15min)、稳定高负载或特殊运行时才转 Fargate/ECS。
- **怎么控制成本?** on-demand + ARM64 + 日志保留 + 贵资源按需起停 + Budgets 告警 + 按 tag 在 Cost Explorer 拆分。
- **怎么保证文档不骗人?** OpenAPI 是 Zod 的确定性投影(`z.toJSONSchema`),schema 改了文档自动跟着改。

相关:[[01-apigw-lambda-dynamodb]]
