"use client";

import { useRef, useState } from "react";

import { EpisodeCard } from "@/components/episode-card";
import { GenerationProgress } from "@/components/generation-progress";
import { ObservabilityPanel } from "@/components/observability-panel";
import { Quiz } from "@/components/quiz";
import { VoiceQuestion } from "@/components/voice-question";
import type { Lesson, LessonLanguage } from "@/lib/types";

export function KathaQuestApp({ sampleChapter }: { sampleChapter: string }) {
  const lessonRef = useRef<HTMLElement>(null);
  const [chapterText, setChapterText] = useState("");
  const [sourceLabel, setSourceLabel] = useState<string>();
  const [ageGroup, setAgeGroup] = useState("8-10");
  const [language, setLanguage] = useState<LessonLanguage>("hi-IN");
  const [phase, setPhase] = useState<"input" | "generating" | "lesson">(
    "input",
  );
  const [lesson, setLesson] = useState<Lesson>();
  const [error, setError] = useState<string>();
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  function chooseSample() {
    setChapterText(sampleChapter);
    setSourceLabel("Volcanoes: Mountains That Can Erupt");
    setError(undefined);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read PDF");
    } finally {
      setExtractingPdf(false);
    }
  }

  async function generate() {
    if (chapterText.length < 100) {
      setError("Choose the demo chapter or upload a text-based PDF first.");
      return;
    }
    setPhase("generating");
    setError(undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const response = await fetch("/api/lessons/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chapterText, ageGroup, language }),
      });
      const result = (await response.json()) as {
        lesson?: Lesson;
        error?: string;
      };
      if (!response.ok || !result.lesson) {
        throw new Error(result.error ?? "Lesson generation failed");
      }
      setLesson(result.lesson);
      setPhase("lesson");
      window.setTimeout(
        () => lessonRef.current?.scrollIntoView({ behavior: "smooth" }),
        100,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Lesson generation failed",
      );
      setPhase("input");
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header container">
        <a className="brand" href="#top">
          <span className="brand-mark">K</span>
          KathaQuest
        </a>
        <div className="header-actions">
          <span className="trust-pill">
            <span className="dot" /> Real, trusted footage
          </span>
          <a className="ghost-button" href="#observability">
            Observe the agent
          </a>
        </div>
      </header>

      {phase === "input" ? (
        <main className="container" id="top">
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">Books become adventures</span>
              <h1>
                Turn chapters into <span className="highlight">video quests.</span>
              </h1>
              <p className="hero-subtitle">
                KathaQuest finds the exact moments inside real educational
                footage, then turns them into a playful lesson in English or
                Hindi.
              </p>
              <div className="feature-row">
                <span>
                  <b>✓</b> Real USGS footage
                </span>
                <span>
                  <b>✓</b> English + हिंदी
                </span>
                <span>
                  <b>✓</b> Evidence with every answer
                </span>
              </div>
            </div>

            <div className="adventure-card">
              <h2>Start your adventure</h2>
              <p>Choose our demo chapter or bring a text-based PDF.</p>
              <button
                className="sample-button"
                onClick={chooseSample}
                type="button"
              >
                <span className="sample-icon">🌋</span>
                <span>
                  <strong>Use the volcano demo chapter</strong>
                  <small>Perfect for the first quest • about 2 minutes</small>
                </span>
              </button>
              <div className="divider">or upload a chapter</div>
              <label className="upload-zone">
                <input
                  accept="application/pdf"
                  onChange={(event) => uploadPdf(event.target.files?.[0])}
                  type="file"
                />
                <strong>
                  {extractingPdf ? "Reading your PDF…" : "Drop in a PDF chapter"}
                </strong>
                <small>Text-based PDF • maximum 10 MB</small>
                {sourceLabel ? (
                  <span className="selected-file">✓ {sourceLabel}</span>
                ) : null}
              </label>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="age">Explorer age</label>
                  <select
                    id="age"
                    onChange={(event) => setAgeGroup(event.target.value)}
                    value={ageGroup}
                  >
                    <option value="6-8">6–8 years</option>
                    <option value="8-10">8–10 years</option>
                    <option value="10-12">10–12 years</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="language">Adventure language</label>
                  <select
                    id="language"
                    onChange={(event) =>
                      setLanguage(event.target.value as LessonLanguage)
                    }
                    value={language}
                  >
                    <option value="hi-IN">हिंदी</option>
                    <option value="en-IN">English</option>
                  </select>
                </div>
              </div>
              <button
                className="primary-button full"
                disabled={extractingPdf}
                onClick={generate}
                type="button"
              >
                Create my video adventure <span>→</span>
              </button>
              {error ? <div className="form-error">{error}</div> : null}
            </div>
            <span className="scribble star" aria-hidden="true">
              ✦
            </span>
            <span className="scribble spark" aria-hidden="true">
              ≋
            </span>
          </section>
        </main>
      ) : null}

      {phase === "generating" ? <GenerationProgress /> : null}

      {phase === "lesson" && lesson ? (
        <main className="lesson-wrap" ref={lessonRef}>
          <div className="container">
            <div className="lesson-heading">
              <div>
                <span className="eyebrow">Your video adventure is ready</span>
                <h1>{lesson.title}</h1>
                <p>
                  Three big ideas, explained with moments retrieved from real
                  educational footage.
                </p>
              </div>
              <button
                className="ghost-button"
                onClick={() => {
                  setLesson(undefined);
                  setPhase("input");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                type="button"
              >
                Make another quest
              </button>
            </div>

            <div className="episode-grid">
              {lesson.episodes.map((episode, index) => (
                <EpisodeCard
                  episode={episode}
                  index={index}
                  key={episode.id}
                  language={lesson.language}
                  onFallback={() => setFallbackUsed(true)}
                />
              ))}
            </div>

            <div className="interactive-grid">
              <VoiceQuestion lessonId={lesson.id} />
              <Quiz concepts={lesson.concepts} lessonId={lesson.id} />
            </div>

            <ObservabilityPanel
              fallbackUsed={fallbackUsed}
              lesson={lesson}
            />
          </div>
        </main>
      ) : null}

      <footer className="footer">
        <div className="container">
          Real public-domain media • VideoDB retrieval • Sarvam AI voice •
          OpenTelemetry + SigNoz observability
        </div>
      </footer>
    </div>
  );
}
