import path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront'
import { FunctionUrlOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment'
import { Architecture, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Bucket, BucketEncryption, BlockPublicAccess } from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

export class TeslaGridStudioStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const spaRewriteFunction = new CloudFrontFunction(this, 'SpaRewriteFunction', {
      code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri || "/";

  if (uri === "/api" || uri.indexOf("/api/") === 0) {
    return request;
  }

  if (uri === "/" || uri.indexOf(".") !== -1) {
    return request;
  }

  request.uri = "/index.html";
  return request;
}
      `),
    })

    const usersTable = new Table(this, 'UsersTable', {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'email',
        type: AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    const sessionsTable = new Table(this, 'SessionsTable', {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'sessionId',
        type: AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    const layoutsTable = new Table(this, 'LayoutsTable', {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'layoutId',
        type: AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    layoutsTable.addGlobalSecondaryIndex({
      indexName: 'byUser',
      partitionKey: {
        name: 'userId',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'updatedAt',
        type: AttributeType.STRING,
      },
    })

    const apiFunction = new NodejsFunction(this, 'PlannerApiFunction', {
      architecture: Architecture.ARM_64,
      bundling: {
        externalModules: [],
      },
      entry: path.resolve(process.cwd(), 'server', 'aws-handler.ts'),
      environment: {
        APP_ENV: 'production',
        APP_STORAGE: 'dynamo',
        LAYOUTS_TABLE_NAME: layoutsTable.tableName,
        SESSIONS_TABLE_NAME: sessionsTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
      },
      handler: 'handler',
      memorySize: 512,
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
    })

    usersTable.grantReadWriteData(apiFunction)
    sessionsTable.grantReadWriteData(apiFunction)
    layoutsTable.grantReadWriteData(apiFunction)

    const apiUrl = apiFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    })

    const siteBucket = new Bucket(this, 'SiteBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const distribution = new Distribution(this, 'PlannerDistribution', {
      additionalBehaviors: {
        '/api': {
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          origin: new FunctionUrlOrigin(apiUrl),
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        '/api/*': {
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          origin: new FunctionUrlOrigin(apiUrl),
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
      defaultBehavior: {
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            eventType: FunctionEventType.VIEWER_REQUEST,
            function: spaRewriteFunction,
          },
        ],
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    })

    new BucketDeployment(this, 'DeploySite', {
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      sources: [Source.asset(path.resolve(process.cwd(), 'dist'))],
    })

    new cdk.CfnOutput(this, 'PlannerUrl', {
      value: `https://${distribution.distributionDomainName}`,
    })

    new cdk.CfnOutput(this, 'ApiOrigin', {
      value: apiUrl.url,
    })
  }
}
