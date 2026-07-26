import { KathaQuestApp } from "@/components/kathaquest-app";
import chapterPackJson from "@/data/chapter-pack.json";
import type { ChapterPackItem } from "@/lib/types";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ chapter?: string }>;
}) {
  const { chapter } = await searchParams;
  return (
    <KathaQuestApp
      chapters={chapterPackJson as ChapterPackItem[]}
      initialChapterId={chapter}
    />
  );
}
