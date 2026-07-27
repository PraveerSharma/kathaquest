"use client";

import type { PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PresentationPlayer } from "@/components/presentation/presentation-player";
import { Quiz } from "@/components/quiz";
import { VoiceQuestion } from "@/components/voice-question";
import {
  loadLessonSession,
  readSavedLesson,
  saveLessonSession,
  type SavedLessonSession,
} from "@/lib/client-lesson";
import {
  filmMediaKey,
  readPreparedMedia,
  savePreparedMedia,
} from "@/lib/client-media";
import {
  getLessonLanguage,
  lessonLanguages,
} from "@/lib/languages";
import type {
  LessonLanguage,
  NarrationTrack,
  PublicLesson,
} from "@/lib/types";

export function LessonExperience({ lessonId }: { lessonId?: string }) {
  const playerRef = useRef<PlayerRef>(null);
  const [session, setSession] = useState<SavedLessonSession>();
  const [ready, setReady] = useState(false);
  const [narrationUrl, setNarrationUrl] = useState<string>();
  const [narrationTracks, setNarrationTracks] =
    useState<NarrationTrack[]>();
  const [providerPreference, setProviderPreference] =
    useState<"auto" | "sarvam" | "elevenlabs">("auto");
  const [actualProvider, setActualProvider] =
    useState<"sarvam" | "elevenlabs">();
  const [voiceFallbackUsed, setVoiceFallbackUsed] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [localizing, setLocalizing] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const saved = readSavedLesson();
    const resolveSession =
      lessonId && saved?.lesson.id !== lessonId
        ? loadLessonSession(lessonId)
        : Promise.resolve(saved);
    void resolveSession
      .then((loaded) => {
        if (!active) return;
        setSession(loaded);
        if (loaded) {
          void createNarratedFilm(
            loaded.lesson.language,
            providerPreference,
            loaded,
            false,
          );
        }
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
    // Loading a route ID is the only trigger; voice changes have their own handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  function resetVoice() {
    setNarrationUrl(undefined);
    setNarrationTracks(undefined);
    setActualProvider(undefined);
    setVoiceFallbackUsed(false);
    setError(undefined);
  }

  async function changeContentLanguage(language: LessonLanguage) {
    if (!session || language === session.lesson.language || localizing) return;
    setLocalizing(true);
    resetVoice();
    try {
      const response = await fetch("/api/lessons/localize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId: session.lesson.id,
          lessonToken: session.lessonToken,
          language,
        }),
      });
      const result = (await response.json()) as {
        lesson?: PublicLesson;
        lessonToken?: string;
        error?: string;
      };
      if (!response.ok || !result.lesson || !result.lessonToken) {
        throw new Error(result.error ?? "Could not localize the lesson");
      }
      const next = {
        lesson: result.lesson,
        lessonToken: result.lessonToken,
      };
      setSession(next);
      saveLessonSession(next);
      await createNarratedFilm(
        language,
        providerPreference,
        next,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not localize the lesson",
      );
    } finally {
      setLocalizing(false);
    }
  }

  async function createNarratedFilm(
    targetLanguage = session?.lesson.language ?? "en-IN",
    targetProvider = providerPreference,
    targetSession = session,
    playWhenReady = true,
  ) {
    if (!targetSession) return;
    setNarrating(true);
    setError(undefined);
    try {
      const cacheKey = filmMediaKey({
        lessonId: targetSession.lesson.id,
        language: targetLanguage,
        provider: targetProvider,
      });
      const cached = await readPreparedMedia(cacheKey);
      if (cached) {
        setNarrationUrl(cached.audioUrl);
        setNarrationTracks(cached.narrationTracks);
        setActualProvider(cached.provider);
        setVoiceFallbackUsed(cached.fallbackUsed);
        if (playWhenReady) {
          window.setTimeout(() => {
            playerRef.current?.seekTo(0);
            playerRef.current?.play();
          }, 0);
        }
        return;
      }
      const response = await fetch("/api/presentations/narrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId: targetSession.lesson.id,
          lessonToken: targetSession.lessonToken,
          language: targetLanguage,
          provider: targetProvider,
        }),
      });
      const result = (await response.json()) as {
        audioUrl?: string;
        provider?: "sarvam" | "elevenlabs";
        fallbackUsed?: boolean;
        narrationTracks?: NarrationTrack[];
        error?: string;
      };
      if (!response.ok || !result.audioUrl || !result.provider) {
        throw new Error(result.error ?? "Could not create lesson narration");
      }
      setNarrationUrl(result.audioUrl);
      setNarrationTracks(result.narrationTracks);
      setActualProvider(result.provider);
      setVoiceFallbackUsed(Boolean(result.fallbackUsed));
      await savePreparedMedia(cacheKey, {
        audioUrl: result.audioUrl,
        provider: result.provider,
        fallbackUsed: Boolean(result.fallbackUsed),
        narrationTracks: result.narrationTracks,
      });
      if (playWhenReady) {
        window.setTimeout(() => {
          playerRef.current?.seekTo(0);
          playerRef.current?.play();
        }, 0);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create lesson narration",
      );
    } finally {
      setNarrating(false);
    }
  }

  async function changeFilmVoiceEngine(
    provider: "auto" | "sarvam" | "elevenlabs",
  ) {
    if (provider === providerPreference || narrating) return;
    setProviderPreference(provider);
    resetVoice();
    await createNarratedFilm(session?.lesson.language ?? "en-IN", provider);
  }

  if (!ready) {
    return (
      <main className="container lesson-studio-empty" id="main-content">
        <span className="eyebrow">Opening your lesson studio</span>
        <h1>Loading the storyboard...</h1>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="container lesson-studio-empty" id="main-content">
        <span className="eyebrow">Your lesson studio</span>
        <h1>Create a chapter adventure first.</h1>
        <p>
          Choose a chapter or upload a PDF. Your structured lesson film will
          appear here.
        </p>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <Link className="primary-button inline-button" href="/">
          Create a lesson
        </Link>
      </main>
    );
  }

  const { lesson, lessonToken } = session;
  const presentation = lesson.presentation;
  if (!presentation) {
    return (
      <main className="container lesson-studio-empty" id="main-content">
        <span className="eyebrow">Saved lesson found</span>
        <h1>This lesson needs the new presentation layer.</h1>
        <p>
          Recreate it once to receive the lesson plan, script and storyboard.
        </p>
        <Link className="primary-button inline-button" href="/">
          Rebuild lesson
        </Link>
      </main>
    );
  }
  const reviewedVideoCount = lesson.episodes.filter(
    (episode) =>
      episode.mediaMode !== "visual_explainer" &&
      episode.evidence.length > 0,
  ).length;
  const visualFallbackCount =
    lesson.episodes.length - reviewedVideoCount;

  return (
    <main
      aria-busy={localizing || narrating}
      className="lesson-studio"
      id="main-content"
    >
      {localizing ? (
        <div
          aria-live="assertive"
          className="language-progress-banner"
          role="status"
        >
          <span className="loading-spinner" aria-hidden="true" />
          <span>
            <strong>Localizing all nine scenes...</strong>
            Script, captions, storyboard and quiz are being translated.
          </span>
        </div>
      ) : null}
      <section className="container lesson-studio-heading">
        <div>
          <span className="eyebrow">AI lesson studio | presentation v1</span>
          <h1>{presentation.plan.title}</h1>
          <p>{presentation.plan.bigQuestion}</p>
          <div className="lesson-trust">
            <span>✓ {presentation.storyboard.scenes.length} planned scenes</span>
            <span>
              ✓ {Math.round(presentation.storyboard.totalDurationSeconds / 60)} minute lesson
            </span>
            {reviewedVideoCount > 0 ? (
              <span>✓ {reviewedVideoCount} reviewed video {reviewedVideoCount === 1 ? "chapter" : "chapters"}</span>
            ) : null}
            {visualFallbackCount > 0 ? (
              <span>✓ {visualFallbackCount} chapter-grounded visual {visualFallbackCount === 1 ? "chapter" : "chapters"}</span>
            ) : null}
          </div>
        </div>
        <div className="studio-heading-actions">
          <Link
            className="text-button back-to-adventure"
            href={`/adventure/${lesson.id}`}
          >
            Back to lesson chapters
          </Link>
          <div className="studio-language">
            <label>
              <span>Learning language</span>
              <select
                disabled={localizing || narrating}
                onChange={(event) =>
                  changeContentLanguage(
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
            </label>
            <small aria-live="polite">
              {localizing
                ? "Localizing every scene..."
                : "Sets captions, script, quiz and film audio together"}
            </small>
            <label className="studio-voice-control">
              <span>Voice engine</span>
              <select
                aria-label="Voice engine for the complete lesson"
                disabled={localizing || narrating}
                onChange={(event) => {
                  void changeFilmVoiceEngine(
                    event.target.value as
                      | "auto"
                      | "sarvam"
                      | "elevenlabs",
                  );
                }}
                value={providerPreference}
              >
                <option value="auto">Auto, best available</option>
                <option value="sarvam">Sarvam AI</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="container studio-layout">
        <div className="studio-main">
          <div className="studio-player-stage">
            <PresentationPlayer
              narrationTracks={narrationTracks}
              narrationUrl={narrationUrl}
              playerRef={playerRef}
              presentation={presentation}
            />
            {!narrationUrl ? (
              <div
                aria-live="polite"
                className="media-preparation-gate"
                role={error ? "alert" : "status"}
              >
                {narrating ? (
                  <span className="loading-spinner" aria-hidden="true" />
                ) : null}
                <strong>
                  {narrating
                    ? `Finishing ${getLessonLanguage(lesson.language).label} lesson audio`
                    : "Lesson audio needs another try"}
                </strong>
                <span>
                  The film stays paused until its three narrated acts and scenes
                  are ready together.
                </span>
                {!narrating ? (
                  <button
                    className="gate-retry-button"
                    onClick={() => void createNarratedFilm()}
                    type="button"
                  >
                    Try audio again
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="film-controls">
            <button
              className="listen-button"
              disabled={narrating}
              onClick={() => void createNarratedFilm()}
              aria-busy={narrating}
              type="button"
            >
              {narrating
                ? `Creating ${getLessonLanguage(lesson.language).label} narration...`
                : narrationUrl
                  ? "Replay narrated film"
                  : "Prepare narration again"}
            </button>
            {actualProvider ? (
              <span className="provider-chip">
                Voice: {actualProvider === "sarvam" ? "Sarvam AI" : "ElevenLabs"}
              </span>
            ) : null}
          </div>
          {narrating ? (
            <div
              aria-live="assertive"
              className="language-change-status"
              role="status"
            >
              <span className="loading-spinner" aria-hidden="true" />
              <span>
                <strong>
                  Creating {getLessonLanguage(lesson.language).label} film audio...
                </strong>
                Preparing three synchronized story acts with a child-friendly
                voice.
              </span>
            </div>
          ) : null}
          {voiceFallbackUsed ? (
            <p className="provider-message" role="status">
              The selected voice engine was unavailable, so the backup voice
              kept your lesson film ready.
            </p>
          ) : null}
          {error ? <div className="form-error" role="alert">{error}</div> : null}
        </div>

        <aside className="scene-rail" aria-label="Storyboard chapters">
          <div className="scene-rail-heading">
            <span className="eyebrow">Storyboard</span>
            <strong>Jump to a scene</strong>
          </div>
          {presentation.storyboard.scenes.map((scene, index) => {
            const sceneStart = presentation.storyboard.scenes
              .slice(0, index)
              .reduce(
                (total, previous) =>
                  total +
                  Math.round(
                    previous.durationSeconds *
                      presentation.storyboard.fps,
                  ),
                0,
              );
            return (
              <button
                key={scene.id}
                onClick={() => {
                  playerRef.current?.seekTo(sceneStart);
                  playerRef.current?.play();
                }}
                type="button"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{scene.title}</strong>
                  <small>
                    {scene.type.replace("_", " ")} · {scene.durationSeconds}s
                  </small>
                </div>
              </button>
            );
          })}
        </aside>
      </section>

      <section className="container lesson-blueprint">
        <details>
          <summary>See how this lesson was designed</summary>
          <div className="blueprint-grid">
            <article>
              <span>Layer 1</span>
              <h2>Lesson plan</h2>
              <p>{presentation.plan.bigQuestion}</p>
              <ul>
                {presentation.plan.teachingArc.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </article>
            <article>
              <span>Layer 2</span>
              <h2>Educational script</h2>
              <p>{presentation.script.narrationWordCount} grounded words</p>
              <blockquote>{presentation.script.hook}</blockquote>
            </article>
            <article>
              <span>Layers 3 to 8</span>
              <h2>Presentation engine</h2>
              <p>
                React/SVG diagrams, deterministic motion, VideoDB footage,
                captions, transitions, Maya and multilingual narration.
              </p>
            </article>
          </div>
        </details>
      </section>

      <section className="container interactive-grid studio-interactions">
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
      </section>
    </main>
  );
}
