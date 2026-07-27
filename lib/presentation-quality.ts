import type {
  Episode,
  LessonPresentation,
  PresentationQualityReport,
  StoryboardScene,
} from "@/lib/types";

const minimumFilmSeconds = 165;
const maximumFilmSeconds = 240;
const wordsPerSecond = 1.75;

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function wordCount(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function sentenceCount(text: string) {
  return Math.max(
    1,
    text.split(/[.!?।॥]+/u).map((item) => item.trim()).filter(Boolean)
      .length,
  );
}

function estimatedSpeechSeconds(text: string) {
  return (
    wordCount(text) / wordsPerSecond +
    Math.max(0, sentenceCount(text) - 1) * 0.28
  );
}

function preferredMotion(scene: StoryboardScene, index: number) {
  if (scene.type === "real_video") return "pan_zoom" as const;
  if (scene.visual.diagramTemplate === "orbit") return "orbit" as const;
  if (
    ["cycle", "process", "cause_effect"].includes(
      scene.visual.diagramTemplate,
    )
  ) {
    return "flow" as const;
  }
  if (scene.type === "animation") return "pulse" as const;
  return index % 2 === 0 ? ("reveal" as const) : ("pulse" as const);
}

function normalizedDuration(scene: StoryboardScene) {
  const spoken = estimatedSpeechSeconds(scene.narration);
  const visualHold =
    scene.type === "checkpoint" ? 7 : scene.type === "real_video" ? 4 : 3;
  const minimum =
    scene.type === "checkpoint" || scene.type === "recap" ? 20 : 16;
  return Math.round(clamp(Math.ceil(spoken + visualHold), minimum, 32));
}

function normalizeScenes(scenes: StoryboardScene[]) {
  const transitions: StoryboardScene["transition"][] = [
    "zoom",
    "slide",
    "fade",
    "wipe",
  ];
  const normalized = scenes.map((scene, index) => {
    const previous = scenes[index - 1];
    const motion =
      previous?.visual.motion === scene.visual.motion
        ? preferredMotion(scene, index)
        : scene.visual.motion;
    const transition =
      previous?.transition === scene.transition
        ? transitions[index % transitions.length]
        : scene.transition;
    const labels = [
      ...new Set(
        [
          ...scene.visual.labels,
          ...scene.keywords,
          scene.title,
        ].map((item) => item.trim()),
      ),
    ]
      .filter(Boolean)
      .slice(0, 5);
    const keywords = [...new Set(scene.keywords.map((item) => item.trim()))]
      .filter(Boolean)
      .slice(0, 4);
    const durationSeconds = normalizedDuration(scene);
    return {
      ...scene,
      durationSeconds,
      keywords,
      transition,
      visual: {
        ...scene.visual,
        labels,
        motion,
        footageEndSeconds:
          scene.visual.footageStartSeconds !== undefined &&
          scene.visual.footageEndSeconds !== undefined
            ? Math.min(
                scene.visual.footageEndSeconds,
                scene.visual.footageStartSeconds + durationSeconds,
              )
            : scene.visual.footageEndSeconds,
      },
    };
  });

  let total = normalized.reduce(
    (sum, scene) => sum + scene.durationSeconds,
    0,
  );
  const narrationSeconds = normalized.reduce(
    (sum, scene) => sum + estimatedSpeechSeconds(scene.narration),
    0,
  );
  const target = Math.round(
    clamp(narrationSeconds + 34, minimumFilmSeconds, maximumFilmSeconds),
  );
  let cursor = 0;
  while (total < target) {
    const index = cursor % normalized.length;
    if (normalized[index].durationSeconds < 32) {
      normalized[index] = {
        ...normalized[index],
        durationSeconds: normalized[index].durationSeconds + 1,
      };
      total += 1;
    }
    cursor += 1;
    if (cursor > normalized.length * 32) break;
  }
  return normalized;
}

function scorePresentation({
  episodes,
  scenes,
}: {
  episodes: Episode[];
  scenes: StoryboardScene[];
}): PresentationQualityReport {
  const teachingScenes = scenes.filter(
    (scene) => !["guide", "recap"].includes(scene.type),
  );
  const grounded = teachingScenes.filter(
    (scene) =>
      scene.evidenceRefs.length > 0 &&
      (scene.type !== "real_video" || Boolean(scene.visual.footageMediaUrl)),
  ).length;
  const grounding = Math.round((grounded / teachingScenes.length) * 100);

  const pacedScenes = scenes.filter((scene) => {
    const speech = estimatedSpeechSeconds(scene.narration);
    const ratio = speech / Math.max(1, scene.durationSeconds);
    return ratio >= 0.42 && ratio <= 0.92;
  }).length;
  const pacing = Math.round((pacedScenes / scenes.length) * 100);

  const uniqueTypes = new Set(scenes.map((scene) => scene.type)).size;
  const uniqueTemplates = new Set(
    scenes.map((scene) => scene.visual.diagramTemplate),
  ).size;
  const uniqueMotions = new Set(
    scenes.map((scene) => scene.visual.motion),
  ).size;
  const adjacentRepeats = scenes.filter(
    (scene, index) =>
      index > 0 &&
      scene.type === scenes[index - 1].type &&
      scene.visual.diagramTemplate ===
        scenes[index - 1].visual.diagramTemplate,
  ).length;
  const visualVariety = Math.round(
    clamp(
      uniqueTypes * 10 +
        uniqueTemplates * 7 +
        uniqueMotions * 5 -
        adjacentRepeats * 12,
    ),
  );

  const engagementSignals = [
    scenes.some((scene) => scene.type === "guide"),
    scenes.some((scene) => scene.type === "checkpoint"),
    scenes.some((scene) => scene.type === "recap"),
    scenes.some((scene) => scene.type === "animation"),
    episodes.some((episode) => episode.evidence.length > 0)
      ? scenes.some((scene) => scene.type === "real_video")
      : true,
    scenes.some((scene) => Boolean(scene.interactionPrompt)),
  ];
  const engagement = Math.round(
    (engagementSignals.filter(Boolean).length / engagementSignals.length) *
      100,
  );

  const readableScenes = scenes.filter(
    (scene) =>
      wordCount(scene.subtitle) <= 20 &&
      scene.keywords.length <= 4 &&
      scene.visual.labels.length >= 2 &&
      scene.visual.labels.length <= 5,
  ).length;
  const readability = Math.round((readableScenes / scenes.length) * 100);
  const overall = Math.round(
    clamp(
      grounding * 0.3 +
        pacing * 0.25 +
        visualVariety * 0.2 +
        engagement * 0.15 +
        readability * 0.1,
      0,
      98,
    ),
  );
  const issues = [
    ...(grounding < 90
      ? ["Some teaching scenes need stronger chapter or video evidence."]
      : []),
    ...(pacing < 80
      ? ["Some narration may feel rushed or leave too much silent time."]
      : []),
    ...(visualVariety < 75
      ? ["The visual rhythm needs more representation variety."]
      : []),
    ...(readability < 85
      ? ["Some captions or labels are too dense for quick reading."]
      : []),
  ];
  return {
    checks: [
      "Every teaching scene is checked for source grounding.",
      "Narration duration is balanced against scene time.",
      "Visual types, motion and transitions are checked for repetition.",
      "A curiosity hook, prediction pause and retrieval recap are required.",
    ],
    engagement,
    grounding,
    issues,
    overall,
    pacing,
    readability,
    tier:
      overall >= 88
        ? "excellent"
        : overall >= 76
          ? "strong"
          : "needs-review",
    visualVariety,
  };
}

export function improvePresentationQuality({
  episodes,
  presentation,
}: {
  episodes: Episode[];
  presentation: LessonPresentation;
}): LessonPresentation {
  const scenes = normalizeScenes(presentation.storyboard.scenes);
  const totalDurationSeconds = scenes.reduce(
    (sum, scene) => sum + scene.durationSeconds,
    0,
  );
  const fullNarration = scenes
    .map((scene) => scene.narration.trim())
    .filter(Boolean)
    .join("\n\n");
  return {
    ...presentation,
    plan: {
      ...presentation.plan,
      targetDurationSeconds: totalDurationSeconds,
    },
    quality: scorePresentation({ episodes, scenes }),
    script: {
      ...presentation.script,
      fullNarration,
      narrationWordCount: wordCount(fullNarration),
    },
    storyboard: {
      ...presentation.storyboard,
      scenes,
      totalDurationSeconds,
    },
  };
}
