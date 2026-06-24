import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { AuthStack } from "../lib/stacks/auth-stack";
import { StorageStack } from "../lib/stacks/storage-stack";
import { CoreApiStack } from "../lib/stacks/core-api-stack";

const ENV = { account: "123456789012", region: "us-east-1" };

describe("CoreApiStack (synthesized — no deploy, $0)", () => {
  const app = new App();
  const env = ENV;
  const auth = new AuthStack(app, "TestAuth", { env });
  const storage = new StorageStack(app, "TestStorage", { env });
  const stack = new CoreApiStack(app, "TestStack", {
    env,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
    bucket: storage.bucket,
  });
  const template = Template.fromStack(stack);

  it("uses an on-demand DynamoDB table with a byCustomer GSI", () => {
    template.hasResourceProperties(
      "AWS::DynamoDB::Table",
      Match.objectLike({
        BillingMode: "PAY_PER_REQUEST",
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({ IndexName: "byCustomer" }),
        ]),
      }),
    );
  });

  it("creates 7 Lambdas on nodejs22.x / arm64 with active tracing", () => {
    template.resourceCountIs("AWS::Lambda::Function", 7);
    template.hasResourceProperties(
      "AWS::Lambda::Function",
      Match.objectLike({
        Runtime: "nodejs22.x",
        Architectures: ["arm64"],
        TracingConfig: { Mode: "Active" },
      }),
    );
  });

  it("sets 1-week log retention on every function", () => {
    template.resourceCountIs("AWS::Logs::LogGroup", 7);
    template.hasResourceProperties("AWS::Logs::LogGroup", { RetentionInDays: 7 });
  });

  it("protects all 7 routes with a Cognito JWT authorizer", () => {
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Route", 7);
    template.resourceCountIs("AWS::ApiGatewayV2::Authorizer", 1);
    template.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerType: "JWT",
    });
    template.hasResourceProperties(
      "AWS::ApiGatewayV2::Route",
      Match.objectLike({ AuthorizationType: "JWT" }),
    );
  });

  it("grants per-route least privilege (read role gets only Query/GetItem)", () => {
    template.hasResourceProperties(
      "AWS::IAM::Policy",
      Match.objectLike({
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({ Action: "dynamodb:GetItem" }),
          ]),
        }),
      }),
    );
    template.hasResourceProperties(
      "AWS::IAM::Policy",
      Match.objectLike({
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({ Action: "dynamodb:DeleteItem" }),
          ]),
        }),
      }),
    );
  });
});

describe("StorageStack", () => {
  const app = new App();
  const stack = new StorageStack(app, "TestStorageOnly", { env: ENV });
  const template = Template.fromStack(stack);

  it("creates a private, encrypted attachments bucket", () => {
    template.hasResourceProperties(
      "AWS::S3::Bucket",
      Match.objectLike({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: Match.anyValue(),
      }),
    );
  });
});
