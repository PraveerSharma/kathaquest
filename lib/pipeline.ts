import "server-only";

import { randomUUID } from "node:crypto";

import {
  createLessonPresentation,
  createGroundedConcept,
  extractConcepts,
  rewriteSearchQuery,
} from "@/lib/llm";
import { getCuratedLesson } from "@/lib/curated-lessons";
import { logger } from "@/lib/logger";
import { createFallbackPresentation } from "@/lib/presentation-fallback";
import { improvePresentationQuality } from "@/lib/presentation-quality";
import { assertKidSafeText } from "@/lib/safety";
import { enrichSelectiveVisuals } from "@/lib/selective-visuals";
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
        const curatedLesson = getCuratedLesson({
          chapterText,
          ageGroup,
          language,
          sourceKind,
        });
        if (curatedLesson) {
          if (curatedLesson.presentation) {
            curatedLesson.presentation = improvePresentationQuality({
              episodes: curatedLesson.episodes,
              presentation: curatedLesson.presentation,
            });
          }
          const duration = performance.now() - started;
          curatedLesson.generationTimeMs = Math.round(duration);
          const currentTraceId = span.spanContext().traceId;
          if (!/^0+$/.test(currentTraceId)) {
            curatedLesson.traceId = currentTraceId;
          }
          span.setAttributes({
            "chapter.title": curatedLesson.title,
            "lesson.cache_hit": true,
            "pipeline.status": "ready",
            "video.relevance_score": curatedLesson.overallCoverage,
            "storyboard.scene_count":
              curatedLesson.presentation?.storyboard.scenes.length ?? 0,
            "storyboard.quality_score":
              curatedLesson.presentation?.quality?.overall ?? 0,
          });
          await withSpan(
            "lesson.persist",
            { "lesson.id": curatedLesson.id },
            async () => saveLesson(curatedLesson),
          );
          telemetry.lessonsGenerated.add(1, {
            language,
            source: "curated",
          });
          telemetry.lessonDuration.record(duration, {
            status: "ready",
            source: "curated",
          });
          if (curatedLesson.presentation?.quality) {
            telemetry.presentationQuality.record(
              curatedLesson.presentation.quality.overall,
              {
                source: "curated",
                tier: curatedLesson.presentation.quality.tier,
              },
            );
          }
          logger.info(
            {
              event: "lesson.curated",
              lessonId: curatedLesson.id,
              durationMs: duration,
            },
            "Curated chapter lesson served",
          );
          return curatedLesson;
        }
        type EpisodeRetrieval = Awaited<
          ReturnType<typeof retrieveEpisodeEvidence>
        >;
        const chapter = await extractConcepts({
          chapterText,
          ageGroup,
          language,
        });
        const attemptedRetrievals = await Promise.allSettled(
          chapter.concepts.map((concept) =>
            retrieveEpisodeEvidence(concept),
          ),
        );
        const retrievals: Array<EpisodeRetrieval | undefined> =
          attemptedRetrievals.map((result) =>
            result.status === "fulfilled" ? result.value : undefined,
          );
        const visualFallbackCount = retrievals.filter(
          (retrieval) => !retrieval,
        ).length;
        const videoMatchCount = retrievals.length - visualFallbackCount;
        span.setAttributes({
          "chapter.title": chapter.chapterTitle,
          "pipeline.status": "searching",
          "video.matched_concept_count": videoMatchCount,
          "video.visual_fallback_count": visualFallbackCount,
          "pipeline.degraded_mode":
            visualFallbackCount > 0 ? "visual_explainer" : "none",
        });
        if (visualFallbackCount > 0) {
          telemetry.visualFallbacks.add(visualFallbackCount, {
            source: sourceKind,
          });
          logger.warn(
            {
              event: "lesson.visual_fallback",
              lessonId,
              videoMatchCount,
              visualFallbackCount,
              concepts: chapter.concepts
                .filter((_, index) => !retrievals[index])
                .map((concept) => concept.title),
            },
            "Reviewed archive coverage was incomplete; using chapter-grounded visual explainers",
          );
        }

        const concepts = await Promise.all(
          chapter.concepts.map((concept, index) =>
            createGroundedConcept({
              concept,
              evidence: retrievals[index]?.search.evidence ?? [],
              ageGroup,
              language,
              chapterContext: retrievals[index] ? undefined : chapterText,
            }),
          ),
        );
        await assertKidSafeText(
          concepts.map((item) => item.explanation).join("\n"),
          "answer",
        );
        const episodes: Episode[] = concepts.map((concept, index) => {
          const retrieval = retrievals[index];
          if (!retrieval) {
            const selectionSummary =
              "No reviewed VideoDB clip passed the relevance, duration, and kid-safety gates for this concept. KathaQuest kept the explanation grounded in the uploaded chapter and switched to diagrams and animation.";
            return {
              id: randomUUID(),
              conceptId: concept.id,
              mediaMode: "visual_explainer",
              title: concept.title,
              explanation: concept.explanation,
              sourceQuote: concept.sourceQuote,
              sourcePage: concept.sourcePage,
              whyThisClip: selectionSummary,
              streamUrl: "",
              durationSeconds: 0,
              evidence: [],
              coverageScore: 0,
              kidSafe: true,
              selectionSummary,
            };
          }
          const { search, rewriteUsed } = retrieval;
          const durationSeconds = search.evidence.reduce(
            (total, item) =>
              total + Math.max(0, item.endSeconds - item.startSeconds),
            0,
          );
          return {
            id: randomUUID(),
            conceptId: concept.id,
            mediaMode: "videodb",
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
        presentation = improvePresentationQuality({
          episodes,
          presentation,
        });
        presentation = await enrichSelectiveVisuals({
          lessonId,
          presentation,
        });
        presentation = improvePresentationQuality({
          episodes,
          presentation,
        });
        telemetry.presentationsGenerated.add(1, {
          prompt_version: presentation.promptVersion,
        });
        if (presentation.quality) {
          telemetry.presentationQuality.record(
            presentation.quality.overall,
            {
              source: sourceKind,
              tier: presentation.quality.tier,
            },
          );
          span.setAttributes({
            "storyboard.quality_score": presentation.quality.overall,
            "storyboard.quality_tier": presentation.quality.tier,
            "storyboard.grounding_score": presentation.quality.grounding,
            "storyboard.pacing_score": presentation.quality.pacing,
            "storyboard.visual_variety_score":
              presentation.quality.visualVariety,
          });
        }

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
          fallbackUsed: visualFallbackCount > 0,
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
