"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  EpisodeCard,
  type NarrationStatus,
  type VoiceProviderPreference,
} from "@/components/episode-card";
import { ObservabilityPanel } from "@/components/observability-panel";
import { Quiz } from "@/components/quiz";
import { VoiceQuestion } from "@/components/voice-question";
import {
  clearLessonSession,
  loadLessonSession,
  readSavedLesson,
  saveLessonSession,
  type SavedLessonSession,
} from "@/lib/client-lesson";
import { getLessonLanguage, lessonLanguages } from "@/lib/languages";
import type { LessonLanguage, PublicLesson } from "@/lib/types";

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="check-icon" fill="none" viewBox="0 0 24 24">
      <path d="m6 12 4 4 8-9" />
    </svg>
  );
}

export function AdventureExperience({ lessonId }: { lessonId?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SavedLessonSession>();
  const [ready, setReady] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [localizing, setLocalizing] = useState(false);
  const [providerPreference, setProviderPreference] =
    useState<VoiceProviderPreference>("auto");
  const [narrationStatuses, setNarrationStatuses] = useState<
    Record<string, NarrationStatus>
  >({});
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const saved = readSavedLesson();
    if (!lessonId || saved?.lesson.id === lessonId) {
      const timer = window.setTimeout(() => {
        if (!active) return;
        setSession(saved);
        setReady(true);
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }
    void loadLessonSession(lessonId)
      .then((loaded) => {
        if (active) setSession(loaded);
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "This shared lesson is unavailable",
          );
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [lessonId]);

  async function changeLessonLanguage(nextLanguage: LessonLanguage) {
    if (
      !session ||
      nextLanguage === session.lesson.language ||
      localizing
    ) {
      return;
    }
    setLocalizing(true);
    setNarrationStatuses({});
    setError(undefined);
    try {
      const response = await fetch("/api/lessons/localize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId: session.lesson.id,
          lessonToken: session.lessonToken,
          language: nextLanguage,
        }),
      });
      const result = (await response.json()) as {
        lesson?: PublicLesson;
        lessonToken?: string;
        error?: string;
      };
      if (!response.ok || !result.lesson || !result.lessonToken) {
        throw new Error(result.error ?? "Could not change the lesson language");
      }
      const nextSession = {
        lesson: result.lesson,
        lessonToken: result.lessonToken,
      };
      setSession(nextSession);
      saveLessonSession(nextSession);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not change the lesson language",
      );
    } finally {
      setLocalizing(false);
    }
  }

  function resetQuest() {
    clearLessonSession();
    router.push("/");
  }

  async function shareLesson() {
    if (!session) return;
    setError(undefined);
    try {
      const response = await fetch("/api/lessons/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId: session.lesson.id,
          lessonToken: session.lessonToken,
        }),
      });
      const result = (await response.json()) as {
        path?: string;
        error?: string;
      };
      if (!response.ok || !result.path) {
        throw new Error(result.error ?? "Could not create a share link");
      }
      const shareUrl = `${window.location.origin}${result.path}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: session.lesson.title,
            text: "Explore this KathaQuest lesson with me.",
            url: shareUrl,
          });
          return;
        } catch {
          // The native share sheet may be dismissed; copying remains available.
        }
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2_000);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create a share link",
      );
    }
  }

  if (!ready) {
    return (
      <main className="container lesson-studio-empty" id="main-content">
        <div className="loading-orbit" aria-hidden="true" />
        <span className="eyebrow">Opening your adventure</span>
        <h1>Gathering your videos and lesson tools...</h1>
        <p role="status">Your saved quest will appear in a moment.</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="container lesson-studio-empty" id="main-content">
        <span className="eyebrow">Your video adventure</span>
        <h1>No saved quest yet.</h1>
        <p>
          Choose a chapter or upload a PDF first. We will keep the resulting
          lesson here so Home, Back and My adventure behave predictably.
        </p>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <Link className="primary-button inline-button" href="/">
          Create a lesson
        </Link>
      </main>
    );
  }

  const { lesson, lessonToken } = session;
  const narrationPreparing = Object.values(narrationStatuses).some(
    (status) => status === "loading",
  );
  const busy = localizing || narrationPreparing;
  return (
    <main
      aria-busy={busy}
      className="lesson-wrap"
      id="main-content"
    >
      {busy ? (
        <div
          aria-live="assertive"
          className="language-progress-banner"
          role="status"
        >
          <span className="loading-spinner" aria-hidden="true" />
          <span>
            <strong>
              {localizing
                ? "Changing the whole lesson language..."
                : `Preparing ${getLessonLanguage(lesson.language).label} voices...`}
            </strong>
            {localizing
              ? "Captions, explanations, questions and quiz are being translated."
              : "Every lesson reel is receiving the same kid-friendly learning language."}
          </span>
        </div>
      ) : null}
      <div className="container">
        <div className="lesson-heading">
          <div>
            <span className="eyebrow">Your video adventure is ready</span>
            <h1>{lesson.title}</h1>
            <p>
              One scripted lesson film plus three deep evidence chapters,
              all grounded in your source.
            </p>
            <div className="lesson-trust">
              <span><CheckIcon /> {Math.round(lesson.overallCoverage * 100)}% evidence match</span>
              <span><CheckIcon /> All clips kid-safe</span>
              <span><CheckIcon /> Answers hidden securely</span>
            </div>
          </div>
          <div className="lesson-heading-actions">
            <a className="primary-button" href={`/lesson/${lesson.id}`}>
              Watch complete lesson film
            </a>
            <button
              className="secondary-button"
              onClick={() => void shareLesson()}
              type="button"
            >
              {shareState === "copied" ? "Lesson link copied" : "Share this lesson"}
            </button>
            <label className="lesson-language-control" htmlFor="lesson-language">
              <span>Learning language</span>
              <select
                disabled={localizing}
                id="lesson-language"
                onChange={(event) =>
                  changeLessonLanguage(
                    event.target.value as LessonLanguage,
                  )
                }
                value={lesson.language}
              >
                {lessonLanguages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label} · {item.englishName}
                  </option>
                ))}
              </select>
              <small aria-live="polite">
                {localizing
                  ? "Translating the lesson..."
                  : `Sets all content and video voices to ${getLessonLanguage(lesson.language).englishName}`}
              </small>
            </label>
            <label className="lesson-language-control" htmlFor="lesson-voice">
              <span>Voice engine for all videos</span>
              <select
                disabled={localizing}
                id="lesson-voice"
                onChange={(event) => {
                  setNarrationStatuses({});
                  setProviderPreference(
                    event.target.value as VoiceProviderPreference,
                  );
                }}
                value={providerPreference}
              >
                <option value="auto">Auto, best available</option>
                <option value="sarvam">Sarvam AI</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
              <small>One voice choice applies to every lesson reel.</small>
            </label>
            <button className="ghost-button" onClick={resetQuest} type="button">
              Make another quest
            </button>
          </div>
        </div>
        {error ? (
          <div className="form-error lesson-error" role="alert">{error}</div>
        ) : null}

        <div className="episode-grid">
          {lesson.episodes.map((episode, index) => (
            <EpisodeCard
              episode={episode}
              index={index}
              key={`${episode.id}-${lesson.language}`}
              language={lesson.language}
              lessonId={lesson.id}
              lessonToken={lessonToken}
              onFallback={() => setFallbackUsed(true)}
              onNarrationStatusChange={(episodeId, status) =>
                setNarrationStatuses((current) => ({
                  ...current,
                  [episodeId]: status,
                }))
              }
              providerPreference={providerPreference}
            />
          ))}
        </div>
        <div className="interactive-grid">
          <VoiceQuestion
            key={`questions-${lesson.language}`}
            lesson={lesson}
            lessonToken={lessonToken}
          />
          <Quiz
            key={`quiz-${lesson.language}`}
            lesson={lesson}
            lessonToken={lessonToken}
          />
        </div>
        <ObservabilityPanel fallbackUsed={fallbackUsed} lesson={lesson} />
      </div>
    </main>
  );
}
