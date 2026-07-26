"use client";

import { useEffect, useState } from "react";

const steps = [
  { at: 0, label: "Reading and safety-checking your chapter" },
  { at: 8, label: "Designing three learning objectives" },
  { at: 24, label: "Reviewing spoken and visual VideoDB evidence" },
  { at: 50, label: "Writing the educational video script" },
  { at: 72, label: "Building the nine-scene storyboard" },
  { at: 92, label: "Planning diagrams, motion and captions" },
  { at: 108, label: "Composing and checking your lesson studio" },
];

export function GenerationProgress() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const active = steps.reduce(
    (current, step, index) =>
      elapsedSeconds >= step.at ? index : current,
    0,
  );
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");

  return (
    <section className="section">
      <div className="container">
        <div className="progress-card">
          <div className="volcano-loader" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24"><path d="m5 18 4-9 3 4 2-7 5 12H5Zm7-12 1-3m2 4 2-3" /></svg>
          </div>
          <div className="section-title">
            <span className="eyebrow">Adventure in progress</span>
            <h2>Your lesson film is taking shape.</h2>
            <p>
              KathaQuest is planning the pedagogy, reviewing VideoDB evidence,
              and turning the script into a programmable visual story.
            </p>
            <div className="progress-expectation">
              <strong aria-hidden="true">
                {minutes}:{seconds}
              </strong>
              <span>
                A new lesson usually takes about two minutes. Keep this tab
                open while the evidence is reviewed.
              </span>
            </div>
          </div>
          <div
            aria-label={`Current step: ${steps[active].label}`}
            aria-live="polite"
            className="progress-list"
            role="status"
          >
            {steps.map((step, index) => (
              <div
                className={`progress-step ${
                  index < active ? "done" : index === active ? "active" : ""
                }`}
                key={step.label}
              >
                <span className="step-icon">
                  {index < active ? (
                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m6 12 4 4 8-9" /></svg>
                  ) : index === active ? (
                    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /></svg>
                  ) : index + 1}
                </span>
                {step.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
