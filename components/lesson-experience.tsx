"use client";

import type { PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PresentationPlayer } from "@/components/presentation/presentation-player";
import { Quiz } from "@/components/quiz";
import { VoiceQuestion } from "@/components/voice-question";
import {
  readSavedLesson,
  saveLessonSession,
  type SavedLessonSession,
} from "@/lib/client-lesson";
import {
  getLessonLanguage,
  lessonLanguages,
} from "@/lib/languages";
import type {
  LessonLanguage,
  PublicLesson,
} from "@/lib/types";

export function LessonExperience() {
  const playerRef = useRef<PlayerRef>(null);
  const [session, setSession] = useState<SavedLessonSession>();
  const [ready, setReady] = useState(false);
  const [narrationUrl, setNarrationUrl] = useState<string>();
  const [audioLanguage, setAudioLanguage] =
    useState<LessonLanguage>("hi-IN");
  const [providerPreference, setProviderPreference] =
    useState<"auto" | "sarvam" | "elevenlabs">("auto");
  const [actualProvider, setActualProvider] =
    useState<"sarvam" | "elevenlabs">();
  const [voiceFallbackUsed, setVoiceFallbackUsed] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [localizing, setLocalizing] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readSavedLesson();
      setSession(saved);
      if (saved) setAudioLanguage(saved.lesson.language);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function resetVoice() {
    setNarrationUrl(undefined);
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
      setAudioLanguage(language);
      saveLessonSession(next);
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

  async function createNarratedFilm() {
    if (!session) return;
    setNarrating(true);
    setError(undefined);
    try {
      const response = await fetch("/api/presentations/narrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId: session.lesson.id,
          lessonToken: session.lessonToken,
          language: audioLanguage,
          provider: providerPreference,
        }),
      });
      const result = (await response.json()) as {
        audioUrl?: string;
        provider?: "sarvam" | "elevenlabs";
        fallbackUsed?: boolean;
        error?: string;
      };
      if (!response.ok || !result.audioUrl || !result.provider) {
        throw new Error(result.error ?? "Could not create lesson narration");
      }
      setNarrationUrl(result.audioUrl);
      setActualProvider(result.provider);
      setVoiceFallbackUsed(Boolean(result.fallbackUsed));
      playerRef.current?.seekTo(0);
      playerRef.current?.play();
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

  if (!ready) {
    return (
      <main className="container lesson-studio-empty" id="main-content">
        <span className="eyebrow">Opening your lesson studio</span>
        <h1>Loading the storyboard…</h1>
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

  return (
    <main className="lesson-studio" id="main-content">
      <section className="container lesson-studio-heading">
        <div>
          <span className="eyebrow">AI lesson studio · presentation v1</span>
          <h1>{presentation.plan.title}</h1>
          <p>{presentation.plan.bigQuestion}</p>
          <div className="lesson-trust">
            <span>✓ {presentation.storyboard.scenes.length} planned scenes</span>
            <span>
              ✓ {Math.round(presentation.storyboard.totalDurationSeconds / 60)} minute lesson
            </span>
            <span>✓ {lesson.episodes.length} reviewed evidence chapters</span>
          </div>
        </div>
        <div className="studio-language">
          <label>
            <span>Content language</span>
            <select
              disabled={localizing}
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
          <small>
            {localizing ? "Localizing all nine scenes…" : "Changes captions, script and quiz"}
          </small>
        </div>
      </section>

      <section className="container studio-layout">
        <div className="studio-main">
          <PresentationPlayer
            narrationUrl={narrationUrl}
            playerRef={playerRef}
            presentation={presentation}
          />
          <div className="film-controls">
            <label className="compact-select">
              <span>Film audio</span>
              <select
                aria-label="Lesson film audio language"
                onChange={(event) => {
                  setAudioLanguage(event.target.value as LessonLanguage);
                  resetVoice();
                }}
                value={audioLanguage}
              >
                {lessonLanguages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label} · {item.englishName}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-select">
              <span>Voice engine</span>
              <select
                aria-label="Lesson film voice engine"
                onChange={(event) => {
                  setProviderPreference(
                    event.target.value as
                      | "auto"
                      | "sarvam"
                      | "elevenlabs",
                  );
                  resetVoice();
                }}
                value={providerPreference}
              >
                <option value="auto">Auto · best available</option>
                <option value="sarvam">Sarvam AI</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </label>
            <button
              className="listen-button"
              disabled={narrating}
              onClick={createNarratedFilm}
              type="button"
            >
              {narrating
                ? `Creating ${getLessonLanguage(audioLanguage).label} narration…`
                : narrationUrl
                  ? "Replay narrated film"
                  : "Add narration to the whole film"}
            </button>
            {actualProvider ? (
              <span className="provider-chip">
                Voice: {actualProvider === "sarvam" ? "Sarvam AI" : "ElevenLabs"}
              </span>
            ) : null}
          </div>
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
              <span>Layers 3–8</span>
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
