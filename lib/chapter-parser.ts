import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

import { withSpan } from "@/lib/telemetry";

const maxPdfBytes = 10 * 1024 * 1024;

export async function extractChapterFromPdf(file: File): Promise<{
  text: string;
  totalPages: number;
}> {
  return withSpan(
    "document.extract",
    {
      "document.content_type": file.type,
      "document.size": file.size,
    },
    async (span) => {
      if (file.type !== "application/pdf") {
        throw new Error("Please upload a PDF file");
      }
      if (file.size > maxPdfBytes) {
        throw new Error("PDF must be smaller than 10 MB");
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(bytes);
      const extracted = await extractText(pdf, { mergePages: false });
      const text = extracted.text
        .map((page, index) => `[Page ${index + 1}]\n${page}`)
        .join("\n\n");
      const normalized = text.replace(/\u0000/g, "").trim();
      if (normalized.length < 100) {
        throw new Error(
          "This PDF contains too little selectable text. Please use a text-based PDF.",
        );
      }
      span.setAttributes({
        "document.page_count": extracted.totalPages,
        "chapter.character_count": normalized.length,
      });
      return { text: normalized, totalPages: extracted.totalPages };
    },
  );
}
