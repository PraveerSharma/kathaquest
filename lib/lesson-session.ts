import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { env } from "@/lib/env";
import type { Lesson, PublicLesson } from "@/lib/types";

const tokenVersion = "kq1";
const tokenLifetimeMs = 24 * 60 * 60 * 1000;

function key(): Buffer {
  const secret =
    env.LESSON_SIGNING_SECRET ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "kathaquest-local-development-only");
  if (!secret) {
    throw new Error("LESSON_SIGNING_SECRET is not configured");
  }
  return createHash("sha256").update(secret).digest();
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function toPublicLesson(lesson: Lesson): PublicLesson {
  return {
    ...lesson,
    concepts: lesson.concepts.map(({ quiz, ...concept }) => ({
      ...concept,
      quiz: {
        question: quiz.question,
        options: quiz.options,
      },
    })),
  };
}

export function sealLesson(lesson: Lesson): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const payload = Buffer.from(
    JSON.stringify({
      lesson,
      expiresAt: Date.now() + tokenLifetimeMs,
    }),
  );
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [tokenVersion, encode(iv), encode(tag), encode(encrypted)].join(".");
}

export function openLesson(token: string): Lesson {
  const [version, ivValue, tagValue, encryptedValue, extra] = token.split(".");
  if (
    version !== tokenVersion ||
    !ivValue ||
    !tagValue ||
    !encryptedValue ||
    extra
  ) {
    throw new Error("This lesson session is invalid");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), decode(ivValue));
    decipher.setAuthTag(decode(tagValue));
    const decrypted = Buffer.concat([
      decipher.update(decode(encryptedValue)),
      decipher.final(),
    ]);
    const payload = JSON.parse(decrypted.toString("utf8")) as {
      lesson: Lesson;
      expiresAt: number;
    };
    if (!payload.lesson?.id || payload.expiresAt < Date.now()) {
      throw new Error("This lesson session has expired");
    }
    return payload.lesson;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "This lesson session has expired"
    ) {
      throw error;
    }
    throw new Error("This lesson session is invalid");
  }
}
