# 05 · 编排与 saga(Step Functions)

对应代码:`infra/lib/stacks/orchestration-stack.ts`、`apps/api/src/saga/*`。

## 一句话

> "订单履约是多步、可能失败、需要回滚的流程,所以用 **Step Functions Standard** 状态机做编排,而不是在 Lambda 里链式调 Lambda:`reserve → charge → ship`,`charge` 带 **Retry**,每步带 **Catch** 触发**补偿**(`refund` + `release-inventory`)——这就是 **saga** 模式。由 `order.created` 事件自动触发,也能在控制台手动 Start 看**可视化执行图**。"

## 状态机

```
ReserveInventory → ChargePayment → ShipOrder → Fulfilled(Succeed)
                       │ Catch            │ Catch
                       ▼                  ▼
              ReleaseInventory      RefundPayment → ReleaseInventory → FulfillmentFailed(Fail)
```

- 前向每步是一个 `LambdaInvoke`(`payloadResponseOnly`,状态透传)。
- `ChargePayment` 加 `Retry`(maxAttempts 2、指数退避)处理瞬时失败;失败到顶后走 `Catch`。
- 补偿是**反向**做的:charge 失败只需释放库存;ship 失败要先退款再释放库存。
- `ShipOrder` 成功时把订单状态改为 `SHIPPED`(唯一一个碰 DynamoDB 的任务,`dynamodb:UpdateItem`)。

## 考点

- **何时用 Step Functions 而不是 Lambda 链**:多步/分支/重试/人工审批/超过 15 分钟/需要可审计可视化时。Lambda 里硬编码编排会变脆、难观测、错误处理散落。
- **Standard vs Express**:Standard = 长时(最长 1 年)、精确一次、完整执行历史/可视化、按状态转换计费(4000 次/月免费);Express = 高频短时、按次+时长计费、至少一次、无完整历史。本项目用 Standard 以便看执行图。
- **saga / 补偿事务**:分布式下没有跨服务 ACID 事务,用"每个前向步配一个补偿步、失败时反向补偿"来达到最终一致。`Catch` + 补偿链就是实现。
- **Retry vs Catch**:`Retry` 先在本步重试瞬时错误;重试用尽再被 `Catch` 捕获走补偿。`resultPath: "$.error"` 把错误并入状态、保留 orderId 给补偿用。
- **触发方式**:EventBridge rule 把 `order.created` 路由来 `StartExecution`,并用 `RuleTargetInput` 把事件归一化成 `{orderId, customerId}`,与手动 Start 的输入一致。
- **直接服务集成**:Step Functions 能直接调 200+ 服务(不必每步都套 Lambda);本 demo 为演示用 Lambda 任务,可提"可用 SDK 集成省掉胶水 Lambda"。

## 验证(部署后)

控制台 → Step Functions → `OrderFulfillment` → **Start execution**,输入:
```json
{ "orderId": "<某订单 id>", "simulateFailAt": "ship" }
```
看可视化图:`ship` 失败 → `RefundPayment` → `ReleaseInventoryAfterShip` → Failed。把 `simulateFailAt` 去掉则全绿、订单变 `SHIPPED`。真实下单也会经 EventBridge 自动触发一次执行。

相关:[[04-async-sqs-eventbridge]]、下一步 [[06-observability-powertools]]
