import { NextResponse } from "next/server";
import { connect } from "videodb";

import { env } from "@/lib/env";
import type { ServiceHealth } from "@/lib/types";

export const runtime = "nodejs";

async function checkVideoDb(): Promise<ServiceHealth> {
  if (!env.VIDEODB_API_KEY || !env.VIDEODB_COLLECTION_ID) {
    return { status: "missing", detail: "Not configured" };
  }
  const started = performance.now();
  try {
    const conn = connect({ apiKey: env.VIDEODB_API_KEY });
    await conn.getCollection(env.VIDEODB_COLLECTION_ID);
    return { status: "ok", latencyMs: Math.round(performance.now() - started) };
  } catch {
    return { status: "degraded", detail: "Connection failed" };
  }
}

export async function GET() {
  const health = {
    application: { status: "ok" } satisfies ServiceHealth,
    videodb: await checkVideoDb(),
    openai: {
      status: env.OPENAI_API_KEY ? "ok" : "missing",
      detail: env.OPENAI_API_KEY ? "Configured" : "Not configured",
    } satisfies ServiceHealth,
    sarvam: {
      status: env.SARVAM_API_KEY ? "ok" : "missing",
      detail: env.SARVAM_API_KEY ? "Configured" : "Not configured",
    } satisfies ServiceHealth,
    elevenlabs: {
      status:
        env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID ? "ok" : "missing",
      detail:
        env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID
          ? "Configured"
          : "Optional backup not configured; Sarvam is the primary Indian-language voice",
    } satisfies ServiceHealth,
    opentelemetry: {
      status:
        process.env.VERCEL &&
        !process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
          ? "missing"
          : "ok",
      detail:
        process.env.VERCEL &&
        !process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
          ? "No reachable production exporter configured; local SigNoz remains supported"
          : `Exporter configured for ${env.OTEL_EXPORTER_OTLP_ENDPOINT}`,
    } satisfies ServiceHealth,
  };

  const degraded = Object.values(health).some(
    (service) => service.status === "degraded",
  );
  return NextResponse.json(health, { status: degraded ? 503 : 200 });
}
