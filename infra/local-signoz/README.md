# Retired local telemetry fallback

Production telemetry now goes directly from Vercel to SigNoz Cloud. The
in-app observability summary, dashboards, and alerts no longer require this
Mac, Docker Desktop, or a Cloudflare tunnel.

This directory is retained only as a reproducible fallback. Foundry can run
SigNoz from the root `casting.yaml` and `casting.yaml.lock`; Caddy can combine
the UI, OTLP/HTTP, and MCP ports behind one local endpoint.

The local containers and both LaunchAgents are intentionally stopped. Their
volumes and configuration have not been deleted.
