import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Construct } from "constructs";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { Port, SecurityGroup, SubnetType, type IVpc } from "aws-cdk-lib/aws-ec2";
import {
  AuroraPostgresEngineVersion,
  ClusterInstance,
  Credentials,
  DatabaseClusterEngine,
  DatabaseCluster,
} from "aws-cdk-lib/aws-rds";
import { FunctionUrlAuthType } from "aws-cdk-lib/aws-lambda";
import { CrudFunction } from "../constructs/crud-function";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, "../../../apps/api/src/data");

export interface DataStackProps extends StackProps {
  readonly vpc: IVpc;
}

/**
 * On-demand relational alternative: Aurora Serverless v2 (Postgres) that scales
 * to ZERO ACU (≈$0 idle) + RDS Proxy for Lambda connection pooling, in private
 * isolated subnets. Deploy for a session, then `cdk destroy` — RDS Proxy bills
 * hourly and does NOT pause, so destroy it aggressively.
 */
export class DataStack extends Stack {
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { vpc } = props;
    const vpcSubnets = { subnetType: SubnetType.PRIVATE_ISOLATED };

    const cluster = new DatabaseCluster(this, "Aurora", {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.of("16.4", "16"),
      }),
      vpc,
      vpcSubnets,
      serverlessV2MinCapacity: 0, // scale-to-zero (Aurora PG 16.3+)
      serverlessV2MaxCapacity: 2,
      writer: ClusterInstance.serverlessV2("writer"),
      credentials: Credentials.fromGeneratedSecret("orders_admin"),
      defaultDatabaseName: "orders",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const lambdaSg = new SecurityGroup(this, "RdsLambdaSg", { vpc });

    const proxy = cluster.addProxy("Proxy", {
      secrets: [cluster.secret!],
      vpc,
      vpcSubnets,
    });
    // Lambda → Proxy → Cluster on 5432
    proxy.connections.allowFrom(lambdaSg, Port.tcp(5432));
    cluster.connections.allowDefaultPortFrom(proxy);

    const rdsFn = new CrudFunction(this, "RdsHandlerFn", {
      entry: resolve(DATA_DIR, "rds-handler.ts"),
      vpc,
      vpcSubnets,
      securityGroups: [lambdaSg],
      externalModules: ["pg-native"], // optional pg dep, not installed
      timeout: Duration.seconds(30),
      environment: {
        PROXY_ENDPOINT: proxy.endpoint,
        SECRET_ARN: cluster.secret!.secretArn,
        DB_NAME: "orders",
      },
      description: "VPC Lambda → RDS Proxy → Aurora",
    }).fn;
    cluster.secret!.grantRead(rdsFn);

    const url = rdsFn.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });

    new CfnOutput(this, "ProxyEndpoint", { value: proxy.endpoint });
    new CfnOutput(this, "RdsFnUrl", { value: url.url });
  }
}
