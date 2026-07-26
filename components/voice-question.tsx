"use client";

import { useRef, useState } from "react";

import { HlsPlayer } from "@/components/hls-player";
import type { PublicLesson } from "@/lib/types";

type Answer = {
  transcript?: string;
  answer: string;
  streamUrl?: string;
  evidence?: Array<{
    mediaUrl?: string;
    startSeconds: number;
    endSeconds: number;
  }>;
  videoUnavailable?: boolean;
};

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
  const [answer, setAnswer] = useState<Answer>();
  const [error, setError] = useState<string>();

  async function send(
    body: FormData | { lessonId: string; lessonToken: string; question: string },
  ) {
    setLoading(true);
    setError(undefined);
    try {
      const multipart = body instanceof FormData;
      const response = await fetch("/api/questions/ask", {
        method: "POST",
        headers: multipart ? undefined : { "content-type": "application/json" },
        body: multipart ? body : JSON.stringify(body),
      });
      const result = (await response.json()) as Answer & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Question failed");
      setAnswer(result);
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
        Type or record a question in your learning language. A matching video
        appears only when the archive has strong direct evidence.
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
        <button className="secondary-button" disabled={loading} type="submit">
          {loading ? "Searching…" : "Ask"}
        </button>
      </form>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      {answer ? (
        <div className="answer-box">
          {answer.transcript ? (
            <p className="transcript">I heard: “{answer.transcript}”</p>
          ) : null}
          <p>{answer.answer}</p>
          {answer.streamUrl ? (
            <div className="answer-video">
              <HlsPlayer
                fallbackEndSeconds={answer.evidence?.[0]?.endSeconds}
                fallbackSrc={answer.evidence?.[0]?.mediaUrl}
                fallbackStartSeconds={answer.evidence?.[0]?.startSeconds}
                src={answer.streamUrl}
              />
            </div>
          ) : (
            <p className="answer-note">
              I could answer from your chapter, but I left out the video
              because the archive did not have a strong enough match.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
