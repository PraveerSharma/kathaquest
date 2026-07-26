import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { openLesson } from "@/lib/lesson-session";
import {
  hasDurableLessonStorage,
  saveLesson,
} from "@/lib/storage";

export const runtime = "nodejs";

const requestSchema = z.object({
  lessonId: z.string().uuid(),
  lessonToken: z.string().min(40).max(200_000),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const lesson = openLesson(input.lessonToken);
    if (lesson.id !== input.lessonId) {
      return NextResponse.json(
        { error: "Lesson session mismatch" },
        { status: 401 },
      );
    }
    await saveLesson(lesson);
    const durable = hasDurableLessonStorage();
    return NextResponse.json({
      path: durable
        ? `/adventure/${lesson.id}`
        : `/adventure/shared#lesson=${encodeURIComponent(input.lessonToken)}`,
      durable,
      retentionDays: env.LESSON_RETENTION_DAYS,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create a share link";
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
