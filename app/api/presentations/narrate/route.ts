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
import type { NarrationTrack, StoryboardScene } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  lessonId: z.string().uuid(),
  lessonToken: z.string().min(40).max(200_000),
  language: z.enum(lessonLanguageCodes),
  provider: z.enum(["auto", "sarvam", "elevenlabs"]).default("auto"),
  forceFailure: z.boolean().optional(),
});

function lessonActs(scenes: StoryboardScene[], fps: number) {
  const acts: Array<{
    durationInFrames: number;
    fromFrame: number;
    scenes: StoryboardScene[];
  }> = [];
  let fromFrame = 0;
  for (let index = 0; index < scenes.length; index += 3) {
    const actScenes = scenes.slice(index, index + 3);
    const durationInFrames = actScenes.reduce(
      (total, scene) =>
        total + Math.round(scene.durationSeconds * fps),
      0,
    );
    acts.push({ scenes: actScenes, fromFrame, durationInFrames });
    fromFrame += durationInFrames;
  }
  return acts;
}

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
          const presentation = lesson.presentation!;
          const acts = lessonActs(
            presentation.storyboard.scenes,
            presentation.storyboard.fps,
          );
          const scripts = await Promise.all(
            acts.map(async (act) => {
              const actScript = composeSceneNarration(act.scenes);
              return lesson.language === input.language
                ? actScript
                : localizeNarrationText(actScript, input.language);
            }),
          );
          await Promise.all(
            scripts.map((script) => assertKidSafeText(script, "answer")),
          );
          const forced =
            input.forceFailure === true || consumeElevenLabsFailure();
          const firstNarration = await generateNarration({
            text: scripts[0],
            language: input.language,
            preferredProvider: input.provider,
            forceFailure: forced,
          });
          const remainingNarrations = await Promise.all(
            scripts.slice(1).map((script) =>
              generateNarration({
                text: script,
                language: input.language,
                preferredProvider: firstNarration.provider,
              }),
            ),
          );
          const narrations = [firstNarration, ...remainingNarrations];
          const narrationTracks: NarrationTrack[] = acts.map((act, index) => ({
            audioUrl: narrations[index].audioUrl,
            durationInFrames: act.durationInFrames,
            fromFrame: act.fromFrame,
            sceneIds: act.scenes.map((scene) => scene.id),
          }));
          const fallbackUsed = narrations.some(
            (narration) => narration.fallbackUsed,
          );
          telemetry.presentationNarrations.add(1, {
            language: input.language,
            provider: firstNarration.provider,
            style: NARRATION_RENDER_VERSION,
            mode: "scene-synced-acts",
          });
          return {
            audioUrl: narrationTracks[0].audioUrl,
            fallbackUsed,
            language: input.language,
            narrationTracks,
            provider: firstNarration.provider,
            narrationStyle: NARRATION_RENDER_VERSION,
            syncMode: "scene-synced-acts",
            durationSeconds:
              presentation.storyboard.totalDurationSeconds,
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
