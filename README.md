# KathaQuest

> Turn textbook chapters into multilingual video adventures using real educational footage.

KathaQuest reads a science chapter, extracts three age-appropriate concepts, searches a trusted archive for exact moments that explain them, and compiles those moments into playable micro-lessons. Children can listen in English or Hindi, ask a typed or spoken question, and get an answer backed by another real video clip.

The reviewed archive contains ten all-ages videos from USGS, NASA, NOAA and the U.S. National Park Service. VideoDB—not a mock—provides ingestion, spoken-word indexing, scene understanding, semantic retrieval, timestamp evidence and HLS compilation.

![KathaQuest home screen](public/demo/home.png)

## Why it exists

Textbooks can feel static, while the best explanation may be buried inside a long lecture or scientific recording. Generic AI video generation introduces another problem: the picture can look convincing without being real.

KathaQuest uses the chapter as a learning roadmap and retrieves evidence from trusted footage. Every clip exposes its source, licence, timestamps and relevance score.

## Demo flow

1. Select one of five original chapter stories or upload a text-based PDF.
2. Choose an age group and English or Hindi.
3. Generate exactly three concepts and three real VideoDB episodes.
4. Listen to a child-friendly explanation.
5. Ask a typed question or record a short Hindi question.
6. Complete the quiz; missed concepts create a VideoDB revision reel.
7. Arm the developer failure control, request English narration, and watch the system recover from ElevenLabs to Sarvam.
8. Inspect the matching trace, metrics and structured logs in SigNoz.

## Architecture

```mermaid
flowchart LR
    A[Chapter PDF or demo text] --> B[Next.js lesson route]
    B --> C[OpenAI structured extraction]
    C --> D[Three source-quoted learning objectives]
    D --> E[VideoDB spoken + scene search]
    E --> F[Timestamped evidence]
    F --> G[VideoDB HLS compilation]
    G --> H[Three playable episodes]
    H --> I[Sarvam / ElevenLabs router]
    H --> J[Question + quiz routes]
    J --> E
    B --> M[OpenAI moderation]
    H --> N[Encrypted lesson token]
    B -. spans, metrics, logs .-> K[OpenTelemetry]
    C -.-> K
    E -.-> K
    I -.-> K
    K --> L[SigNoz via Foundry]
```

The app is one strict-TypeScript Next.js repository. External credentials remain in server-only environment variables. Quiz answers stay inside a 24-hour AES-256-GCM lesson token and are never returned as readable browser data.

## VideoDB depth

- Ten real, reviewed sources from USGS, NASA, NOAA and NPS in one collection
- Spoken-word indexes for narrated educational evidence
- Scene indexes describing vents, craters, lava, ash, gas and eruption processes
- Collection-wide semantic search across both index types and up to three topic-neutral queries
- Kid-safe allowlist filtering before any clip can be compiled
- Deduplication of overlapping timestamp results
- One automatic LLM query rewrite when a search is empty
- Exact source title, start/end time, match type and confidence in the UI
- Search-result compilation into browser-playable HLS
- New searches for child questions and quiz revision

Source and licence records live in [`data/demo-videos.json`](data/demo-videos.json). Runtime VideoDB IDs are cached locally by the seeding script and intentionally ignored by Git.

## SigNoz observability

The root `lesson.generate` trace includes:

- `document.extract`
- `llm.extract_concepts`
- `videodb.search_concept`
- `videodb.rewrite_query`
- `videodb.compile_episode`
- `sarvam.speech_to_text`
- `llm.answer_question`
- `tts.generate`
- `tts.fallback`
- `quiz.evaluate`
- `revision.compile`
- `lesson.persist`

Custom counters and histograms cover lesson success/failure/duration, VideoDB latency/results/empty searches, TTS latency/failures/fallbacks, questions and revision reels. Pino logs include trace ID, span ID, lesson ID, event and provider fields.

The controlled failure is intentionally visible: `tts.generate` fails for ElevenLabs, `kathaquest.tts.failures` increases, `tts.fallback` records recovery, Sarvam returns real audio, and the UI reports both failure and recovery.

## Stack

- Next.js 16, React 19, TypeScript 5 (strict)
- OpenAI Responses API structured outputs + Zod
- VideoDB Node.js SDK and HLS.js
- Sarvam AI Bulbul v3 TTS and Saarika STT
- ElevenLabs multilingual TTS when credentials are present
- OpenTelemetry traces/metrics and Pino structured logs
- SigNoz installed reproducibly with Foundry
- Tailwind CSS 4 plus purpose-built accessible components

## Local setup

Requirements: Node.js 22+, npm, Docker Desktop, and credentials for VideoDB, OpenAI and Sarvam. ElevenLabs is optional for local Hindi-first development but required to demonstrate a successful English primary-provider request.

```bash
git clone https://github.com/PraveerSharma/kathaquest.git
cd kathaquest
npm install
cp .env.example .env.local
```

