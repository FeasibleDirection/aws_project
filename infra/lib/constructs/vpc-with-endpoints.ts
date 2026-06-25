import { Construct } from "constructs";
import {
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpointAwsService,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";

/**
 * The cost-safe VPC: `natGateways: 0` (no ~$32/mo NAT), private-isolated subnets,
 * FREE S3 + DynamoDB gateway endpoints, and a Secrets Manager interface endpoint
 * so VPC Lambdas can read the DB secret without internet egress. The trade-off:
 * VPC Lambdas can only reach AWS services that have an endpoint — exactly enough
 * for this demo (DB via proxy, secret via interface endpoint, DynamoDB/S3 via
 * gateway endpoints).
 */
export class VpcWithEndpoints extends Construct {
  readonly vpc: Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "isolated", subnetType: SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // free gateway endpoints
    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: GatewayVpcEndpointAwsService.S3,
    });
    this.vpc.addGatewayEndpoint("DynamoEndpoint", {
      service: GatewayVpcEndpointAwsService.DYNAMODB,
    });
    // interface endpoint (~$/AZ while up) so VPC Lambdas read secrets without NAT
    this.vpc.addInterfaceEndpoint("SecretsEndpoint", {
      service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });
  }
}
