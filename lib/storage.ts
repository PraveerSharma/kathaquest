import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { Lesson, VideoDbCacheEntry } from "@/lib/types";

const lessonFile = path.join(process.cwd(), "data", "demo-lessons.json");
const videoCacheFile = path.join(process.cwd(), "data", "videodb-cache.json");

declare global {
  var __kathaquestLessons: Map<string, Lesson> | undefined;
}

const memoryLessons =
  globalThis.__kathaquestLessons ?? new Map<string, Lesson>();

if (process.env.NODE_ENV !== "production") {
  globalThis.__kathaquestLessons = memoryLessons;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function saveLesson(lesson: Lesson): Promise<void> {
  memoryLessons.set(lesson.id, lesson);
  if (process.env.VERCEL) return;

  const lessons = await readJson<Record<string, Lesson>>(lessonFile, {});
  lessons[lesson.id] = lesson;
  await writeJson(lessonFile, lessons);
}

export async function getLesson(id: string): Promise<Lesson | null> {
  const inMemory = memoryLessons.get(id);
  if (inMemory) return inMemory;

  const lessons = await readJson<Record<string, Lesson>>(lessonFile, {});
  const lesson = lessons[id] ?? null;
  if (lesson) memoryLessons.set(id, lesson);
  return lesson;
}

export async function getVideoCache(): Promise<VideoDbCacheEntry[]> {
  return readJson<VideoDbCacheEntry[]>(videoCacheFile, []);
}

export async function saveVideoCache(
  entries: VideoDbCacheEntry[],
): Promise<void> {
  await writeJson(videoCacheFile, entries);
}
