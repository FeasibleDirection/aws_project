import { Construct } from "constructs";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { IFunction } from "aws-cdk-lib/aws-lambda";

/** HTTP API (cheaper/faster than REST API) with CORS + a DRY route helper. */
export class CrudApi extends Construct {
  readonly api: HttpApi;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.api = new HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: ["*"], // demo; lock to the CloudFront origin for real use
        allowMethods: [CorsHttpMethod.ANY],
        allowHeaders: ["content-type", "authorization"],
      },
    });
  }

  route(id: string, method: HttpMethod, path: string, handler: IFunction): void {
    this.api.addRoutes({
      path,
      methods: [method],
      integration: new HttpLambdaIntegration(id, handler),
    });
  }
}
