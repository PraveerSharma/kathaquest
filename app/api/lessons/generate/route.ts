import { NextResponse } from "next/server";
import { z } from "zod";

import { sealLesson, toPublicLesson } from "@/lib/lesson-session";
import { generateLesson } from "@/lib/pipeline";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  chapterText: z.string().min(100).max(50_000),
  ageGroup: z.enum(["6-8", "8-10", "10-12"]),
  language: z.enum(["en-IN", "hi-IN"]),
  sourceKind: z.enum(["chapter-pack", "uploaded-pdf"]).default("uploaded-pdf"),
});

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, "lesson-generate", 10, 10 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many quests started. Please try again shortly." },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  try {
    const input = requestSchema.parse(await request.json());
    const lesson = await generateLesson(input);
    return NextResponse.json({
      lessonId: lesson.id,
      status: "ready",
      lesson: toPublicLesson(lesson),
      lessonToken: sealLesson(lesson),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lesson generation failed";
    const status =
      error instanceof z.ZodError
        ? 400
        : message.includes("suitable") || message.includes("evidence")
          ? 422
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
