import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";
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

const redisUrl = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
const redisToken =
  env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
const lessonKey = (id: string) => `kathaquest:lesson:${id}`;

async function redisCommand<T>(command: unknown[]): Promise<T> {
  if (!redisUrl || !redisToken) {
    throw new Error("Durable lesson storage is not configured");
  }
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${redisToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Durable lesson storage failed (HTTP ${response.status})`);
  }
  const payload = (await response.json()) as {
    result?: T;
    error?: string;
  };
  if (payload.error) throw new Error(payload.error);
  return payload.result as T;
}

export function hasDurableLessonStorage(): boolean {
  return Boolean(redisUrl && redisToken);
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
  if (hasDurableLessonStorage()) {
    await redisCommand([
      "SET",
      lessonKey(lesson.id),
      JSON.stringify(lesson),
      "EX",
      env.LESSON_RETENTION_DAYS * 24 * 60 * 60,
    ]);
    return;
  }
  if (process.env.VERCEL) return;

  const lessons = await readJson<Record<string, Lesson>>(lessonFile, {});
  lessons[lesson.id] = lesson;
  await writeJson(lessonFile, lessons);
}

export async function getLesson(id: string): Promise<Lesson | null> {
  const inMemory = memoryLessons.get(id);
  if (inMemory) return inMemory;

  if (hasDurableLessonStorage()) {
    const serialized = await redisCommand<string | null>([
      "GET",
      lessonKey(id),
    ]);
    const lesson = serialized ? (JSON.parse(serialized) as Lesson) : null;
    if (lesson) memoryLessons.set(id, lesson);
    return lesson;
  }

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
