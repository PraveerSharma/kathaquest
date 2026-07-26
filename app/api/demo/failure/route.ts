import { NextResponse } from "next/server";

import {
  armElevenLabsFailure,
  isElevenLabsFailureArmed,
} from "@/lib/demo-state";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST() {
  if (env.DEMO_MODE !== "true") {
    return NextResponse.json(
      { error: "Demo controls are disabled" },
      { status: 403 },
    );
  }
  armElevenLabsFailure();
  return NextResponse.json({
    armed: isElevenLabsFailureArmed(),
    message: "The next narration will simulate a primary voice-provider failure.",
  });
}
