import { NextResponse } from "next/server";
import { z } from "zod";

import { generateLesson } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  chapterText: z.string().min(100).max(50_000),
  ageGroup: z.enum(["6-8", "8-10", "10-12"]),
  language: z.enum(["en-IN", "hi-IN"]),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const lesson = await generateLesson(input);
    return NextResponse.json({ lessonId: lesson.id, status: "ready", lesson });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lesson generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
