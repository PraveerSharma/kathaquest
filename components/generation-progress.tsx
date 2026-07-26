"use client";

import { useEffect, useState } from "react";

const steps = [
  "Reading your chapter",
  "Finding three key ideas",
  "Reviewing spoken and visual evidence",
  "Stitching useful lesson reels",
  "Preparing the lesson",
  "Finishing your adventure",
];

export function GenerationProgress() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((current) => Math.min(current + 1, steps.length - 1));
    }, 4_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="section" aria-live="polite">
      <div className="container">
        <div className="progress-card">
          <div className="volcano-loader" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24"><path d="m5 18 4-9 3 4 2-7 5 12H5Zm7-12 1-3m2 4 2-3" /></svg>
          </div>
          <div className="section-title">
            <span className="eyebrow">Adventure in progress</span>
            <h2>Real footage, coming right up.</h2>
            <p>
              VideoDB is searching speech and scenes across the reviewed,
              all-ages archive. This can take a minute.
            </p>
          </div>
          <div className="progress-list">
            {steps.map((step, index) => (
              <div
                className={`progress-step ${
                  index < active ? "done" : index === active ? "active" : ""
                }`}
                key={step}
              >
                <span className="step-icon">
                  {index < active ? (
                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m6 12 4 4 8-9" /></svg>
                  ) : index === active ? (
                    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /></svg>
                  ) : index + 1}
                </span>
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
