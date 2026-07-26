import { NextResponse } from "next/server";

import { getLesson } from "@/lib/storage";
import { sealLesson, toPublicLesson } from "@/lib/lesson-session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await context.params;
  const lesson = await getLesson(lessonId);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  return NextResponse.json({
    lesson: toPublicLesson(lesson),
    lessonToken: sealLesson(lesson),
  });
}
