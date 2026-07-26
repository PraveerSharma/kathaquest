import { AdventureExperience } from "@/components/adventure-experience";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Shared video adventure | KathaQuest",
  description:
    "Open a persistent, evidence-backed KathaQuest video lesson.",
};

export default async function SharedAdventurePage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to my adventure</a>
      <SiteHeader active="adventure" />
      <AdventureExperience lessonId={lessonId} />
      <SiteFooter />
    </div>
  );
}
