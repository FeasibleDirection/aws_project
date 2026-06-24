import { Construct } from "constructs";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
} from "aws-cdk-lib/aws-s3";

/**
 * Private, encrypted bucket for order attachments. Clients never touch it
 * directly — they receive short-lived presigned URLs from Lambda. CORS allows
 * the browser PUT/GET; a lifecycle rule expires demo objects after 7 days.
 */
export class StorageStack extends Stack {
  readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.bucket = new Bucket(this, "Attachments", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY, // demo posture
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: Duration.days(7) }],
      cors: [
        {
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET],
          allowedOrigins: ["*"], // demo; lock to the app origin for real use
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    new CfnOutput(this, "BucketName", { value: this.bucket.bucketName });
  }
}
