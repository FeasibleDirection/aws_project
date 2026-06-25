# 08 · 密钥与配置(Secrets Manager · SSM · KMS)

对应代码:`infra/lib/stacks/config-stack.ts`、`infra/lib/stacks/data-stack.ts`(`addRotationSingleUser`)。

## 一句话

> "配置和密钥都不进代码/不进 env-in-git:**非密配置放 SSM Parameter Store**(免费 Standard、版本化、IAM 控权);**密钥放 Secrets Manager**,并用**客户托管 KMS CMK**(信封加密 + 自动轮换)加密;数据库凭证开 **自动轮换**(`addRotationSingleUser`,轮换 Lambda 在 VPC 内经 Secrets 接口端点访问)。"

## 考点

- **Secrets Manager vs SSM Parameter Store**:
  - **SSM Standard**:免费、4KB、版本化、可 KMS 加密(SecureString)——存非密或低敏配置最省。
  - **Secrets Manager**:$0.40/密钥/月,内建**轮换**、跨账号共享、随机生成——存数据库密码/API key、需要轮换时用它。
  - 一句话取舍:"要轮换就 Secrets Manager,纯配置就 SSM(省钱)"。
- **KMS / 信封加密**:数据不是直接用 CMK 加密,而是 CMK 加密一个数据密钥(DEK),DEK 加密数据——这就是**信封加密**,兼顾安全与性能。
- **客户托管 key (CMK) vs AWS 托管 key**:CMK($1/月)可控**key policy**、可审计、可控轮换;AWS 托管 key 免费但不可控。本项目建 1 个 CMK 演示,其余服务可用免费的 AWS 托管 key。
- **key policy vs IAM**:KMS 用谁能用这把钥匙由 key policy + IAM 共同决定(双重授权)。
- **自动轮换**:Aurora 密钥 `addRotationSingleUser` 每 30 天换一次密码;轮换 Lambda 必须能同时访问 Secrets Manager 和数据库——本项目零 NAT VPC 里靠 Secrets 接口端点 + in-VPC 到库。
- **不把密钥放代码/env 的理由**:env 变量会进日志/进 git、难轮换、难审计;运行时从 Secrets/SSM 拉取并最小权限授权。

## 已落地

- ConfigStack(常开):CMK(`alias/orders-demo`,开轮换)+ SSM 参数 `/orders-demo/dev/feature-flags`(注意:SSM 参数名不能以 `aws`/`ssm` 开头)+ Secrets Manager 密钥(CMK 加密)。
- DataStack(按需):Aurora 主密钥 + RDS Proxy 用该密钥 + `addRotationSingleUser` 自动轮换。
- ObservabilityStack(Phase 6):CfnBudget 也是"配置即代码"的一例。

## 验证(部署后)

`aws ssm get-parameter --name /orders-demo/dev/feature-flags`;`aws secretsmanager describe-secret --secret-id orders-demo/third-party-api-key`(看 KmsKeyId 指向 CMK);`aws kms describe-key --key-id alias/orders-demo`(看 KeyRotationEnabled)。

相关:[[07-relational-rds-cache]]、下一步 [[09-cicd-oidc]]
