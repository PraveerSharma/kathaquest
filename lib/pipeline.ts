import "server-only";

import { randomUUID } from "node:crypto";

import { extractConcepts, rewriteSearchQuery } from "@/lib/llm";
import { logger } from "@/lib/logger";
import { saveLesson } from "@/lib/storage";
import { telemetry, withSpan } from "@/lib/telemetry";
import type {
  Episode,
  LearningConcept,
  Lesson,
  LessonLanguage,
} from "@/lib/types";
import { searchEducationalArchive } from "@/lib/videodb";

async function buildEpisode(
  concept: LearningConcept,
): Promise<Episode> {
  let query = concept.videoSearchQuery;
  let search = await searchEducationalArchive(query);
  let rewriteUsed = false;

  if (!search) {
    query = await rewriteSearchQuery(query, concept.title);
    rewriteUsed = true;
    search = await searchEducationalArchive(query);
  }

  if (!search) {
    throw new Error(
      `No real VideoDB evidence was found for “${concept.title}”`,
    );
  }

  const durationSeconds = search.evidence.reduce(
    (total, item) => total + Math.max(0, item.endSeconds - item.startSeconds),
    0,
  );

  return {
    id: randomUUID(),
    conceptId: concept.id,
    title: concept.title,
    explanation: concept.explanation,
    whyThisClip: `VideoDB matched ${search.matchType === "scene" ? "visible eruption scenes" : "spoken educational evidence"} to “${query}”${rewriteUsed ? " after one automatic query rewrite" : ""}.`,
    streamUrl: search.streamUrl,
    durationSeconds,
    evidence: search.evidence,
  };
}

export async function generateLesson({
  chapterText,
  ageGroup,
  language,
}: {
  chapterText: string;
  ageGroup: string;
  language: LessonLanguage;
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
        const chapter = await extractConcepts({
          chapterText,
          ageGroup,
          language,
        });
        span.setAttributes({
          "chapter.title": chapter.chapterTitle,
          "pipeline.status": "searching",
        });

        const episodes: Episode[] = [];
        for (const concept of chapter.concepts) {
          episodes.push(await buildEpisode(concept));
        }

        const duration = performance.now() - started;
        const lesson: Lesson = {
          id: lessonId,
          title: chapter.chapterTitle,
          ageGroup,
          language,
          status: "ready",
          concepts: chapter.concepts,
          episodes,
          traceId: span.spanContext().traceId,
          generationTimeMs: Math.round(duration),
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
