import Image from "next/image";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Inside KathaQuest: Observing an AI Lesson Pipeline with SigNoz",
  description:
    "How I used OpenTelemetry and SigNoz to understand a multilingual PDF-to-lesson pipeline.",
};

export default function KathaQuestSigNozBlog() {
  return (
    <main>
      <SiteHeader active="blog" />
      <article className="blog-article container">
        <header className="blog-hero">
          <p className="eyebrow">BUILD STORY · SIGNOZ HACKATHON 2026</p>
          <h1>
            I could see the lesson. SigNoz showed me why it took a minute to
            arrive.
          </h1>
          <p className="blog-deck">
            Building KathaQuest, an AI lesson studio that turns a school
            chapter into a narrated, visual lesson, forced me to treat
            observability as part of the product rather than a dashboard added
            at the end.
          </p>
          <div className="blog-byline">
            <span>By Praveer Sharma</span>
            <span>12 minute read</span>
          </div>
        </header>

        <Image
          alt="KathaQuest home screen for choosing a chapter"
          className="blog-cover"
          height={900}
          priority
          src="/demo/home.png"
          width={1600}
        />

        <section>
          <p>
            A child does not care that an application made seven API calls.
            They care that the explanation makes sense, the voice feels
            friendly, and the next scene appears before curiosity turns into
            impatience. That was the useful constraint behind KathaQuest.
          </p>
          <p>
            The first prototype extracted topics from a PDF and returned a few
            related video clips. It technically worked, but it solved only the
            retrieval part of learning. A short clip of an eruption does not
            explain pressure, magma, or what happens below the surface. I
            rebuilt the workflow as a small lesson studio: parse the chapter,
            create a pedagogical plan, write a scene-by-scene script, retrieve
            real footage, compose diagrams and highlighted vocabulary, narrate
            it in the child&apos;s language, and finish with a quiz.
          </p>
          <p>
            That stronger workflow also created a harder engineering problem.
            One request now crosses document parsing, OpenAI, VideoDB, media
            ranking, a presentation engine, text-to-speech, and storage. A
            generic request-duration graph could tell me the whole operation
            was slow. It could not tell me which creative step was slow, what
            language was affected, or whether the final video was actually
            relevant.
          </p>
        </section>

        <section>
          <h2>Tracing the lesson, not just the HTTP request</h2>
          <p>
            I instrumented the pipeline with OpenTelemetry and used a
            self-hosted SigNoz deployment installed through Foundry. The root
            span is <code>lesson.generate</code>. Beneath it are spans named
            after product decisions: <code>llm.extract_concepts</code>,{" "}
            <code>videodb.search_concept</code>,{" "}
            <code>videodb.rerank_candidates</code>,{" "}
            <code>videodb.compile_episode</code>,{" "}
            <code>llm.create_lesson_presentation</code>, and{" "}
            <code>tts.generate</code>.
          </p>
          <pre>
            <code>{`lesson.generate
├── document.parse
├── llm.extract_concepts
├── videodb.search_concept
│   └── videodb.rerank_candidates
├── videodb.compile_episode
├── llm.create_lesson_presentation
└── tts.generate`}</code>
          </pre>
          <p>
            Each span carries the context I need during a demo or an incident:
            provider, model, age band, target language, scene count, media
            source, result count, relevance score, and fallback status. API
            keys and chapter text are deliberately excluded. The result is a
            trace that reads like the lesson&apos;s production diary.
          </p>
          <figure>
            <Image
              alt="KathaQuest traces visible in SigNoz"
              height={900}
              src="/blog/signoz-traces.png"
              width={1600}
            />
            <figcaption>
              Real KathaQuest lesson traces in the local SigNoz instance.
            </figcaption>
          </figure>
        </section>

        <section>
          <h2>The first numbers changed what I worked on</h2>
          <p>
            During the final test run, SigNoz received 320 spans across 34
            lesson-generation traces. Eighteen lessons completed in the
            selected window. It also received 27 KathaQuest-specific metrics,
            plus 224 OpenAI spans and six Sarvam narration spans. The average
            retrieved-video relevance score was about 0.615.
          </p>
          <p>
            The most useful finding was less flattering: the visible UI was
            responsive, but the end-to-end pipeline could approach a minute.
            VideoDB work reached roughly 6.46 seconds at p95, and storyboard
            creation added another large block. Without distributed traces I
            would have optimized the React interface because that was the part
            I could see. The trace made it obvious that retrieval fan-out and
            repeated generation were the real targets.
          </p>
          <p>
            I added a ten-panel KathaQuest dashboard through the SigNoz API and
            MCP tools. It tracks completed and failed lessons, p95 generation
            time, LLM and TTS latency, VideoDB latency, video relevance,
            provider volume, scene volume, and fallback behavior. Every query
            was dry-run before the dashboard was created. That last detail
            mattered: telemetry labels are easy to assume and expensive to
            discover during a live demo.
          </p>
          <figure>
            <Image
              alt="KathaQuest service metrics in SigNoz"
              height={900}
              src="/blog/signoz-service.png"
              width={1600}
            />
            <figcaption>
              The service view confirmed that traces were arriving before I
              built project-specific panels.
            </figcaption>
          </figure>
        </section>

        <section>
          <h2>Reproducible by design</h2>
          <p>
            The repository includes both <code>casting.yaml</code> and{" "}
            <code>casting.yaml.lock</code>, so the observability stack can be
            reproduced with Foundry:
          </p>
          <pre>
            <code>{`foundryctl cast -f casting.yaml

# SigNoz UI
open http://localhost:8080

# The app exports OTLP/HTTP telemetry here
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`}</code>
          </pre>
          <p>
            I also added a configuration script that checks existing
            dashboards, validates each query, then creates the KathaQuest
            dashboard. If a public, authenticated webhook is supplied, the same
            script can create notification channels and alerts for failed
            lessons, slow p95 generation, and low media relevance.
          </p>
          <p>
            One real deployment lesson was that a Vercel function cannot export
            to <code>localhost:4318</code> on my laptop. Local development and
            the self-hosted stack work together, but production needs a
            network-reachable OpenTelemetry collector with TLS and
            authentication. I kept that boundary explicit instead of making
            the production badge claim telemetry that could not arrive.
          </p>
        </section>

        <section>
          <h2>Observability became a product feature</h2>
          <p>
            The lesson quality score is not an infrastructure metric in the
            traditional sense, yet it is the number that matters most here. A
            healthy 200 response with irrelevant footage is still a failed
            learning experience. Recording relevance, fallback source, language
            selection, and scene count beside latency lets me ask better
            questions: Are Hindi lessons slower? Does a fallback image improve
            completion but reduce relevance? Do younger age bands need fewer
            scenes?
          </p>
          <p>
            KathaQuest now supports eleven Indian languages and lets the learner
            switch narration without rebuilding the visual lesson. Sarvam
            supplies regional-language speech, while the provider boundary also
            supports ElevenLabs when valid credentials are configured. The
            presentation itself is deterministic React composition, inspired
            by Remotion: real clips when they teach the concept well, diagrams
            when the concept is invisible, captions for every narration line,
            and short knowledge checks that turn watching into participation.
          </p>
          <p>
            The next optimization is trace-driven. I want to cache stable lesson
            plans, parallelize independent media searches, set a hard retrieval
            budget per scene, and evaluate relevance before rendering. SigNoz
            gives each change an honest before-and-after result.
          </p>
        </section>

        <section>
          <h2>What I learned</h2>
          <p>
            I started this hackathon thinking observability would help me prove
            that the app worked. It did something more valuable: it showed me
            where the product did not yet respect a child&apos;s time.
            Instrumenting semantic stages made the system easier to explain,
            debug, and improve. Foundry made the stack repeatable, and the
            SigNoz traces connected technical latency to an actual learning
            moment.
          </p>
          <p>
            AI assisted with implementation and editing during the build. The
            measurements, screenshots, architecture decisions, failures, and
            conclusions in this article come from the running KathaQuest
            system.
          </p>
          <div className="blog-cta">
            <div>
              <h2>Turn a chapter into a lesson</h2>
              <p>Try a sample chapter or upload your own PDF.</p>
            </div>
            <Link className="primary-button" href="/content">
              Open KathaQuest
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
