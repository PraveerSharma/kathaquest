"use client";

import { Player } from "@remotion/player";

import { LessonComposition } from "@/components/presentation/lesson-composition";
import type {
  Episode,
  LessonPresentation,
  StoryboardScene,
} from "@/lib/types";

function fallbackScene(episode: Episode): StoryboardScene {
  return {
    id: `visual-${episode.id}`,
    type: "diagram",
    conceptId: episode.conceptId,
    title: episode.title,
    narration: episode.explanation,
    subtitle: episode.whyThisClip,
    durationSeconds: 55,
    keywords: episode.title.split(/\s+/).slice(0, 3),
    transition: "fade",
    visual: {
      diagramTemplate: "process",
      labels: [episode.title, "Observe", "Connect"],
      motion: "flow",
    },
    evidenceRefs: [`chapter:${episode.conceptId}`],
  };
}

function episodePresentation(
  episode: Episode,
  presentation?: LessonPresentation,
): LessonPresentation {
  const matchingScenes =
    presentation?.storyboard.scenes.filter(
      (scene) => scene.conceptId === episode.conceptId,
    ) ?? [];
  const scenes = matchingScenes.length > 0 ? matchingScenes : [fallbackScene(episode)];
  const totalDurationSeconds = scenes.reduce(
    (total, scene) => total + scene.durationSeconds,
    0,
  );
  return {
    schemaVersion: "presentation-v1",
    promptVersion: presentation?.promptVersion ?? "episode-visual-v1",
    guide: presentation?.guide ?? {
      name: "Maya",
      role: "curious explorer",
    },
    plan: {
      version: "lesson-plan-v1",
      title: episode.title,
      bigQuestion: episode.whyThisClip,
      audience: presentation?.plan.audience ?? "Young learner",
      targetDurationSeconds: totalDurationSeconds,
      learningObjectives: [
        {
          conceptId: episode.conceptId,
          objective: episode.explanation,
          sourceQuote: episode.sourceQuote,
        },
      ],
      teachingArc: scenes.map((scene) => scene.title),
    },
    script: {
      version: "video-script-v1",
      hook: episode.title,
      fullNarration: episode.explanation,
      narrationWordCount: episode.explanation.trim().split(/\s+/).length,
      closingLine: episode.whyThisClip,
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

export function EpisodeVisualPlayer({
  audioUrl,
  episode,
  presentation,
}: {
  audioUrl?: string;
  episode: Episode;
  presentation?: LessonPresentation;
}) {
  const visual = episodePresentation(episode, presentation);
  return (
    <div className="episode-visual-player">
      <Player
        acknowledgeRemotionLicense
        component={LessonComposition}
        compositionHeight={visual.storyboard.height}
        compositionWidth={visual.storyboard.width}
        controls
        durationInFrames={Math.round(
          visual.storyboard.totalDurationSeconds * visual.storyboard.fps,
        )}
        fps={visual.storyboard.fps}
        inputProps={{ presentation: visual, narrationUrl: audioUrl }}
        numberOfSharedAudioTags={1}
        showVolumeControls
        style={{ aspectRatio: "16 / 9", width: "100%" }}
      />
    </div>
  );
}
