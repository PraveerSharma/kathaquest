"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { GenerationProgress } from "@/components/generation-progress";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { saveLessonSession } from "@/lib/client-lesson";
import { lessonLanguages } from "@/lib/languages";
import type {
  ChapterPackItem,
  LessonLanguage,
  LessonResponse,
} from "@/lib/types";

function BookIcon({ id }: { id: string }) {
  const paths: Record<string, React.ReactNode> = {
    volcanoes: <path d="m5 18 4-9 3 4 2-7 5 12H5Zm7-12 1-3m2 4 2-3" />,
    "water-cycle": <path d="M12 3s6 6 6 11a6 6 0 1 1-12 0c0-5 6-11 6-11Zm-3 12a3 3 0 0 0 3 3" />,
    "solar-system": <path d="M12 5a7 7 0 1 0 7 7M4 9c4 3 11 6 16 3s-3-7-7-8m6 1h.01" />,
    butterfly: <path d="M12 10c-2-5-8-6-8-1 0 3 4 5 8 5m0-4c2-5 8-6 8-1 0 3-4 5-8 5m0-4v9m-2-1h4" />,
    photosynthesis: <path d="M12 21V10m0 4c-5 0-8-3-8-8 5 0 8 3 8 8Zm0 3c5 0 8-3 8-8-5 0-8 3-8 8Z" />,
  };
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[id]}
      </g>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="check-icon" fill="none" viewBox="0 0 24 24">
      <path d="m6 12 4 4 8-9" />
    </svg>
  );
}

