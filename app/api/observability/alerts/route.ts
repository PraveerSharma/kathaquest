import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withSpan } from "@/lib/telemetry";

export const runtime = "nodejs";

function authorized(request: Request) {
  if (!env.SIGNOZ_WEBHOOK_USERNAME || !env.SIGNOZ_WEBHOOK_PASSWORD) {
    return false;
  }

  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(
    `${env.SIGNOZ_WEBHOOK_USERNAME}:${env.SIGNOZ_WEBHOOK_PASSWORD}`,
  ).toString("base64")}`;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);

  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return withSpan(
    "signoz.alert.webhook",
    {
      "alert.receiver": "kathaquest",
      "alert.status":
        typeof payload.status === "string" ? payload.status : "unknown",
    },
    async () => {
      logger.warn(
        {
          event: "signoz.alert.received",
          alertCount: Array.isArray(payload.alerts)
            ? payload.alerts.length
            : undefined,
          status: payload.status,
        },
        "SigNoz alert notification received",
      );
      return NextResponse.json({ accepted: true });
    },
  );
}
