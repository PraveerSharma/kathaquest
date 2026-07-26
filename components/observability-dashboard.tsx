"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Summary = {
  status: "live";
  service: string;
  windowHours: number;
  generatedAt: string;
  latestSpanAt?: string;
  metrics: {
    traces: number;
    spans: number;
    errors: number;
    errorRate: number;
    lessons: number;
    successfulLessons: number;
    lessonSuccessRate: number;
    p95LatencyMs: number;
    lessonP95LatencyMs: number;
    relevanceScore: number;
    openaiCalls: number;
    videoDbCalls: number;
    narrations: number;
    quizChecks: number;
  };
  trend: Array<{
    bucket: string;
    traces: number;
    spans: number;
  }>;
  recent: Array<{
    event_time: string;
    name: string;
    duration_ms: number;
    has_error: number;
    language: string;
    provider: string;
  }>;
};

const operationLabels: Record<string, string> = {
  "lesson.generate": "Complete lesson",
  "lesson.persist": "Save lesson",
  "llm.extract_concepts": "Plan learning goals",
  "llm.create_lesson_presentation": "Build storyboard",
  "quiz.evaluate": "Check quiz answer",
  "tts.generate": "Create narration",
  "videodb.compile_episode": "Assemble footage",
  "videodb.rerank_candidates": "Review clip relevance",
  "videodb.search_concept": "Search VideoDB",
};

function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)} s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function parseClickHouseDate(value: string) {
  return new Date(`${value.replace(" ", "T").slice(0, 23)}Z`);
}

