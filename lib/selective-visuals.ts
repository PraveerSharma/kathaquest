import "server-only";

import OpenAI from "openai";

import { env, requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withSpan } from "@/lib/telemetry";
import type {
  LessonPresentation,
  StoryboardScene,
} from "@/lib/types";

type RenderResponse = {
  videoUrl?: string;
  jobId?: string;
  status?: "queued" | "running" | "ready" | "failed";
  statusUrl?: string;
  error?: string;
  message?: string;
};

let imageClient: OpenAI | undefined;

function openai(): OpenAI {
  imageClient ??= new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return imageClient;
}

function needsManim(scene: StoryboardScene): boolean {
  return (
    scene.type === "animation" &&
    ["orbit", "layers", "cycle", "process"].includes(
      scene.visual.diagramTemplate,
    )
  );
}

function needsImageMotion(scene: StoryboardScene): boolean {
  return (
    !scene.visual.footageMediaUrl &&
    (scene.type === "keyword" ||
      (scene.type === "diagram" &&
        scene.visual.motion === "pan_zoom" &&
        ["comparison", "concept_map"].includes(
          scene.visual.diagramTemplate,
        )))
  );
}

async function callRenderer(
  baseUrl: string,
  apiKey: string | undefined,
  body: Record<string, unknown>,
): Promise<string> {
  const headers = {
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    "content-type": "application/json",
  };
  const response = await fetch(new URL("/render", baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = (await response.json()) as RenderResponse;
  if (!response.ok) {
    throw new Error(
      result.error ??
        result.message ??
        `Visual renderer failed (HTTP ${response.status})`,
    );
  }
  if (result.videoUrl) return result.videoUrl;
  if (!result.jobId && !result.statusUrl) {
    throw new Error("Visual renderer returned neither a video nor a job");
  }

  const statusUrl = result.statusUrl
    ? new URL(result.statusUrl, baseUrl)
    : new URL(`/jobs/${result.jobId}`, baseUrl);
  const deadline = Date.now() + 170_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const statusResponse = await fetch(statusUrl, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const status = (await statusResponse.json()) as RenderResponse;
    if (!statusResponse.ok) {
      throw new Error(
        status.error ??
          status.message ??
          `Visual render status failed (HTTP ${statusResponse.status})`,
      );
    }
    if (status.status === "ready" && status.videoUrl) return status.videoUrl;
    if (status.status === "failed") {
      throw new Error(status.error ?? "Visual render job failed");
    }
  }
  throw new Error("Visual render job timed out");
}

async function renderManimScene(
  lessonId: string,
  scene: StoryboardScene,
): Promise<StoryboardScene> {
  if (!env.MANIM_RENDERER_URL) return scene;
  const mediaUrl = await callRenderer(
    env.MANIM_RENDERER_URL,
    env.MANIM_RENDERER_API_KEY,
    {
      lessonId,
      sceneId: scene.id,
      template: scene.visual.diagramTemplate,
      title: scene.title,
      labels: scene.visual.labels,
      durationSeconds: scene.durationSeconds,
      format: "mp4",
    },
  );
  return {
    ...scene,
    visual: {
      ...scene.visual,
      generatedAsset: {
        kind: "manim",
        status: "ready",
        mediaUrl,
        renderer: "manim-worker",
        selectionReason:
          "The mechanism needs spatial or mathematical motion beyond the SVG template.",
      },
    },
  };
}

async function renderImageMotionScene(
  lessonId: string,
  scene: StoryboardScene,
): Promise<StoryboardScene> {
  if (!env.IMAGE_VIDEO_RENDERER_URL || !env.OPENAI_API_KEY) return scene;
  const prompt = [
    "Create one accurate, kid-friendly educational illustration.",
    "Wide 16:9 composition, warm editorial children's science style.",
    "No text, labels, logos, frightening imagery, or decorative clutter.",
    `Lesson scene: ${scene.title}.`,
    `Grounded visual concepts: ${scene.visual.labels.join(", ")}.`,
    `The illustration must support this explanation: ${scene.narration}`,
  ].join(" ");
  const generated = await openai().images.generate({
    model: env.OPENAI_IMAGE_MODEL,
    prompt,
    quality: "low",
    size: "1536x1024",
  });
  const imageBase64 = generated.data?.[0]?.b64_json;
  if (!imageBase64) throw new Error("Image generation returned no image");
  const mediaUrl = await callRenderer(
    env.IMAGE_VIDEO_RENDERER_URL,
    env.IMAGE_VIDEO_RENDERER_API_KEY,
    {
      lessonId,
      sceneId: scene.id,
      imageBase64,
      imageFormat: "png",
      durationSeconds: Math.min(scene.durationSeconds, 12),
      motion: scene.visual.motion,
      format: "mp4",
    },
  );
  return {
    ...scene,
    visual: {
      ...scene.visual,
      generatedAsset: {
        kind: "image_to_video",
        status: "ready",
        mediaUrl,
        renderer: "openai-image-motion",
        selectionReason:
          "No reviewed footage was suitable, so one grounded illustration received restrained camera motion.",
      },
    },
  };
}

export async function enrichSelectiveVisuals({
  lessonId,
  presentation,
}: {
  lessonId: string;
  presentation: LessonPresentation;
}): Promise<LessonPresentation> {
  const canRenderManim = Boolean(env.MANIM_RENDERER_URL);
  const canRenderImageMotion = Boolean(
    env.IMAGE_VIDEO_RENDERER_URL && env.OPENAI_API_KEY,
  );
  if (!canRenderManim && !canRenderImageMotion) return presentation;

  return withSpan(
    "presentation.enrich_visuals",
    {
      "lesson.id": lessonId,
      "visual.manim_enabled": canRenderManim,
      "visual.image_motion_enabled": canRenderImageMotion,
    },
    async () => {
      let imageMotionUsed = false;
      const scenes: StoryboardScene[] = [];
      for (const scene of presentation.storyboard.scenes) {
        try {
          if (canRenderManim && needsManim(scene)) {
            scenes.push(await renderManimScene(lessonId, scene));
            continue;
          }
          if (
            canRenderImageMotion &&
            !imageMotionUsed &&
            needsImageMotion(scene)
          ) {
            imageMotionUsed = true;
            scenes.push(await renderImageMotionScene(lessonId, scene));
            continue;
          }
        } catch (error) {
          logger.warn(
            {
              event: "visual.renderer_fallback",
              lessonId,
              sceneId: scene.id,
              error: error instanceof Error ? error.message : String(error),
            },
            "Generated visual failed; retaining the deterministic SVG scene",
          );
        }
        scenes.push(scene);
      }
      return {
        ...presentation,
        storyboard: {
          ...presentation.storyboard,
          scenes,
        },
      };
    },
  );
}
