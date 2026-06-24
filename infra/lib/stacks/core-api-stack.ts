import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Construct } from "constructs";
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import type { IUserPool, IUserPoolClient } from "aws-cdk-lib/aws-cognito";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import { GSI_BY_CUSTOMER, GSI_PK, GSI_SK } from "@app/shared";
import { CrudFunction } from "../constructs/crud-function";
import { CrudApi } from "../constructs/crud-api";

const here = dirname(fileURLToPath(import.meta.url));
// infra/lib/stacks -> repo root -> apps/api/src/routes
const ROUTES_DIR = resolve(here, "../../../apps/api/src/routes");

export interface CoreApiStackProps extends StackProps {
  /** Cognito pool whose JWTs the HTTP API authorizer validates. */
  readonly userPool: IUserPool;
  readonly userPoolClient: IUserPoolClient;
  /** Bucket for order attachments (presigned upload/download). */
  readonly bucket: IBucket;
}

/**
 * The always-on, ~$0 CRUD spine: DynamoDB (on-demand) + 5 per-route Lambdas
 * behind an HTTP API, protected by a Cognito JWT authorizer. Each function's IAM
 * role is granted EXACTLY ONE DynamoDB action. A `byCustomer` GSI lets the list
 * route Query per-user instead of Scanning the whole table.
 */
export class CoreApiStack extends Stack {
  /** Exposed so AsyncStack can consume the stream + grant cleanup access. */
  readonly table: Table;

  constructor(scope: Construct, id: string, props: CoreApiStackProps) {
    super(scope, id, props);

    const table = new Table(this, "OrdersTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // demo posture; RETAIN in prod
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      stream: StreamViewType.NEW_AND_OLD_IMAGES, // CDC source for async events
    });
    this.table = table;
    // Access-pattern-driven GSI: list orders by owner, newest first.
    table.addGlobalSecondaryIndex({
      indexName: GSI_BY_CUSTOMER,
      partitionKey: { name: GSI_PK, type: AttributeType.STRING },
      sortKey: { name: GSI_SK, type: AttributeType.STRING },
    });

    const environment = { TABLE_NAME: table.tableName };
    const make = (id: string, file: string, extraEnv?: Record<string, string>) =>
      new CrudFunction(this, id, {
        entry: resolve(ROUTES_DIR, file),
        environment: { ...environment, ...extraEnv },
        description: `${id} (orders ${file})`,
      }).fn;

    const createFn = make("CreateFn", "create.ts");
    const getFn = make("GetFn", "get.ts");
    const listFn = make("ListFn", "list.ts");
    const updateFn = make("UpdateFn", "update.ts");
    const deleteFn = make("DeleteFn", "delete.ts");
    const bucketEnv = { BUCKET_NAME: props.bucket.bucketName };
    const uploadFn = make("PresignUploadFn", "attachment-upload.ts", bucketEnv);
    const downloadFn = make("PresignDownloadFn", "attachment-download.ts", bucketEnv);

    // --- per-route least privilege: one action per function role ---
    table.grant(createFn, "dynamodb:PutItem");
    table.grant(getFn, "dynamodb:GetItem");
    table.grant(listFn, "dynamodb:Query"); // includes the GSI index ARN
    table.grant(updateFn, "dynamodb:UpdateItem");
    table.grant(deleteFn, "dynamodb:DeleteItem");
    // presign-upload writes the key onto the order; presign-download reads it
    table.grant(uploadFn, "dynamodb:UpdateItem");
    props.bucket.grantPut(uploadFn);
    table.grant(downloadFn, "dynamodb:GetItem");
    props.bucket.grantRead(downloadFn);

    // Cognito JWT authorizer on every route — Lambda never sees anon requests.
    const authorizer = new HttpUserPoolAuthorizer(
      "JwtAuthorizer",
      props.userPool,
      { userPoolClients: [props.userPoolClient] },
    );

    const crud = new CrudApi(this, "Api", { authorizer });
    crud.route("CreateRoute", HttpMethod.POST, "/orders", createFn);
    crud.route("ListRoute", HttpMethod.GET, "/orders", listFn);
    crud.route("GetRoute", HttpMethod.GET, "/orders/{id}", getFn);
    crud.route("UpdateRoute", HttpMethod.PATCH, "/orders/{id}", updateFn);
    crud.route("DeleteRoute", HttpMethod.DELETE, "/orders/{id}", deleteFn);
    crud.route("AttachUploadRoute", HttpMethod.POST, "/orders/{id}/attachment", uploadFn);
    crud.route("AttachDownloadRoute", HttpMethod.GET, "/orders/{id}/attachment", downloadFn);

    new CfnOutput(this, "ApiUrl", { value: crud.api.apiEndpoint });
    new CfnOutput(this, "TableName", { value: table.tableName });
  }
}
