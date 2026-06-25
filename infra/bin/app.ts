import { App, Tags } from "aws-cdk-lib";
import { getConfig } from "../lib/config";
import { APP_NAME } from "../lib/constants";
import { ConfigStack } from "../lib/stacks/config-stack";
import { AuthStack } from "../lib/stacks/auth-stack";
import { StorageStack } from "../lib/stacks/storage-stack";
import { CoreApiStack } from "../lib/stacks/core-api-stack";
import { AsyncStack } from "../lib/stacks/async-stack";
import { OrchestrationStack } from "../lib/stacks/orchestration-stack";
import { ObservabilityStack } from "../lib/stacks/observability-stack";
import { NetworkStack } from "../lib/stacks/network-stack";
import { DataStack } from "../lib/stacks/data-stack";
import { CacheStack } from "../lib/stacks/cache-stack";

const app = new App();
const config = getConfig("dev");

// Phase 8: foundational config + secrets (KMS CMK, SSM params, Secrets Manager).
new ConfigStack(app, "ConfigStack", { env: config.env });

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
const asyncStack = new AsyncStack(app, "AsyncStack", {
  env: config.env,
  table: core.table,
});

// Phase 5: Step Functions fulfillment saga, triggered by order.created.
new OrchestrationStack(app, "OrchestrationStack", {
  env: config.env,
  table: core.table,
  bus: asyncStack.bus,
});

// Phase 6: dashboards, alarms, and the cost budget.
new ObservabilityStack(app, "ObservabilityStack", {
  env: config.env,
  deadLetterQueue: asyncStack.deadLetterQueue,
  alarmEmail: config.alarmEmail,
  monthlyBudgetUsd: config.monthlyBudgetUsd,
});

// Phase 7: relational + cache + VPC. COST-BEARING and gated behind a context
// flag so a plain `cdk deploy --all` never spins them up. To use them:
//   cdk deploy NetworkStack DataStack CacheStack -c withData=true
//   cdk destroy NetworkStack DataStack CacheStack -c withData=true   (after demo)
if (app.node.tryGetContext("withData") === "true") {
  const network = new NetworkStack(app, "NetworkStack", { env: config.env });
  new DataStack(app, "DataStack", { env: config.env, vpc: network.vpc });
  new CacheStack(app, "CacheStack", {
    env: config.env,
    vpc: network.vpc,
    table: core.table,
  });
}

// Cost tracking + ownership tags applied to every resource.
Tags.of(app).add("Project", APP_NAME);
Tags.of(app).add("Stage", config.stage);
Tags.of(app).add("ManagedBy", "cdk");
