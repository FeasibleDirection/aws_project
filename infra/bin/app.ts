import { App, Tags } from "aws-cdk-lib";
import { getConfig } from "../lib/config";
import { APP_NAME } from "../lib/constants";
import { AuthStack } from "../lib/stacks/auth-stack";
import { StorageStack } from "../lib/stacks/storage-stack";
import { CoreApiStack } from "../lib/stacks/core-api-stack";
import { AsyncStack } from "../lib/stacks/async-stack";

const app = new App();
const config = getConfig("dev");

// Phase 2: Cognito pool fronts the API. Phase 3: S3 bucket for attachments.
const auth = new AuthStack(app, "AuthStack", { env: config.env });
const storage = new StorageStack(app, "StorageStack", { env: config.env });
const core = new CoreApiStack(app, "CoreApiStack", {
  env: config.env,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  bucket: storage.bucket,
});

// Phase 4: async event fan-out driven by the table's stream.
new AsyncStack(app, "AsyncStack", { env: config.env, table: core.table });

// Cost tracking + ownership tags applied to every resource.
Tags.of(app).add("Project", APP_NAME);
Tags.of(app).add("Stage", config.stage);
Tags.of(app).add("ManagedBy", "cdk");
