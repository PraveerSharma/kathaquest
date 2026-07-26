"use client";

import { useRef, useState } from "react";

import { HlsPlayer } from "@/components/hls-player";

type Answer = {
  transcript?: string;
  answer: string;
  streamUrl: string;
};

export function VoiceQuestion({ lessonId }: { lessonId: string }) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [question, setQuestion] = useState("");
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<Answer>();
  const [error, setError] = useState<string>();

  async function send(body: FormData | { lessonId: string; question: string }) {
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
    await send({ lessonId, question });
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
        form.append("lessonId", lessonId);
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
        Type a question or record a short Hindi question. The answer comes with
        another exact moment from the real archive.
      </p>
      <form className="question-form" onSubmit={askTyped}>
        <input
          aria-label="Your question"
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Why does lava come out?"
          value={question}
        />
        <button
          aria-label={recording ? "Stop recording" : "Record a question"}
          className={`icon-button ${recording ? "recording" : ""}`}
          onClick={toggleRecording}
          type="button"
        >
          {recording ? "■" : "●"}
        </button>
        <button className="secondary-button" disabled={loading} type="submit">
          {loading ? "Searching…" : "Ask"}
        </button>
      </form>
      {error ? <div className="form-error">{error}</div> : null}
      {answer ? (
        <div className="answer-box">
          {answer.transcript ? (
            <p className="transcript">I heard: “{answer.transcript}”</p>
          ) : null}
          <p>{answer.answer}</p>
          <div className="answer-video">
            <HlsPlayer src={answer.streamUrl} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
