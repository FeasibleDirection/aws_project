import { Construct } from "constructs";
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { Key } from "aws-cdk-lib/aws-kms";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

/**
 * Foundational config + secrets. Demonstrates the "where do config/secrets
 * live" answer: non-secret config in SSM Parameter Store (free Standard tier),
 * secrets in Secrets Manager encrypted with a customer-managed KMS key (envelope
 * encryption + automatic key rotation). Never in code or env-in-git.
 */
export class ConfigStack extends Stack {
  readonly key: Key;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Customer-managed key with automatic yearly rotation (envelope encryption).
    this.key = new Key(this, "OrdersKey", {
      alias: "alias/orders-demo",
      description: "CMK for orders demo secrets (envelope encryption)",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY, // demo posture
    });

    // Non-secret config → SSM Parameter Store (free, IAM-scoped, versioned).
    new StringParameter(this, "FeatureFlags", {
      parameterName: "/aws-crud-demo/dev/feature-flags",
      stringValue: JSON.stringify({ newCheckout: false, betaUsers: [] }),
      description: "Non-secret app config (SSM Parameter Store)",
    });

    // Secret → Secrets Manager, encrypted with the CMK (not the AWS-managed key).
    new Secret(this, "ThirdPartyApiKey", {
      secretName: "orders-demo/third-party-api-key",
      description: "Example third-party API key, encrypted with the CMK",
      encryptionKey: this.key,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ provider: "example" }),
        generateStringKey: "apiKey",
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    new CfnOutput(this, "KeyArn", { value: this.key.keyArn });
  }
}
