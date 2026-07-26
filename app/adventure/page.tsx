import { AdventureExperience } from "@/components/adventure-experience";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "My video adventure — KathaQuest",
  description:
    "Explore your saved evidence-backed video lesson, ask questions and play the quiz.",
};

export default function AdventurePage() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to my adventure</a>
      <SiteHeader active="adventure" />
      <AdventureExperience />
      <SiteFooter />
    </div>
  );
}
