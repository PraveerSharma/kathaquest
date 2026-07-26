import { NextResponse } from "next/server";

import { extractChapterFromPdf } from "@/lib/chapter-parser";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, "pdf-extract", 10, 10 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Upload limit reached. Please try again shortly." },
      { status: 429 },
    );
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A PDF file is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(await extractChapterFromPdf(file));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not read the PDF",
      },
      { status: 422 },
    );
  }
}
