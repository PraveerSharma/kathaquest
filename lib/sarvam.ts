import "server-only";

import { requireEnv } from "@/lib/env";
import { getLessonLanguage } from "@/lib/languages";
import { logger } from "@/lib/logger";
import { telemetry, withSpan } from "@/lib/telemetry";
import type { LessonLanguage } from "@/lib/types";

type SarvamTtsResponse = {
  request_id?: string;
  audios?: string[];
};

function narrationChunks(text: string, maxCharacters = 2_300) {
  const sentences = text
    .trim()
    .split(/(?<=[.!?।])\s+/u)
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  function pushPart(part: string) {
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length <= maxCharacters) {
      current = candidate;
      return;
    }
    if (current) chunks.push(current);
    current = part;
  }

  for (const sentence of sentences) {
    if (sentence.length <= maxCharacters) {
      pushPart(sentence);
      continue;
    }
    let section = "";
    for (const word of sentence.split(/\s+/)) {
      const candidate = section ? `${section} ${word}` : word;
      if (candidate.length > maxCharacters && section) {
        pushPart(section);
        section = word;
      } else {
        section = candidate;
      }
    }
    if (section) pushPart(section);
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, maxCharacters)];
}

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
    async (span) => {
      const voice = getLessonLanguage(language);
      const chunks = narrationChunks(text);
      const audioParts: Buffer[] = [];
      const requestIds: string[] = [];

      for (const chunk of chunks) {
        const response = await fetch("https://api.sarvam.ai/text-to-speech", {
          method: "POST",
          headers: {
            "api-subscription-key": requireEnv("SARVAM_API_KEY"),
            "content-type": "application/json",
          },
          body: JSON.stringify({
            text: chunk,
            target_language_code: language,
            model: "bulbul:v3",
            speaker: voice.speaker,
            output_audio_codec: "mp3",
            speech_sample_rate: 48_000,
            pace: 0.92,
            temperature: 0.6,
            enable_preprocessing: true,
          }),
        });

        if (!response.ok) {
          telemetry.ttsFailures.add(1, { provider: "sarvam" });
          throw new Error(`Sarvam TTS failed with HTTP ${response.status}`);
        }

        const payload = (await response.json()) as SarvamTtsResponse;
        const audios = payload.audios?.filter(Boolean);
        if (!audios?.length) {
          telemetry.ttsFailures.add(1, { provider: "sarvam" });
          throw new Error("Sarvam TTS returned no audio");
        }
        audioParts.push(
          ...audios.map((audio) => Buffer.from(audio, "base64")),
        );
        if (payload.request_id) requestIds.push(payload.request_id);
      }

      const duration = performance.now() - started;
      telemetry.ttsRequestDuration.record(duration, {
        provider: "sarvam",
        language,
      });
      span.setAttributes({
        "tts.chunk_count": chunks.length,
        "tts.output_bytes": audioParts.reduce(
          (total, part) => total + part.byteLength,
          0,
        ),
      });
      logger.info(
        {
          event: "tts.generated",
          provider: "sarvam",
          language,
          speaker: voice.speaker,
          durationMs: duration,
          chunkCount: chunks.length,
          requestIds,
        },
        "Narration generated",
      );
      return `data:audio/mpeg;base64,${Buffer.concat(audioParts).toString("base64")}`;
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
