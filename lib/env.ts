import "server-only";

import { z } from "zod";

const envSchema = z.object({
  VIDEODB_API_KEY: z.string().min(1).optional(),
  VIDEODB_COLLECTION_ID: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default("gpt-5.6"),
  LESSON_SIGNING_SECRET: z.string().min(32).optional(),
  SARVAM_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_VOICE_ID: z.string().min(1).optional(),
  OTEL_SERVICE_NAME: z.string().default("kathaquest"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default("http://localhost:4318"),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z
    .string()
    .url()
    .default("http://localhost:4318/v1/traces"),
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: z
    .string()
    .url()
    .default("http://localhost:4318/v1/metrics"),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  SIGNOZ_INGESTION_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SIGNOZ_URL: z.string().url().optional(),
  SIGNOZ_URL: z.string().url().default("http://localhost:8080"),
  SIGNOZ_MCP_URL: z.string().url().default("http://localhost:8000/mcp"),
  SIGNOZ_WEBHOOK_USERNAME: z.string().min(1).optional(),
  SIGNOZ_WEBHOOK_PASSWORD: z.string().min(16).optional(),
  DEMO_FORCE_ELEVENLABS_FAILURE: z.string().default("false"),
  DEMO_MODE: z.string().default("true"),
});

export const env = envSchema.parse(process.env);

export function requireEnv<K extends keyof typeof env>(
  key: K,
): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
