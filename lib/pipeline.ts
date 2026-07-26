import "server-only";

import { randomUUID } from "node:crypto";

import {
  createGroundedConcept,
  extractConcepts,
  rewriteSearchQuery,
} from "@/lib/llm";
import { logger } from "@/lib/logger";
import { assertKidSafeText } from "@/lib/safety";
import { saveLesson } from "@/lib/storage";
import { telemetry, withSpan } from "@/lib/telemetry";
import type {
  Episode,
  LearningConcept,
  Lesson,
  LessonLanguage,
} from "@/lib/types";
import { searchEducationalArchive } from "@/lib/videodb";

async function retrieveEpisodeEvidence(
  concept: Omit<LearningConcept, "explanation" | "quiz">,
) {
  let queries = concept.videoSearchQueries;
  let search = await searchEducationalArchive(queries);
  let rewriteUsed = false;

  if (!search) {
    const rewritten = await rewriteSearchQuery(queries[0], concept.title);
    queries = [rewritten];
    rewriteUsed = true;
    search = await searchEducationalArchive(queries);
  }

  if (!search) {
    throw new Error(
      `No real VideoDB evidence was found for “${concept.title}”`,
    );
  }

  return { search, rewriteUsed };
}

export async function generateLesson({
  chapterText,
  ageGroup,
  language,
  sourceKind = "uploaded-pdf",
}: {
  chapterText: string;
  ageGroup: string;
  language: LessonLanguage;
  sourceKind?: Lesson["sourceKind"];
}): Promise<Lesson> {
  const lessonId = randomUUID();
  const started = performance.now();

  return withSpan(
    "lesson.generate",
    {
      "lesson.id": lessonId,
      "chapter.character_count": chapterText.length,
      "student.age_group": ageGroup,
      "lesson.language": language,
      "pipeline.status": "extracting",
    },
    async (span) => {
      try {
        await assertKidSafeText(chapterText, "chapter");
        const chapter = await extractConcepts({
          chapterText,
          ageGroup,
          language,
        });
        span.setAttributes({
          "chapter.title": chapter.chapterTitle,
          "pipeline.status": "searching",
        });

        const retrievals = await Promise.all(
          chapter.concepts.map((concept) => retrieveEpisodeEvidence(concept)),
        );
        const concepts = await Promise.all(
          chapter.concepts.map((concept, index) =>
            createGroundedConcept({
              concept,
              evidence: retrievals[index].search.evidence,
              ageGroup,
              language,
            }),
          ),
        );
        await assertKidSafeText(
          concepts.map((item) => item.explanation).join("\n"),
          "answer",
        );
        const episodes: Episode[] = concepts.map((concept, index) => {
          const { search, rewriteUsed } = retrievals[index];
          const durationSeconds = search.evidence.reduce(
            (total, item) =>
              total + Math.max(0, item.endSeconds - item.startSeconds),
            0,
          );
          return {
            id: randomUUID(),
            conceptId: concept.id,
            title: concept.title,
            explanation: concept.explanation,
            sourceQuote: concept.sourceQuote,
            sourcePage: concept.sourcePage,
            whyThisClip: `VideoDB matched ${search.matchType === "scene" ? "visible educational scenes" : "spoken educational evidence"} to “${search.queryUsed}”${rewriteUsed ? " after one automatic query rewrite" : ""}. Every source is from the reviewed all-ages catalog.`,
            streamUrl: search.streamUrl,
            durationSeconds,
            evidence: search.evidence,
            coverageScore: search.coverageScore,
            kidSafe: search.evidence.every((item) => item.kidSafe),
          };
        });

        const duration = performance.now() - started;
        const overallCoverage =
          episodes.reduce((total, item) => total + item.coverageScore, 0) /
          episodes.length;
        const lesson: Lesson = {
          id: lessonId,
          title: chapter.chapterTitle,
          ageGroup,
          language,
          status: "ready",
          concepts,
          episodes,
          traceId: span.spanContext().traceId,
          generationTimeMs: Math.round(duration),
          overallCoverage,
          sourceKind,
          createdAt: new Date().toISOString(),
        };

        span.setAttribute("pipeline.status", "ready");
        await withSpan(
          "lesson.persist",
          { "lesson.id": lessonId },
          async () => saveLesson(lesson),
        );
        telemetry.lessonsGenerated.add(1, { language });
        telemetry.lessonDuration.record(duration, { status: "ready" });
        logger.info(
          {
            event: "lesson.generated",
            lessonId,
            durationMs: duration,
            episodeCount: episodes.length,
          },
          "Lesson generated successfully",
        );
        return lesson;
      } catch (error) {
        const duration = performance.now() - started;
        telemetry.lessonsFailed.add(1);
        telemetry.lessonDuration.record(duration, { status: "failed" });
        span.setAttribute("pipeline.status", "failed");
        logger.error(
          {
            event: "lesson.failed",
            lessonId,
            durationMs: duration,
            error: error instanceof Error ? error.message : String(error),
          },
          "Lesson generation failed",
        );
        throw error;
      }
    },
  );
}
