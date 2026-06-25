# 09 · CI/CD(GitHub Actions + OIDC)

对应代码:`.github/workflows/ci.yml`、`infra/lib/stacks/pipeline-stack.ts`。

## 一句话

> "GitHub Actions:PR/push 跑 `typecheck + test + openapi:gen + build`;合并到 main 用 **GitHub OIDC** 换一个**短时 STS 凭证** assume 部署角色再 `cdk deploy`——**没有任何长期 access key 存在仓库里**。部署角色遵循最小权限:它只被允许 `sts:AssumeRole` 到 **CDK bootstrap 角色**(真正的部署权限在那),而不是给它 AdministratorAccess。"

## 流水线

```
PR / push  → build-test: pnpm install → typecheck → test → openapi:gen → build
push main  → deploy(needs build-test): OIDC assume role → cdk deploy --all（7 个常开栈）
```

## 考点

- **OIDC vs access key**(必问):access key 是长期凭证,会泄露/进 git/要轮换;**OIDC** 让 GitHub 用 workflow 的身份令牌找 AWS 换**短时**凭证,无长期密钥。`permissions: id-token: write` + `aws-actions/configure-aws-credentials` 是关键。
- **信任策略要收紧**:OIDC role 的 `sub` 条件锁到 `repo:OWNER/REPO:ref:refs/heads/main`,`aud=sts.amazonaws.com`——只有这个仓库的 main 分支能 assume,防止别的仓库冒用。
- **最小权限部署角色**:不给 Admin,而是只允许 assume `cdk-*` bootstrap 角色(deploy/file-publishing/lookup),实际权限由 bootstrap 角色承载。
- **基建即测试**:CI 跑的 `pnpm test` 包含 `aws-cdk-lib/assertions` 的 `Template.fromStack` 断言——**不部署就能验证**运行时/架构/计费/权限/资源数,$0、秒级。
- **Turbo 缓存**:`turbo run` 对未变化的包命中缓存(`FULL TURBO`),CI 更快。
- **成本栈隔离**:CI 只 `--all` 部署 7 个常开栈;Phase 7 的 NetworkStack/DataStack/CacheStack 需 `-c withData=true`,CI 不会误部署。
- **蓝绿/金丝雀 / 回滚**:CloudFormation 变更集 + 失败自动回滚;多环境用不同 OIDC role/账号做 dev→staging→prod 晋级(本 demo 单 stage)。

## 启用步骤

1. 部署 OIDC provider + 角色:
   ```powershell
   pnpm --filter @app/infra run deploy -- PipelineStack -c githubRepo=你的GitHub用户名/仓库名 --require-approval never
   ```
   输出 `DeployRoleArn`。
2. GitHub 仓库 → Settings → Secrets and variables → Actions → 新建 secret `AWS_DEPLOY_ROLE_ARN` = 上面的 ARN。
3. push 到 main 即触发部署。(账号每个 OIDC URL 只能有一个 provider;若已存在,复用即可。)

相关:[[08-secrets]]、回到 [[00-architecture-overview]]
