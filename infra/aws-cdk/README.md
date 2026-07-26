# KathaQuest AWS production stack

This CDK stack targets `ap-south-1` and deliberately avoids idle container
costs. It creates:

- one `t4g.large` EC2 instance with 60 GB encrypted gp3 for Docker SigNoz
  installed through Foundry using the repository's `casting.yaml` and
  `casting.yaml.lock`;
- Caddy-managed HTTPS endpoints for the SigNoz UI, protected OTLP ingestion,
  and protected SigNoz MCP;
- an API Gateway and Lambda job API that launches exactly one ARM64 Fargate
  Manim/FFmpeg task per render;
- private S3 job/output buckets, a CloudFront asset origin, and DynamoDB job
  status with short retention;
- generated renderer and OTLP tokens in KMS-encrypted Secrets Manager secrets;
- an hourly safety Lambda that stops KathaQuest compute if the account is no
  longer on the active Free Plan or remaining credits fall to USD 5.

There is no NAT Gateway, ECS service, or load balancer.

## Deploy with the non-root role

Do not deploy from the AWS root identity.

```bash
aws login --profile kathaquest-admin --region ap-south-1
aws configure set role_arn \
  arn:aws:iam::401716295503:role/KathaQuestBootstrapDeploymentRole \
  --profile kathaquest-deploy
aws configure set source_profile kathaquest-admin --profile kathaquest-deploy
aws configure set region ap-south-1 --profile kathaquest-deploy

export AWS_PROFILE=kathaquest-deploy
export CDK_DEFAULT_ACCOUNT=401716295503
export CDK_DEFAULT_REGION=ap-south-1

npm ci
npx cdk bootstrap \
  aws://401716295503/ap-south-1 \
  --qualifier kathaquest
npm run diff
npm run deploy
```

The account must finish AWS verification before EC2, ECS, Lambda,
CloudFormation, and RDS APIs become available.

## Production application wiring

Use `asm-exec` to resolve each secret directly into the Vercel CLI process.
Never print, copy, or commit either token.

The stack outputs provide the renderer API, OTLP, SigNoz, and SigNoz MCP URLs.
Set both visual renderer URLs to `RendererApiUrl`, and set both renderer API
keys from `RendererSecretArn`. Set OTLP trace and metric URLs below
`OtelEndpoint`, with `Authorization=Bearer%20<TOKEN>` resolved from
`OtelSecretArn`.

The AWS Budget is an alert, not a hard cap. The active AWS Free Plan prevents
pay-as-you-go billing unless the owner explicitly upgrades the plan. The
hourly safety Lambda is a secondary guardrail, not a billing guarantee.
