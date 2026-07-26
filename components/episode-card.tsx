"use client";

import { useRef, useState } from "react";

import { HlsPlayer } from "@/components/hls-player";
import type { Episode, LessonLanguage } from "@/lib/types";

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "short clip";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export function EpisodeCard({
  episode,
  index,
  language,
  onFallback,
}: {
  episode: Episode;
  index: number;
  language: LessonLanguage;
  onFallback: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>();
  const [provider, setProvider] = useState<"sarvam" | "elevenlabs">();
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [error, setError] = useState<string>();

  async function listen() {
    setError(undefined);
    if (audioUrl) {
      await audioRef.current?.play();
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/narration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: episode.explanation,
          language,
        }),
      });
      const result = (await response.json()) as {
        audioUrl?: string;
        provider?: "sarvam" | "elevenlabs";
        fallbackUsed?: boolean;
        error?: string;
      };
      if (!response.ok || !result.audioUrl || !result.provider) {
        throw new Error(result.error ?? "Narration failed");
      }
      setAudioUrl(result.audioUrl);
      setProvider(result.provider);
      setFallbackUsed(Boolean(result.fallbackUsed));
      if (result.fallbackUsed) onFallback();
      window.setTimeout(() => audioRef.current?.play(), 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Narration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="episode-card">
      <div className="episode-layout">
        <div className="video-shell">
          <HlsPlayer src={episode.streamUrl} />
          <span className="video-badge">Real VideoDB stream</span>
        </div>
        <div className="episode-content">
          <div className="episode-kicker">
            <span>Episode {index + 1}</span>
            <span>{formatDuration(episode.durationSeconds)}</span>
          </div>
          <h3>{episode.title}</h3>
          <p className="episode-explanation">{episode.explanation}</p>
          <blockquote className="source-quote">
            <span>From your chapter{episode.sourcePage ? ` · page ${episode.sourcePage}` : ""}</span>
            “{episode.sourceQuote}”
          </blockquote>
          <button
            className="listen-button"
            disabled={loading}
            onClick={listen}
            type="button"
          >
            <svg aria-hidden="true" className="button-icon" fill="none" viewBox="0 0 24 24">
              {audioUrl ? (
                <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
              ) : (
                <path d="m9 7 8 5-8 5V7Z" />
              )}
            </svg>
            {loading ? "Preparing voice…" : audioUrl ? "Listen again" : "Listen to explanation"}
          </button>
          <audio ref={audioRef} src={audioUrl} />
          {provider ? (
            <div className="provider-message">
              {fallbackUsed
                ? "Primary voice provider failed • Recovered using Sarvam AI"
                : `Narrated with ${provider === "sarvam" ? "Sarvam AI" : "ElevenLabs"}`}
            </div>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
          <div className="why-box">
            <strong>Why this clip?</strong>
            {episode.whyThisClip}
          </div>
          <div className="evidence-list">
            {episode.evidence.map((evidence) => (
              <div
                className="evidence-row"
                key={`${evidence.videoId}-${evidence.startSeconds}`}
              >
                <span className="score-pill">
                  {Math.round((evidence.relevanceScore ?? 0) * 100)}% match
                </span>
                <span>
                  {Math.round(evidence.startSeconds)}s–
                  {Math.round(evidence.endSeconds)}s
                </span>
                {evidence.sourceUrl ? (
                  <a
                    href={evidence.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                    title={evidence.videoTitle}
                  >
                    {evidence.videoTitle}
                  </a>
                ) : (
                  <span>{evidence.videoTitle}</span>
                )}
                <span>• {evidence.licence ?? "Licence documented"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
