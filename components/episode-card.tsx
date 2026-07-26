"use client";

import { useEffect, useRef, useState } from "react";

import { HlsPlayer } from "@/components/hls-player";
import {
  getLessonLanguage,
  lessonLanguages,
} from "@/lib/languages";
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
  lessonId,
  lessonToken,
  onFallback,
}: {
  episode: Episode;
  index: number;
  language: LessonLanguage;
  lessonId: string;
  lessonToken: string;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>();
  const [localizedStream, setLocalizedStream] = useState<string>();
  const [showLocalized, setShowLocalized] = useState(false);
  const [syncMode, setSyncMode] = useState<"videodb-timeline" | "browser">();
  const [provider, setProvider] = useState<"sarvam" | "elevenlabs">();
  const [audioLanguage, setAudioLanguage] =
    useState<LessonLanguage>(language);
  const [providerPreference, setProviderPreference] =
    useState<"auto" | "sarvam" | "elevenlabs">("auto");
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [error, setError] = useState<string>();
  const languageName = getLessonLanguage(audioLanguage).label;

  function resetLocalizedMedia() {
    audioRef.current?.pause();
    if (videoRef.current) videoRef.current.muted = false;
    setAudioUrl(undefined);
    setLocalizedStream(undefined);
    setShowLocalized(false);
    setSyncMode(undefined);
    setProvider(undefined);
    setFallbackUsed(false);
    setError(undefined);
  }

  async function changeAudioLanguage(nextLanguage: LessonLanguage) {
    if (nextLanguage === audioLanguage || loading) return;
    setAudioLanguage(nextLanguage);
    resetLocalizedMedia();
    await requestLocalizedVideo(nextLanguage, providerPreference);
  }

  async function changeProvider(
    nextProvider: "auto" | "sarvam" | "elevenlabs",
  ) {
    if (nextProvider === providerPreference || loading) return;
    setProviderPreference(nextProvider);
    resetLocalizedMedia();
    await requestLocalizedVideo(audioLanguage, nextProvider);
  }

  function hearOriginalAudio() {
    audioRef.current?.pause();
    if (videoRef.current) videoRef.current.muted = false;
    setShowLocalized(false);
  }

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;
    if (!showLocalized || !audioUrl || syncMode !== "browser") {
      audio.pause();
      video.muted = false;
      return;
    }

    video.muted = true;

    const align = () => {
      if (!Number.isFinite(video.duration) || !Number.isFinite(audio.duration)) {
        return;
      }
      const ratio = audio.duration / video.duration;
      audio.playbackRate = Math.max(0.65, Math.min(1.35, ratio));
      audio.currentTime = Math.min(
        audio.duration,
        video.currentTime * ratio,
      );
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
    if (!video.paused) play();
    return () => {
      video.removeEventListener("play", play);
      video.removeEventListener("pause", pause);
      video.removeEventListener("seeked", align);
      video.removeEventListener("timeupdate", maintainSync);
      video.removeEventListener("ended", pause);
      audio.removeEventListener("loadedmetadata", align);
      audio.pause();
    };
  }, [audioUrl, showLocalized, syncMode]);

  async function requestLocalizedVideo(
    targetLanguage: LessonLanguage,
    targetProvider: "auto" | "sarvam" | "elevenlabs",
  ) {
    setError(undefined);
    setLoading(true);
    try {
      const response = await fetch("/api/narration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId,
          lessonToken,
          episodeId: episode.id,
          language: targetLanguage,
          provider: targetProvider,
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
      setAudioUrl(result.audioUrl);
      setProvider(result.provider);
      setSyncMode(result.syncMode ?? "browser");
      setShowLocalized(true);
      if (result.streamUrl) {
        setLocalizedStream(result.streamUrl);
        if (videoRef.current) videoRef.current.muted = false;
      }
      setFallbackUsed(Boolean(result.fallbackUsed));
      if (result.fallbackUsed) onFallback();
      if (!result.streamUrl) {
        window.setTimeout(() => {
          const video = videoRef.current;
          const audio = audioRef.current;
          if (!video || !audio) return;
          video.muted = true;
          audio.currentTime = video.currentTime;
          void Promise.allSettled([video.play(), audio.play()]);
        }, 0);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Narration failed");
    } finally {
      setLoading(false);
    }
  }

  async function prepareLocalizedVideo() {
    setError(undefined);
    if (localizedStream) {
      if (videoRef.current) videoRef.current.muted = false;
      setShowLocalized(true);
      return;
    }
    if (audioUrl && syncMode === "browser") {
      setShowLocalized(true);
      const video = videoRef.current;
      const audio = audioRef.current;
      if (video && audio) {
        video.muted = true;
        await Promise.allSettled([video.play(), audio.play()]);
      }
      return;
    }
    await requestLocalizedVideo(audioLanguage, providerPreference);
  }

  return (
    <article aria-busy={loading} className="episode-card">
      <div className="episode-layout">
        <div className="video-shell">
          <HlsPlayer
            fallbackEndSeconds={episode.evidence[0]?.endSeconds}
            fallbackSrc={episode.evidence[0]?.mediaUrl}
            fallbackStartSeconds={episode.evidence[0]?.startSeconds}
            onSourceFallback={() => {
              if (!showLocalized || !audioUrl) return;
              setLocalizedStream(undefined);
              setShowLocalized(true);
              setSyncMode("browser");
            }}
            ref={videoRef}
            src={
              showLocalized && localizedStream
                ? localizedStream
                : episode.streamUrl
            }
          />
          <span className="video-badge">
            {showLocalized
              ? `${languageName} narrated video`
              : "VideoDB lesson reel"}
          </span>
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
          <div className="video-language-actions">
            <label className="compact-select">
              <span>Audio language</span>
              <select
                aria-label={`Audio language for ${episode.title}`}
                disabled={loading}
                onChange={(event) =>
                  void changeAudioLanguage(
                    event.target.value as LessonLanguage,
                  )
                }
                value={audioLanguage}
              >
                {lessonLanguages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-select">
              <span>Voice engine</span>
              <select
                aria-label={`Voice engine for ${episode.title}`}
                disabled={loading}
                onChange={(event) =>
                  void changeProvider(
                    event.target.value as
                      | "auto"
                      | "sarvam"
                      | "elevenlabs",
                  )
                }
                value={providerPreference}
              >
                <option value="auto">Auto</option>
                <option value="sarvam">Sarvam</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </label>
            <button
              className="listen-button"
              disabled={loading}
              onClick={prepareLocalizedVideo}
              aria-busy={loading}
              type="button"
            >
              <svg aria-hidden="true" className="button-icon" fill="none" viewBox="0 0 24 24">
                <path d="m9 7 8 5-8 5V7Z" />
              </svg>
              {loading
                ? `Creating ${languageName} video…`
                : audioUrl
                  ? `Replay in ${languageName}`
                  : `Add friendly ${languageName} voice`}
            </button>
            {showLocalized ? (
              <button
                className="text-button"
                onClick={hearOriginalAudio}
                type="button"
              >
                Hear original audio
              </button>
            ) : null}
          </div>
          <audio ref={audioRef} src={audioUrl} />
          {loading ? (
            <div
              aria-live="assertive"
              className="language-change-status"
              role="status"
            >
              <span className="loading-spinner" aria-hidden="true" />
              <span>
                <strong>Creating {languageName} voice audio…</strong>
                Translating, speaking and syncing it with this video.
              </span>
            </div>
          ) : null}
          {provider ? (
            <div className="provider-message" role="status">
              {fallbackUsed
                ? "Primary voice provider recovered with a backup voice."
                : syncMode === "videodb-timeline"
                  ? `Friendly ${languageName} narration synchronized with the stitched video.`
                  : `Friendly ${languageName} narration synchronized in your browser.`}
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
                  {Math.round(
                    (evidence.reviewConfidence ??
                      evidence.relevanceScore ??
                      0) * 100,
                  )}% reviewed
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
                {evidence.selectionReason ? (
                  <small className="evidence-reason">
                    {evidence.selectionReason}
                  </small>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
