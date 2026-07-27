import "server-only";

import { requireEnv } from "@/lib/env";
import {
  NARRATION_RENDER_VERSION,
  prepareElevenLabsNarration,
} from "@/lib/narration-style";
import { telemetry, withSpan } from "@/lib/telemetry";

export async function generateElevenLabsNarration(
  text: string,
  forceFailure = false,
): Promise<string> {
  const started = performance.now();
  return withSpan(
    "tts.generate",
    {
      "ai.provider": "elevenlabs",
      "ai.model": "eleven_multilingual_v2",
      "ai.prompt_version": NARRATION_RENDER_VERSION,
      "ai.input_size": text.length,
      "tts.provider": "elevenlabs",
    },
    async () => {
      if (forceFailure) {
        telemetry.ttsFailures.add(1, { provider: "elevenlabs" });
        throw new Error("Controlled ElevenLabs failure for demo");
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${requireEnv("ELEVENLABS_VOICE_ID")}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": requireEnv("ELEVENLABS_API_KEY"),
            "content-type": "application/json",
            accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: prepareElevenLabsNarration(text).slice(0, 9_500),
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.52,
              similarity_boost: 0.76,
              style: 0,
              use_speaker_boost: true,
              speed: 0.92,
            },
          }),
        },
      );

      telemetry.ttsRequestDuration.record(performance.now() - started, {
        provider: "elevenlabs",
      });
      if (!response.ok) {
        telemetry.ttsFailures.add(1, { provider: "elevenlabs" });
        throw new Error(
          `ElevenLabs TTS failed with HTTP ${response.status}`,
        );
      }
      const audio = Buffer.from(await response.arrayBuffer()).toString(
        "base64",
      );
      return `data:audio/mpeg;base64,${audio}`;
    },
  );
}
