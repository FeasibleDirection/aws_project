import { Construct } from "constructs";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Architecture, Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { SERVICE_NAME } from "../constants";

export interface CrudFunctionProps {
  /** Absolute path to the handler .ts file (exports `handler`). */
  readonly entry: string;
  readonly description?: string;
  readonly environment?: Record<string, string>;
  readonly memorySize?: number;
  readonly timeout?: Duration;
}

/**
 * The showcase L3 construct: every Lambda is, by construction, nodejs22.x on
 * ARM64/Graviton, X-Ray traced, esbuild-bundled, Powertools-configured, and has
 * a log group with a 1-week retention (default retention is "never" = a silent
 * bill). Handlers become one-liners; standards are encoded once.
 */
export class CrudFunction extends Construct {
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: CrudFunctionProps) {
    super(scope, id);

    const logGroup = new LogGroup(this, "Logs", {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.fn = new NodejsFunction(this, "Fn", {
      entry: props.entry,
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: props.memorySize ?? 256,
      timeout: props.timeout ?? Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      logGroup,
      description: props.description,
      bundling: {
        minify: true,
        sourceMap: true,
        // @aws-sdk/* is provided by the nodejs22 runtime (externalised by default)
      },
      environment: {
        POWERTOOLS_SERVICE_NAME: SERVICE_NAME,
        LOG_LEVEL: "INFO",
        NODE_OPTIONS: "--enable-source-maps",
        ...props.environment,
      },
    });
  }
}
