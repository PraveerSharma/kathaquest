import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeElevenLabsFailure } from "@/lib/demo-state";
import { lessonLanguageCodes } from "@/lib/languages";
import { openLesson } from "@/lib/lesson-session";
import { localizeNarrationText } from "@/lib/llm";
import {
  composeSceneNarration,
  NARRATION_RENDER_VERSION,
} from "@/lib/narration-style";
import { generateNarration } from "@/lib/narration-router";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertKidSafeText } from "@/lib/safety";
import { telemetry, withSpan } from "@/lib/telemetry";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  lessonId: z.string().uuid(),
  lessonToken: z.string().min(40).max(200_000),
  language: z.enum(lessonLanguageCodes),
  provider: z.enum(["auto", "sarvam", "elevenlabs"]).default("auto"),
  forceFailure: z.boolean().optional(),
});

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    request,
    "presentation-narration",
    20,
    10 * 60_000,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Voice-film limit reached. Please try again shortly." },
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
    if (!lesson.presentation) {
      return NextResponse.json(
        { error: "This saved lesson predates the presentation studio." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      await withSpan(
        "presentation.generate_narration",
        {
          "lesson.id": lesson.id,
          "lesson.language": input.language,
          "tts.preferred_provider": input.provider,
          "storyboard.scene_count":
            lesson.presentation.storyboard.scenes.length,
        },
        async () => {
          const storyboardScript = composeSceneNarration(
            lesson.presentation!.storyboard.scenes,
          );
          const script =
            lesson.language === input.language
              ? storyboardScript
              : await localizeNarrationText(
                  storyboardScript,
                  input.language,
                );
          await assertKidSafeText(script, "answer");
          const forced =
            input.forceFailure === true || consumeElevenLabsFailure();
          const narration = await generateNarration({
              text: script,
              language: input.language,
              preferredProvider: input.provider,
              forceFailure: forced,
            });
          telemetry.presentationNarrations.add(1, {
            language: input.language,
            provider: narration.provider,
            style: NARRATION_RENDER_VERSION,
          });
          return {
            ...narration,
            language: input.language,
            narrationStyle: NARRATION_RENDER_VERSION,
            durationSeconds:
              lesson.presentation!.storyboard.totalDurationSeconds,
          };
        },
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Presentation narration failed";
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
