import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeElevenLabsFailure } from "@/lib/demo-state";
import { generateNarration } from "@/lib/narration-router";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  text: z.string().min(1).max(5_000),
  language: z.enum(["en-IN", "hi-IN"]),
  forceFailure: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
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
      { status: 500 },
    );
  }
}
