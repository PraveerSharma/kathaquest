import { readFile } from "node:fs/promises";

import type { Lesson } from "../lib/types";

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

const lesson = generated.lesson as Lesson;
if (lesson.concepts.length !== 3 || lesson.episodes.length !== 3) {
  throw new Error("Lesson did not contain exactly three concepts and episodes");
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
    lesson,
    question: "Why does magma rise toward the surface?",
  }),
});
if (!questionResult.answer || !questionResult.streamUrl) {
  throw new Error("Question answer lacked an explanation or evidence stream");
}

const wrongAnswers = Object.fromEntries(
  lesson.concepts.map((concept) => [
    concept.id,
    concept.quiz.options.find(
      (option) => option !== concept.quiz.correctAnswer,
    ) ?? "",
  ]),
);
const quizResult = await request("/api/quiz/submit", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: lesson.id,
    lesson,
    answers: wrongAnswers,
  }),
});
if (quizResult.score !== 0 || !quizResult.revisionReelUrl) {
  throw new Error("Quiz did not create the expected revision reel");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      lessonId: lesson.id,
      conceptCount: lesson.concepts.length,
      episodeCount: lesson.episodes.length,
      questionAnswered: true,
      revisionReelCreated: true,
      health,
    },
    null,
    2,
  ),
);
