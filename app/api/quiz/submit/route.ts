import { NextResponse } from "next/server";
import { z } from "zod";

import { openLesson } from "@/lib/lesson-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { telemetry, withSpan } from "@/lib/telemetry";
import { searchEducationalArchive } from "@/lib/videodb";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  lessonId: z.string().uuid(),
  lessonToken: z.string().min(40).max(200_000),
  answers: z.record(z.string(), z.string().min(1).max(100)),
});

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, "quiz", 20, 10 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Quiz limit reached. Please try again shortly." },
      { status: 429 },
    );
  }
  try {
    const body = requestSchema.parse(await request.json());
    const lesson = openLesson(body.lessonToken);
    if (lesson.id !== body.lessonId) {
      return NextResponse.json({ error: "Lesson session mismatch" }, { status: 401 });
    }
    const hasInvalidAnswer = lesson.concepts.some((concept) => {
      const answer = body.answers[concept.id];
      return !answer || !concept.quiz.options.includes(answer);
    });
    if (hasInvalidAnswer) {
      return NextResponse.json(
        { error: "Choose one valid answer for every question." },
        { status: 400 },
      );
    }

    return await withSpan(
      "quiz.evaluate",
      { "lesson.id": lesson.id },
      async () => {
        const incorrectConceptIds = lesson.concepts
          .filter(
            (concept) =>
              body.answers?.[concept.id] !== concept.quiz.correctAnswer,
          )
          .map((concept) => concept.id);
        let revisionReelUrl: string | undefined;

        if (incorrectConceptIds.length > 0) {
          const concept = lesson.concepts.find(
            (item) => item.id === incorrectConceptIds[0],
          );
          if (concept) {
            const revision = await withSpan(
              "revision.compile",
              {
                "lesson.id": lesson.id,
                "revision.concept_count": incorrectConceptIds.length,
              },
              async () =>
                searchEducationalArchive(concept.videoSearchQueries, {
                  conceptTitle: concept.title,
                  learningObjective: concept.learningObjective,
                  purpose: "revision",
                }),
            );
            revisionReelUrl = revision?.streamUrl;
            if (revisionReelUrl) telemetry.revisionsGenerated.add(1);
          }
        }

        return NextResponse.json({
          score: lesson.concepts.length - incorrectConceptIds.length,
          total: lesson.concepts.length,
          incorrectConceptIds,
          revisionReelUrl,
        });
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Quiz evaluation failed";
    return NextResponse.json(
      { error: message },
      {
        status:
          error instanceof z.ZodError
            ? 400
            : message.includes("session")
              ? 401
              : 500,
      },
    );
  }
}
