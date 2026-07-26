import "server-only";

import { env } from "@/lib/env";
import { generateElevenLabsNarration } from "@/lib/elevenlabs";
import { logger } from "@/lib/logger";
import { generateSarvamNarration } from "@/lib/sarvam";
import { telemetry, withSpan } from "@/lib/telemetry";
import type { LessonLanguage } from "@/lib/types";

export async function generateNarration({
  text,
  language,
  forceFailure = false,
}: {
  text: string;
  language: LessonLanguage;
  forceFailure?: boolean;
}): Promise<{
  audioUrl: string;
  provider: "sarvam" | "elevenlabs";
  fallbackUsed: boolean;
  primaryFailure?: string;
}> {
  try {
    if (forceFailure) throw new Error("Controlled Sarvam failure for demo");
    return {
      audioUrl: await generateSarvamNarration(text, language),
      provider: "sarvam",
      fallbackUsed: false,
    };
  } catch (primaryError) {
    if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
      throw primaryError;
    }
    return withSpan(
      "tts.fallback",
      { "tts.fallback_used": true, "tts.provider": "elevenlabs" },
      async () => {
        telemetry.ttsFallbacks.add(1, {
          from: "sarvam",
          to: "elevenlabs",
        });
        logger.warn(
          {
            event: "tts.fallback",
            provider: "elevenlabs",
            primaryProvider: "sarvam",
            error:
              primaryError instanceof Error
                ? primaryError.message
                : String(primaryError),
          },
          "Primary voice provider failed; recovered using ElevenLabs",
        );
        return {
          audioUrl: await generateElevenLabsNarration(text),
          provider: "elevenlabs" as const,
          fallbackUsed: true,
          primaryFailure:
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError),
        };
      },
    );
  }
}
