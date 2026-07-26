import { NextResponse } from "next/server";

import { getLesson } from "@/lib/storage";
import { telemetry, withSpan } from "@/lib/telemetry";
import type { Lesson } from "@/lib/types";
import { searchEducationalArchive } from "@/lib/videodb";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      lessonId?: string;
      lesson?: Lesson;
      answers?: Record<string, string>;
    };
    const lesson =
      body.lesson?.id === body.lessonId
        ? body.lesson
        : body.lessonId
          ? await getLesson(body.lessonId)
          : null;
    if (!lesson || !body.answers) {
      return NextResponse.json(
        { error: "Lesson and answers are required" },
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
                searchEducationalArchive(concept.videoSearchQuery),
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Quiz evaluation failed",
      },
      { status: 500 },
    );
  }
}
