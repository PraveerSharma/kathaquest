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

export async function loadLessonSession(
  lessonId: string,
): Promise<SavedLessonSession> {
  const token =
    lessonId === "shared"
      ? new URLSearchParams(window.location.hash.slice(1)).get("lesson")
      : null;
  if (lessonId === "shared" && !token) {
    throw new Error("This shared lesson link is incomplete");
  }
  const response = await fetch(
    token
      ? "/api/lessons/resume"
      : `/api/lessons/${encodeURIComponent(lessonId)}`,
    token
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lessonToken: token }),
        }
      : { cache: "no-store" },
  );
  const result = (await response.json()) as {
    lesson?: PublicLesson;
    lessonToken?: string;
    error?: string;
  };
  if (!response.ok || !result.lesson || !result.lessonToken) {
    throw new Error(result.error ?? "This shared lesson is unavailable");
  }
  const session = {
    lesson: result.lesson,
    lessonToken: result.lessonToken,
  };
  saveLessonSession(session);
  return session;
}

export function clearLessonSession() {
  window.localStorage.removeItem(savedLessonKey);
  window.dispatchEvent(new Event("kathaquest:lesson-saved"));
}
