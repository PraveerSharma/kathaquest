"use client";

import { useState } from "react";

import { HlsPlayer } from "@/components/hls-player";
import type { PublicLesson } from "@/lib/types";

type QuizResult = {
  score: number;
  total: number;
  incorrectConceptIds: string[];
  revisionReelUrl?: string;
  revisionFallback?: {
    mediaUrl?: string;
    startSeconds: number;
    endSeconds: number;
  };
};

export function Quiz({
  lesson,
  lessonToken,
}: {
  lesson: PublicLesson;
  lessonToken: string;
}) {
  const concepts = lesson.concepts;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    if (Object.keys(answers).length !== concepts.length) return;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, lessonToken, answers }),
      });
      const payload = (await response.json()) as QuizResult & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Quiz failed");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quiz failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="activity-card">
      <span className="eyebrow">Three quick questions</span>
      <h2>Ready for a quest check?</h2>
      <p>
        Miss one? KathaQuest makes a revision reel from the evidence you need.
      </p>
      <div className="quiz-list">
        {concepts.map((concept, index) => (
          <div key={concept.id}>
            <p className="quiz-question">
              {index + 1}. {concept.quiz.question}
            </p>
            <div className="option-grid">
              {concept.quiz.options.map((option) => (
                <button
                  className={`option-button ${
                    answers[concept.id] === option ? "selected" : ""
                  }`}
                  key={option}
                  onClick={() =>
                    setAnswers((current) => ({
                      ...current,
                      [concept.id]: option,
                    }))
                  }
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        className="primary-button full"
        disabled={
          loading || Object.keys(answers).length !== concepts.length
        }
        onClick={submit}
        style={{ marginTop: 22 }}
        type="button"
      >
        {loading ? "Building your result..." : "Check my answers"}
      </button>
      {error ? <div className="form-error">{error}</div> : null}
      {result ? (
        <div className="quiz-result">
          You scored {result.score} out of {result.total}.
          {result.revisionReelUrl ? (
            <div className="answer-video" style={{ marginTop: 12 }}>
              <HlsPlayer
                fallbackEndSeconds={result.revisionFallback?.endSeconds}
                fallbackSrc={result.revisionFallback?.mediaUrl}
                fallbackStartSeconds={result.revisionFallback?.startSeconds}
                src={result.revisionReelUrl}
              />
            </div>
          ) : (
            <span> Brilliant, no revision reel needed!</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
