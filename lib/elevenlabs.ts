import "server-only";

import { requireEnv } from "@/lib/env";
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
      "ai.input_size": text.length,
      "tts.provider": "elevenlabs",
    },
    async () => {
      if (forceFailure) {
        telemetry.ttsFailures.add(1, { provider: "elevenlabs" });
        throw new Error("Controlled ElevenLabs failure for demo");
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${requireEnv("ELEVENLABS_VOICE_ID")}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": requireEnv("ELEVENLABS_API_KEY"),
            "content-type": "application/json",
            accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: text.slice(0, 5_000),
            model_id: "eleven_multilingual_v2",
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
