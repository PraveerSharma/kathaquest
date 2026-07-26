# Production SigNoz on AWS EKS

KathaQuest should send OTLP/HTTP over HTTPS from Vercel to a protected
OpenTelemetry Collector endpoint in EKS. The SigNoz UI should use a separate
HTTPS hostname and should not be anonymously public.

## Inputs required from the owner

Do not place any of these secrets in Git.

1. AWS account ID and an IAM role/profile allowed to manage EKS, EC2/VPC,
   IAM, EBS, load balancers and the selected DNS zone.
2. Confirmed AWS region. The recommended India region is `ap-south-1`
   (Mumbai).
3. Cluster name, for example `kathaquest-observability-prod`.
4. Existing VPC ID and three private subnet IDs, or approval to create a new
   three-AZ VPC.
5. Capacity and monthly budget. SigNoz documents a minimum of 4 CPU, 8 GB RAM
   and 30 GB storage; its recommended starting point is 8 CPU, 16 GB RAM and
   80 GB storage.
6. DNS zone and two hostnames, for example `signoz.example.com` for the UI and
   `otel.example.com` for OTLP ingestion.
7. ACM certificate ARN covering both hostnames, or permission to request and
   validate one.
8. UI access policy: VPN/private-only, identity-aware proxy, or authenticated
   public ingress.
9. A new OTLP ingress username/password or bearer token. This is separate from
   the KathaQuest application API keys.
10. Trace, log and metric retention targets and an alert-notification channel.

## Installation path

Prerequisites are an EKS cluster, Kubernetes 1.22 or newer, Helm 3.8 or newer,
`kubectl` access and the Amazon EBS CSI driver. Use managed EC2 nodes for the
initial deployment; ClickHouse needs persistent volumes.

```bash
aws eks update-kubeconfig \
  --name kathaquest-observability-prod \
  --region ap-south-1

kubectl apply -f infra/signoz-aws/gp3-storageclass.yaml

helm repo add signoz https://charts.signoz.io
helm repo update
helm upgrade --install signoz signoz/signoz \
  --namespace signoz \
  --create-namespace \
  --wait \
  --timeout 1h \
  -f infra/signoz-aws/signoz-values.yaml
```

Verify privately before adding ingress:

```bash
kubectl port-forward -n signoz svc/signoz 8080:8080
curl -fsS http://localhost:8080/api/v1/health
```

Then install an ingress controller, terminate TLS with ACM, expose the SigNoz
UI on the UI hostname, and expose collector port 4318 on the OTLP hostname.
Protect the collector with an authentication layer and a request-size/rate
limit. Configure Vercel using the names in `vercel.env.example`; encode spaces
in `OTEL_EXPORTER_OTLP_HEADERS` as `%20`.

## Completion checks

- `https://signoz.example.com/api/v1/health` returns healthy through the
  authenticated UI path.
- A production KathaQuest request creates a `kathaquest` trace in SigNoz.
- The trace contains `lesson.generate`, VideoDB retrieval, narration and
  persistence spans.
- The invalid-voice demo produces a failed TTS span followed by a fallback
  span.
- Dashboard queries and alert rules see live production data.
- Collector ingress rejects a request without the configured authorization
  header.

The EKS deployment is intentionally not applied from this repository until the
owner supplies the inputs above, because creating EKS, EC2, EBS and load
balancer resources creates ongoing AWS charges.
