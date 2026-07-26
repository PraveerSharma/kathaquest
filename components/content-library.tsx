import Link from "next/link";

import type { ChapterPackItem } from "@/lib/types";

export function ContentLibrary({
  chapters,
}: {
  chapters: ChapterPackItem[];
}) {
  return (
    <main className="container content-page" id="main-content">
      <section className="content-hero">
        <span className="eyebrow">KathaQuest chapter library</span>
        <h1>Choose the next world to explore.</h1>
        <p>
          Every chapter can become one continuous lesson film with Maya,
          diagrams, animation, reviewed real footage, captions, narration and
          a learning checkpoint.
        </p>
      </section>
      <section className="content-library" aria-label="Available chapters">
        {chapters.map((chapter, index) => (
          <article className={`content-library-card accent-${chapter.accent}`} key={chapter.id}>
            <span className="content-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <span className="chapter-subject">{chapter.subject}</span>
              <h2>{chapter.title}</h2>
              <p>{chapter.summary}</p>
              <div className="content-card-meta">
                <span>{chapter.ageRange}</span>
                <span>{chapter.pages} pages</span>
                <span>Hybrid video ready</span>
              </div>
              <Link
                className="primary-button inline-button"
                href={`/?chapter=${chapter.id}#builder`}
              >
                Build this lesson
              </Link>
            </div>
          </article>
        ))}
      </section>
      <section className="presentation-explainer">
        <div>
          <span className="eyebrow">What gets created</span>
          <h2>More than a playlist of clips.</h2>
        </div>
        <ol>
          <li><strong>Lesson plan</strong><span>Question, objectives and teaching arc</span></li>
          <li><strong>Video script</strong><span>Age-aware narration with a hook and recap</span></li>
          <li><strong>Storyboard</strong><span>Nine timed scenes, captions and transitions</span></li>
          <li><strong>Lesson film</strong><span>Real evidence plus diagrams, motion and Maya</span></li>
        </ol>
      </section>
    </main>
  );
}
