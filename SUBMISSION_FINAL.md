# KathaQuest SigNoz Hackathon Submission

## Team name

KathaQuest

## Person submitting

Praveer Sharma

## Track

AI & Agent Observability

## Project description

KathaQuest is an AI lesson studio that turns any textbook chapter or PDF into one coherent, interactive video lesson for children. It plans the pedagogy, writes a scene-by-scene script and storyboard, retrieves relevant real-world footage through VideoDB, adds diagrams and captions, narrates the lesson in 11 Indian languages, and reinforces learning with questions and a quiz. OpenTelemetry and SigNoz make the entire AI and media pipeline measurable, from document parsing and LLM calls to video relevance, TTS latency, fallbacks, and completion.

## GitHub repository

https://github.com/PraveerSharma/kathaquest

The repository includes `casting.yaml` and `casting.yaml.lock` for a reproducible Foundry deployment.

## Deployed project

https://kathaquest.vercel.app

## Project blog

https://kathaquest.vercel.app/blog/kathaquest-signoz

## YouTube demo

Upload `artifacts/kathaquest-hackathon-demo.mp4` as an unlisted or public YouTube video, then paste the resulting URL here. The finished video is 2 minutes 22 seconds and includes narration and burned-in captions.

Suggested title: `KathaQuest: Observable AI Lessons for Every Child | SigNoz Hackathon`

Suggested description:

> KathaQuest turns any textbook chapter into a coherent, interactive, multilingual video lesson. This demo covers the product workflow, hybrid lesson architecture, and how OpenTelemetry plus SigNoz reveal latency, relevance, provider behavior, and fallbacks across the AI pipeline.
>
> Live: https://kathaquest.vercel.app
>
> Code: https://github.com/PraveerSharma/kathaquest
>
> Build story: https://kathaquest.vercel.app/blog/kathaquest-signoz

## How SigNoz is used

KathaQuest uses OpenTelemetry and SigNoz to observe the complete chapter-to-lesson pipeline as one distributed trace. The root `lesson.generate` span connects document parsing, concept extraction, OpenAI lesson planning, VideoDB search and reranking, episode compilation, storyboard generation, and Sarvam or ElevenLabs narration. Spans carry safe product context such as model, language, age band, scene count, relevance score, result count, and fallback status, while excluding API keys and chapter text.

The live test produced 320 spans across 34 lesson traces, 18 completed lessons, and 27 KathaQuest metrics. A reproducible ten-panel dashboard tracks completion and failure counts, p95 lesson latency, LLM and TTS latency, VideoDB latency, media relevance, scene volume, provider usage, and fallback behavior. Alert configuration covers failed lessons, slow p95 generation, and low video relevance. SigNoz exposed VideoDB latency near 6.5 seconds at p95 and made it clear that retrieval and storyboarding, not the React interface, were the most important optimization targets.

## Hackathon experience

This hackathon changed how I think about observability in an AI product. I began by treating telemetry as proof that KathaQuest was running. Once I traced semantic stages such as lesson planning, media retrieval, relevance scoring, storyboarding, and narration, it became a way to measure the learning experience itself. The most useful moment was discovering that the interface felt responsive while the full pipeline could still make a child wait close to a minute. SigNoz showed exactly where that time went.

I also learned a lot from making the stack reproducible with Foundry, validating dashboard queries against real data, and handling local versus production OTLP networking honestly. The deadline was intense, but the result is a much more explainable product and a clear, measurable path for improving speed and content quality.

