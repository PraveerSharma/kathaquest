import type { PublicLesson } from "@/lib/types";

export const savedLessonKey = "kathaquest.lesson.v1";

export type SavedLessonSession = {
  lesson: PublicLesson;
  lessonToken: string;
};

export function readSavedLesson(): SavedLessonSession | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(savedLessonKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SavedLessonSession;
    return parsed.lesson?.id && parsed.lessonToken ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function saveLessonSession(session: SavedLessonSession) {
  window.localStorage.setItem(savedLessonKey, JSON.stringify(session));
  window.dispatchEvent(new Event("kathaquest:lesson-saved"));
}

export function clearLessonSession() {
  window.localStorage.removeItem(savedLessonKey);
  window.dispatchEvent(new Event("kathaquest:lesson-saved"));
}
