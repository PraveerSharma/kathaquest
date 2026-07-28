import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { getCloudObservabilitySummary } from "@/lib/signoz-cloud";
import { withSpan } from "@/lib/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withSpan(
    "observability.summary",
    { "observability.backend": "signoz" },
    async (span) => {
      try {
        if (
          env.SIGNOZ_API_KEY &&
          env.SIGNOZ_MCP_URL.includes("signoz.cloud")
        ) {
          const summary = await getCloudObservabilitySummary();
          span.setAttribute("observability.available", true);
          span.setAttribute("observability.source", "signoz-cloud");
          return NextResponse.json(summary, {
            headers: {
              "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
            },
          });
        }

        const response = await fetch(
          new URL("/public/observability", env.SIGNOZ_URL),
          {
            cache: "no-store",
            signal: AbortSignal.timeout(6_000),
          },
        );
        if (!response.ok) {
          span.setAttribute("observability.available", false);
          return NextResponse.json(
            {
              status: "unavailable",
              message: "Live telemetry is reconnecting.",
            },
            { status: 503 },
          );
        }

        const summary = (await response.json()) as Record<string, unknown>;
        span.setAttribute("observability.available", true);
        return NextResponse.json(summary, {
          headers: { "Cache-Control": "no-store" },
        });
      } catch {
        span.setAttribute("observability.available", false);
        return NextResponse.json(
          {
            status: "unavailable",
            message: "Live telemetry is reconnecting.",
          },
          { status: 503 },
        );
      }
    },
  );
}
