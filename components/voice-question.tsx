"use client";

import { useEffect, useRef, useState } from "react";

import { PresentationPlayer } from "@/components/presentation/presentation-player";
import {
  readCuriosityAnswer,
  readLatestCuriosityAnswer,
  saveCuriosityAnswer,
  type CuriosityAnswer,
} from "@/lib/client-curiosity";
import {
  curiosityMediaKey,
  readPreparedMedia,
  savePreparedMedia,
} from "@/lib/client-media";
import type {
  NarrationTrack,
  PublicLesson,
} from "@/lib/types";

export function VoiceQuestion({
  lesson,
  lessonToken,
}: {
  lesson: PublicLesson;
  lessonToken: string;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [question, setQuestion] = useState("");
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<CuriosityAnswer>();
  const [clipPlanning, setClipPlanning] = useState(false);
  const [clipLoading, setClipLoading] = useState(false);
  const [clipError, setClipError] = useState<string>();
  const [narrationTracks, setNarrationTracks] =
    useState<NarrationTrack[]>();
  const [narrationProvider, setNarrationProvider] =
    useState<"sarvam" | "elevenlabs">();
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cached = readLatestCuriosityAnswer(
        lesson.id,
        lesson.language,
      );
      setAnswer(cached);
      setRestored(Boolean(cached));
      setNarrationTracks(undefined);
      setNarrationProvider(undefined);
      setClipError(undefined);
      if (cached) void prepareClip(cached);
    }, 0);
    return () => window.clearTimeout(timer);
    // prepareClip intentionally follows the current lesson session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, lesson.language]);

  async function buildClip(
    result: CuriosityAnswer,
    askedQuestion: string,
  ) {
    if (result.curiosityClip && result.clipToken) {
      void prepareClip(result);
      return;
    }
    if (!result.questionToken) {
      setClipError("The visual-answer plan was not returned.");
      return;
    }
    setClipPlanning(true);
    setClipError(undefined);
    try {
      const response = await fetch("/api/questions/clip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          lessonToken,
          questionToken: result.questionToken,
        }),
      });
      const generated = (await response.json()) as CuriosityAnswer & {
        error?: string;
      };
      if (
        !response.ok ||
        !generated.curiosityClip ||
        !generated.clipToken
      ) {
        throw new Error(
          generated.error ?? "Could not build the visual answer",
        );
      }
      const completed = { ...result, ...generated };
      setAnswer(completed);
      saveCuriosityAnswer(
        lesson.id,
        lesson.language,
        askedQuestion,
        completed,
      );
      void prepareClip(completed);
    } catch (caught) {
      setClipError(
        caught instanceof Error
          ? caught.message
          : "Could not build the visual answer",
      );
    } finally {
      setClipPlanning(false);
    }
  }

  async function prepareClip(result: CuriosityAnswer) {
    if (!result.curiosityClip || !result.clipToken) return;
    setClipLoading(true);
    setClipError(undefined);
    try {
      const cacheKey = curiosityMediaKey({
        clipId: result.curiosityClip.id,
        language: lesson.language,
        lessonId: lesson.id,
        provider: "auto",
      });
      const cached = await readPreparedMedia(cacheKey);
      if (cached?.narrationTracks?.length) {
        setNarrationTracks(cached.narrationTracks);
        setNarrationProvider(cached.provider);
        return;
      }
      const response = await fetch("/api/questions/narrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          lessonToken,
          clipToken: result.clipToken,
          provider: "auto",
        }),
      });
      const narration = (await response.json()) as {
        audioUrl?: string;
        error?: string;
        fallbackUsed?: boolean;
        narrationTracks?: NarrationTrack[];
        provider?: "sarvam" | "elevenlabs";
      };
      if (
        !response.ok ||
        !narration.audioUrl ||
        !narration.provider ||
        !narration.narrationTracks?.length
      ) {
        throw new Error(
          narration.error ?? "Could not narrate this visual answer",
        );
      }
      setNarrationTracks(narration.narrationTracks);
      setNarrationProvider(narration.provider);
      await savePreparedMedia(cacheKey, {
        audioUrl: narration.audioUrl,
        fallbackUsed: Boolean(narration.fallbackUsed),
        narrationTracks: narration.narrationTracks,
        provider: narration.provider,
      });
    } catch (caught) {
      setClipError(
        caught instanceof Error
          ? caught.message
          : "Could not narrate this visual answer",
      );
    } finally {
      setClipLoading(false);
    }
  }

  async function send(
    body: FormData | { lessonId: string; lessonToken: string; question: string },
  ) {
    setLoading(true);
    setError(undefined);
    setClipError(undefined);
    setClipPlanning(false);
    setRestored(false);
    try {
      const multipart = body instanceof FormData;
      if (!multipart) {
        const cached = readCuriosityAnswer(
          lesson.id,
          lesson.language,
          body.question,
        );
        if (cached) {
          setAnswer(cached);
          setRestored(true);
          setNarrationTracks(undefined);
          setNarrationProvider(undefined);
          void prepareClip(cached);
          return;
        }
      }
      const response = await fetch("/api/questions/ask", {
        method: "POST",
        headers: multipart ? undefined : { "content-type": "application/json" },
        body: multipart ? body : JSON.stringify(body),
      });
      const result = (await response.json()) as CuriosityAnswer & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Question failed");
      setAnswer(result);
      setNarrationTracks(undefined);
      setNarrationProvider(undefined);
      const answeredQuestion =
        result.curiosityClip?.question ??
        result.transcript ??
        (multipart ? "" : body.question);
      if (answeredQuestion) void buildClip(result, answeredQuestion);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Question failed");
    } finally {
      setLoading(false);
    }
  }

  async function askTyped(event: React.FormEvent) {
    event.preventDefault();
    if (question.trim().length < 2) return;
    await send({ lessonId: lesson.id, lessonToken, question });
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const form = new FormData();
        form.append("lessonId", lesson.id);
        form.append("lessonToken", lessonToken);
        form.append("audio", blob, "question.webm");
        await send(form);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Microphone permission was not granted.");
    }
  }

  return (
    <section className="activity-card">
      <span className="eyebrow">Ask with your voice</span>
      <h2>Still curious?</h2>
      <p>
        Type or record a question in your learning language. Maya answers from
        this chapter, then builds a short narrated visual explanation.
      </p>
      <form className="question-form" onSubmit={askTyped}>
        <input
          aria-label="Your question"
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What would you like to understand better?"
          value={question}
        />
        <button
          aria-label={recording ? "Stop recording" : "Record a question"}
          className={`icon-button ${recording ? "recording" : ""}`}
          disabled={loading || clipPlanning || clipLoading}
          onClick={toggleRecording}
          type="button"
        >
          <svg aria-hidden="true" className="button-icon" fill="none" viewBox="0 0 24 24">
            {recording ? (
              <rect fill="currentColor" height="10" rx="1" width="10" x="7" y="7" />
            ) : (
              <>
                <rect height="11" rx="4" width="7" x="8.5" y="3" />
                <path d="M6 11a6 6 0 0 0 12 0m-6 6v4m-3 0h6" />
              </>
            )}
          </svg>
        </button>
        <button
          className="secondary-button"
          disabled={loading || clipPlanning || clipLoading}
          type="submit"
        >
          {loading ? "Finding the answer..." : "Ask"}
        </button>
      </form>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      {answer ? (
        <div className="answer-box curiosity-answer">
          <div className="curiosity-answer-heading">
            <div>
              <span className="eyebrow">Grounded answer</span>
              <strong>
                {answer.curiosityClip?.presentation.plan.title ??
                  "Here is what the chapter shows"}
              </strong>
            </div>
            {restored ? <span className="cached-answer-chip">Saved</span> : null}
          </div>
          {answer.transcript ? (
            <p className="transcript">I heard: “{answer.transcript}”</p>
          ) : null}
          <p className="curiosity-direct-answer">{answer.answer}</p>
          {answer.curiosityClip ? (
            <div className="curiosity-clip-area">
              {clipLoading ? (
                <div
                  aria-live="polite"
                  className="curiosity-build-state"
                  role="status"
                >
                  <span className="loading-orbit" />
                  <div>
                    <strong>Maya is narrating your visual answer…</strong>
                    <p>
                      The text is ready. We’re synchronizing the voice with four
                      grounded Remotion scenes.
                    </p>
                    <div className="curiosity-build-steps">
                      <span className="done">Answer checked</span>
                      <span className="done">Storyboard ready</span>
                      <span>Voice syncing</span>
                    </div>
                  </div>
                </div>
              ) : narrationTracks?.length ? (
                <>
                  <div aria-live="polite" className="curiosity-ready-line">
                    <span>✓ Curiosity Clip ready</span>
                    <span>
                      {answer.curiosityClip.presentation.storyboard.scenes.length}{" "}
                      scenes ·{" "}
                      {Math.round(
                        answer.curiosityClip.presentation.storyboard
                          .totalDurationSeconds,
                      )}
                      s · {narrationProvider}
                    </span>
                  </div>
                  <div className="answer-video curiosity-player">
                    <PresentationPlayer
                      narrationTracks={narrationTracks}
                      presentation={answer.curiosityClip.presentation}
                    />
                  </div>
                  <div className="curiosity-source-line">
                    <span>Grounded in this chapter</span>
                    <span>
                      {answer.curiosityClip.videoEvidenceUsed
                        ? `Reviewed VideoDB evidence · ${answer.curiosityClip.evidence[0]?.videoTitle ?? "trusted source"}`
                        : "Chapter-grounded animated explanation"}
                    </span>
                  </div>
                </>
              ) : clipError ? (
                <div className="curiosity-clip-error" role="alert">
                  <div>
                    <strong>The visual answer is ready, but its voice paused.</strong>
                    <p>{clipError}</p>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => void prepareClip(answer)}
                    type="button"
                  >
                    Try narration again
                  </button>
                </div>
              ) : null}
            </div>
          ) : clipPlanning ? (
            <div
              aria-live="polite"
              className="curiosity-build-state"
              role="status"
            >
              <span className="loading-orbit" />
              <div>
                <strong>Maya is building your visual answer…</strong>
                <p>
                  Your grounded answer is ready. We’re checking VideoDB and
                  planning four child-friendly scenes.
                </p>
                <div className="curiosity-build-steps">
                  <span className="done">Answer checked</span>
                  <span>Evidence review</span>
                  <span>Storyboard planning</span>
                </div>
              </div>
            </div>
          ) : clipError ? (
            <div className="curiosity-clip-error" role="alert">
              <div>
                <strong>Your text answer is safe and ready.</strong>
                <p>{clipError}</p>
              </div>
              <button
                className="secondary-button"
                onClick={() =>
                  void buildClip(
                    answer,
                    answer.transcript ?? question,
                  )
                }
                type="button"
              >
                Try visual again
              </button>
            </div>
          ) : (
            <p className="answer-note">
              The grounded answer is ready, but a visual explanation could not
              be created this time.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