function formatTime(value: string) {
  const date = parseClickHouseDate(value);
  if (Number.isNaN(date.valueOf())) return "Recently";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function ObservabilityDashboard() {
  const [summary, setSummary] = useState<Summary>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/observability/summary", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Telemetry unavailable");
      setSummary((await response.json()) as Summary);
      setMessage(undefined);
    } catch {
      setMessage("The telemetry host is reconnecting. We will retry shortly.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const maxTrendSpans = useMemo(
    () => Math.max(1, ...(summary?.trend.map((point) => point.spans) ?? [1])),
    [summary],
  );

  if (loading && !summary) {
    return (
      <section aria-live="polite" className="observability-loading">
        <span className="loading-orbit" />
        <h1>Connecting to SigNoz...</h1>
        <p>Collecting the latest lesson traces.</p>
      </section>
    );
  }

  if (!summary) {
    return (
      <section aria-live="polite" className="observability-loading">
        <span className="status-light status-light-warning" />
        <h1>Telemetry is reconnecting</h1>
        <p>{message}</p>
        <button className="primary-button" onClick={refresh} type="button">
          Try again
        </button>
      </section>
    );
  }

  const { metrics } = summary;

  return (
    <>
      <section className="observability-hero">
        <div>
          <p className="eyebrow">KATHAQUEST × SIGNOZ</p>
          <h1>See each lesson being built.</h1>
          <p>
            Mission Control turns OpenTelemetry traces into a readable view of
            lesson quality, speed, AI dependencies, and recent activity.
          </p>
        </div>
        <div className="telemetry-live-card" aria-live="polite">
          <span className="telemetry-live-label">
            <span className="status-light" /> Live telemetry
          </span>
          <strong>{metrics.traces.toLocaleString("en-IN")}</strong>
          <small>traces in the last {summary.windowHours} hours</small>
          <span>
            Refreshed{" "}
            {new Intl.DateTimeFormat("en-IN", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(summary.generatedAt))}
          </span>
        </div>
      </section>

      {message ? <div className="telemetry-notice">{message}</div> : null}

      <section aria-label="Lesson telemetry overview" className="signal-grid">
        <article className="signal-card signal-card-coral">
          <span className="signal-icon" aria-hidden="true">
            ◉
          </span>
          <small>Lessons tracked</small>
          <strong>{metrics.lessons}</strong>
          <p>{metrics.successfulLessons} completed successfully</p>
        </article>
        <article className="signal-card signal-card-mint">
          <span className="signal-icon" aria-hidden="true">
            ✓
          </span>
          <small>Lesson success</small>
          <strong>{metrics.lessonSuccessRate}%</strong>
          <p>Includes deliberate recovery tests</p>
        </article>
        <article className="signal-card signal-card-lavender">
          <span className="signal-icon" aria-hidden="true">
            ◷
          </span>
          <small>Lesson p95</small>
          <strong>{formatDuration(metrics.lessonP95LatencyMs)}</strong>
          <p>95% of observed lessons finish within this time</p>
        </article>
        <article className="signal-card signal-card-yellow">
          <span className="signal-icon" aria-hidden="true">
            ★
          </span>
          <small>Clip relevance</small>
          <strong>{Math.round(metrics.relevanceScore * 100)}%</strong>
          <p>Average score after evidence ranking</p>
        </article>
      </section>

      <section className="telemetry-layout">
        <article className="telemetry-panel telemetry-traffic">
          <div className="telemetry-panel-heading">
            <div>
              <p className="eyebrow">TRACE TRAFFIC</p>
              <h2>What the app is doing</h2>
            </div>
            <div className="trace-total">
              <strong>{metrics.spans.toLocaleString("en-IN")}</strong>
              <span>unique spans</span>
            </div>
          </div>
          <div
            aria-label="Trace volume in two hour intervals"
            className="trace-chart"
            role="img"
          >
            {summary.trend.map((point) => (
              <div className="trace-bar-column" key={point.bucket}>
                <span>{point.spans.toLocaleString("en-IN")}</span>
                <div
                  className="trace-bar"
                  style={{
                    height: `${Math.max(8, (point.spans / maxTrendSpans) * 100)}%`,
                  }}
                />
                <small>{formatTime(point.bucket)}</small>
              </div>
            ))}
          </div>
          <div className="trace-chart-legend">
            <span>
              <i className="legend-swatch" /> Spans captured by SigNoz
            </span>
            <span>{metrics.errorRate}% span error rate</span>
          </div>
        </article>

        <aside className="telemetry-panel telemetry-reading">
          <p className="eyebrow">READ THE SIGNAL</p>
          <h2>What needs attention?</h2>
          <div className="insight-row">
            <span>01</span>
            <p>
              Lesson generation is the longest path. Media search and
              storyboard work are the first optimization targets.
            </p>
          </div>
          <div className="insight-row">
            <span>02</span>
            <p>
              A {Math.round(metrics.relevanceScore * 100)}% relevance score
              means retrieval quality deserves the same attention as uptime.
            </p>
          </div>
          <div className="insight-row">
            <span>03</span>
            <p>
              Error spans include provider recovery tests, so fallbacks remain
              visible instead of quietly hiding a weak dependency.
            </p>
          </div>
        </aside>
      </section>

      <section className="dependency-section">
        <div className="section-heading-inline">
          <div>
            <p className="eyebrow">DEPENDENCY PULSE</p>
            <h2>One lesson, several specialist services</h2>
          </div>
          <p>
            Counts come from deduplicated spans in the current 24 hour window.
          </p>
        </div>
        <div className="dependency-grid">
          <article>
            <span className="dependency-mark">AI</span>
            <div>
              <strong>OpenAI</strong>
              <p>Planning, scripts, and evidence ranking</p>
            </div>
            <b>{metrics.openaiCalls}</b>
          </article>
          <article>
            <span className="dependency-mark">VD</span>
            <div>
              <strong>VideoDB</strong>
              <p>Reviewed footage search and assembly</p>
            </div>
            <b>{metrics.videoDbCalls}</b>
          </article>
          <article>
            <span className="dependency-mark">VO</span>
            <div>
              <strong>Voice engine</strong>
              <p>Regional-language narration tracks</p>
            </div>
            <b>{metrics.narrations}</b>
          </article>
          <article>
            <span className="dependency-mark">QZ</span>
            <div>
              <strong>Learning checks</strong>
              <p>Quiz attempts evaluated with trace context</p>
            </div>
            <b>{metrics.quizChecks}</b>
          </article>
        </div>
      </section>

      <section className="activity-section">
        <div className="section-heading-inline">
          <div>
            <p className="eyebrow">RECENT OPERATIONS</p>
            <h2>The lesson pipeline, as it happened</h2>
          </div>
          <p>Safe operational labels only. Chapter text and keys stay private.</p>
        </div>
        <div className="activity-list">
          {summary.recent.map((event, index) => (
            <article key={`${event.event_time}-${event.name}-${index}`}>
              <span
                className={
                  event.has_error
                    ? "activity-status activity-status-error"
                    : "activity-status"
                }
              />
              <div>
                <strong>{operationLabels[event.name] ?? event.name}</strong>
                <p>
                  {event.language || event.provider
                    ? [event.language, event.provider]
                        .filter(Boolean)
                        .join(" · ")
                    : "KathaQuest pipeline"}
                </p>
              </div>
              <time>{formatTime(event.event_time)}</time>
              <b>{formatDuration(event.duration_ms)}</b>
            </article>
          ))}
        </div>
      </section>

      <section className="observability-explainer">
        <div>
          <p className="eyebrow">WHY IT MATTERS</p>
          <h2>A 200 response does not guarantee a good lesson.</h2>
        </div>
        <p>
          KathaQuest records the stages a learner actually feels: planning,
          footage relevance, narration, persistence, and quiz feedback. SigNoz
          helps us connect technical performance to the quality of the learning
          experience.
        </p>
        <a className="secondary-button" href="/blog/kathaquest-signoz">
          Read the build story
        </a>
      </section>
    </>
  );
}
