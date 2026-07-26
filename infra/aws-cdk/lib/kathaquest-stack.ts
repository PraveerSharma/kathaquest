import * as path from "node:path";

import {
  Arn,
  ArnFormat,
  CfnOutput,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  StackProps,
  Validations,
} from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class KathaQuestAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const projectRoot = path.resolve(__dirname, "../../..");
    const lambdaCode = path.join(projectRoot, "infra/aws-cdk/lambda");
    const rendererPath = path.join(projectRoot, "services/visual-renderer");

    const vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.42.0.0/16"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });
    const flowLogGroup = new logs.LogGroup(this, "VpcRejectedFlowLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    vpc.addFlowLog("RejectedTraffic", {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: ec2.FlowLogTrafficType.REJECT,
    });

    const secretKey = new kms.Key(this, "SecretKey", {
      alias: "alias/kathaquest-production-secrets",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const rendererSecret = new secretsmanager.Secret(this, "RendererSecret", {
      secretName: "kathaquest/production/renderer",
      encryptionKey: secretKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ purpose: "renderer-api" }),
        generateStringKey: "token",
        passwordLength: 48,
        excludePunctuation: true,
      },
    });
    Validations.of(rendererSecret).acknowledge({
      id: "AwsSolutions::AwsSolutions-SMG4",
      reason:
        "This token is consumed by Vercel and API Gateway; automatic rotation would break production until both consumers are updated. Rotation is performed through the documented asm-exec runbook.",
    });
    const otelSecret = new secretsmanager.Secret(this, "OtelSecret", {
      secretName: "kathaquest/production/otel",
      encryptionKey: secretKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ purpose: "otel-ingestion" }),
        generateStringKey: "token",
        passwordLength: 48,
        excludePunctuation: true,
      },
    });
    Validations.of(otelSecret).acknowledge({
      id: "AwsSolutions::AwsSolutions-SMG4",
      reason:
        "This token is consumed by Vercel and Caddy; automatic rotation would break telemetry until both consumers restart. Rotation is performed through the documented asm-exec runbook.",
    });

    const accessLogBucket = new s3.Bucket(this, "AccessLogBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      lifecycleRules: [{ expiration: Duration.days(14) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });
    Validations.of(accessLogBucket).acknowledge({
      id: "AwsSolutions-S1",
      reason:
        "This is the terminal access-log destination and cannot recursively log to itself.",
    });
    const jobBucket = new s3.Bucket(this, "RenderJobBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      serverAccessLogsBucket: accessLogBucket,
      serverAccessLogsPrefix: "render-jobs/",
      lifecycleRules: [{ expiration: Duration.days(1) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const outputBucket = new s3.Bucket(this, "RenderOutputBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      serverAccessLogsBucket: accessLogBucket,
      serverAccessLogsPrefix: "render-output/",
      lifecycleRules: [{ expiration: Duration.days(7) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const outputOrigin =
      origins.S3BucketOrigin.withOriginAccessControl(outputBucket);
    const assetDistribution = new cloudfront.Distribution(
      this,
      "RenderAssetDistribution",
      {
        defaultBehavior: {
          origin: outputOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        },
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
        enableLogging: true,
        logBucket: accessLogBucket,
        logFilePrefix: "cloudfront/",
      },
    );
    Validations.of(assetDistribution).acknowledge({
      id: "AwsSolutions::AwsSolutions-CFR4",
      reason:
        "The CloudFront-managed domain uses the default CloudFront certificate; the distribution still declares TLS 1.2 2021 as its minimum viewer policy.",
    });
    Validations.of(assetDistribution).acknowledge({
      id: "AwsSolutions::AwsSolutions-CFR1",
      reason:
        "Educational assets must remain available to hackathon judges and learners globally.",
    });
    Validations.of(assetDistribution).acknowledge({
      id: "AwsSolutions::AwsSolutions-CFR2",
      reason:
        "Only immutable private-S3 MP4 objects are served; AWS WAF fixed charges are disproportionate for the active Free Plan.",
    });

    const jobTable = new dynamodb.Table(this, "RenderJobTable", {
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    Validations.of(jobTable).acknowledge({
      id: "AwsSolutions::AwsSolutions-DDB3",
      reason:
        "Render job state is disposable, expires after one day, and is reconstructed by resubmitting a job; PITR would add cost without protecting durable lesson data.",
    });

    const cluster = new ecs.Cluster(this, "RendererCluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });
    Validations.of(cluster).acknowledge({
      id: "AwsSolutions::AwsSolutions-ECS4",
      reason:
        "Tasks are ephemeral and already emit structured CloudWatch logs; Container Insights fixed ingestion would consume limited Free Plan credits.",
    });
    const rendererImage = new ecrAssets.DockerImageAsset(
      this,
      "RendererImage",
      {
        directory: rendererPath,
        platform: ecrAssets.Platform.LINUX_ARM64,
      },
    );
    const taskSecurityGroup = new ec2.SecurityGroup(
      this,
      "RendererTaskSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
        description:
          "Outbound-only access for ephemeral KathaQuest visual render tasks",
      },
    );
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "RendererTaskDefinition",
      {
        cpu: 2048,
        memoryLimitMiB: 4096,
        ephemeralStorageGiB: 30,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      },
    );
    const rendererLogs = new logs.LogGroup(this, "RendererLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const containerName = "visual-renderer";
    taskDefinition.addContainer("RendererContainer", {
      containerName,
      image: ecs.ContainerImage.fromDockerImageAsset(rendererImage),
      command: ["python", "worker.py"],
      logging: ecs.LogDrivers.awsLogs({
        logGroup: rendererLogs,
        streamPrefix: "render",
        mode: ecs.AwsLogDriverMode.NON_BLOCKING,
      }),
      environment: {
        JOB_BUCKET: jobBucket.bucketName,
        OUTPUT_BUCKET: outputBucket.bucketName,
        JOB_TABLE: jobTable.tableName,
        PUBLIC_BASE_URL: `https://${assetDistribution.distributionDomainName}`,
      },
    });
    Validations.of(taskDefinition).acknowledge({
      id: "AwsSolutions::AwsSolutions-ECS2",
      reason:
        "The task environment contains only resource identifiers and a public CDN URL; no credentials or secrets are stored in plaintext.",
    });
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [jobBucket.arnForObjects("jobs/*")],
      }),
    );
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [outputBucket.arnForObjects("assets/*")],
      }),
    );
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:UpdateItem"],
        resources: [jobTable.tableArn],
      }),
    );
    Validations.of(taskDefinition.taskRole).acknowledge({
      id: "AwsSolutions-IAM5[Resource::<RenderJobBucket4C24C26F.Arn>/jobs/*]",
      reason:
        "The wildcard is restricted to job payload object keys in one generated S3 bucket; each unpredictable UUID job key must be readable by the worker.",
    });
    Validations.of(taskDefinition.taskRole).acknowledge({
      id: "AwsSolutions-IAM5[Resource::<RenderOutputBucket70435368.Arn>/assets/*]",
      reason:
        "The wildcard is restricted to generated MP4 keys under assets/ in one private bucket.",
    });
    if (taskDefinition.executionRole) {
      Validations.of(taskDefinition.executionRole).acknowledge({
        id: "AwsSolutions-IAM5[Resource::*]",
        reason:
          "ECR GetAuthorizationToken does not support resource-level permissions; the execution role is used only to pull this task image and write its scoped log stream.",
      });
    }

    const rendererApiLogs = new logs.LogGroup(this, "RendererApiLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const rendererApiRole = new iam.Role(this, "RendererApiRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });
    rendererApiRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [`${rendererApiLogs.logGroupArn}:*`],
      }),
    );
    Validations.of(rendererApiRole).acknowledge({
      id: "AwsSolutions-IAM5[Resource::<RendererApiLogs91F45B81.Arn>:*]",
      reason:
        "Lambda log streams have generated names; write access is restricted to streams inside this function's dedicated one-week log group.",
    });
    const rendererApi = new lambda.Function(this, "RendererApi", {
      runtime: lambda.Runtime.PYTHON_3_14,
      architecture: lambda.Architecture.ARM_64,
      handler: "renderer_api.handler",
      code: lambda.Code.fromAsset(lambdaCode),
      timeout: Duration.seconds(20),
      memorySize: 256,
      logGroup: rendererApiLogs,
      role: rendererApiRole,
      environment: {
        RENDERER_API_KEY: rendererSecret
          .secretValueFromJson("token")
          .unsafeUnwrap(),
        JOB_BUCKET: jobBucket.bucketName,
        JOB_TABLE: jobTable.tableName,
        ECS_CLUSTER: cluster.clusterArn,
        TASK_DEFINITION: taskDefinition.taskDefinitionArn,
        CONTAINER_NAME: containerName,
        PUBLIC_SUBNETS: vpc.publicSubnets
          .map((subnet) => subnet.subnetId)
          .join(","),
        TASK_SECURITY_GROUP: taskSecurityGroup.securityGroupId,
      },
    });
    rendererApi.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [jobBucket.arnForObjects("jobs/*")],
      }),
    );
    Validations.of(rendererApi.role!).acknowledge({
      id: "AwsSolutions-IAM5[Resource::<RenderJobBucket4C24C26F.Arn>/jobs/*]",
      reason:
        "The API creates unpredictable UUID job payload keys only under jobs/ in one private bucket.",
    });
    rendererApi.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
        resources: [jobTable.tableArn],
      }),
    );
    rendererApi.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecs:RunTask"],
        resources: [taskDefinition.taskDefinitionArn],
        conditions: {
          ArnEquals: { "ecs:cluster": cluster.clusterArn },
        },
      }),
    );
    taskDefinition.executionRole?.grantPassRole(rendererApi.grantPrincipal);
    taskDefinition.taskRole.grantPassRole(rendererApi.grantPrincipal);

    const httpApi = new apigwv2.HttpApi(this, "RendererHttpApi", {
      apiName: "kathaquest-renderer",
      createDefaultStage: true,
    });
    const authorizerLogs = new logs.LogGroup(this, "RendererAuthorizerLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const rendererAuthorizerRole = new iam.Role(
      this,
      "RendererAuthorizerRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      },
    );
    rendererAuthorizerRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [`${authorizerLogs.logGroupArn}:*`],
      }),
    );
    Validations.of(rendererAuthorizerRole).acknowledge({
      id: "AwsSolutions-IAM5[Resource::<RendererAuthorizerLogsCF57AAE2.Arn>:*]",
      reason:
        "Lambda log streams have generated names; write access is restricted to streams inside the authorizer's dedicated one-week log group.",
    });
    const rendererAuthorizerFunction = new lambda.Function(
      this,
      "RendererAuthorizer",
      {
        runtime: lambda.Runtime.PYTHON_3_14,
        architecture: lambda.Architecture.ARM_64,
        handler: "authorizer.handler",
        code: lambda.Code.fromAsset(lambdaCode),
        timeout: Duration.seconds(5),
        memorySize: 128,
        logGroup: authorizerLogs,
        role: rendererAuthorizerRole,
        environment: {
          RENDERER_API_KEY: rendererSecret
            .secretValueFromJson("token")
            .unsafeUnwrap(),
        },
      },
    );
    const rendererAuthorizer = new authorizers.HttpLambdaAuthorizer(
      "RendererTokenAuthorizer",
      rendererAuthorizerFunction,
      {
        responseTypes: [authorizers.HttpLambdaResponseType.SIMPLE],
        identitySource: ["$request.header.Authorization"],
        resultsCacheTtl: Duration.minutes(5),
      },
    );
    const apiIntegration = new integrations.HttpLambdaIntegration(
      "RendererApiIntegration",
      rendererApi,
    );
    httpApi.addRoutes({
      path: "/render",
      methods: [apigwv2.HttpMethod.POST],
      integration: apiIntegration,
      authorizer: rendererAuthorizer,
    });
    httpApi.addRoutes({
      path: "/jobs/{jobId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
      authorizer: rendererAuthorizer,
    });
    const apiAccessLogs = new logs.LogGroup(this, "RendererApiAccessLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const defaultStage = httpApi.defaultStage?.node
      .defaultChild as apigwv2.CfnStage;
    defaultStage.accessLogSettings = {
      destinationArn: apiAccessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        routeKey: "$context.routeKey",
        status: "$context.status",
        responseLatency: "$context.responseLatency",
        integrationError: "$context.integrationErrorMessage",
      }),
    };
    apiAccessLogs.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal("apigateway.amazonaws.com")],
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [`${apiAccessLogs.logGroupArn}:*`],
      }),
    );

    const castingAsset = new s3Assets.Asset(this, "CastingAsset", {
      path: path.join(projectRoot, "casting.yaml"),
    });
    const castingLockAsset = new s3Assets.Asset(this, "CastingLockAsset", {
      path: path.join(projectRoot, "casting.yaml.lock"),
    });
    const signozRole = new iam.Role(this, "SigNozInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    signozRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "ssm:UpdateInstanceInformation",
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel",
          "ec2messages:AcknowledgeMessage",
          "ec2messages:DeleteMessage",
          "ec2messages:FailMessage",
          "ec2messages:GetEndpoint",
          "ec2messages:GetMessages",
          "ec2messages:SendReply",
        ],
        resources: ["*"],
      }),
    );
    Validations.of(signozRole).acknowledge({
      id: "AwsSolutions-IAM5[Resource::*]",
      reason:
        "The SSM and EC2 Messages channel actions required for keyless Session Manager administration do not support resource-level permissions; no SSH ingress exists.",
    });
    signozRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [
          castingAsset.bucket.arnForObjects(castingAsset.s3ObjectKey),
          castingLockAsset.bucket.arnForObjects(castingLockAsset.s3ObjectKey),
        ],
      }),
    );
    otelSecret.grantRead(signozRole);

    const signozSecurityGroup = new ec2.SecurityGroup(
      this,
      "SigNozSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
        description:
          "Public TLS ingress for KathaQuest SigNoz UI, OTLP, and MCP",
      },
    );
    signozSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "ACME HTTP challenge and HTTPS redirect",
    );
    signozSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "SigNoz UI, protected OTLP, and protected MCP",
    );
    Validations.of(signozSecurityGroup).acknowledge({
      id: "AwsSolutions::AwsSolutions-EC23",
      reason:
        "Only TCP 80 and 443 are public; Caddy terminates TLS, restricts OTLP/MCP with bearer authentication, and redirects ACME HTTP traffic.",
    });

    const eip = new ec2.CfnEIP(this, "SigNozPublicIp", {
      domain: "vpc",
    });
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -euxo pipefail",
      "dnf install -y docker jq",
      "systemctl enable --now docker",
      "mkdir -p /opt/kathaquest/signoz /opt/kathaquest/caddy/data /opt/kathaquest/caddy/config",
      `aws s3 cp ${castingAsset.s3ObjectUrl} /opt/kathaquest/signoz/casting.yaml`,
      `aws s3 cp ${castingLockAsset.s3ObjectUrl} /opt/kathaquest/signoz/casting.yaml.lock`,
      "curl -fsSL https://signoz.io/foundry.sh | bash",
      "cd /opt/kathaquest/signoz",
      "foundryctl cast -f casting.yaml",
      "curl -fsSL https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/main/plugins/aws-core/skills/aws-secrets-manager/references/asm-exec -o /usr/local/bin/asm-exec",
      "chmod 0755 /usr/local/bin/asm-exec",
      `IP_DASHED="$(printf %s '${eip.ref}' | tr . -)"`,
      `cat > /opt/kathaquest/caddy/Caddyfile <<'CADDY'
signoz.__IP__.sslip.io {
  reverse_proxy 127.0.0.1:8080
}

otel.__IP__.sslip.io {
  @unauthorized not header Authorization "Bearer {$OTEL_TOKEN}"
  respond @unauthorized 401
  reverse_proxy 127.0.0.1:4318
}

signoz-mcp.__IP__.sslip.io {
  @unauthorized not header Authorization "Bearer {$OTEL_TOKEN}"
  respond @unauthorized 401
  reverse_proxy 127.0.0.1:8000
}
CADDY`,
      'sed -i "s/__IP__/${IP_DASHED}/g" /opt/kathaquest/caddy/Caddyfile',
      `AWS_REGION=${this.region} /usr/local/bin/asm-exec -- docker run -d --name kathaquest-caddy --restart unless-stopped --network host -e 'OTEL_TOKEN={{resolve:secretsmanager:${otelSecret.secretArn}:SecretString:token}}' -v /opt/kathaquest/caddy/Caddyfile:/etc/caddy/Caddyfile:ro -v /opt/kathaquest/caddy/data:/data -v /opt/kathaquest/caddy/config:/config caddy:2.10.2-alpine`,
    );
    const signozInstance = new ec2.Instance(this, "SigNozInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType("t4g.large"),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      role: signozRole,
      securityGroup: signozSecurityGroup,
      userData,
      requireImdsv2: true,
      detailedMonitoring: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(60, {
            encrypted: true,
            deleteOnTermination: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    });
    const cfnSigNozInstance = signozInstance.node
      .defaultChild as ec2.CfnInstance;
    cfnSigNozInstance.disableApiTermination = true;
    new ec2.CfnEIPAssociation(this, "SigNozPublicIpAssociation", {
      allocationId: eip.attrAllocationId,
      instanceId: signozInstance.instanceId,
    });

    const costSafetyLogs = new logs.LogGroup(this, "CostSafetyLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const costSafetyRole = new iam.Role(this, "CostSafetyRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });
    costSafetyRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [`${costSafetyLogs.logGroupArn}:*`],
      }),
    );
    Validations.of(costSafetyRole).acknowledge({
      id: "AwsSolutions-IAM5[Resource::<CostSafetyLogs988BB5C6.Arn>:*]",
      reason:
        "Lambda log streams have generated names; write access is restricted to streams inside the safety controller's dedicated one-week log group.",
    });
    const costSafety = new lambda.Function(this, "CostSafety", {
      runtime: lambda.Runtime.PYTHON_3_14,
      architecture: lambda.Architecture.ARM_64,
      handler: "cost_safety.handler",
      code: lambda.Code.fromAsset(lambdaCode),
      timeout: Duration.seconds(30),
      memorySize: 128,
      logGroup: costSafetyLogs,
      role: costSafetyRole,
      environment: {
        MINIMUM_CREDITS_USD: "5",
        SIGNOZ_INSTANCE_ID: signozInstance.instanceId,
        ECS_CLUSTER: cluster.clusterArn,
      },
    });
    costSafety.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["freetier:GetAccountPlanState"],
        resources: ["*"],
      }),
    );
    Validations.of(costSafety.role!).acknowledge({
      id: "AwsSolutions-IAM5[Resource::*]",
      reason:
        "FreeTier plan state, EC2 DescribeInstances, and ECS ListTasks do not support complete resource-level scoping; mutating Stop actions are restricted by instance ID and cluster condition where supported.",
    });
    costSafety.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ec2:DescribeInstances"],
        resources: ["*"],
      }),
    );
    costSafety.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ec2:StopInstances"],
        resources: [
          Arn.format(
            {
              service: "ec2",
              resource: "instance",
              resourceName: signozInstance.instanceId,
              arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
            },
            this,
          ),
        ],
      }),
    );
    costSafety.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecs:ListTasks", "ecs:StopTask"],
        resources: ["*"],
        conditions: {
          ArnEquals: { "ecs:cluster": cluster.clusterArn },
        },
      }),
    );
    new events.Rule(this, "HourlyCostSafetyCheck", {
      schedule: events.Schedule.rate(Duration.hours(1)),
      targets: [new targets.LambdaFunction(costSafety)],
    });

    const ipHostname = `${Fn.join("-", Fn.split(".", eip.ref))}.sslip.io`;
    new CfnOutput(this, "RendererApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "RendererSecretArn", {
      value: rendererSecret.secretArn,
    });
    new CfnOutput(this, "SigNozUrl", {
      value: `https://signoz.${ipHostname}`,
    });
    new CfnOutput(this, "OtelEndpoint", {
      value: `https://otel.${ipHostname}`,
    });
    new CfnOutput(this, "SigNozMcpUrl", {
      value: `https://signoz-mcp.${ipHostname}/mcp`,
    });
    new CfnOutput(this, "OtelSecretArn", { value: otelSecret.secretArn });
    new CfnOutput(this, "SigNozInstanceId", {
      value: signozInstance.instanceId,
    });
  }
}
