import { readFile } from "node:fs/promises";

import type { PublicLesson } from "../lib/types";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";

async function request(pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`${pathname} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

const health = await request("/api/health");
const sampleChapter = await readFile(
  new URL("../data/sample-volcano-chapter.txt", import.meta.url),
  "utf8",
);
const generated = await request("/api/lessons/generate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    chapterText: sampleChapter,
    ageGroup: "8-10",
    language: "en-IN",
  }),
});

const lesson = generated.lesson as PublicLesson;
const lessonToken = generated.lessonToken as string;
if (lesson.concepts.length !== 3 || lesson.episodes.length !== 3) {
  throw new Error("Lesson did not contain exactly three concepts and episodes");
}
if (
  !lessonToken ||
  lesson.concepts.some(
    (concept) => "correctAnswer" in concept.quiz,
  )
) {
  throw new Error("Secure public lesson contract was not enforced");
}
if (
  lesson.episodes.some(
    (episode) => !episode.streamUrl || !episode.evidence?.length,
  )
) {
  throw new Error("One or more episodes lacks a real stream or evidence");
}

const questionResult = await request("/api/questions/ask", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: lesson.id,
    lessonToken,
    question: "Why does magma rise toward the surface?",
  }),
});
if (!questionResult.answer || !questionResult.streamUrl) {
  throw new Error("Question answer lacked an explanation or evidence stream");
}

const wrongAnswers = Object.fromEntries(
  lesson.concepts.map((concept) => [concept.id, concept.quiz.options[0]]),
);
const quizResult = await request("/api/quiz/submit", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: lesson.id,
    lessonToken,
    answers: wrongAnswers,
  }),
});
if (
  typeof quizResult.score !== "number" ||
  quizResult.score < 0 ||
  quizResult.score > lesson.concepts.length
) {
  throw new Error("Quiz did not return a valid score");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      lessonId: lesson.id,
      conceptCount: lesson.concepts.length,
      episodeCount: lesson.episodes.length,
      questionAnswered: true,
      secureLessonToken: true,
      revisionReelCreated: Boolean(quizResult.revisionReelUrl),
      health,
    },
    null,
    2,
  ),
);
