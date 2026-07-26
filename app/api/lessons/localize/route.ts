import { NextResponse } from "next/server";
import { z } from "zod";

import { lessonLanguageCodes } from "@/lib/languages";
import {
  openLesson,
  sealLesson,
  toPublicLesson,
} from "@/lib/lesson-session";
import { localizeLesson } from "@/lib/llm";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertKidSafeText } from "@/lib/safety";
import { saveLesson } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  lessonId: z.string().uuid(),
  lessonToken: z.string().min(40).max(200_000),
  language: z.enum(lessonLanguageCodes),
});

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, "lesson-localize", 20, 10 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Language-switch limit reached. Please try again shortly." },
      { status: 429 },
    );
  }
  try {
    const input = requestSchema.parse(await request.json());
    const lesson = openLesson(input.lessonToken);
    if (lesson.id !== input.lessonId) {
      return NextResponse.json(
        { error: "Lesson session mismatch" },
        { status: 401 },
      );
    }
    const localized = await localizeLesson(lesson, input.language);
    await assertKidSafeText(
      localized.concepts
        .flatMap((concept) => [
          concept.title,
          concept.learningObjective,
          concept.explanation,
          concept.quiz.question,
          ...concept.quiz.options,
        ])
        .join("\n"),
      "answer",
    );
    await saveLesson(localized);
    return NextResponse.json({
      lesson: toPublicLesson(localized),
      lessonToken: sealLesson(localized),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lesson localization failed";
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
