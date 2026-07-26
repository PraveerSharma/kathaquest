import "server-only";

import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { telemetry, withSpan } from "@/lib/telemetry";
import type { LessonLanguage } from "@/lib/types";

type SarvamTtsResponse = {
  request_id?: string;
  audios?: string[];
};

export async function generateSarvamNarration(
  text: string,
  language: LessonLanguage,
): Promise<string> {
  const started = performance.now();
  return withSpan(
    "tts.generate",
    {
      "ai.provider": "sarvam",
      "ai.model": "bulbul:v3",
      "ai.input_size": text.length,
      "lesson.language": language,
      "tts.provider": "sarvam",
    },
    async () => {
      const response = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
          "api-subscription-key": requireEnv("SARVAM_API_KEY"),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: text.slice(0, 2_500),
          target_language_code: language,
          model: "bulbul:v3",
          speaker: language === "hi-IN" ? "ritu" : "shubh",
          output_audio_codec: "mp3",
          pace: 0.9,
        }),
      });

      const duration = performance.now() - started;
      telemetry.ttsRequestDuration.record(duration, {
        provider: "sarvam",
        language,
      });

      if (!response.ok) {
        telemetry.ttsFailures.add(1, { provider: "sarvam" });
        throw new Error(`Sarvam TTS failed with HTTP ${response.status}`);
      }

      const payload = (await response.json()) as SarvamTtsResponse;
      const audio = payload.audios?.[0];
      if (!audio) {
        telemetry.ttsFailures.add(1, { provider: "sarvam" });
        throw new Error("Sarvam TTS returned no audio");
      }

      logger.info(
        {
          event: "tts.generated",
          provider: "sarvam",
          language,
          durationMs: duration,
          requestId: payload.request_id,
        },
        "Narration generated",
      );
      return `data:audio/mpeg;base64,${audio}`;
    },
  );
}

export async function transcribeWithSarvam(
  audio: File,
): Promise<{ transcript: string; languageCode?: string }> {
  return withSpan(
    "sarvam.speech_to_text",
    {
      "ai.provider": "sarvam",
      "ai.model": "saarika:v2.5",
      "ai.input_size": audio.size,
    },
    async () => {
      const form = new FormData();
      form.append("file", audio);
      form.append("model", "saarika:v2.5");
      form.append("language_code", "unknown");

      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: {
          "api-subscription-key": requireEnv("SARVAM_API_KEY"),
        },
        body: form,
      });
      if (!response.ok) {
        throw new Error(`Sarvam STT failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        transcript?: string;
        language_code?: string;
      };
      if (!payload.transcript) {
        throw new Error("Sarvam STT returned no transcript");
      }
      return {
        transcript: payload.transcript,
        languageCode: payload.language_code,
      };
    },
  );
}
