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
  preferredProvider = "auto",
}: {
  text: string;
  language: LessonLanguage;
  forceFailure?: boolean;
  preferredProvider?: "auto" | "sarvam" | "elevenlabs";
}): Promise<{
  audioUrl: string;
  provider: "sarvam" | "elevenlabs";
  fallbackUsed: boolean;
  primaryFailure?: string;
}> {
  const useElevenLabsFirst = preferredProvider === "elevenlabs";
  const primaryProvider = useElevenLabsFirst ? "elevenlabs" : "sarvam";
  const backupProvider = useElevenLabsFirst ? "sarvam" : "elevenlabs";
  try {
    if (forceFailure) {
      throw new Error(`Controlled ${primaryProvider} failure for demo`);
    }
    return {
      audioUrl: useElevenLabsFirst
        ? await generateElevenLabsNarration(text)
        : await generateSarvamNarration(text, language),
      provider: primaryProvider,
      fallbackUsed: false,
    };
  } catch (primaryError) {
    if (
      !useElevenLabsFirst &&
      (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID)
    ) {
      throw primaryError;
    }
    return withSpan(
      "tts.fallback",
      { "tts.fallback_used": true, "tts.provider": backupProvider },
      async () => {
        telemetry.ttsFallbacks.add(1, {
          from: primaryProvider,
          to: backupProvider,
        });
        logger.warn(
          {
            event: "tts.fallback",
            provider: backupProvider,
            primaryProvider,
            error:
              primaryError instanceof Error
                ? primaryError.message
                : String(primaryError),
          },
          "Primary voice provider failed; recovered using backup narration",
        );
        return {
          audioUrl: useElevenLabsFirst
            ? await generateSarvamNarration(text, language)
            : await generateElevenLabsNarration(text),
          provider: backupProvider,
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
