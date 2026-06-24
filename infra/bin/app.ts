import { App, Tags } from "aws-cdk-lib";
import { getConfig } from "../lib/config";
import { APP_NAME } from "../lib/constants";
import { CoreApiStack } from "../lib/stacks/core-api-stack";

const app = new App();
const config = getConfig("dev");

// Phase 1: the always-on CRUD spine. Later phases add Auth/Storage/Async/...
new CoreApiStack(app, "CoreApiStack", { env: config.env });

// Cost tracking + ownership tags applied to every resource.
Tags.of(app).add("Project", APP_NAME);
Tags.of(app).add("Stage", config.stage);
Tags.of(app).add("ManagedBy", "cdk");
