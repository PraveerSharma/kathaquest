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
  const [preparationReason, setPreparationReason] = useState<
    "language" | "voice"
  >();
  const [completionNotice, setCompletionNotice] = useState<string>();
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

  useEffect(() => {
    if (!session || !preparationReason || localizing) return;
    const statuses = session.lesson.episodes.map(
      (episode) => narrationStatuses[episode.id],
    );
    if (statuses.some((status) => !status || status === "loading")) return;
    const timer = window.setTimeout(() => {
      if (statuses.every((status) => status === "ready")) {
        const languageName = getLessonLanguage(
          session.lesson.language,
        ).englishName;
        setCompletionNotice(
          preparationReason === "language"
            ? `${languageName} is ready across the complete lesson and all ${session.lesson.episodes.length} episodes.`
            : `The selected voice engine is ready across all ${session.lesson.episodes.length} episodes.`,
        );
      } else {
        setError(
          "Most of the lesson is ready, but one episode still needs its audio retried.",
        );
      }
      setPreparationReason(undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    localizing,
    narrationStatuses,
    preparationReason,
    session,
  ]);

  useEffect(() => {
    if (!completionNotice) return;
    const timer = window.setTimeout(() => setCompletionNotice(undefined), 7_000);
    return () => window.clearTimeout(timer);
  }, [completionNotice]);

  async function changeLessonLanguage(nextLanguage: LessonLanguage) {
    if (
      !session ||
      nextLanguage === session.lesson.language ||
      localizing
    ) {
      return;
    }
    setPreparationReason("language");
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
      setPreparationReason(undefined);
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
  const videoEpisodeCount = lesson.episodes.filter(
    (episode) =>
      episode.mediaMode !== "visual_explainer" &&
      episode.evidence.length > 0,
  ).length;
  const visualEpisodeCount = lesson.episodes.length - videoEpisodeCount;
  const readyNarrationCount = lesson.episodes.filter(
    (episode) => narrationStatuses[episode.id] === "ready",
  ).length;
  const busy =
    localizing || narrationPreparing || Boolean(preparationReason);
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
              : `${readyNarrationCount} of ${lesson.episodes.length} episode audio tracks are ready. Playback unlocks one episode at a time.`}
          </span>
        </div>
      ) : null}
      {completionNotice ? (
        <div
          aria-live="polite"
          className="language-ready-banner"
          role="status"
        >
          <span className="language-ready-check"><CheckIcon /></span>
          <span>
            <strong>Everything is ready to play.</strong>
            {completionNotice}
          </span>
        </div>
      ) : null}
      <div className="container">
        <section className="lesson-command-deck">
          <div className="lesson-heading-copy">
            <span className="eyebrow">Your video adventure is ready</span>
            <h1>{lesson.title}</h1>
            <p>
              One scripted lesson film plus three source-grounded learning
              chapters, using reviewed footage only when it truly fits.
            </p>
            <div className="lesson-trust">
              {videoEpisodeCount > 0 ? (
                <span><CheckIcon /> {videoEpisodeCount} reviewed video {videoEpisodeCount === 1 ? "chapter" : "chapters"}</span>
              ) : null}
              {visualEpisodeCount > 0 ? (
                <span><CheckIcon /> {visualEpisodeCount} chapter-grounded visual {visualEpisodeCount === 1 ? "chapter" : "chapters"}</span>
              ) : null}
              <span><CheckIcon /> No weak footage substituted</span>
              <span><CheckIcon /> Answers hidden securely</span>
            </div>
          </div>
          <aside className="lesson-control-card" aria-label="Lesson controls">
            <div className="lesson-control-heading">
              <div>
                <strong>Play it your way</strong>
                <small>One language and voice choice updates every episode.</small>
              </div>
              <span className={busy ? "control-status is-busy" : "control-status"}>
                {busy ? "Preparing" : "Ready"}
              </span>
            </div>
            <div className="lesson-control-grid">
              <label className="lesson-language-control" htmlFor="lesson-language">
                <span>Learning language</span>
                <select
                  disabled={busy}
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
                    ? "Translating all lesson content..."
                    : "Updates content, captions, quiz, and episode audio."}
                </small>
              </label>
              <label className="lesson-language-control" htmlFor="lesson-voice">
                <span>Voice engine</span>
                <select
                  disabled={busy}
                  id="lesson-voice"
                  onChange={(event) => {
                    setNarrationStatuses({});
                    setPreparationReason("voice");
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
                <small>Applies the same voice provider to all episodes.</small>
              </label>
            </div>
            <div className="lesson-primary-actions">
              <Link
                aria-disabled={busy}
                className={`primary-button ${busy ? "is-disabled" : ""}`}
                href={`/lesson/${lesson.id}`}
                onClick={(event) => {
                  if (busy) event.preventDefault();
                }}
              >
                Watch complete lesson
              </Link>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void shareLesson()}
                type="button"
              >
                {shareState === "copied" ? "Link copied" : "Share lesson"}
              </button>
            </div>
            <button className="text-button make-another-link" onClick={resetQuest} type="button">
              Start a different chapter
            </button>
          </aside>
        </section>
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
              presentation={lesson.presentation}
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
