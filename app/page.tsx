import { readFile } from "node:fs/promises";
import path from "node:path";

import { KathaQuestApp } from "@/components/kathaquest-app";

export default async function Home() {
  const sampleChapter = await readFile(
    path.join(process.cwd(), "data", "sample-volcano-chapter.txt"),
    "utf8",
  );
  return <KathaQuestApp sampleChapter={sampleChapter} />;
}
