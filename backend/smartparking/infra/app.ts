import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "node:path";

const app = new cdk.App();
const stack = new cdk.Stack(app, "MayabParking", { env: { region: process.env.AWS_REGION ?? "us-east-1" } });
const pool = new cdk.CfnParameter(stack, "CognitoUserPoolId", { type: "String", allowedPattern: "[a-z]{2}-[a-z]+-[0-9]_[A-Za-z0-9]+", description: "User pool existente, en la misma región" });
const client = new cdk.CfnParameter(stack, "CognitoClientId", { type: "String", minLength: 1 });
const origins = new cdk.CfnParameter(stack, "AllowedOrigins", { type: "CommaDelimitedList", default: "http://localhost:3000", description: "Orígenes separados por coma, sin barra final" });
const zones = new dynamodb.Table(stack, "Zones", { partitionKey: { name: "zoneId", type: dynamodb.AttributeType.STRING }, billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, removalPolicy: cdk.RemovalPolicy.RETAIN });
const sessions = new dynamodb.Table(stack, "Sessions", { partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING }, billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, removalPolicy: cdk.RemovalPolicy.RETAIN });
const fn = new nodejs.NodejsFunction(stack, "ParkingHandler", {
  entry: path.join(__dirname, "../src/handler.ts"), runtime: lambda.Runtime.NODEJS_22_X,
  timeout: cdk.Duration.seconds(15), memorySize: 256,
  logGroup: new logs.LogGroup(stack, "ParkingLogs", { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: cdk.RemovalPolicy.DESTROY }),
  environment: { ZONES_TABLE: zones.tableName, SESSIONS_TABLE: sessions.tableName },
  bundling: { minify: true, externalModules: [] },
});
zones.grantReadWriteData(fn);
sessions.grantReadWriteData(fn);
const api = new apigw.HttpApi(stack, "Api", { corsPreflight: {
  allowOrigins: origins.valueAsList, allowHeaders: ["Authorization", "Content-Type"],
  allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST],
} });
const authorizer = new HttpJwtAuthorizer("Cognito", `https://cognito-idp.${stack.region}.amazonaws.com/${pool.valueAsString}`, { jwtAudience: [client.valueAsString] });
for (const [route, method] of [["/parking/zones", apigw.HttpMethod.GET], ["/parking/session", apigw.HttpMethod.GET], ["/parking/entry", apigw.HttpMethod.POST], ["/parking/exit", apigw.HttpMethod.POST]] as const) {
  api.addRoutes({ path: route, methods: [method], integration: new HttpLambdaIntegration(route.replaceAll("/", "-"), fn), authorizer });
}
new cdk.CfnOutput(stack, "ApiUrl", { value: api.apiEndpoint });
new cdk.CfnOutput(stack, "ZonesTable", { value: zones.tableName });
new cdk.CfnOutput(stack, "SessionsTable", { value: sessions.tableName });
