import { Construct } from "constructs";
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import type { Vpc } from "aws-cdk-lib/aws-ec2";
import { VpcWithEndpoints } from "../constructs/vpc-with-endpoints";

/** On-demand: the zero-NAT VPC consumed by DataStack + CacheStack. */
export class NetworkStack extends Stack {
  readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.vpc = new VpcWithEndpoints(this, "Net").vpc;
    new CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
  }
}
