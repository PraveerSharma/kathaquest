"use client";

import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { RefObject } from "react";

import { LessonComposition } from "@/components/presentation/lesson-composition";
import type { LessonPresentation, NarrationTrack } from "@/lib/types";

export function PresentationPlayer({
  presentation,
  narrationTracks,
  narrationUrl,
  playerRef,
}: {
  presentation: LessonPresentation;
  narrationTracks?: NarrationTrack[];
  narrationUrl?: string;
  playerRef?: RefObject<PlayerRef | null>;
}) {
  return (
    <div
      className="presentation-player-shell"
      data-narration-mode={
        narrationTracks?.length ? "scene-synced" : "continuous"
      }
    >
      <div className="presentation-frame-bar">
        <strong>{presentation.plan.title}</strong>
        <span>{presentation.storyboard.scenes.length} scene learning film</span>
      </div>
      <Player
        acknowledgeRemotionLicense
        component={LessonComposition}
        compositionHeight={presentation.storyboard.height}
        compositionWidth={presentation.storyboard.width}
        controls
        durationInFrames={Math.round(
          presentation.storyboard.totalDurationSeconds *
            presentation.storyboard.fps,
        )}
        fps={presentation.storyboard.fps}
        inputProps={{ presentation, narrationTracks, narrationUrl }}
        numberOfSharedAudioTags={3}
        ref={playerRef}
        showVolumeControls
        style={{ aspectRatio: "16 / 9", width: "100%" }}
      />
    </div>
  );
}