Fill `.env.local`; never commit it.

```bash
npm run verify-services
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The seed script is resumable. It reuses cached VideoDB IDs and does not upload a source twice. Set `SEED_LIMIT=1 npm run seed` to prove one vertical slice first.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VIDEODB_API_KEY` | Server-side VideoDB access |
| `VIDEODB_COLLECTION_ID` | Trusted archive collection |
| `OPENAI_API_KEY` | Structured chapter reasoning |
| `OPENAI_MODEL` | Defaults to `gpt-5.6` |
| `LESSON_SIGNING_SECRET` | 32+ character key for encrypted stateless lesson sessions |
| `SARVAM_API_KEY` | Hindi/English TTS and Hindi STT |
| `ELEVENLABS_API_KEY` | English primary TTS |
| `ELEVENLABS_VOICE_ID` | English narration voice |
| `OTEL_*` | Service name and OTLP HTTP endpoints |
| `SIGNOZ_URL` | Local SigNoz UI |
| `SIGNOZ_MCP_URL` | Local SigNoz MCP endpoint |
| `DEMO_MODE` | Enables the controlled failure route |

## SigNoz with Foundry

```bash
curl -fsSL https://signoz.io/foundry.sh | bash
foundryctl gauge -f casting.yaml
foundryctl cast -f casting.yaml
docker compose \
  -f pours/deployment/compose.yaml \
  -f signoz/compose.telemetry.yaml \
  up -d --force-recreate ingester
curl -fsS localhost:8080/api/v1/health
```

Expected endpoints:

- SigNoz UI: `http://localhost:8080`
- OTLP HTTP: `http://localhost:4318`
- OTLP gRPC: `http://localhost:4317`
- SigNoz MCP: `http://localhost:8000/mcp`

Both [`casting.yaml`](casting.yaml) and [`casting.yaml.lock`](casting.yaml.lock) are committed for reproducibility. Dashboard panels, alerts and validation steps are in [`signoz/DASHBOARDS_AND_ALERTS.md`](signoz/DASHBOARDS_AND_ALERTS.md).

The small Compose override keeps the local OTLP pipelines active before the first SigNoz owner finishes UI onboarding. Without it, the pre-onboarding OpAMP default can temporarily replace trace, metric, and log pipelines with no-op pipelines.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
# With npm run dev active:
npm run smoke-test
npm run evals
```

The smoke test performs a real lesson generation and verifies exactly three concepts and episodes, playable streams, evidence, Q&A, quiz scoring, an encrypted lesson token, and no readable answer leak. The evaluation suite runs the five bundled chapters against grounding, safety, coverage, and evidence contracts.

## Public media and licences

The catalog uses reviewed educational media from USGS, NASA, NOAA and NPS. Every entry records its authority, audience, safety note, topics, source page, and licence/usage designation. KathaQuest displays source details beside every retrieved clip. See [`data/demo-videos.json`](data/demo-videos.json).

## Failure recovery demo

1. Generate a lesson.
2. In the developer observability panel, choose **Simulate ElevenLabs failure**.
3. On an English lesson, choose **Listen to explanation**.
4. Confirm the UI says “Primary voice provider failed” and “Recovered using Sarvam AI.”
5. In SigNoz, open the lesson trace and inspect `tts.generate` followed by `tts.fallback`.

## Production posture and limitations

- Lesson interactions are stateless and serverless-safe through encrypted, expiring tokens; persistent multi-device history still needs a database and authentication.
- Rate limiting is best-effort per runtime instance. A distributed limiter should replace it before large public traffic.
- Uploaded PDFs are text-based and capped at 10 MB; OCR is not included.
- Retrieval is safe by construction but limited to the reviewed ten-video corpus. Unsupported topics fail instead of showing an unreviewed or irrelevant clip.
- The revision reel currently targets the first missed concept.
- Self-hosted SigNoz is local; Vercel telemetry needs a reachable hosted or tunneled OTLP endpoint.
- ElevenLabs credentials are optional; Sarvam remains the working fallback.

## Bundled chapter pack

The PDFs in [`Chapter_Pack`](Chapter_Pack) cover volcanoes, the water cycle, the solar system, butterfly metamorphosis, and photosynthesis. Run `npm run build:chapters` after editing them to regenerate the UI catalog in [`data/chapter-pack.json`](data/chapter-pack.json).

## Post-hackathon roadmap

Teacher-curated archives and approval, more subjects, curriculum mapping, regional-language expansion, accessibility modes, learning outcome tracking, publisher integrations and adaptive student revision.

## AI Tools Disclosure

We used OpenAI Codex as a coding assistant for implementation, debugging and documentation. All product decisions, integration choices, testing and final submission review were performed by the team.

## Team

Built by Praveer Sharma for the VideoDB “Unlock the Footage” and Agents of SigNoz hackathons.
