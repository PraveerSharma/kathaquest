import { LessonExperience } from "@/components/lesson-experience";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Shared lesson studio | KathaQuest",
  description:
    "Watch a shareable KathaQuest lesson film with its storyboard and activities.",
};

export default async function SharedLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to lesson</a>
      <SiteHeader active="lesson" />
      <LessonExperience lessonId={lessonId} />
      <SiteFooter />
    </div>
  );
}
