import Image from "next/image";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Inside KathaQuest: Observing an AI Lesson Pipeline with SigNoz",
  description:
    "What real OpenTelemetry traces taught me about a multilingual PDF-to-lesson pipeline.",
};

export default function KathaQuestSigNozBlog() {
  return (
    <main>
      <SiteHeader active="signoz-blog" />
      <article className="blog-article container">
        <header className="blog-hero">
          <p className="eyebrow">BUILD STORY · SIGNOZ</p>
          <h1>
            I could see the lesson. SigNoz showed me why it took two minutes to
            arrive.
          </h1>
          <p className="blog-deck">
            KathaQuest turns a school chapter into a narrated, visual lesson.
            Once the pipeline grew past a single AI call, I needed to understand
            the wait from the learner&apos;s point of view.
          </p>
          <div className="blog-byline">
            <span>By Praveer Sharma</span>
            <span>8 minute read</span>
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
            My first KathaQuest prototype looked convincing for about thirty
            seconds. It extracted topics from a PDF and found related video
            clips. Then I tried learning from it. A short clip of a volcano
            erupting is memorable, but it does not explain pressure, magma, or
            what is happening under the ground.
          </p>
          <p>
            I rebuilt the flow around a complete lesson: parse the chapter,
            choose learning goals, write a scene-by-scene script, retrieve
            footage, add diagrams and highlighted words, create narration, save
            the lesson, and finish with a quiz. That made the product more
            useful. It also made a single request depend on OpenAI, VideoDB, a
            presentation engine, text-to-speech, and storage.
          </p>
          <p>
            The page could tell me that generation was taking a long time. It
            could not tell me whether the delay came from planning, footage
            retrieval, or narration. Worse, a fast request could still return
            an irrelevant clip. I needed both engineering signals and learning
            quality signals in the same trace.
          </p>
        </section>

        <section>
          <h2>I traced the work a learner actually waits for</h2>
          <p>
            KathaQuest uses OpenTelemetry and a self-hosted SigNoz stack
            installed with Foundry. The root span is{" "}
            <code>lesson.generate</code>. Its children use product language:
            <code>llm.extract_concepts</code>,{" "}
            <code>videodb.search_concept</code>,{" "}
            <code>videodb.rerank_candidates</code>,{" "}
            <code>videodb.compile_episode</code>,{" "}
            <code>llm.create_lesson_presentation</code>, and{" "}
            <code>lesson.persist</code>. Narration and quiz attempts have their
            own spans too.
          </p>
          <pre>
            <code>{`lesson.generate
├── document.parse
├── llm.extract_concepts
├── videodb.search_concept
│   └── videodb.rerank_candidates
├── videodb.compile_episode
├── llm.create_lesson_presentation
└── lesson.persist`}</code>
          </pre>
          <p>
            I register an OTLP/HTTP exporter at startup, then wrap each
            meaningful stage with a small helper. The production exporter URL
            comes from the environment rather than being baked into the app:
          </p>
          <pre>
            <code>{`registerOTel({
  serviceName: "kathaquest",
  traceExporter: new OTLPHttpJsonTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    headers: exporterHeaders(),
  }),
});

await withSpan("lesson.generate", {
  "lesson.language": language,
  "lesson.age_band": ageBand,
}, async (span) => buildLesson(span));`}</code>
          </pre>
          <p>
            The attributes include provider, model, age band, target language,
            scene count, media source, result count, relevance score, and
            fallback status. Chapter text, children&apos;s answers, API keys,
            and signed media URLs are left out. A trace should help with a
            problem without becoming a second copy of private data.
          </p>
          <figure>
            <Image
              alt="KathaQuest traces visible in SigNoz"
              height={900}
              src="/blog/signoz-traces.png"
              width={1600}
            />
            <figcaption>
              Real KathaQuest traces in the self-hosted SigNoz instance.
            </figcaption>
          </figure>
        </section>

        <section>
          <h2>The trace contradicted my first guess</h2>
          <p>
            I expected the interface or the final video composition to be the
            bottleneck. The 24-hour snapshot on 27 July said otherwise. After
            deduplicating retried records, SigNoz contained 8,427 unique spans
            across 1,135 traces. Thirty-eight{" "}
            <code>lesson.generate</code> spans were recorded, and 27 completed
            successfully. The unsuccessful runs include provider recovery tests
            and failed development attempts, which I kept visible on purpose.
          </p>
          <p>
            Lesson generation reached 145.8 seconds at p95. Concept searches in
            VideoDB reached roughly 25 seconds at p95, while the average
            recorded relevance score was 0.62. Those numbers pointed to
            retrieval fan-out, ranking, and repeated generation. Shaving fifty
            milliseconds from a React render would not change the experience.
          </p>
          <p>
            Relevance was the more important lesson. A healthy HTTP response
            with weak footage is still a bad result for a child. Recording the
            score beside latency lets me see whether a faster retrieval strategy
            also made the lesson less useful.
          </p>
          <figure>
            <Image
              alt="KathaQuest service metrics in SigNoz"
              height={900}
              src="/blog/signoz-service.png"
              width={1600}
            />
            <figcaption>
              The service view confirmed that production traces were arriving
              before I built KathaQuest-specific views.
            </figcaption>
          </figure>
        </section>

        <section>
          <h2>The production mistake was localhost</h2>
          <p>
            Local development was simple: the Next.js app exported OTLP to{" "}
            <code>localhost:4318</code>, where the collector was listening. I
            initially carried that mental model into Vercel. Of course, a
            serverless function&apos;s localhost is not my laptop. The app
            looked healthy while the production traces went nowhere.
          </p>
          <p>
            For the live deployment, Vercel now sends traces to a
            network-reachable TLS gateway, which forwards OTLP to the
            self-hosted collector. I verified the path by creating a full Water
            Cycle lesson and a quiz event, then finding both in ClickHouse and
            SigNoz. This gateway is an interim bridge. The repository also has a
            cost-guarded AWS CDK stack for a permanent host, but the AWS account
            is still awaiting compute verification.
          </p>
          <p>
            That boundary matters. “Exporter configured” and “trace received”
            are different claims. My health route checks the configuration; my
            deployment test checks for the actual span ID at the other end.
          </p>
        </section>

        <section>
          <h2>A dashboard for people who do not speak in span IDs</h2>
          <p>
            The SigNoz workspace has detailed panels for lesson failures,
            generation p95, OpenAI and TTS latency, VideoDB latency, relevance,
            fallback behavior, and scene volume. Those views are useful while
            debugging. They are dense for a judge, teacher, or product reviewer
            who wants the story quickly.
          </p>
          <p>
            I added a public Mission Control page inside KathaQuest. It reads
            safe aggregates from the SigNoz ClickHouse store and refreshes every
            fifteen seconds. It shows lesson success, p95 generation time,
            relevance, dependency calls, trace traffic, and recent semantic
            operations. It never exposes raw attributes or credentials. The
            page also explains what the numbers suggest, because a chart without
            a decision is decoration.
          </p>
          <p>
            The lesson detail page still shows its own trace ID and generation
            time. That gives me two useful levels: a learner can report one
            problematic lesson, while Mission Control shows whether the problem
            is part of a pattern.
          </p>
        </section>

        <section>
          <h2>The setup is reproducible</h2>
          <p>
            The repository includes <code>casting.yaml</code> and{" "}
            <code>casting.yaml.lock</code>. Foundry can recreate the Docker
            deployment and its SigNoz MCP server:
          </p>
          <pre>
            <code>{`foundryctl cast -f casting.yaml

# SigNoz UI
open http://localhost:8080

# Local OTLP/HTTP endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`}</code>
          </pre>
          <p>
            A configuration script checks for existing dashboards, dry-runs
            each query, and then creates the KathaQuest panels. It can also
            configure alerts for failed lessons, slow p95 generation, and low
            media relevance when an authenticated notification channel is
            supplied. Dry-running the queries saved time because attribute
            names that look obvious in application code are easy to misread in
            the telemetry schema.
          </p>
          <p>
            The complete setup, including the instrumentation and Foundry
            manifests, is available in the{" "}
            <a
              href="https://github.com/PraveerSharma/kathaquest"
              rel="noreferrer"
              target="_blank"
            >
              KathaQuest repository
            </a>
            .
          </p>
        </section>

        <section>
          <h2>What I would tell myself at the start</h2>
          <p>
            Name spans after decisions in the product, not after helper
            functions. Add quality attributes early. Test the route from the
            production runtime, not only from a laptop. Finally, keep failed
            experiments visible. The 71.1% lesson success rate is less polished
            than a perfect green card, but it tells me where the product still
            needs work.
          </p>
          <p>
            SigNoz began as a way to prove that KathaQuest was running. It
            became the tool that showed me where the app was wasting a
            child&apos;s time and where “working” still meant “not useful
            enough.” That is the kind of feedback I can build from.
          </p>
          <div className="blog-cta">
            <div>
              <h2>See the system for yourself</h2>
              <p>Explore the live signals or turn a chapter into a lesson.</p>
            </div>
            <div className="blog-cta-actions">
              <Link className="secondary-button" href="/observability">
                Open Mission Control
              </Link>
              <Link className="primary-button" href="/content">
                Try KathaQuest
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
