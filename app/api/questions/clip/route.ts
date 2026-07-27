import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createFallbackCuriosityPresentation,
} from "@/lib/curiosity-clip";
import { logger } from "@/lib/logger";
import {
  createCuriosityClip,
  createQuestionSearchQuery,
} from "@/lib/llm";
import {
  openCuriosityRequest,
  openLesson,
  sealCuriosityClip,
} from "@/lib/lesson-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertKidSafeText } from "@/lib/safety";
import { telemetry, withSpan } from "@/lib/telemetry";
import type { CuriosityClip } from "@/lib/types";
import { searchEducationalArchive } from "@/lib/videodb";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  lessonId: z.string().uuid(),
  lessonToken: z.string().min(40).max(200_000),
  questionToken: z.string().min(40).max(200_000),
});

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    request,
    "curiosity-clip",
    12,
    10 * 60_000,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Curiosity Clip limit reached. Please try again shortly." },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  try {
    const input = requestSchema.parse(await request.json());
    const lesson = openLesson(input.lessonToken);
    const sealed = openCuriosityRequest(input.questionToken);
    if (
      lesson.id !== input.lessonId ||
      sealed.lessonId !== lesson.id ||
      sealed.request.language !== lesson.language
    ) {
      return NextResponse.json(
        { error: "Curiosity request session mismatch" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      await withSpan(
        "curiosity.generate",
        {
          "lesson.id": lesson.id,
          "lesson.language": lesson.language,
          "curiosity.request_id": sealed.request.id,
        },
        async (span) => {
          let support: Awaited<
            ReturnType<typeof searchEducationalArchive>
          > = null;
          try {
            const searchQuery = await createQuestionSearchQuery({
              question: sealed.request.question,
              lessonTitle: lesson.title,
              concepts: lesson.concepts,
            });
            support = await searchEducationalArchive(searchQuery, {
              conceptTitle: sealed.request.question,
              learningObjective: `Answer the child's question with direct visual or spoken evidence from ${lesson.title}.`,
              purpose: "answer",
            });
          } catch (searchError) {
            logger.warn(
              {
                event: "curiosity.evidence_fallback",
                lessonId: lesson.id,
                error:
                  searchError instanceof Error
                    ? searchError.message
                    : String(searchError),
              },
              "Curiosity Clip is continuing with chapter-grounded visuals",
            );
          }

          let presentation;
          let fallbackUsed = false;
          try {
            presentation = await createCuriosityClip({
              ageGroup: lesson.ageGroup,
              answer: sealed.request.answer,
              concepts: lesson.concepts,
              evidence: support?.evidence ?? [],
              language: lesson.language,
              lessonTitle: lesson.title,
              question: sealed.request.question,
            });
          } catch (clipError) {
            fallbackUsed = true;
            logger.warn(
              {
                event: "curiosity.storyboard_fallback",
                lessonId: lesson.id,
                error:
                  clipError instanceof Error
                    ? clipError.message
                    : String(clipError),
              },
              "Structured Curiosity Clip failed; using deterministic storyboard",
            );
            presentation = createFallbackCuriosityPresentation({
              ageGroup: lesson.ageGroup,
              answer: sealed.request.answer,
              concepts: lesson.concepts,
              language: lesson.language,
              question: sealed.request.question,
            });
          }
          await assertKidSafeText(
            presentation.storyboard.scenes
              .map(
                (scene) =>
                  `${scene.title}\n${scene.narration}\n${scene.subtitle}`,
              )
              .join("\n\n"),
            "answer",
          );

          const clip: CuriosityClip = {
            id: sealed.request.id,
            question: sealed.request.question,
            answer: sealed.request.answer,
            language: lesson.language,
            presentation,
            evidence: support?.evidence ?? [],
            videoEvidenceUsed: presentation.storyboard.scenes.some(
              (scene) => scene.type === "real_video",
            ),
            createdAt: sealed.request.createdAt,
          };
          const clipToken = sealCuriosityClip({
            clip,
            lessonId: lesson.id,
          });
          telemetry.curiosityClipsGenerated.add(1, {
            language: lesson.language,
            fallback: String(fallbackUsed),
            video_evidence: String(clip.videoEvidenceUsed),
          });
          if (presentation.quality) {
            telemetry.presentationQuality.record(
              presentation.quality.overall,
              {
                source: "curiosity",
                tier: presentation.quality.tier,
              },
            );
          }
          span.setAttributes({
            "curiosity.clip_id": clip.id,
            "curiosity.fallback_used": fallbackUsed,
            "curiosity.video_used": clip.videoEvidenceUsed,
            "curiosity.quality_score":
              presentation.quality?.overall ?? 0,
          });
          return {
            curiosityClip: clip,
            clipToken,
            evidence: support?.evidence ?? [],
            streamUrl: support?.streamUrl,
            videoUnavailable: !support,
          };
        },
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Curiosity Clip generation failed";
    return NextResponse.json(
      { error: message },
      {
        status:
          error instanceof z.ZodError
            ? 400
            : message.includes("session") ||
                message.includes("invalid") ||
                message.includes("expired")
              ? 401
              : 500,
      },
    );
  }
}
