import { NextResponse } from "next/server";

import { extractChapterFromPdf } from "@/lib/chapter-parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
