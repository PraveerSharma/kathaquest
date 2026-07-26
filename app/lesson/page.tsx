import { LessonExperience } from "@/components/lesson-experience";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "My lesson studio — KathaQuest",
  description:
    "Watch one continuous interactive lesson film made from script, diagrams, animation and real evidence.",
};

export default function LessonPage() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to lesson</a>
      <SiteHeader active="lesson" />
      <LessonExperience />
      <SiteFooter />
    </div>
  );
}
