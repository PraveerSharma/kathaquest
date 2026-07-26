import { NextResponse } from "next/server";
import { z } from "zod";

import {
  openLesson,
  sealLesson,
  toPublicLesson,
} from "@/lib/lesson-session";
import { saveLesson } from "@/lib/storage";

export const runtime = "nodejs";

const requestSchema = z.object({
  lessonToken: z.string().min(40).max(200_000),
});

export async function POST(request: Request) {
  try {
    const { lessonToken } = requestSchema.parse(await request.json());
    const lesson = openLesson(lessonToken);
    await saveLesson(lesson);
    return NextResponse.json({
      lesson: toPublicLesson(lesson),
      lessonToken: sealLesson(lesson),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Shared lesson is unavailable";
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
