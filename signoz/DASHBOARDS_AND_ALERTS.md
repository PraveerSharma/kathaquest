# SigNoz Dashboards and Alerts

Use these definitions after `foundryctl cast -f casting.yaml` starts the local stack. Open `http://localhost:8080`, complete the first-user setup, generate one KathaQuest lesson, then create the panels below with the Metrics Query Builder.

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
5. Arm **Simulate ElevenLabs failure**, request English narration, and confirm:
   - `tts.generate` has error status.
   - `tts.fallback` succeeds.
   - `kathaquest.tts.failures` increments.
   - `kathaquest.tts.fallbacks` increments.
   - The TTS alert enters firing state.
6. Save screenshots of both dashboards and the failed/recovered trace under `public/demo/`.
