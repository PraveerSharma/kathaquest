"use client";

import { useEffect, useState } from "react";

const steps = [
  "Reading your chapter",
  "Finding three key ideas",
  "Searching real educational videos",
  "Creating your episodes",
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
            🌋
          </div>
          <div className="section-title">
            <span className="eyebrow">Adventure in progress</span>
            <h2>Real footage, coming right up.</h2>
            <p>
              VideoDB is searching speech and scenes across the trusted USGS
              archive. This can take a minute.
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
                  {index < active ? "✓" : index === active ? "●" : index + 1}
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
