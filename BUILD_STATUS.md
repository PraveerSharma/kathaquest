# KathaQuest Build Status

Last updated: 2026-07-26

## Core product

- [x] Convert the source PDF to Markdown
- [x] Initialise strict Next.js + TypeScript project
- [x] Validate supplied VideoDB, OpenAI and Sarvam credentials
- [x] Seed ten reviewed all-ages videos across five science topics
- [x] Index spoken-word and visual scene understanding
- [x] Return three timestamped, playable VideoDB episodes
- [x] Extract exactly three concepts with structured LLM output
- [x] Generate Hindi narration with Sarvam AI
- [x] Demonstrate controlled ElevenLabs failure and Sarvam fallback
- [x] Answer a typed or spoken question with supporting video evidence
- [x] Generate quiz feedback and a revision reel
- [x] Add five original PDFs to the selectable chapter pack
- [x] Support generalized text-based PDF uploads
- [x] Verify source quotes against the uploaded chapter
- [x] Moderate chapter, question, answer, and narration text
- [x] Hide quiz answers in encrypted, expiring lesson tokens
- [x] Add best-effort API rate limits
- [x] Add chapter-pack grounding and safety evaluations

## Observability

- [x] Add Foundry `casting.yaml`
- [x] Generate and commit `casting.yaml.lock`
- [x] Start SigNoz via Foundry and Docker
- [x] Export OpenTelemetry traces and metrics
- [x] Verify KathaQuest telemetry in the SigNoz ClickHouse store
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

- SigNoz is healthy locally. First-user setup and dashboard/alert creation still require completing the SigNoz UI onboarding at `http://localhost:8080`.
- ElevenLabs credentials were not supplied. English narration correctly exercises the Sarvam recovery path; add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` to demonstrate a healthy primary request before the controlled failure.
