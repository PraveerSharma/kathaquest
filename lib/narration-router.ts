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
  if (language === "hi-IN") {
    try {
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

  try {
    return {
      audioUrl: await generateElevenLabsNarration(text, forceFailure),
      provider: "elevenlabs",
      fallbackUsed: false,
    };
  } catch (primaryError) {
    return withSpan(
      "tts.fallback",
      { "tts.fallback_used": true, "tts.provider": "sarvam" },
      async () => {
        telemetry.ttsFallbacks.add(1, {
          from: "elevenlabs",
          to: "sarvam",
        });
        logger.warn(
          {
            event: "tts.fallback",
            provider: "sarvam",
            primaryProvider: "elevenlabs",
            error:
              primaryError instanceof Error
                ? primaryError.message
                : String(primaryError),
          },
          "Primary voice provider failed; recovered using Sarvam AI",
        );
        return {
          audioUrl: await generateSarvamNarration(text, language),
          provider: "sarvam" as const,
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
