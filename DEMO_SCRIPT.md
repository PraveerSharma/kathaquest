# KathaQuest Demo Script

Target duration: 3 minutes 40 seconds.

## 0:00–0:25 — The problem

“Children often struggle with static textbook chapters, even though excellent educational footage already exists. The hard part is finding the exact moments that explain a chapter safely and quickly.”

Show the KathaQuest home screen. Point out “Real, trusted footage.”

## 0:25–1:05 — Generate a lesson

1. Choose **Use the volcano demo chapter**.
2. Select **8–10 years** and **हिंदी**.
3. Choose **Create my video adventure**.
4. Briefly show the six pipeline progress states.

Say: “OpenAI returns exactly three age-appropriate concepts. Each becomes an evidence search across VideoDB’s spoken-word and visual scene indexes.”

## 1:05–1:45 — Show VideoDB intelligence

1. Show all three episode cards.
2. Play one compiled HLS episode.
3. Point to the source, public-domain licence, timestamps, match type and relevance.

Say: “This is not a generic link or synthetic video. VideoDB found the exact moments inside a real USGS archive and compiled them into a new playable stream.”

## 1:45–2:15 — Ask a question

Record or type: “Lava bahar kyun aata hai?”

Show:

- Sarvam transcription
- The short Hindi response
- The supporting VideoDB stream

## 2:15–2:45 — Observability

Open the developer observability panel, then SigNoz.

Show:

- `lesson.generate` root trace
- OpenAI extraction span
- Three VideoDB search and compilation branches
- Search latency/result attributes
- Structured log correlation
- Lesson Agent Health dashboard

## 2:45–3:20 — Failure and recovery

1. Open an English lesson.
2. Choose **Simulate ElevenLabs failure**.
3. Choose **Listen to explanation**.
4. Show the UI recovery message.
5. In SigNoz, show the failed `tts.generate` span, `tts.fallback`, the failure counter and alert.

Say: “The primary provider failed, but the child’s lesson did not. SigNoz makes both the failure and recovery visible.”

## 3:20–3:40 — Close

“KathaQuest makes books visual, multilingual and evidence-based. VideoDB unlocks the knowledge inside real educational footage, while SigNoz makes the complete AI pipeline reliable and transparent.”
