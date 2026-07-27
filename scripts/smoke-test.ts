import { readFile } from "node:fs/promises";

import type {
  CuriosityClip,
  PublicLesson,
  StoryboardSceneType,
} from "../lib/types";

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
  "sourceContext" in lesson ||
  lesson.concepts.some(
    (concept) => "correctAnswer" in concept.quiz,
  )
) {
  throw new Error("Secure public lesson contract was not enforced");
}
if (
  lesson.episodes.some(
    (episode) =>
      !episode.streamUrl ||
      !episode.evidence?.length ||
      episode.durationSeconds < 50,
  )
) {
  throw new Error(
    "One or more episodes lacks a meaningful-length stream or evidence",
  );
}
if (
  !lesson.presentation ||
  lesson.presentation.storyboard.scenes.length !== 9 ||
  lesson.presentation.storyboard.totalDurationSeconds < 150
) {
  throw new Error("Lesson did not include a complete presentation storyboard");
}
if (
  !lesson.presentation.quality ||
  lesson.presentation.quality.overall < 76
) {
  throw new Error("Presentation did not pass the film quality gate");
}
const presentationTypes = new Set(
  lesson.presentation.storyboard.scenes.map((scene) => scene.type),
);
for (const requiredType of [
  "guide",
  "diagram",
  "animation",
  "real_video",
  "checkpoint",
  "recap",
] satisfies StoryboardSceneType[]) {
  if (!presentationTypes.has(requiredType)) {
    throw new Error(`Presentation omitted required ${requiredType} scene`);
  }
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
const curiosityQuestionToken = questionResult.questionToken as string;
const curiosityResult = await request("/api/questions/clip", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: lesson.id,
    lessonToken,
    questionToken: curiosityQuestionToken,
  }),
});
const curiosityClip = curiosityResult.curiosityClip as CuriosityClip;
const curiosityClipToken = curiosityResult.clipToken as string;
if (
  !questionResult.answer ||
  !curiosityQuestionToken ||
  !curiosityClipToken ||
  curiosityClip.presentation.storyboard.scenes.length !== 4 ||
  curiosityClip.presentation.storyboard.totalDurationSeconds < 40 ||
  (curiosityClip.presentation.quality?.overall ?? 0) < 70
) {
  throw new Error("Question answer lacked a grounded Curiosity Clip");
}
const curiosityNarration = await request("/api/questions/narrate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: lesson.id,
    lessonToken,
    clipToken: curiosityClipToken,
    provider: "auto",
  }),
});
if (
  !curiosityNarration.audioUrl ||
  !Array.isArray(curiosityNarration.narrationTracks) ||
  curiosityNarration.narrationTracks.length !== 2
) {
  throw new Error("Curiosity Clip narration was not scene-synchronized");
}

const localizedResult = await request("/api/lessons/localize", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: lesson.id,
    lessonToken,
    language: "bn-IN",
  }),
});
const localizedLesson = localizedResult.lesson as PublicLesson;
const localizedToken = localizedResult.lessonToken as string;
if (
  localizedLesson.language !== "bn-IN" ||
  localizedLesson.title === lesson.title ||
  !localizedToken
) {
  throw new Error("Regional-language lesson localization failed");
}

const narrationResult = await request("/api/narration", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: localizedLesson.id,
    lessonToken: localizedToken,
    episodeId: localizedLesson.episodes[0].id,
    language: localizedLesson.language,
  }),
});
if (!narrationResult.audioUrl || !narrationResult.syncMode) {
  throw new Error("Localized child-friendly narration failed");
}

const presentationNarration = await request("/api/presentations/narrate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: localizedLesson.id,
    lessonToken: localizedToken,
    language: "mr-IN",
    provider: "auto",
  }),
});
if (
  !presentationNarration.audioUrl ||
  !presentationNarration.provider ||
  presentationNarration.language !== "mr-IN"
) {
  throw new Error("Whole-film independent-language narration failed");
}

const wrongAnswers = Object.fromEntries(
  localizedLesson.concepts.map((concept) => [
    concept.id,
    concept.quiz.options[0],
  ]),
);
const quizResult = await request("/api/quiz/submit", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    lessonId: localizedLesson.id,
    lessonToken: localizedToken,
    answers: wrongAnswers,
  }),
});
if (
  typeof quizResult.score !== "number" ||
  quizResult.score < 0 ||
  quizResult.score > localizedLesson.concepts.length
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
      minimumEpisodeSeconds: Math.min(
        ...lesson.episodes.map((episode) => episode.durationSeconds),
      ),
      questionAnswered: true,
      curiosityClipDurationSeconds:
        curiosityClip.presentation.storyboard.totalDurationSeconds,
      curiosityClipQuality:
        curiosityClip.presentation.quality?.overall,
      curiosityClipNarrationTracks:
        curiosityNarration.narrationTracks.length,
      regionalLanguageSwitch: localizedLesson.language,
      narrationSyncMode: narrationResult.syncMode,
      localizedVideoCreated: Boolean(narrationResult.streamUrl),
      presentationSceneCount:
        lesson.presentation.storyboard.scenes.length,
      presentationDurationSeconds:
        lesson.presentation.storyboard.totalDurationSeconds,
      presentationTypes: [...presentationTypes],
      presentationAudioLanguage: presentationNarration.language,
      presentationVoiceProvider: presentationNarration.provider,
      secureLessonToken: true,
      revisionReelCreated: Boolean(quizResult.revisionReelUrl),
      health,
    },
    null,
    2,
  ),
);
