import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeElevenLabsFailure } from "@/lib/demo-state";
import { generateNarration } from "@/lib/narration-router";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertKidSafeText } from "@/lib/safety";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  text: z.string().min(1).max(5_000),
  language: z.enum(["en-IN", "hi-IN"]),
  forceFailure: z.boolean().optional(),
});

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, "narration", 30, 10 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Narration limit reached. Please try again shortly." },
      { status: 429 },
    );
  }
  try {
    const input = requestSchema.parse(await request.json());
    await assertKidSafeText(input.text, "answer");
    const forced =
      input.forceFailure === true || consumeElevenLabsFailure();
    return NextResponse.json(
      await generateNarration({
        text: input.text,
        language: input.language,
        forceFailure: forced,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Narration generation failed",
      },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
