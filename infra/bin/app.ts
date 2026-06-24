import { App, Tags } from "aws-cdk-lib";
import { getConfig } from "../lib/config";
import { APP_NAME } from "../lib/constants";
import { AuthStack } from "../lib/stacks/auth-stack";
import { CoreApiStack } from "../lib/stacks/core-api-stack";

const app = new App();
const config = getConfig("dev");

// Phase 2: Cognito pool fronts the API; CoreApi attaches its JWT authorizer.
const auth = new AuthStack(app, "AuthStack", { env: config.env });
new CoreApiStack(app, "CoreApiStack", {
  env: config.env,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
});

// Cost tracking + ownership tags applied to every resource.
Tags.of(app).add("Project", APP_NAME);
Tags.of(app).add("Stage", config.stage);
Tags.of(app).add("ManagedBy", "cdk");
