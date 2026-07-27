"use client";

import type {
  CuriosityClip,
  VideoEvidence,
} from "@/lib/types";

export type CuriosityAnswer = {
  answer: string;
  clipToken?: string;
  curiosityClip?: CuriosityClip;
  evidence?: VideoEvidence[];
  questionId?: string;
  questionToken?: string;
  streamUrl?: string;
  transcript?: string;
  videoUnavailable?: boolean;
};

type SavedCuriosityAnswer = CuriosityAnswer & {
  questionKey: string;
  savedAt: number;
};

const cacheVersion = "curiosity-v1";
const maximumSavedClips = 3;

function storageKey(lessonId: string, language: string) {
  return `kathaquest.${cacheVersion}:${lessonId}:${language}`;
}

export function curiosityQuestionKey(question: string) {
  const normalized = question
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ");
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${normalized.slice(0, 32)}:${(hash >>> 0).toString(36)}`;
}

function readAll(
  lessonId: string,
  language: string,
): SavedCuriosityAnswer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(
      storageKey(lessonId, language),
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedCuriosityAnswer[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            Boolean(item.answer) &&
            Boolean(item.curiosityClip?.id) &&
            Boolean(item.clipToken),
        )
      : [];
  } catch {
    return [];
  }
}

export function readLatestCuriosityAnswer(
  lessonId: string,
  language: string,
): CuriosityAnswer | undefined {
  return readAll(lessonId, language)[0];
}

export function readCuriosityAnswer(
  lessonId: string,
  language: string,
  question: string,
): CuriosityAnswer | undefined {
  const questionKey = curiosityQuestionKey(question);
  return readAll(lessonId, language).find(
    (item) => item.questionKey === questionKey,
  );
}

export function saveCuriosityAnswer(
  lessonId: string,
  language: string,
  question: string,
  answer: CuriosityAnswer,
) {
  if (
    typeof window === "undefined" ||
    !answer.curiosityClip ||
    !answer.clipToken
  ) {
    return;
  }
  const questionKey = curiosityQuestionKey(question);
  const current = readAll(lessonId, language).filter(
    (item) => item.questionKey !== questionKey,
  );
  const next: SavedCuriosityAnswer[] = [
    { ...answer, questionKey, savedAt: Date.now() },
    ...current,
  ].slice(0, maximumSavedClips);
  try {
    window.localStorage.setItem(
      storageKey(lessonId, language),
      JSON.stringify(next),
    );
  } catch {
    // Curiosity caching improves latency but must never block the answer.
  }
}
