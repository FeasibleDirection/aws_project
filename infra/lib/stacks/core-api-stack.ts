import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Construct } from "constructs";
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { CrudFunction } from "../constructs/crud-function";
import { CrudApi } from "../constructs/crud-api";

const here = dirname(fileURLToPath(import.meta.url));
// infra/lib/stacks -> repo root -> apps/api/src/routes
const ROUTES_DIR = resolve(here, "../../../apps/api/src/routes");

/**
 * The always-on, ~$0 CRUD spine: DynamoDB (on-demand) + 5 per-route Lambdas
 * behind an HTTP API. Each function's IAM role is granted EXACTLY ONE DynamoDB
 * action — the read functions literally cannot DeleteItem.
 */
export class CoreApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new Table(this, "OrdersTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // demo posture; RETAIN in prod
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    const environment = { TABLE_NAME: table.tableName };
    const make = (id: string, file: string) =>
      new CrudFunction(this, id, {
        entry: resolve(ROUTES_DIR, file),
        environment,
        description: `${id} (orders ${file})`,
      }).fn;

    const createFn = make("CreateFn", "create.ts");
    const getFn = make("GetFn", "get.ts");
    const listFn = make("ListFn", "list.ts");
    const updateFn = make("UpdateFn", "update.ts");
    const deleteFn = make("DeleteFn", "delete.ts");

    // --- per-route least privilege: one action per function role ---
    table.grant(createFn, "dynamodb:PutItem");
    table.grant(getFn, "dynamodb:GetItem");
    table.grant(listFn, "dynamodb:Scan");
    table.grant(updateFn, "dynamodb:UpdateItem");
    table.grant(deleteFn, "dynamodb:DeleteItem");

    const crud = new CrudApi(this, "Api");
    crud.route("CreateRoute", HttpMethod.POST, "/orders", createFn);
    crud.route("ListRoute", HttpMethod.GET, "/orders", listFn);
    crud.route("GetRoute", HttpMethod.GET, "/orders/{id}", getFn);
    crud.route("UpdateRoute", HttpMethod.PATCH, "/orders/{id}", updateFn);
    crud.route("DeleteRoute", HttpMethod.DELETE, "/orders/{id}", deleteFn);

    new CfnOutput(this, "ApiUrl", { value: crud.api.apiEndpoint });
    new CfnOutput(this, "TableName", { value: table.tableName });
  }
}
