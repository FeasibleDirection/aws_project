import { DEFAULT_REGION } from "./constants";

export interface AppConfig {
  stage: string;
  env: { account?: string; region: string };
  /** Email for budget + alarm notifications (set ALARM_EMAIL to enable). */
  alarmEmail?: string;
  /** Monthly cost budget + billing-alarm threshold in USD. */
  monthlyBudgetUsd: number;
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
    alarmEmail: process.env.ALARM_EMAIL,
    monthlyBudgetUsd: Number(process.env.MONTHLY_BUDGET_USD ?? "10"),
  };
}
