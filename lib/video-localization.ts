import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  Audio,
  Clip,
  connect,
  EditorAudioAsset,
  EditorTimeline,
  EditorVideoAsset,
  Track,
} from "videodb";

import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { generateNarration } from "@/lib/narration-router";
import { withSpan } from "@/lib/telemetry";
import type { Episode, LessonLanguage } from "@/lib/types";

function audioBuffer(dataUrl: string) {
  const marker = ";base64,";
  const index = dataUrl.indexOf(marker);
  if (index < 0) throw new Error("Narration audio was not base64 encoded");
  return Buffer.from(dataUrl.slice(index + marker.length), "base64");
}

export async function createLocalizedEpisodeVideo({
  episode,
  language,
  forceFailure = false,
  preferredProvider = "auto",
}: {
  episode: Episode;
  language: LessonLanguage;
  forceFailure?: boolean;
  preferredProvider?: "auto" | "sarvam" | "elevenlabs";
}) {
  return withSpan(
    "videodb.localize_episode",
    {
      "episode.id": episode.id,
      "lesson.language": language,
      "video.segment_count": episode.evidence.length,
    },
    async (span) => {
      const narration = await generateNarration({
        text: episode.explanation,
        language,
        forceFailure,
        preferredProvider,
      });
      const tempPath = path.join(
        tmpdir(),
        `kathaquest-${episode.id}-${randomUUID()}.mp3`,
      );

      try {
        await fs.writeFile(tempPath, audioBuffer(narration.audioUrl));
        const conn = connect({ apiKey: requireEnv("VIDEODB_API_KEY") });
        const collection = await conn.getCollection(
          requireEnv("VIDEODB_COLLECTION_ID"),
        );
        const uploaded = await collection.uploadFile({
          filePath: tempPath,
          mediaType: "audio",
          name: `KathaQuest ${episode.id} ${language}`,
          description:
            "Temporary child-friendly localized narration for a KathaQuest lesson reel.",
        });
        if (!(uploaded instanceof Audio)) {
          throw new Error("VideoDB did not return a narration audio asset");
        }

        const timeline = new EditorTimeline(conn);
        const videoTrack = new Track(0);
        let cursor = 0;
        for (const evidence of episode.evidence) {
          const duration = Math.max(
            1,
            evidence.endSeconds - evidence.startSeconds,
          );
          videoTrack.addClip(
            cursor,
            new Clip({
              asset: new EditorVideoAsset({
                id: evidence.videoId,
                start: evidence.startSeconds,
                volume: 0.08,
              }),
              duration,
            }),
          );
          cursor += duration;
        }

        const audioTrack = new Track(1);
        audioTrack.addClip(
          0,
          new Clip({
            asset: new EditorAudioAsset({ id: uploaded.id, volume: 1 }),
            duration: Math.min(uploaded.length, cursor),
          }),
        );
        timeline.addTrack(videoTrack);
        timeline.addTrack(audioTrack);
        const streamUrl = await timeline.generateStream();
        if (!streamUrl) {
          throw new Error("VideoDB returned no localized timeline stream");
        }

        span.setAttributes({
          "video.stream_generated": true,
          "video.duration_seconds": cursor,
          "tts.provider": narration.provider,
          "tts.fallback_used": narration.fallbackUsed,
        });
        return {
          ...narration,
          streamUrl,
          durationSeconds: cursor,
          syncMode: "videodb-timeline" as const,
        };
      } catch (error) {
        logger.warn(
          {
            event: "videodb.localization.fallback",
            episodeId: episode.id,
            language,
            error: error instanceof Error ? error.message : String(error),
          },
          "VideoDB localized timeline failed; returning synchronized audio fallback",
        );
        span.setAttributes({
          "video.stream_generated": false,
          "video.sync_mode": "browser",
        });
        return {
          ...narration,
          durationSeconds: episode.durationSeconds,
          syncMode: "browser" as const,
        };
      } finally {
        await fs.unlink(tempPath).catch(() => undefined);
      }
    },
  );
}
