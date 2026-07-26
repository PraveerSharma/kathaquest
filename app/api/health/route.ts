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

async function checkElevenLabs(): Promise<ServiceHealth> {
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
    return {
      status: "missing",
      detail: "Not configured; Sarvam remains available",
    };
  }
  const started = performance.now();
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/voices/${env.ELEVENLABS_VOICE_ID}`,
      {
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
        signal: AbortSignal.timeout(5_000),
      },
    );
    return response.ok
      ? {
          status: "ok",
          latencyMs: Math.round(performance.now() - started),
          detail: "Authenticated voice ready",
        }
      : {
          status: "degraded",
          latencyMs: Math.round(performance.now() - started),
          detail: `Authentication or voice access failed (HTTP ${response.status}); Sarvam fallback remains ready`,
        };
  } catch {
    return {
      status: "degraded",
      latencyMs: Math.round(performance.now() - started),
      detail: "Connection failed; Sarvam fallback remains ready",
    };
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
    elevenlabs: await checkElevenLabs(),
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
