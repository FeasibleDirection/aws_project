# 06 · 可观测性(Powertools · X-Ray · CloudWatch)

对应代码:`apps/api/src/common/{powertools,middleware}.ts`、`apps/api/src/routes/create.ts`(自定义指标)、`infra/lib/stacks/observability-stack.ts`、`infra/lib/constructs/crud-function.ts`(Tracing.ACTIVE + 日志保留)。

## 一句话

> "可观测性是底线。HTTP 处理用 **Middy + Powertools v2** 一把接上:`Logger`(结构化 JSON 日志)、`Tracer`(X-Ray)、`Metrics`(EMF 自定义指标),错误统一在中间件映射成信封;每个 Lambda 都 `Tracing.ACTIVE` + 7 天日志保留;CloudWatch 一个 Dashboard + 告警(DLQ 深度、Lambda 错误、p99、预估账单),告警发到 SNS。"

## 三件套(logs / traces / metrics)

- **Logger**:结构化 JSON、自动注入请求上下文(`injectLambdaContext`),按 `correlation id` 串联。比 `console.log` 强在可检索、可关联。
- **Tracer**:`captureLambdaHandler` + 函数级 `Tracing.ACTIVE` → X-Ray **ServiceMap** 看 API GW→Lambda→DynamoDB→SQS 全链路,定位是哪一跳慢。再用 `tracer.captureAWSv3Client(client)` 可把下游 AWS 调用也变成子段。
- **Metrics**:EMF(Embedded Metric Format)零额外调用地从日志里产出自定义指标,例如 `OrdersCreated`(在 create 里 `metrics.addMetric`);`logMetrics` 中间件在结束时 flush。

## CloudWatch(ObservabilityStack)

- **Dashboard**(`orders-demo`):Lambda 错误、p99 时延、DLQ 深度、OrdersCreated。
- **告警** → SNS topic(可订阅邮箱):
  - **DLQ 深度 ≥ 1**:有消息进死信(几乎必问的"你盯什么")。
  - **Lambda 错误 Sum > 5 / 5min**:错误尖峰。
  - **EstimatedCharges > 预算**:账单告警(只在 us-east-1 有该指标,需在账户里开启 billing alerts)。
- **Budget**:`CfnBudget` 月度预算($10,ACTUAL>80% / FORECASTED>100% 邮件)—— 把手动建的预算也写进 IaC。

## 考点

- **怎么排查偶发失败**:先看 CloudWatch Logs(结构化、按 correlation id 过滤)→ X-Ray trace 看哪一跳异常/超时 → 指标/告警确认影响面。
- **Logs vs Metrics vs Alarms**:日志=事件明细;指标=可聚合的时间序列;告警=指标越界触发动作。三者配合。
- **cold-start metric / EMF**:Powertools 能开 `captureColdStartMetric`;EMF 让"打一条日志=产一个指标",省去 PutMetricData 调用。
- **告警该盯什么**:错误率、p99 时延、DLQ 深度、并发/限流、账单。`treatMissingData` 要设对(本项目无数据时不报警)。
- **成本**:Dashboard ≤3、Alarm ≤10 在免费层内;日志保留 7 天避免隐形账单(`CrudFunction` 默认)。

## 验证(部署后)

下几单 → 看 `orders-demo` Dashboard 的 OrdersCreated 上升;X-Ray ServiceMap 看链路;在 Step Functions 触发一次 `ship` 失败 → 看错误是否进指标。给 alarm SNS / budget 加邮箱(`ALARM_EMAIL=you@x.com pnpm --filter @app/infra run deploy -- --all`)能收告警邮件。

相关:[[05-orchestration-stepfunctions]]、下一步 [[07-relational-rds-cache]]
