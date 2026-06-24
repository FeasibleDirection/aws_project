# 04 · 异步解耦(DynamoDB Streams · EventBridge · SQS · SNS)

对应代码:`infra/lib/stacks/async-stack.ts`、`apps/api/src/events/{stream-publisher,order-consumer,stale-cleanup}.ts`、`core-api-stack.ts`(表上开 stream)。

## 一句话

> "下单不直接发事件——用 **DynamoDB Streams** 做变更捕获(CDC)把已提交的写发到 **EventBridge**(避免 dual-write 丢事件、且 API 代码零改动);EventBridge **rule** 按 `detail-type` 路由到 **SQS**(带 **DLQ**)做可靠缓冲,**消费者** Lambda 用部分批失败处理、再 fan-out 到 **SNS** 通知;另有一个**定时 rule** 每天清理过期 PENDING 订单。"

## 链路

```
Create → DynamoDB —(Stream INSERT)→ stream-publisher → EventBridge bus
   → Rule(order.created) → SQS(+DLQ) → order-consumer → SNS topic
(另: 每日 Rule(rate 1 day) → stale-cleanup → Scan PENDING + 置 CANCELLED)
```

## 考点

- **SQS vs SNS vs EventBridge**(必考):
  - **SQS** = 队列,**拉**取、消息被消费一次、做**缓冲削峰/解耦**。
  - **SNS** = 发布订阅,**推**送、一条消息 **fan-out** 给多个订阅者(邮件/HTTP/SQS)。
  - **EventBridge** = 事件总线,按事件**内容路由**(rule 过滤 `source`/`detail-type`/detail 字段)、有 schema registry、接 SaaS 源、能定时。需要"按内容分发、加消费者不动生产者"就用它;只是简单 fan-out 用 SNS 更省。
- **DLQ / redrive**(几乎必问):队列配 `maxReceiveCount=3` + DLQ,毒消息重试 3 次后进 DLQ,不阻塞队列;告警挂 DLQ 深度(Phase 6)。
- **部分批失败**(`reportBatchItemFailures`):返回 `batchItemFailures`,只重投失败的那条,而不是整批重来。
- **幂等**:SQS/Streams 都是**至少一次**投递,消费者必须幂等(按订单 id/事件 id 去重)。
- **dual-write 问题**:在 create 里"写库 + 发事件"不是原子的,可能写成功但发事件失败 → 丢事件。**CDC(Streams)从已提交的变更发事件**是更稳的模式(事务性发件箱的简化版)。
- **何时 Scan 是对的**:`stale-cleanup` 是低频批处理任务,全表 Scan 可接受;热路径绝不 Scan。
- **EventBridge Scheduler vs 定时 Rule**:本项目定时清理用经典 `events.Rule(schedule: rate(1 day))`;更现代的 **EventBridge Scheduler** 支持一次性、时区、灵活时间窗、14M 次/月免费——可作为升级讲点。
- **流处理调优**:`startingPosition`、`batchSize`、`bisectBatchOnError`、`retryAttempts`、`filterCriteria`(只收 INSERT)。

## 验证(部署后)

创建一个订单 → CloudWatch 看 `StreamPublisherFn`/`OrderConsumerFn` 日志(几秒内)→ EventBridge bus 指标 → SQS 队列 sent/received → SNS(可给 topic 加个邮箱订阅看通知)。手动触发清理:在 Lambda 控制台 invoke `StaleCleanupFn`。

相关:[[03-storage-s3]]、下一步 [[05-orchestration-stepfunctions]]
