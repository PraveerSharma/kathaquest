import { ContentLibrary } from "@/components/content-library";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import chapterPackJson from "@/data/chapter-pack.json";
import type { ChapterPackItem } from "@/lib/types";

export const metadata = {
  title: "Explore chapters | KathaQuest",
  description: "Choose a chapter and turn it into an interactive lesson film.",
};

export default function ContentPage() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to chapters</a>
      <SiteHeader active="content" />
      <ContentLibrary chapters={chapterPackJson as ChapterPackItem[]} />
      <SiteFooter />
    </div>
  );
}
