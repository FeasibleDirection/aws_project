import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { AuthStack } from "../lib/stacks/auth-stack";
import { StorageStack } from "../lib/stacks/storage-stack";
import { CoreApiStack } from "../lib/stacks/core-api-stack";
import { AsyncStack } from "../lib/stacks/async-stack";
import { OrchestrationStack } from "../lib/stacks/orchestration-stack";
import { ObservabilityStack } from "../lib/stacks/observability-stack";

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

describe("AsyncStack", () => {
  const app = new App();
  const auth = new AuthStack(app, "A2", { env: ENV });
  const storage = new StorageStack(app, "S2", { env: ENV });
  const core = new CoreApiStack(app, "C2", {
    env: ENV,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
    bucket: storage.bucket,
  });
  const stack = new AsyncStack(app, "Async2", { env: ENV, table: core.table });
  const template = Template.fromStack(stack);

  it("buffers via SQS with a DLQ redrive policy", () => {
    template.resourceCountIs("AWS::SQS::Queue", 2);
    template.hasResourceProperties(
      "AWS::SQS::Queue",
      Match.objectLike({ RedrivePolicy: Match.objectLike({ maxReceiveCount: 3 }) }),
    );
  });

  it("has an EventBridge bus, an SNS topic, 3 Lambdas, and 2 event sources", () => {
    template.resourceCountIs("AWS::Events::EventBus", 1);
    template.resourceCountIs("AWS::SNS::Topic", 1);
    template.resourceCountIs("AWS::Lambda::Function", 3);
    // DynamoDB stream source + SQS source
    template.resourceCountIs("AWS::Lambda::EventSourceMapping", 2);
  });
});

describe("OrchestrationStack", () => {
  const app = new App();
  const auth = new AuthStack(app, "A3", { env: ENV });
  const storage = new StorageStack(app, "St3", { env: ENV });
  const core = new CoreApiStack(app, "C3", {
    env: ENV,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
    bucket: storage.bucket,
  });
  const asyncStack = new AsyncStack(app, "Asy3", { env: ENV, table: core.table });
  const stack = new OrchestrationStack(app, "Orch3", {
    env: ENV,
    table: core.table,
    bus: asyncStack.bus,
  });
  const template = Template.fromStack(stack);

  it("creates a Standard state machine with 5 task Lambdas", () => {
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
    template.hasResourceProperties(
      "AWS::StepFunctions::StateMachine",
      Match.objectLike({ StateMachineType: "STANDARD" }),
    );
    template.resourceCountIs("AWS::Lambda::Function", 5);
  });

  it("subscribes the state machine to order.created", () => {
    template.resourceCountIs("AWS::Events::Rule", 1);
  });
});

describe("ObservabilityStack", () => {
  const app = new App();
  const auth = new AuthStack(app, "A4", { env: ENV });
  const storage = new StorageStack(app, "St4", { env: ENV });
  const core = new CoreApiStack(app, "C4", {
    env: ENV,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
    bucket: storage.bucket,
  });
  const asyncStack = new AsyncStack(app, "Asy4", { env: ENV, table: core.table });
  const stack = new ObservabilityStack(app, "Obs4", {
    env: ENV,
    deadLetterQueue: asyncStack.deadLetterQueue,
    monthlyBudgetUsd: 10,
  });
  const template = Template.fromStack(stack);

  it("creates a dashboard, 3 alarms, and a monthly budget", () => {
    template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    template.resourceCountIs("AWS::CloudWatch::Alarm", 3);
    template.resourceCountIs("AWS::Budgets::Budget", 1);
  });
});
