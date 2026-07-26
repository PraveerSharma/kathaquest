# KathaQuest Build Status

Last updated: 2026-07-26

## Core product

- [x] Convert the source PDF to Markdown
- [x] Initialise strict Next.js + TypeScript project
- [x] Validate supplied VideoDB, OpenAI and Sarvam credentials
- [x] Seed six public-domain volcano videos in VideoDB
- [x] Index spoken-word and visual scene understanding
- [x] Return three timestamped, playable VideoDB episodes
- [x] Extract exactly three concepts with structured LLM output
- [x] Generate Hindi narration with Sarvam AI
- [x] Demonstrate controlled ElevenLabs failure and Sarvam fallback
- [x] Answer a typed or spoken question with supporting video evidence
- [x] Generate quiz feedback and a revision reel

## Observability

- [x] Add Foundry `casting.yaml`
- [x] Generate and commit `casting.yaml.lock`
- [ ] Export OpenTelemetry traces and metrics
- [ ] Verify a complete lesson trace in SigNoz
- [ ] Create two dashboards
- [ ] Create three alerts
- [ ] Capture dashboard screenshots

## Quality and submission

- [x] Production build succeeds
- [x] Lint and typecheck pass
- [x] Smoke test passes
- [x] No secrets are committed or exposed in browser responses
- [x] README and architecture diagram complete
- [x] Demo script and submission copy complete
- [x] Production deployment complete
- [ ] Demo recording complete
- [x] Tagged release complete
- [ ] VideoDB submission sent
- [ ] SigNoz submission sent

## Current blockers

- Docker Desktop is not running, so Foundry successfully validated and forged the SigNoz stack but could not start it. Launch Docker, run `foundryctl cast -f casting.yaml`, then create the dashboard panels and alerts in `signoz/DASHBOARDS_AND_ALERTS.md`.
- ElevenLabs credentials were not supplied. English narration correctly exercises the Sarvam recovery path; add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` to demonstrate a healthy primary request before the controlled failure.
