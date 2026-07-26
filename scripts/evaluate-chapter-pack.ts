import chapterPackJson from "../data/chapter-pack.json";
import type {
  ChapterPackItem,
  LessonResponse,
  StoryboardSceneType,
} from "../lib/types";

const chapters = chapterPackJson as ChapterPackItem[];
const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const limit = Number(process.env.EVAL_LIMIT ?? chapters.length);
const requestedChapterIds = new Set(
  (process.env.EVAL_CHAPTERS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const selectedChapters = (
  requestedChapterIds.size > 0
    ? chapters.filter((chapter) => requestedChapterIds.has(chapter.id))
    : chapters
).slice(0, limit);

type Evaluation = {
  chapter: string;
  passed: boolean;
  conceptCount: number;
  episodeCount: number;
  sourceQuotesVerified: boolean;
  kidSafe: boolean;
  answersHidden: boolean;
  overallCoverage: number;
  evidenceCount: number;
  minimumEpisodeSeconds: number;
  precisionReviewed: boolean;
  presentationSceneCount: number;
  presentationDurationSeconds: number;
  hybridSceneTypes: string[];
  presentationGrounded: boolean;
  completeNarration: boolean;
  issues: string[];
};

const results: Evaluation[] = [];

for (const chapter of selectedChapters) {
  const response = await fetch(`${baseUrl}/api/lessons/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chapterText: chapter.text,
      ageGroup: "8-10",
      language: "en-IN",
      sourceKind: "chapter-pack",
    }),
  });
  const payload = (await response.json()) as
    | LessonResponse
    | { error: string };
  if (!response.ok || !("lesson" in payload)) {
    results.push({
      chapter: chapter.title,
      passed: false,
      conceptCount: 0,
      episodeCount: 0,
      sourceQuotesVerified: false,
      kidSafe: false,
      answersHidden: false,
      overallCoverage: 0,
      evidenceCount: 0,
      minimumEpisodeSeconds: 0,
      precisionReviewed: false,
      presentationSceneCount: 0,
      presentationDurationSeconds: 0,
      hybridSceneTypes: [],
      presentationGrounded: false,
      completeNarration: false,
      issues: ["error" in payload ? payload.error : `HTTP ${response.status}`],
    });
    continue;
  }

  const { lesson, lessonToken } = payload;
  const normalizedSource = chapter.text.replace(/\s+/g, " ").toLowerCase();
  const sourceQuotesVerified = lesson.concepts.every((concept) =>
    normalizedSource.includes(
      concept.sourceQuote.replace(/\s+/g, " ").toLowerCase(),
    ),
  );
  const kidSafe = lesson.episodes.every(
    (episode) =>
      episode.kidSafe && episode.evidence.every((item) => item.kidSafe),
  );
  const answersHidden = lesson.concepts.every(
    (concept) => !("correctAnswer" in concept.quiz),
  );
  const evidenceCount = lesson.episodes.reduce(
    (total, episode) => total + episode.evidence.length,
    0,
  );
  const minimumEpisodeSeconds = Math.min(
    ...lesson.episodes.map((episode) => episode.durationSeconds),
  );
  const precisionReviewed = lesson.episodes.every((episode) =>
    episode.evidence.every(
      (item) =>
        typeof item.reviewConfidence === "number" &&
        item.reviewConfidence >= 0.55 &&
        Boolean(item.selectionReason),
    ),
  );
  const presentation = lesson.presentation;
  const hybridSceneTypes = presentation
    ? [...new Set(presentation.storyboard.scenes.map((scene) => scene.type))]
    : [];
  const requiredSceneTypes: StoryboardSceneType[] = [
    "guide",
    "diagram",
    "animation",
    "real_video",
    "checkpoint",
    "recap",
  ];
  const presentationGrounded = Boolean(
    presentation &&
      presentation.plan.learningObjectives.every((objective) =>
        normalizedSource.includes(
          objective.sourceQuote.replace(/\s+/g, " ").toLowerCase(),
        ),
      ) &&
      presentation.storyboard.scenes
        .filter((scene) => scene.type === "real_video")
        .every(
          (scene) =>
            Boolean(scene.visual.footageMediaUrl) &&
            scene.evidenceRefs.some((reference) => !reference.startsWith("chapter:")),
        ) &&
      presentation.storyboard.scenes.filter(
        (scene) => scene.type === "real_video",
      ).length >= 2 &&
      lesson.concepts.every((concept) =>
        presentation.storyboard.scenes.some(
          (scene) => scene.conceptId === concept.id,
        ),
      ),
  );
  const narrationWords =
    presentation?.script.fullNarration.trim().split(/\s+/).length ?? 0;
  const completeNarration =
    narrationWords >= 180 &&
    narrationWords <= 450 &&
    presentation?.script.narrationWordCount === narrationWords;
  const issues = [
    lesson.concepts.length === 3 ? "" : "concept_count",
    lesson.episodes.length === 3 ? "" : "episode_count",
    sourceQuotesVerified ? "" : "unverified_source_quote",
    kidSafe ? "" : "unsafe_media",
    answersHidden ? "" : "answer_leak",
    lesson.overallCoverage > 0 ? "" : "zero_coverage",
    evidenceCount >= 3 ? "" : "insufficient_evidence",
    minimumEpisodeSeconds >= 50 ? "" : "episode_too_short",
    precisionReviewed ? "" : "evidence_not_precision_reviewed",
    lessonToken ? "" : "missing_session_token",
    presentation ? "" : "missing_presentation",
    presentation?.storyboard.scenes.length === 9
      ? ""
      : "invalid_storyboard_scene_count",
    (presentation?.storyboard.totalDurationSeconds ?? 0) >= 150
      ? ""
      : "presentation_too_short",
    requiredSceneTypes.every((type) => hybridSceneTypes.includes(type))
      ? ""
      : "missing_hybrid_scene_type",
    presentationGrounded ? "" : "ungrounded_presentation",
    completeNarration ? "" : "incomplete_narration",
  ].filter(Boolean);

  results.push({
    chapter: chapter.title,
    passed: issues.length === 0,
    conceptCount: lesson.concepts.length,
    episodeCount: lesson.episodes.length,
    sourceQuotesVerified,
    kidSafe,
    answersHidden,
    overallCoverage: lesson.overallCoverage,
    evidenceCount,
    minimumEpisodeSeconds,
    precisionReviewed,
    presentationSceneCount:
      presentation?.storyboard.scenes.length ?? 0,
    presentationDurationSeconds:
      presentation?.storyboard.totalDurationSeconds ?? 0,
    hybridSceneTypes,
    presentationGrounded,
    completeNarration,
    issues,
  });
}

console.log(JSON.stringify({ passed: results.every((item) => item.passed), results }, null, 2));
if (results.some((item) => !item.passed)) process.exitCode = 1;
