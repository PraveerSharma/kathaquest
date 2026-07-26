import type {
  Episode,
  LearningConcept,
  LessonLanguage,
  LessonPresentation,
  StoryboardScene,
} from "@/lib/types";

function words(text: string, start: number, count: number) {
  return text.trim().split(/\s+/).slice(start, start + count).join(" ");
}

function templateFor(value: string): StoryboardScene["visual"]["diagramTemplate"] {
  const normalized = value.toLocaleLowerCase();
  if (/cycle|stage|journey|metamorph/.test(normalized)) return "cycle";
  if (/layer|inside|part|structure/.test(normalized)) return "layers";
  if (/planet|orbit|solar|moon/.test(normalized)) return "orbit";
  if (/different|compare|versus|type/.test(normalized)) return "comparison";
  if (/cause|why|because|effect/.test(normalized)) return "cause_effect";
  return "process";
}

function labelsFor(concept: LearningConcept) {
  const candidates = [
    concept.title,
    ...concept.learningObjective
      .split(/[,.;:]|\band\b/gi)
      .map((item) => item.trim()),
  ].filter((item) => item.length > 1);
  return [...new Set(candidates)].slice(0, 4);
}

export function createFallbackPresentation({
  title,
  ageGroup,
  concepts,
  episodes,
}: {
  title: string;
  ageGroup: string;
  language: LessonLanguage;
  concepts: LearningConcept[];
  episodes: Episode[];
}): LessonPresentation {
  const scenes: StoryboardScene[] = [
    {
      id: "scene-1",
      type: "guide",
      title,
      narration: `Hello, explorer! I am Maya. Today we will investigate ${title}. Keep your eyes open for three clues, because each one will help us answer a big question about how this idea works.`,
      subtitle: `Maya’s mission: investigate ${title}`,
      durationSeconds: 20,
      keywords: ["observe", "wonder", "discover"],
      transition: "zoom",
      visual: {
        diagramTemplate: "concept_map",
        labels: concepts.map((concept) => concept.title),
        motion: "reveal",
      },
      evidenceRefs: [],
    },
  ];

  concepts.forEach((concept, index) => {
    const episode = episodes[index];
    const evidence = episode.evidence[0];
    const firstSceneNumber = index * 2 + 2;
    const labels = labelsFor(concept);
    scenes.push({
      id: `scene-${firstSceneNumber}`,
      type: index % 2 === 0 ? "diagram" : "animation",
      conceptId: concept.id,
      title: concept.title,
      narration: words(concept.explanation, 0, 52),
      subtitle: concept.learningObjective,
      durationSeconds: 24,
      keywords: labels.slice(0, 3),
      transition: index % 2 === 0 ? "slide" : "wipe",
      visual: {
        diagramTemplate: templateFor(
          `${concept.title} ${concept.learningObjective}`,
        ),
        labels,
        motion: index % 2 === 0 ? "flow" : "pulse",
      },
      evidenceRefs: [`chapter:${concept.id}`],
    });
    scenes.push({
      id: `scene-${firstSceneNumber + 1}`,
      type: evidence?.mediaUrl ? "real_video" : "diagram",
      conceptId: concept.id,
      title: `See it: ${concept.title}`,
      narration: words(concept.explanation, 52, 42),
      subtitle: episode.whyThisClip,
      durationSeconds: 22,
      keywords: labels.slice(0, 3),
      transition: "fade",
      visual: {
        diagramTemplate: templateFor(concept.title),
        labels,
        motion: evidence?.mediaUrl ? "pan_zoom" : "reveal",
        footageEpisodeId: evidence?.mediaUrl ? episode.id : undefined,
        footageMediaUrl: evidence?.mediaUrl,
        footageStartSeconds: evidence?.startSeconds,
        footageEndSeconds: evidence?.mediaUrl
          ? Math.min(evidence.endSeconds, evidence.startSeconds + 22)
          : undefined,
      },
      evidenceRefs: evidence
        ? [
            `${evidence.videoId}:${evidence.startSeconds.toFixed(1)}-${evidence.endSeconds.toFixed(1)}`,
          ]
        : [`chapter:${concept.id}`],
    });
  });

  scenes.push(
    {
      id: "scene-8",
      type: "checkpoint",
      title: "Pause and predict",
      narration:
        "Pause for a moment and make a prediction. Which of the three ideas would you use first to explain the lesson to a friend, and what evidence would you show them?",
      subtitle: "What would you explain first—and why?",
      durationSeconds: 18,
      keywords: ["predict", "explain", "evidence"],
      transition: "slide",
      visual: {
        diagramTemplate: "concept_map",
        labels: concepts.map((concept) => concept.title),
        motion: "pulse",
      },
      evidenceRefs: concepts.map((concept) => `chapter:${concept.id}`),
      interactionPrompt:
        "Choose one idea and explain it aloud before continuing.",
    },
    {
      id: "scene-9",
      type: "recap",
      title: "Maya’s explorer recap",
      narration: `Excellent exploring! We connected ${concepts.map((concept) => concept.title).join(", ")}. Replay any scene that still feels mysterious, then try the quiz to see which idea is ready and which one deserves another adventure.`,
      subtitle: "Three ideas connected—now test your understanding.",
      durationSeconds: 22,
      keywords: concepts.map((concept) => concept.title).slice(0, 3),
      transition: "fade",
      visual: {
        diagramTemplate: "concept_map",
        labels: concepts.map((concept) => concept.title),
        motion: "reveal",
      },
      evidenceRefs: concepts.map((concept) => `chapter:${concept.id}`),
    },
  );

  const fullNarration = scenes.map((scene) => scene.narration).join(" ");
  const totalDurationSeconds = scenes.reduce(
    (total, scene) => total + scene.durationSeconds,
    0,
  );
  return {
    schemaVersion: "presentation-v1",
    promptVersion: "deterministic-fallback-v1",
    guide: { name: "Maya", role: "curious explorer" },
    plan: {
      version: "lesson-plan-v1",
      title,
      bigQuestion: `How do the three big ideas in ${title} connect?`,
      audience: ageGroup,
      targetDurationSeconds: totalDurationSeconds,
      learningObjectives: concepts.map((concept) => ({
        conceptId: concept.id,
        objective: concept.learningObjective,
        sourceQuote: concept.sourceQuote,
      })),
      teachingArc: [
        "Spark curiosity",
        "Build a visual model",
        "Connect the model to real evidence",
        "Pause and predict",
        "Recap and retrieve",
      ],
    },
    script: {
      version: "video-script-v1",
      hook: scenes[0].narration,
      fullNarration,
      narrationWordCount: fullNarration.split(/\s+/).filter(Boolean).length,
      closingLine: scenes.at(-1)?.narration ?? "",
    },
    storyboard: {
      version: "storyboard-v1",
      fps: 30,
      width: 1280,
      height: 720,
      totalDurationSeconds,
      scenes,
    },
  };
}
