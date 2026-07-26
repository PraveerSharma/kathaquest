# KathaQuest Build Status

Last updated: 2026-07-26

## Core product

- [x] Convert the source PDF to Markdown
- [x] Initialise strict Next.js + TypeScript project
- [x] Validate supplied VideoDB, OpenAI and Sarvam credentials
- [x] Seed twelve reviewed all-ages videos across five science topics
- [x] Index spoken-word and visual scene understanding
- [x] Return three timestamped, playable VideoDB episodes
- [x] Extract exactly three concepts with structured LLM output
- [x] Support full lesson and quiz localization across 11 Indian languages
- [x] Generate language-specific, kid-friendly Sarvam narration
- [x] Synchronize localized narration with stitched video through VideoDB Timeline
- [x] Require 50-second-or-longer precision-reviewed lesson videos
- [x] Answer a typed or spoken question with supporting video evidence
- [x] Generate quiz feedback and a revision reel
- [x] Add five original PDFs to the selectable chapter pack
- [x] Support generalized text-based PDF uploads
- [x] Verify source quotes against the uploaded chapter
- [x] Moderate chapter, question, answer, and narration text
- [x] Hide quiz answers in encrypted, expiring lesson tokens
- [x] Add best-effort API rate limits
- [x] Add chapter-pack grounding and safety evaluations
- [x] Add cross-browser desktop/mobile workflow coverage
- [x] Exercise the real PDF → video → language → Q&A → quiz path in Chromium

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
- [x] Browser suite passes on Chromium, Firefox, WebKit and Pixel 7
- [x] All five chapter-pack relevance/duration evaluations pass
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
- VideoDB’s optional enhanced audio-index endpoint currently returns HTTP 500. Spoken-word and detailed scene indexes, retrieval, stitching and Timeline narration composition remain healthy.
