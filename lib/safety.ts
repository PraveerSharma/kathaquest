import "server-only";

import OpenAI from "openai";

import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

let client: OpenAI | undefined;

function openai(): OpenAI {
  client ??= new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return client;
}

const blockedCategories = [
  "sexual/minors",
  "sexual",
  "self-harm/intent",
  "self-harm/instructions",
  "hate/threatening",
  "violence/graphic",
  "illicit/violent",
] as const;

export async function assertKidSafeText(
  text: string,
  context: "chapter" | "question" | "answer",
): Promise<void> {
  const response = await openai().moderations.create({
    model: "omni-moderation-latest",
    input: text.slice(0, 30_000),
  });
  const result = response.results[0];
  const categories = result?.categories as unknown as Record<string, boolean>;
  const blocked = blockedCategories.filter((category) => categories?.[category]);

  logger.info(
    {
      event: "safety.moderated",
      context,
      flagged: result?.flagged ?? false,
      blockedCategories: blocked,
    },
    "Content safety check completed",
  );

  if (blocked.length > 0) {
    throw new Error(
      context === "chapter"
        ? "This chapter is not suitable for a child-friendly learning quest."
        : "That request cannot be used in a child-friendly learning quest.",
    );
  }
}
