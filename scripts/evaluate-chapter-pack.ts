import chapterPackJson from "../data/chapter-pack.json";
import type {
  ChapterPackItem,
  LessonResponse,
} from "../lib/types";

const chapters = chapterPackJson as ChapterPackItem[];
const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const limit = Number(process.env.EVAL_LIMIT ?? chapters.length);

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
  issues: string[];
};

const results: Evaluation[] = [];

for (const chapter of chapters.slice(0, limit)) {
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
  const issues = [
    lesson.concepts.length === 3 ? "" : "concept_count",
    lesson.episodes.length === 3 ? "" : "episode_count",
    sourceQuotesVerified ? "" : "unverified_source_quote",
    kidSafe ? "" : "unsafe_media",
    answersHidden ? "" : "answer_leak",
    lesson.overallCoverage > 0 ? "" : "zero_coverage",
    evidenceCount >= 3 ? "" : "insufficient_evidence",
    lessonToken ? "" : "missing_session_token",
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
    issues,
  });
}

console.log(JSON.stringify({ passed: results.every((item) => item.passed), results }, null, 2));
if (results.some((item) => !item.passed)) process.exitCode = 1;
