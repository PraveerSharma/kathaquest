import { readFile } from "node:fs/promises";

import type {
  CuriosityClip,
  NarrationTrack,
  PublicLesson,
  StoryboardSceneType,
} from "../lib/types";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";

async function request<T>(
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(`${pathname} failed: ${body.error ?? response.status}`);
  }
  return body;
}

const existingLessonId = process.env.VERIFY_LESSON_ID;
const generated = existingLessonId
  ? await request<{
      lesson: PublicLesson;
      lessonToken: string;
    }>(`/api/lessons/${encodeURIComponent(existingLessonId)}`)
  : await (async () => {
      const chapterText = await readFile(
        new URL("../data/sample-volcano-chapter.txt", import.meta.url),
        "utf8",
      );
      return request<{
        lesson: PublicLesson;
        lessonToken: string;
      }>("/api/lessons/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ageGroup: "8-10",
          chapterText,
          language: "en-IN",
        }),
      });
    })();
const question = "Why does magma rise toward Earth's surface?";
const answered = await request<{
  answer: string;
  questionToken: string;
}>("/api/questions/ask", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: generated.lesson.id,
    lessonToken: generated.lessonToken,
    question,
  }),
});
const generatedClip = await request<{
  clipToken: string;
  curiosityClip: CuriosityClip;
}>("/api/questions/clip", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: generated.lesson.id,
    lessonToken: generated.lessonToken,
    questionToken: answered.questionToken,
  }),
});
const clip = generatedClip.curiosityClip;
const types = clip.presentation.storyboard.scenes.map(
  (scene) => scene.type,
);
const expectedTypes: StoryboardSceneType[] = [
  "guide",
  "diagram",
  clip.videoEvidenceUsed ? "real_video" : "animation",
  "checkpoint",
];
if (
  !answered.answer ||
  !answered.questionToken ||
  !generatedClip.clipToken ||
  clip.question !== question ||
  clip.presentation.storyboard.scenes.length !== 4 ||
  clip.presentation.storyboard.totalDurationSeconds < 40 ||
  clip.presentation.storyboard.totalDurationSeconds > 70 ||
  (clip.presentation.quality?.grounding ?? 0) < 90 ||
  types.some((type, index) => type !== expectedTypes[index])
) {
  throw new Error(
    `Curiosity Clip contract failed: ${JSON.stringify({
      duration: clip.presentation.storyboard.totalDurationSeconds,
      grounding: clip.presentation.quality?.grounding,
      types,
    })}`,
  );
}

const narrated = await request<{
  audioUrl: string;
  narrationTracks: NarrationTrack[];
  provider: string;
}>("/api/questions/narrate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    clipToken: generatedClip.clipToken,
    lessonId: generated.lesson.id,
    lessonToken: generated.lessonToken,
    provider: "auto",
  }),
});
if (
  !narrated.audioUrl ||
  narrated.narrationTracks.length !== 2 ||
  narrated.narrationTracks.some(
    (track) => track.durationInFrames <= 0 || track.sceneIds.length !== 2,
  )
) {
  throw new Error("Curiosity Clip narration contract failed");
}

console.log(
  JSON.stringify(
    {
      answer: answered.answer,
      clipId: clip.id,
      durationSeconds:
        clip.presentation.storyboard.totalDurationSeconds,
      evidenceCount: clip.evidence.length,
      narrationProvider: narrated.provider,
      narrationTracks: narrated.narrationTracks.length,
      quality: clip.presentation.quality,
      sceneTypes: types,
      videoEvidenceUsed: clip.videoEvidenceUsed,
    },
    null,
    2,
  ),
);
