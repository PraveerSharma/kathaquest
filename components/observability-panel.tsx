"use client";

import { useState } from "react";

import type { PublicLesson } from "@/lib/types";

export function ObservabilityPanel({
  lesson,
  fallbackUsed,
}: {
  lesson: PublicLesson;
  fallbackUsed: boolean;
}) {
  const signozUrl = process.env.NEXT_PUBLIC_SIGNOZ_URL;
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string>();

  async function armFailure() {
    const response = await fetch("/api/demo/failure", { method: "POST" });
    const body = (await response.json()) as {
      armed?: boolean;
      message?: string;
      error?: string;
    };
    setArmed(Boolean(body.armed));
    setMessage(body.message ?? body.error);
  }

  return (
    <section className="dev-panel" id="observability">
      <div className="dev-header">
        <div>
          <span className="status-pill">
            <span className="dot" /> Developer observability
          </span>
          <h2>Every AI step has a trail.</h2>
        </div>
      </div>
      <div className="dev-grid">
        <div className="dev-stat">
          <small>Trace ID</small>
          <strong title={lesson.traceId}>{lesson.traceId ?? "Pending"}</strong>
        </div>
        <div className="dev-stat">
          <small>Generation time</small>
          <strong>
            {lesson.generationTimeMs
              ? `${(lesson.generationTimeMs / 1_000).toFixed(1)} seconds`
              : "—"}
          </strong>
        </div>
        <div className="dev-stat">
          <small>VideoDB evidence</small>
          <strong>
            {lesson.episodes.reduce(
              (sum, episode) => sum + episode.evidence.length,
              0,
            )}{" "}
            timestamped clips
          </strong>
        </div>
        <div className="dev-stat">
          <small>Voice recovery</small>
          <strong>{fallbackUsed ? "Backup voice used" : "Ready"}</strong>
        </div>
      </div>
      <div className="dev-actions">
        <button className="danger" onClick={armFailure} type="button">
          {armed ? "Failure armed" : "Simulate voice-provider failure"}
        </button>
        {signozUrl ? (
          <a href={signozUrl} rel="noreferrer" target="_blank">
            Open SigNoz
          </a>
        ) : null}
        <a href="/api/health" rel="noreferrer" target="_blank">
          Service health
        </a>
      </div>
      {message ? <div className="provider-message">{message}</div> : null}
    </section>
  );
}
