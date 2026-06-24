import { DEFAULT_REGION } from "./constants";

export interface AppConfig {
  stage: string;
  env: { account?: string; region: string };
}

/**
 * Resolve config for a stage. Account comes from the ambient AWS profile
 * (CDK_DEFAULT_ACCOUNT); region defaults to us-east-1 (cheapest, all services).
 */
export function getConfig(stage = "dev"): AppConfig {
  return {
    stage,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION ?? DEFAULT_REGION,
    },
  };
}
