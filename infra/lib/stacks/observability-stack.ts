import { Construct } from "constructs";
import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  Metric,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import type { IQueue } from "aws-cdk-lib/aws-sqs";

export interface ObservabilityStackProps extends StackProps {
  readonly deadLetterQueue: IQueue;
  readonly alarmEmail?: string;
  readonly monthlyBudgetUsd: number;
}

/**
 * Ops + cost guardrails as code: a CloudWatch dashboard, alarms (DLQ depth,
 * Lambda errors, estimated charges) routed to an SNS topic, and a monthly AWS
 * Budget. Kept within the free tier (1 dashboard ≤3, 3 alarms ≤10).
 */
export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const alarmTopic = new Topic(this, "Alarms", { topicName: "orders-alarms" });
    if (props.alarmEmail) {
      alarmTopic.addSubscription(new EmailSubscription(props.alarmEmail));
    }
    const action = new SnsAction(alarmTopic);

    // --- metrics ---
    const dlqDepth = props.deadLetterQueue.metricApproximateNumberOfMessagesVisible(
      { period: Duration.minutes(1), statistic: "Maximum" },
    );
    const lambdaErrors = new Metric({
      namespace: "AWS/Lambda",
      metricName: "Errors",
      statistic: "Sum",
      period: Duration.minutes(5),
    });
    const lambdaP99 = new Metric({
      namespace: "AWS/Lambda",
      metricName: "Duration",
      statistic: "p99",
      period: Duration.minutes(5),
    });
    const ordersCreated = new Metric({
      namespace: "OrdersApi",
      metricName: "OrdersCreated",
      statistic: "Sum",
      period: Duration.hours(1),
    });
    const billing = new Metric({
      namespace: "AWS/Billing",
      metricName: "EstimatedCharges",
      dimensionsMap: { Currency: "USD" },
      statistic: "Maximum",
      period: Duration.hours(6),
      region: "us-east-1", // billing metric lives only in us-east-1
    });

    // --- alarms ---
    new Alarm(this, "DlqNotEmpty", {
      metric: dlqDepth,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: "Messages landed in the order DLQ",
    }).addAlarmAction(action);

    new Alarm(this, "LambdaErrors", {
      metric: lambdaErrors,
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: "Lambda error spike across the app",
    }).addAlarmAction(action);

    new Alarm(this, "BillingAlarm", {
      metric: billing,
      threshold: props.monthlyBudgetUsd,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: `Estimated charges exceeded $${props.monthlyBudgetUsd}`,
    }).addAlarmAction(action);

    // --- dashboard ---
    const dashboard = new Dashboard(this, "OrdersDashboard", {
      dashboardName: "orders-demo",
    });
    dashboard.addWidgets(
      new GraphWidget({ title: "Lambda Errors (all)", left: [lambdaErrors] }),
      new GraphWidget({ title: "Lambda Duration p99 (all)", left: [lambdaP99] }),
      new GraphWidget({ title: "DLQ depth", left: [dlqDepth] }),
      new GraphWidget({ title: "Orders created", left: [ordersCreated] }),
    );

    // --- cost budget (IaC version of the manual AWS Budget) ---
    new CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "orders-demo-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: "USD" },
      },
      notificationsWithSubscribers: props.alarmEmail
        ? [
            {
              notification: {
                notificationType: "ACTUAL",
                comparisonOperator: "GREATER_THAN",
                threshold: 80,
              },
              subscribers: [
                { subscriptionType: "EMAIL", address: props.alarmEmail },
              ],
            },
            {
              notification: {
                notificationType: "FORECASTED",
                comparisonOperator: "GREATER_THAN",
                threshold: 100,
              },
              subscribers: [
                { subscriptionType: "EMAIL", address: props.alarmEmail },
              ],
            },
          ]
        : undefined,
    });
  }
}
