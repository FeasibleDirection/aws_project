import { Construct } from "constructs";
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import {
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
} from "aws-cdk-lib/aws-iam";

export interface PipelineStackProps extends StackProps {
  /** "owner/repo" allowed to assume the deploy role on the main branch. */
  readonly githubRepo: string;
}

/**
 * Keyless CI deploys: a GitHub OIDC identity provider + a deploy role that only
 * the given repo's main branch can assume — no long-lived access keys to leak.
 * The role follows least privilege by only being allowed to assume the CDK
 * bootstrap roles (which hold the actual deploy permissions), not Admin.
 */
export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const provider = new OpenIdConnectProvider(this, "GithubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const deployRole = new Role(this, "DeployRole", {
      roleName: "orders-demo-github-deploy",
      assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });

    // Least privilege: the CI role only assumes the CDK bootstrap roles, which
    // carry the real deploy permissions (not AdministratorAccess on this role).
    deployRole.addToPolicy(
      new PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    new CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn });
  }
}
