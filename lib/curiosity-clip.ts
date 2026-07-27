import "server-only";

import { createHash } from "node:crypto";

import { improvePresentationQuality } from "@/lib/presentation-quality";
import type {
  LearningConcept,
  LessonLanguage,
  LessonPresentation,
} from "@/lib/types";

export function curiosityClipId({
  language,
  lessonId,
  question,
}: {
  language: LessonLanguage;
  lessonId: string;
  question: string;
}) {
  const normalized = question.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
  return `curiosity-${createHash("sha256")
    .update(`${lessonId}:${language}:${normalized}`)
    .digest("hex")
    .slice(0, 20)}`;
}

function words(text: string, count: number) {
  return text.trim().split(/\s+/u).slice(0, count).join(" ");
}

function matchingConcept(
  concepts: LearningConcept[],
  question: string,
) {
  const questionTerms = new Set(
    question
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length > 3),
  );
  return (
    concepts
      .map((concept) => ({
        concept,
        score: `${concept.title} ${concept.learningObjective}`
          .toLocaleLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((term) => questionTerms.has(term)).length,
      }))
      .sort((left, right) => right.score - left.score)[0]?.concept ??
    concepts[0]
  );
}

export function createFallbackCuriosityPresentation({
  ageGroup,
  answer,
  concepts,
  question,
}: {
  ageGroup: string;
  answer: string;
  concepts: LearningConcept[];
  language: LessonLanguage;
  question: string;
}): LessonPresentation {
  const concept = matchingConcept(concepts, question);
  const explanation = words(concept?.explanation ?? answer, 58);
  const firstHalf = words(explanation, 29);
  const secondHalf = explanation
    .split(/\s+/u)
    .slice(29, 58)
    .join(" ");
  const labels = [
    concept?.title ?? "Big idea",
    ...(concept?.learningObjective.split(/\s+/u).slice(0, 4) ?? [
      "Observe",
      "Connect",
    ]),
  ].slice(0, 5);
  const scenes = [
    {
      id: "curiosity-scene-1",
      type: "guide" as const,
      conceptId: concept?.id,
      title: question,
      narration: `${question} ${words(answer, 18)}`,
      subtitle: question,
      durationSeconds: 10,
      keywords: labels.slice(0, 3),
      transition: "zoom" as const,
      visual: {
        diagramTemplate: "concept_map" as const,
        labels,
        motion: "reveal" as const,
      },
      evidenceRefs: concept ? [`chapter:${concept.id}`] : [],
    },
    {
      id: "curiosity-scene-2",
      type: "diagram" as const,
      conceptId: concept?.id,
      title: concept?.title ?? "Build the idea",
      narration: firstHalf,
      subtitle: concept?.learningObjective ?? answer,
      durationSeconds: 13,
      keywords: labels.slice(0, 3),
      transition: "slide" as const,
      visual: {
        diagramTemplate: "cause_effect" as const,
        labels,
        motion: "flow" as const,
      },
      evidenceRefs: concept ? [`chapter:${concept.id}`] : [],
    },
    {
      id: "curiosity-scene-3",
      type: "animation" as const,
      conceptId: concept?.id,
      title: "See the process",
      narration: secondHalf || firstHalf,
      subtitle: answer,
      durationSeconds: 13,
      keywords: labels.slice(0, 3),
      transition: "wipe" as const,
      visual: {
        diagramTemplate: "process" as const,
        labels,
        motion: "pulse" as const,
      },
      evidenceRefs: concept ? [`chapter:${concept.id}`] : [],
    },
    {
      id: "curiosity-scene-4",
      type: "checkpoint" as const,
      conceptId: concept?.id,
      title: "Your turn",
      narration: `${answer} ${words(concept?.learningObjective ?? question, 15)}`,
      subtitle: answer,
      durationSeconds: 12,
      keywords: labels.slice(0, 3),
      transition: "fade" as const,
      visual: {
        diagramTemplate: "concept_map" as const,
        labels,
        motion: "reveal" as const,
      },
      evidenceRefs: concept ? [`chapter:${concept.id}`] : [],
      interactionPrompt: question,
    },
  ];
  const fullNarration = scenes.map((scene) => scene.narration).join("\n\n");
  return improvePresentationQuality({
    episodes: [],
    format: "curiosity",
    presentation: {
      schemaVersion: "presentation-v1",
      promptVersion: "curiosity-clip-fallback-v1",
      guide: { name: "Maya", role: "curious explorer" },
      plan: {
        version: "lesson-plan-v1",
        title: concept?.title ?? "Your visual answer",
        bigQuestion: question,
        audience: ageGroup,
        targetDurationSeconds: 48,
        learningObjectives: concept
          ? [
              {
                conceptId: concept.id,
                objective: concept.learningObjective,
                sourceQuote: concept.sourceQuote,
              },
            ]
          : [],
        teachingArc: scenes.map((scene) => scene.title),
      },
      script: {
        version: "video-script-v1",
        hook: question,
        fullNarration,
        narrationWordCount: fullNarration.split(/\s+/u).filter(Boolean).length,
        closingLine: answer,
      },
      storyboard: {
        version: "storyboard-v1",
        fps: 30,
        width: 1280,
        height: 720,
        totalDurationSeconds: 48,
        scenes,
      },
    },
  });
}
