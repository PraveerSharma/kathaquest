import OpenAI from "openai";
import { connect } from "videodb";

type Result = {
  ok: boolean;
  detail?: string;
  latencyMs?: number;
};

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

async function timed(task: () => Promise<string>): Promise<Result> {
  const started = performance.now();
  try {
    return {
      ok: true,
      detail: await task(),
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

const results = {
  videodb: await timed(async () => {
    const conn = connect({ apiKey: required("VIDEODB_API_KEY") });
    const collection = await conn.getCollection(
      required("VIDEODB_COLLECTION_ID"),
    );
    const videos = await collection.getVideos();
    return `collection ${collection.id}; ${videos.length} video(s)`;
  }),
  openai: await timed(async () => {
    const client = new OpenAI({ apiKey: required("OPENAI_API_KEY") });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      reasoning: { effort: "none" },
      input: "Reply with exactly: ready",
      max_output_tokens: 16,
    });
    return `${response.model}: ${response.output_text}`;
  }),
  sarvam: await timed(async () => {
    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": required("SARVAM_API_KEY"),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: "KathaQuest is ready.",
        target_language_code: "en-IN",
        model: "bulbul:v3",
        speaker: "shubh",
        output_audio_codec: "mp3",
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { audios?: string[] };
    if (!payload.audios?.[0]) throw new Error("No audio returned");
    return "bulbul:v3 audio returned";
  }),
  elevenlabs: {
    ok: Boolean(
      process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID,
    ),
    detail:
      process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID
        ? "configured"
        : "not configured; Sarvam fallback will be used",
  },
};

console.log(JSON.stringify(results, null, 2));
if (!results.videodb.ok || !results.openai.ok || !results.sarvam.ok) {
  process.exitCode = 1;
}
