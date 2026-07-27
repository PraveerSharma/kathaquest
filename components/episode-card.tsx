"use client";

import { useEffect, useRef, useState } from "react";

import { HlsPlayer } from "@/components/hls-player";
import { EpisodeVisualPlayer } from "@/components/presentation/episode-visual-player";
import {
  episodeMediaKey,
  readPreparedMedia,
  savePreparedMedia,
  type PreparedMedia,
} from "@/lib/client-media";
import { getLessonLanguage } from "@/lib/languages";
import type {
  Episode,
  LessonLanguage,
  LessonPresentation,
} from "@/lib/types";

export type VoiceProviderPreference = "auto" | "sarvam" | "elevenlabs";
export type NarrationStatus = "loading" | "ready" | "error";

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
  lessonId,
  lessonToken,
  onFallback,
  presentation,
  providerPreference,
  onNarrationStatusChange,
}: {
  episode: Episode;
  index: number;
  language: LessonLanguage;
  lessonId: string;
  lessonToken: string;
  onFallback: () => void;
  presentation?: LessonPresentation;
  providerPreference: VoiceProviderPreference;
  onNarrationStatusChange?: (
    episodeId: string,
    status: NarrationStatus,
  ) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const preparedRequestRef = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>();
  const [localizedStream, setLocalizedStream] = useState<string>();
  const [syncMode, setSyncMode] = useState<"videodb-timeline" | "browser">();
  const [provider, setProvider] = useState<"sarvam" | "elevenlabs">();
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [error, setError] = useState<string>();
  const languageName = getLessonLanguage(language).label;
  const hasVideo =
    episode.mediaMode !== "visual_explainer" &&
    Boolean(episode.streamUrl || episode.evidence[0]?.mediaUrl);

  function resetLocalizedMedia() {
    audioRef.current?.pause();
    if (videoRef.current) videoRef.current.muted = false;
    setAudioUrl(undefined);
    setLocalizedStream(undefined);
    setSyncMode(undefined);
    setProvider(undefined);
    setFallbackUsed(false);
    setError(undefined);
  }

  function applyPreparedMedia(media: PreparedMedia) {
    setAudioUrl(media.audioUrl);
    setProvider(media.provider);
    setSyncMode(media.syncMode ?? "browser");
    setLocalizedStream(media.streamUrl);
    setFallbackUsed(media.fallbackUsed);
    if (media.fallbackUsed) onFallback();
  }

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !audioUrl || syncMode !== "browser") return;

    video.muted = true;
    const align = () => {
      if (!Number.isFinite(video.duration) || !Number.isFinite(audio.duration)) {
        return;
      }
      const ratio = audio.duration / video.duration;
      audio.playbackRate = Math.max(0.65, Math.min(1.35, ratio));
      audio.currentTime = Math.min(audio.duration, video.currentTime * ratio);
    };
    const maintainSync = () => {
      if (!Number.isFinite(video.duration) || !Number.isFinite(audio.duration)) {
        return;
      }
      const ratio = audio.duration / video.duration;
      const expected = video.currentTime * ratio;
      if (Math.abs(audio.currentTime - expected) > 0.4) {
        audio.currentTime = Math.min(audio.duration, expected);
      }
    };
    const play = () => {
      align();
      void audio.play().catch(() => undefined);
    };
    const pause = () => audio.pause();
    video.addEventListener("play", play);
    video.addEventListener("pause", pause);
    video.addEventListener("seeked", align);
    video.addEventListener("timeupdate", maintainSync);
    video.addEventListener("ended", pause);
    audio.addEventListener("loadedmetadata", align);
    return () => {
      video.removeEventListener("play", play);
      video.removeEventListener("pause", pause);
      video.removeEventListener("seeked", align);
      video.removeEventListener("timeupdate", maintainSync);
      video.removeEventListener("ended", pause);
      audio.removeEventListener("loadedmetadata", align);
      audio.pause();
    };
  }, [audioUrl, syncMode]);

  async function requestLocalizedMedia(requestKey: string) {
    setError(undefined);
    setLoading(true);
    onNarrationStatusChange?.(episode.id, "loading");
    try {
      const response = await fetch("/api/narration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId,
          lessonToken,
          episodeId: episode.id,
          language,
          provider: providerPreference,
        }),
      });
      const result = (await response.json()) as {
        audioUrl?: string;
        provider?: "sarvam" | "elevenlabs";
        fallbackUsed?: boolean;
        streamUrl?: string;
        syncMode?: "videodb-timeline" | "browser";
        error?: string;
      };
      if (!response.ok || !result.audioUrl || !result.provider) {
        throw new Error(result.error ?? "Narration failed");
      }
      const media: Omit<PreparedMedia, "savedAt"> = {
        audioUrl: result.audioUrl,
        provider: result.provider,
        fallbackUsed: Boolean(result.fallbackUsed),
        streamUrl: result.streamUrl,
        syncMode: result.syncMode ?? "browser",
      };
      await savePreparedMedia(requestKey, media);
      if (preparedRequestRef.current !== requestKey) return;
      applyPreparedMedia({ ...media, savedAt: Date.now() });
      onNarrationStatusChange?.(episode.id, "ready");
    } catch (caught) {
      if (preparedRequestRef.current !== requestKey) return;
      setError(caught instanceof Error ? caught.message : "Narration failed");
      onNarrationStatusChange?.(episode.id, "error");
    } finally {
      if (preparedRequestRef.current === requestKey) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const requestKey = episodeMediaKey({
      lessonId,
      episodeId: episode.id,
      language,
      provider: providerPreference,
    });
    preparedRequestRef.current = requestKey;
    const timer = window.setTimeout(() => {
      if (!active) return;
      resetLocalizedMedia();
      setLoading(true);
      onNarrationStatusChange?.(episode.id, "loading");
      void readPreparedMedia(requestKey).then((cached) => {
        if (!active || preparedRequestRef.current !== requestKey) return;
        if (cached) {
          applyPreparedMedia(cached);
          setLoading(false);
          onNarrationStatusChange?.(episode.id, "ready");
          return;
        }
        void requestLocalizedMedia(requestKey);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // The request is deliberately keyed to all lesson-wide media controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    episode.id,
    language,
    lessonId,
    providerPreference,
    retryKey,
  ]);

  const mediaReady = Boolean(audioUrl);
  return (
    <article aria-busy={loading} className="episode-card">
      <div className="episode-layout">
        <div className="video-shell">
          {hasVideo ? (
            <HlsPlayer
              fallbackEndSeconds={episode.evidence[0]?.endSeconds}
              fallbackSrc={episode.evidence[0]?.mediaUrl}
              fallbackStartSeconds={episode.evidence[0]?.startSeconds}
              onSourceFallback={() => {
                if (!audioUrl) return;
                setLocalizedStream(undefined);
                setSyncMode("browser");
              }}
              ref={videoRef}
              src={localizedStream ?? episode.streamUrl}
            />
          ) : (
            <EpisodeVisualPlayer
              audioUrl={audioUrl}
              episode={episode}
              presentation={presentation}
            />
          )}
          {!mediaReady ? (
            <div
              aria-live="polite"
              className="media-preparation-gate"
              role={error ? "alert" : "status"}
            >
              {loading ? (
                <span className="loading-spinner" aria-hidden="true" />
              ) : null}
              <strong>
                {error
                  ? `${languageName} audio needs another try`
                  : `Finishing ${languageName} audio`}
              </strong>
              <span>
                {error
                  ? "The player stays paused so the lesson never starts silently."
                  : "Playback will unlock when the narration and visuals are ready together."}
              </span>
              {error ? (
                <button
                  className="gate-retry-button"
                  onClick={() => setRetryKey((current) => current + 1)}
                  type="button"
                >
                  Try audio again
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="video-frame-caption">
            {loading
              ? `Preparing ${languageName} narration`
              : error
                ? "Playback paused until audio is ready"
                : hasVideo
                  ? `${languageName} narrated VideoDB reel`
                  : `${languageName} narrated visual explainer`}
          </div>
        </div>
        <div className="episode-content">
          <div className="episode-kicker">
            <span>Episode {index + 1}</span>
            <span>
              {hasVideo
                ? formatDuration(episode.durationSeconds)
                : "Visual explainer"}
            </span>
          </div>
          <h3>{episode.title}</h3>
          <p className="episode-explanation">{episode.explanation}</p>
          <blockquote className="source-quote">
            <span>
              From your chapter
              {episode.sourcePage ? ` · page ${episode.sourcePage}` : ""}
            </span>
            “{episode.sourceQuote}”
          </blockquote>
          <audio ref={audioRef} src={audioUrl} />
          {provider && mediaReady ? (
            <div className="provider-message" role="status">
              {fallbackUsed
                ? "The backup voice kept this episode ready."
                : hasVideo && syncMode === "videodb-timeline"
                  ? `The ${languageName} narration is synchronized with the VideoDB reel.`
                  : `The ${languageName} narration and visuals are ready to play together.`}
            </div>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
          <div className="why-box">
            <strong>
              {hasVideo ? "Why this clip?" : "Why a visual explainer?"}
            </strong>
            {episode.whyThisClip}
          </div>
          {episode.evidence.length > 0 ? (
            <div className="evidence-list">
              {episode.evidence.map((evidence) => (
                <div
                  className="evidence-row"
                  key={`${evidence.videoId}-${evidence.startSeconds}`}
                >
                  <span className="score-pill">
                    {Math.round(
                      (evidence.reviewConfidence ??
                        evidence.relevanceScore ??
                        0) * 100,
                    )}
                    % reviewed
                  </span>
                  <span>
                    {Math.round(evidence.startSeconds)}s to{" "}
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
                  <span>| {evidence.licence ?? "Licence documented"}</span>
                  {evidence.selectionReason ? (
                    <small className="evidence-reason">
                      {evidence.selectionReason}
                    </small>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="coverage-fallback-note">
              <strong>No unrelated footage was substituted.</strong>
              <span>
                This inline narrated visual teaches the chapter idea while the
                reviewed VideoDB library grows.
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
