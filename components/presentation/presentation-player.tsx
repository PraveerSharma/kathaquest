"use client";

import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import type { RefObject } from "react";

import { LessonComposition } from "@/components/presentation/lesson-composition";
import type { LessonPresentation } from "@/lib/types";

export function PresentationPlayer({
  presentation,
  narrationUrl,
  playerRef,
}: {
  presentation: LessonPresentation;
  narrationUrl?: string;
  playerRef?: RefObject<PlayerRef | null>;
}) {
  return (
    <div className="presentation-player-shell">
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
        inputProps={{ presentation, narrationUrl }}
        numberOfSharedAudioTags={1}
        ref={playerRef}
        showVolumeControls
        style={{ aspectRatio: "16 / 9", width: "100%" }}
      />
    </div>
  );
}
