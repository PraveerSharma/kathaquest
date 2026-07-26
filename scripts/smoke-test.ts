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

const lesson = generated.lesson as {
  id: string;
  concepts: unknown[];
  episodes: Array<{ streamUrl?: string; evidence?: unknown[] }>;
};
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

console.log(
  JSON.stringify(
    {
      ok: true,
      lessonId: lesson.id,
      conceptCount: lesson.concepts.length,
      episodeCount: lesson.episodes.length,
      health,
    },
    null,
    2,
  ),
);
import { readFile } from "node:fs/promises";
