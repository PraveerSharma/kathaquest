import { NextResponse } from "next/server";
import { z } from "zod";

import {
  openCuriosityClip,
  openLesson,
} from "@/lib/lesson-session";
import {
  composeSceneNarration,
  NARRATION_RENDER_VERSION,
} from "@/lib/narration-style";
import { generateNarration } from "@/lib/narration-router";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertKidSafeText } from "@/lib/safety";
import { telemetry, withSpan } from "@/lib/telemetry";
import type {
  NarrationTrack,
  StoryboardScene,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  lessonId: z.string().uuid(),
  lessonToken: z.string().min(40).max(200_000),
  clipToken: z.string().min(40).max(200_000),
  provider: z.enum(["auto", "sarvam", "elevenlabs"]).default("auto"),
});

function clipActs(scenes: StoryboardScene[], fps: number) {
  const acts: Array<{
    durationInFrames: number;
    fromFrame: number;
    scenes: StoryboardScene[];
  }> = [];
  let fromFrame = 0;
  for (let index = 0; index < scenes.length; index += 2) {
    const actScenes = scenes.slice(index, index + 2);
    const durationInFrames = actScenes.reduce(
      (total, scene) =>
        total + Math.round(scene.durationSeconds * fps),
      0,
    );
    acts.push({ durationInFrames, fromFrame, scenes: actScenes });
    fromFrame += durationInFrames;
  }
  return acts;
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    request,
    "curiosity-narration",
    12,
    10 * 60_000,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Curiosity Clip limit reached. Please try again shortly." },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const input = requestSchema.parse(await request.json());
    const lesson = openLesson(input.lessonToken);
    const sealed = openCuriosityClip(input.clipToken);
    if (
      lesson.id !== input.lessonId ||
      sealed.lessonId !== lesson.id ||
      sealed.clip.language !== lesson.language
    ) {
      return NextResponse.json(
        { error: "Curiosity Clip session mismatch" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      await withSpan(
        "curiosity.generate_narration",
        {
          "lesson.id": lesson.id,
          "lesson.language": lesson.language,
          "curiosity.clip_id": sealed.clip.id,
          "tts.preferred_provider": input.provider,
        },
        async () => {
          const presentation = sealed.clip.presentation;
          const acts = clipActs(
            presentation.storyboard.scenes,
            presentation.storyboard.fps,
          );
          const scripts = acts.map((act) =>
            composeSceneNarration(act.scenes),
          );
          await Promise.all(
            scripts.map((script) => assertKidSafeText(script, "answer")),
          );
          const firstNarration = await generateNarration({
            text: scripts[0],
            language: lesson.language,
            preferredProvider: input.provider,
          });
          const remainingNarrations = await Promise.all(
            scripts.slice(1).map((script) =>
              generateNarration({
                text: script,
                language: lesson.language,
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
          telemetry.curiosityClipNarrations.add(1, {
            language: lesson.language,
            provider: firstNarration.provider,
            style: NARRATION_RENDER_VERSION,
          });
          return {
            audioUrl: narrationTracks[0].audioUrl,
            clipId: sealed.clip.id,
            durationSeconds:
              presentation.storyboard.totalDurationSeconds,
            fallbackUsed,
            language: lesson.language,
            narrationStyle: NARRATION_RENDER_VERSION,
            narrationTracks,
            provider: firstNarration.provider,
            syncMode: "scene-synced-acts",
          };
        },
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Curiosity Clip narration failed";
    return NextResponse.json(
      { error: message },
      {
        status:
          error instanceof z.ZodError
            ? 400
            : message.includes("session") ||
                message.includes("invalid") ||
                message.includes("expired")
              ? 401
              : 500,
      },
    );
  }
}
