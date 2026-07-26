import "server-only";

import { randomUUID } from "node:crypto";

import {
  createLessonPresentation,
  createGroundedConcept,
  extractConcepts,
  rewriteSearchQuery,
} from "@/lib/llm";
import { logger } from "@/lib/logger";
import { createFallbackPresentation } from "@/lib/presentation-fallback";
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
  let search = await searchEducationalArchive(queries, {
    conceptTitle: concept.title,
    learningObjective: concept.learningObjective,
    purpose: "lesson",
  });
  let rewriteUsed = false;

  if (!search) {
    const rewritten = await rewriteSearchQuery(queries[0], concept.title);
    queries = [rewritten];
    rewriteUsed = true;
    search = await searchEducationalArchive(queries, {
      conceptTitle: concept.title,
      learningObjective: concept.learningObjective,
      purpose: "lesson",
    });
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
        let chapter:
          | Awaited<ReturnType<typeof extractConcepts>>
          | undefined;
        let retrievals:
          | Array<Awaited<ReturnType<typeof retrieveEpisodeEvidence>>>
          | undefined;
        const excludedConcepts: string[] = [];
        let lastRetrievalError: unknown;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const plan = await extractConcepts({
            chapterText,
            ageGroup,
            language,
            excludedConcepts,
          });
          const attemptedRetrievals = await Promise.allSettled(
            plan.concepts.map((concept) => retrieveEpisodeEvidence(concept)),
          );
          const failedIndexes = attemptedRetrievals.flatMap((result, index) =>
            result.status === "rejected" ? [index] : [],
          );
          if (failedIndexes.length === 0) {
            chapter = plan;
            retrievals = attemptedRetrievals.map((result) => {
              if (result.status !== "fulfilled") {
                throw new Error("Unexpected retrieval planning state");
              }
              return result.value;
            });
            break;
          }

          const firstFailure = attemptedRetrievals[failedIndexes[0]];
          lastRetrievalError =
            firstFailure.status === "rejected"
              ? firstFailure.reason
              : undefined;
          excludedConcepts.push(
            ...failedIndexes.map((index) => {
              const concept = plan.concepts[index];
              return `${concept.title}: ${concept.learningObjective}`;
            }),
          );
          logger.warn(
            {
              event: "lesson.plan_retried",
              attempt,
              rejectedConcepts: failedIndexes.map(
                (index) => plan.concepts[index].title,
              ),
            },
            "Replanning around concepts without direct archive evidence",
          );
        }

        if (!chapter || !retrievals) {
          throw lastRetrievalError instanceof Error
            ? lastRetrievalError
            : new Error(
                "The reviewed video archive does not yet cover three chapter concepts",
              );
        }
        span.setAttributes({
          "chapter.title": chapter.chapterTitle,
          "pipeline.status": "searching",
        });

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
            whyThisClip: `${search.selectionSummary}${rewriteUsed ? " The search was automatically clarified once to improve coverage." : ""}`,
            streamUrl: search.streamUrl,
            durationSeconds,
            evidence: search.evidence,
            coverageScore: search.coverageScore,
            kidSafe: search.evidence.every((item) => item.kidSafe),
            selectionSummary: search.selectionSummary,
          };
        });
        let presentation;
        try {
          presentation = await createLessonPresentation({
            title: chapter.chapterTitle,
            ageGroup,
            language,
            concepts,
            episodes,
          });
        } catch (presentationError) {
          telemetry.presentationFallbacks.add(1);
          logger.warn(
            {
              event: "presentation.fallback",
              lessonId,
              error:
                presentationError instanceof Error
                  ? presentationError.message
                  : String(presentationError),
            },
            "AI storyboard validation failed; using the grounded deterministic presentation",
          );
          presentation = createFallbackPresentation({
            title: chapter.chapterTitle,
            ageGroup,
            language,
            concepts,
            episodes,
          });
        }
        telemetry.presentationsGenerated.add(1, {
          prompt_version: presentation.promptVersion,
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
          presentation,
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