export function KathaQuestApp({
  chapters,
  initialChapterId,
}: {
  chapters: ChapterPackItem[];
  initialChapterId?: string;
}) {
  const router = useRouter();
  const initialChapter = chapters.find(
    (chapter) => chapter.id === initialChapterId,
  );
  const personalizeRef = useRef<HTMLDivElement>(null);
  const [chapterText, setChapterText] = useState(initialChapter?.text ?? "");
  const [sourceLabel, setSourceLabel] = useState<string | undefined>(
    initialChapter
      ? `${initialChapter.title} • ${initialChapter.pages} pages`
      : undefined,
  );
  const [sourceKind, setSourceKind] =
    useState<"chapter-pack" | "uploaded-pdf">("chapter-pack");
  const [ageGroup, setAgeGroup] = useState("8-10");
  const [language, setLanguage] = useState<LessonLanguage>("hi-IN");
  const [phase, setPhase] = useState<"input" | "generating">("input");
  const [error, setError] = useState<string>();
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const readyTimer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(readyTimer);
  }, []);

  function chooseChapter(chapter: ChapterPackItem) {
    setChapterText(chapter.text);
    setSourceLabel(`${chapter.title} • ${chapter.pages} pages`);
    setSourceKind("chapter-pack");
    setError(undefined);
    if (window.innerWidth <= 700) {
      window.setTimeout(
        () =>
          personalizeRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        100,
      );
    }
  }

  async function uploadPdf(file?: File) {
    if (!file) return;
    setExtractingPdf(true);
    setError(undefined);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/chapters/extract", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        text?: string;
        totalPages?: number;
        error?: string;
      };
      if (!response.ok || !result.text) {
        throw new Error(result.error ?? "Could not read PDF");
      }
      setChapterText(result.text);
      setSourceLabel(`${file.name} • ${result.totalPages} pages`);
      setSourceKind("uploaded-pdf");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read PDF");
    } finally {
      setExtractingPdf(false);
    }
  }

  async function generate() {
    if (chapterText.length < 100) {
      setError("Choose a chapter or upload a text-based PDF first.");
      return;
    }
    setPhase("generating");
    setError(undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const response = await fetch("/api/lessons/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chapterText, ageGroup, language, sourceKind }),
      });
      const result = (await response.json()) as Partial<LessonResponse> & {
        error?: string;
      };
      if (!response.ok || !result.lesson || !result.lessonToken) {
        throw new Error(result.error ?? "Lesson generation failed");
      }
      saveLessonSession({
        lesson: result.lesson,
        lessonToken: result.lessonToken,
      });
      router.push("/adventure");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Lesson generation failed",
      );
      setPhase("input");
    }
  }

  return (
    <div className="app-shell" data-ready={hydrated}>
      <a className="skip-link" href="#main-content">Skip to the adventure</a>
      <SiteHeader active="home" />

      {phase === "input" ? (
        <main className="container" id="main-content">
          <section className="hero" id="top">
            <div className="hero-copy">
              <span className="eyebrow">Books become adventures</span>
              <h1>
                Turn any chapter into a <span className="highlight">video quest.</span>
              </h1>
              <p className="hero-subtitle">
                Pick a story or bring your own PDF. KathaQuest plans the
                lesson, writes the script, builds a storyboard, and combines
                diagrams, animation, Maya and reviewed real footage into one
                interactive film.
              </p>
              <div className="feature-row" aria-label="Product benefits">
                <span><b>1</b> Source-grounded</span>
                <span><b>2</b> 11 Indian languages</span>
                <span><b>3</b> One complete lesson film</span>
              </div>
            </div>

            <aside className="journey-card" aria-label="How KathaQuest works">
              <span className="journey-label">Your three-step quest</span>
              <ol className="journey-steps">
                <li><span>1</span><div><strong>Choose</strong><small>A chapter or your PDF</small></div></li>
                <li><span>2</span><div><strong>Personalize</strong><small>Age and language</small></div></li>
                <li><span>3</span><div><strong>Explore</strong><small>Watch, ask, and play</small></div></li>
              </ol>
            </aside>
          </section>

          <section className="quest-builder" aria-labelledby="builder-title">
            <div className="builder-heading">
              <div>
                <span className="eyebrow">Step 1 · Choose</span>
                <h2 id="builder-title">Where should we explore?</h2>
                <p>Five original chapter stories are ready, or upload any text-based PDF.</p>
              </div>
              <span className="safety-note">
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m7 11 3 3 7-7m4 5c0 5-3.4 8.5-9 10-5.6-1.5-9-5-9-10V5l9-3 9 3v7Z" /></svg>
                Input and output safety checked
              </span>
            </div>

            <div className="chapter-grid">
              {chapters.map((chapter) => {
                const selected =
                  sourceKind === "chapter-pack" &&
                  sourceLabel?.startsWith(chapter.title);
                return (
                  <button
                    aria-pressed={selected}
                    className={`chapter-card accent-${chapter.accent} ${selected ? "selected" : ""}`}
                    disabled={!hydrated}
                    key={chapter.id}
                    onClick={() => chooseChapter(chapter)}
                    type="button"
                  >
                    <span className="chapter-icon"><BookIcon id={chapter.id} /></span>
                    <span className="chapter-subject">{chapter.subject}</span>
                    <strong>{chapter.title}</strong>
                    <small>{chapter.summary}</small>
                    <span className="chapter-meta">{chapter.ageRange} · {chapter.pages} pages</span>
                  </button>
                );
              })}
            </div>

            <div className="builder-controls" ref={personalizeRef}>
              <label className="upload-zone">
                <input
                  accept="application/pdf"
                  disabled={!hydrated}
                  onChange={(event) => uploadPdf(event.target.files?.[0])}
                  type="file"
                />
                <span className="upload-icon" aria-hidden="true">
                  <svg fill="none" viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5" /></svg>
                </span>
                <span>
                  <strong>{extractingPdf ? "Reading your PDF…" : "Upload your own chapter"}</strong>
                  <small>Text-based PDF · up to 10 MB</small>
                </span>
              </label>

              <div className="personalize-card">
                <span className="eyebrow">Step 2 · Personalize</span>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="age">Explorer age</label>
                    <select id="age" onChange={(event) => setAgeGroup(event.target.value)} value={ageGroup}>
                      <option value="6-8">6–8 years</option>
                      <option value="8-10">8–10 years</option>
                      <option value="10-12">10–12 years</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="language">Adventure language</label>
                    <select id="language" onChange={(event) => setLanguage(event.target.value as LessonLanguage)} value={language}>
                      {lessonLanguages.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label} · {item.englishName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="selection-summary" aria-live="polite">
                  {sourceLabel ? <><span className="selection-check"><CheckIcon /></span><span><strong>Ready:</strong> {sourceLabel}</span></> : <span>Choose a chapter to continue.</span>}
                </div>
                <button className="primary-button full" disabled={extractingPdf || !chapterText} onClick={generate} type="button">
                  Create my video adventure
                  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
                </button>
                {error ? <div className="form-error" role="alert">{error}</div> : null}
              </div>
            </div>
          </section>
        </main>
      ) : null}

      {phase === "generating" ? <GenerationProgress /> : null}

      <SiteFooter />
    </div>
  );
}
