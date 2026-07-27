# SigNoz Dashboards and Alerts

The Docker stack was installed and verified healthy on 2026-07-26 with:

```bash
foundryctl cast -f casting.yaml
docker compose \
  -f pours/deployment/compose.yaml \
  -f signoz/compose.telemetry.yaml \
  up -d --force-recreate ingester
curl -fsS http://localhost:8080/api/v1/health
docker ps
```

Open `http://localhost:8080`, complete the first-user setup, generate one KathaQuest lesson, then create the panels below with the Metrics Query Builder. The dashboard UI requires the owner account created during onboarding, so it is intentionally not automated with a shared credential.

All panels filter on `service.name = 'kathaquest'` when that resource attribute is available.

## Dashboard 1: Lesson Agent Health

| Panel | Metric / signal | Aggregation |
| --- | --- | --- |
| Total lessons generated | `kathaquest.lesson.generated` | Sum |
| Lesson success rate | generated / (generated + failed) × 100 | Formula |
| P50 lesson duration | `kathaquest.lesson.duration` | P50 |
| P95 lesson duration | `kathaquest.lesson.duration` | P95 |
| Failed lessons | `kathaquest.lesson.failed` | Sum |
| Average VideoDB search latency | `kathaquest.videodb.search.duration` | Average |
| Empty VideoDB searches | `kathaquest.videodb.empty_results` | Sum |
| TTS fallback count | `kathaquest.tts.fallbacks` | Sum |
| Recent error traces | Trace signal, `status = error` | Table |

## Dashboard 2: AI Provider Reliability

| Panel | Metric / signal | Aggregation |
| --- | --- | --- |
| TTS requests by provider | `kathaquest.tts.request.duration` | Count, group by `provider` |
| Average TTS latency | `kathaquest.tts.request.duration` | Average, group by `provider` |
| Provider failures | `kathaquest.tts.failures` | Sum, group by `provider` |
| Fallbacks over time | `kathaquest.tts.fallbacks` | Sum over time |
| Questions asked | `kathaquest.questions.asked` | Sum, group by `language` |
| Curiosity Clips generated | `kathaquest.curiosity.clips.generated` | Sum, group by `video_evidence` and `fallback` |
| Curiosity Clip narrations | `kathaquest.curiosity.narrations.generated` | Sum, group by `language` and `provider` |
| Presentation quality | `kathaquest.presentation.quality` | Average, group by `source` and `tier` |
| Slowest pipeline stage | Trace duration | P95, group by `name` |
| Video results per search | `kathaquest.videodb.search.results` | Average |
| Revision reels generated | `kathaquest.revision.generated` | Sum |

## Alerts

Create three metric-based alerts with a five-minute evaluation window and thresholds that trigger during the demo:

1. **KathaQuest lesson generation failure**
   - Metric: `kathaquest.lesson.failed`
   - Aggregation: Sum
   - Trigger: above `0`
2. **KathaQuest TTS provider failure**
   - Metric: `kathaquest.tts.failures`
   - Aggregation: Sum
   - Trigger: above `0`
3. **KathaQuest empty VideoDB search**
   - Metric: `kathaquest.videodb.empty_results`
   - Aggregation: Sum
   - Trigger: above `0`

Add label `demo=kathaquest` to each alert.

## Validation sequence

1. Run `npm run dev`.
2. Generate a volcano lesson and confirm `kathaquest.lesson.generated` increments.
3. Open Traces and filter `service.name = 'kathaquest'`.
4. Inspect `lesson.generate` and its VideoDB/OpenAI child spans.
5. Ask a question in **Still curious?** and inspect the separate
   `curiosity.answer`, `curiosity.generate`, `llm.create_curiosity_clip`, and
   `curiosity.generate_narration` spans.
6. Arm **Simulate ElevenLabs failure**, request English narration, and confirm:
   - `tts.generate` has error status.
   - `tts.fallback` succeeds.
   - `kathaquest.tts.failures` increments.
   - `kathaquest.tts.fallbacks` increments.
   - The TTS alert enters firing state.
7. Save screenshots of both dashboards and the failed/recovered trace under `public/demo/`.
