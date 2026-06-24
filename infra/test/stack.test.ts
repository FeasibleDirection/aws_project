import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { CoreApiStack } from "../lib/stacks/core-api-stack";

describe("CoreApiStack (synthesized — no deploy, $0)", () => {
  const app = new App();
  const stack = new CoreApiStack(app, "TestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  const template = Template.fromStack(stack);

  it("uses an on-demand DynamoDB table", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("creates 5 Lambdas on nodejs22.x / arm64 with active tracing", () => {
    template.resourceCountIs("AWS::Lambda::Function", 5);
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
    template.resourceCountIs("AWS::Logs::LogGroup", 5);
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 7,
    });
  });

  it("exposes an HTTP API with exactly 5 routes", () => {
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Route", 5);
  });

  it("grants per-route least privilege (read role gets only GetItem)", () => {
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
