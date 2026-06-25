import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Construct } from "constructs";
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import { Port, SecurityGroup, SubnetType, type IVpc } from "aws-cdk-lib/aws-ec2";
import { CfnServerlessCache } from "aws-cdk-lib/aws-elasticache";
import { FunctionUrlAuthType } from "aws-cdk-lib/aws-lambda";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import { CrudFunction } from "../constructs/crud-function";

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(here, "../../../apps/api/src/cache");

export interface CacheStackProps extends StackProps {
  readonly vpc: IVpc;
  readonly table: Table;
}

/**
 * On-demand cache layer: ElastiCache Serverless (Valkey ~$6/mo floor, cheaper
 * than DAX) with a cache-aside Lambda. Valkey serverless has no scale-to-zero,
 * so `cdk destroy` after a session. The cache-aside Lambda reaches DynamoDB via
 * the free gateway endpoint on a miss.
 */
export class CacheStack extends Stack {
  constructor(scope: Construct, id: string, props: CacheStackProps) {
    super(scope, id, props);
    const { vpc, table } = props;
    const vpcSubnets = { subnetType: SubnetType.PRIVATE_ISOLATED };

    const cacheSg = new SecurityGroup(this, "CacheSg", { vpc });
    const lambdaSg = new SecurityGroup(this, "CacheLambdaSg", { vpc });
    cacheSg.addIngressRule(lambdaSg, Port.tcp(6379), "cache-aside Lambda → Valkey");

    const cache = new CfnServerlessCache(this, "Valkey", {
      engine: "valkey",
      serverlessCacheName: "orders-cache",
      securityGroupIds: [cacheSg.securityGroupId],
      subnetIds: vpc.selectSubnets(vpcSubnets).subnetIds,
    });

    const cacheFn = new CrudFunction(this, "CacheAsideFn", {
      entry: resolve(CACHE_DIR, "cache-aside.ts"),
      vpc,
      vpcSubnets,
      securityGroups: [lambdaSg],
      timeout: Duration.seconds(15),
      environment: {
        CACHE_ENDPOINT: cache.attrEndpointAddress,
        TABLE_NAME: table.tableName,
      },
      description: "VPC cache-aside Lambda (Valkey + DynamoDB fallback)",
    }).fn;
    table.grant(cacheFn, "dynamodb:GetItem");

    const url = cacheFn.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });

    new CfnOutput(this, "CacheEndpoint", { value: cache.attrEndpointAddress });
    new CfnOutput(this, "CacheFnUrl", { value: url.url });
  }
}
