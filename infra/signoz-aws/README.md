# KathaQuest SigNoz deployment

KathaQuest exports production OpenTelemetry traces over OTLP/HTTP. The
permanent AWS deployment is defined in `infra/aws-cdk`; it installs Docker
SigNoz through Foundry on EC2 in `ap-south-1` using the repository's
`casting.yaml` and `casting.yaml.lock`.

The new AWS account is currently under AWS verification, so EC2, ECS, Lambda,
CloudFormation, and RDS reject requests at the subscription layer. The
deployment cannot be created until AWS clears that account control.

## Current judge-facing fallback

For the judging window, Foundry SigNoz is running in Docker on the owner's Mac.
`infra/local-signoz/Caddyfile` combines:

- SigNoz UI on `/`;
- OTLP/HTTP on `/v1/traces`, `/v1/metrics`, and `/v1/logs`;
- SigNoz MCP on `/mcp`.

A persistent macOS LaunchAgent runs a Cloudflare Quick Tunnel to that gateway.
The production Vercel project is configured with the resulting HTTPS endpoint.
This path has been verified with a real Water Cycle lesson and a quiz:

- `kathaquest` service traces arrived from production;
- OpenAI moderation and response spans arrived;
- VideoDB collection search and compile spans arrived;
- the custom `quiz.evaluate` span arrived with its lesson ID and `Ok` status.

The fallback requires the Mac to remain powered on, online, and running Docker
Desktop. A Quick Tunnel hostname changes if the tunnel or Mac restarts.

## Permanent AWS deployment

After AWS verification:

1. Sign in using the `kathaquest-admin` IAM user.
2. Assume `KathaQuestBootstrapDeploymentRole`; do not deploy as root.
3. Follow `infra/aws-cdk/README.md`.
4. Resolve the generated OTLP and renderer tokens into Vercel with `asm-exec`.
5. Generate a production lesson and confirm its trace and custom spans in
   SigNoz before retiring the local tunnel.

The AWS Free Plan is active and prevents automatic pay-as-you-go billing unless
the owner explicitly upgrades. A USD 15 monthly Budget and an additional
infrastructure safety controller provide secondary guardrails.
