import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeElevenLabsFailure } from "@/lib/demo-state";
import { lessonLanguageCodes } from "@/lib/languages";
import { openLesson } from "@/lib/lesson-session";
import { localizeNarrationText } from "@/lib/llm";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertKidSafeText } from "@/lib/safety";
import { createLocalizedEpisodeVideo } from "@/lib/video-localization";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  lessonId: z.string().uuid(),
  lessonToken: z.string().min(40).max(200_000),
  episodeId: z.string().uuid(),
  language: z.enum(lessonLanguageCodes),
  provider: z.enum(["auto", "sarvam", "elevenlabs"]).default("auto"),
  forceFailure: z.boolean().optional(),
});

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, "narration", 30, 10 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Narration limit reached. Please try again shortly." },
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
    const episode = lesson.episodes.find((item) => item.id === input.episodeId);
    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }
    const explanation =
      lesson.language === input.language
        ? episode.explanation
        : await localizeNarrationText(episode.explanation, input.language);
    await assertKidSafeText(explanation, "answer");
    const forced =
      input.forceFailure === true || consumeElevenLabsFailure();
    return NextResponse.json(
      await createLocalizedEpisodeVideo({
        episode: { ...episode, explanation },
        language: input.language,
        forceFailure: forced,
        preferredProvider: input.provider,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Narration generation failed",
      },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
