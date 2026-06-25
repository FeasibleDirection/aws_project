# 07 · 关系型 + 缓存 + VPC(按需,会计费)

对应代码:`infra/lib/constructs/vpc-with-endpoints.ts`、`infra/lib/stacks/{network,data,cache}-stack.ts`、`apps/api/src/data/rds-handler.ts`、`apps/api/src/cache/cache-aside.ts`。
> 这三个栈用 context flag 闸住,`--all` 不会部署。仅 synth 验证过,部署会真实计费。

## 一句话

> "关系型用 **Aurora Serverless v2(Postgres)scale-to-zero**(空闲≈$0)+ **RDS Proxy** 做连接池,放私有隔离子网;VPC 的省钱关键是 **`natGateways:0` + S3/DynamoDB gateway endpoint(免费)+ Secrets interface endpoint**,VPC Lambda 不需要 NAT 也能读密钥/查库;缓存用 **ElastiCache Serverless Valkey** + cache-aside,热点读命中缓存、未命中回源 DynamoDB。用完一律 `cdk destroy`(RDS Proxy 不暂停,会持续计费)。"

## 考点

- **SQL vs NoSQL 取舍**:需要 JOIN、即席查询、多行 ACID 事务 → 关系型(Aurora);需要已知访问模式下个位数毫秒、自动伸缩 → DynamoDB。本项目主存 DynamoDB,Aurora 作"读模型/报表"对照。
- **RDS Proxy 为什么必须**:Lambda 高并发会瞬间打满 Postgres 连接数;RDS Proxy 池化/复用连接、平滑故障切换。**坑**:RDS Proxy 按 vCPU-小时计费且**不随 Aurora 暂停**——这是"贵的那一个"。
- **Aurora scale-to-zero**:min ACU 0 + 自动暂停,空闲只剩存储费;但**有活动连接(含 RDS Proxy 保活)会阻止暂停**,所以要会讲"确认它真暂停了"。
- **VPC 成本设计(最强省钱讲稿)**:NAT Gateway ~$32/月/AZ 是最常见的意外账单;`natGateways:0` + **gateway endpoint(S3/DynamoDB 免费)** + 按需 **interface endpoint(Secrets,~$/AZ,栈在线时才计费)**。代价:VPC Lambda 只能访问有 endpoint 的 AWS 服务——本 demo 刚好够。要访问第三方 HTTP 才需要 NAT(或便宜的 fck-nat 实例 ~$3.5/月)。
- **Lambda 入 VPC 的冷启动**:历史上 ENI 挂载慢;现在 Hyperplane ENI 大幅改善,但仍要权衡是否真需要入 VPC。
- **cache-aside vs DAX**:cache-aside 通用(任何数据源)、需自己管失效;DAX 是 DynamoDB 专用、零代码但只对 DynamoDB。Valkey 比 Redis OSS 便宜、serverless 100MB 起步 ~$6/月。
- **Multi-AZ vs 读副本**:Multi-AZ 提高可用性(自动故障切换);读副本扩读吞吐。

## 部署 / 销毁(会计费!)

```powershell
# 部署(显式开 withData;NetworkStack 先)
pnpm --filter @app/infra run deploy -- NetworkStack DataStack CacheStack -c withData=true --require-approval never
# 测:curl 两个 Function URL
curl.exe "<RdsFnUrl>"                 # 经 RDS Proxy 查 Aurora,返回 version()
curl.exe "<CacheFnUrl>?id=<订单id>"   # 第一次 source=dynamodb,第二次 source=cache
# ⚠️ 用完立刻销毁(RDS Proxy/ElastiCache 不暂停)
pnpm --filter @app/infra run destroy -- NetworkStack DataStack CacheStack -c withData=true
```
一次 2 小时 demo < $1;忘记销毁:RDS Proxy ~$88/月、ElastiCache ~$6/月。Function URL 为演示用 `authType: NONE`(公开),生产应上 IAM/授权。

相关:[[06-observability-powertools]]、下一步 [[08-secrets]]
