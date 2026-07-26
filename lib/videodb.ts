import "server-only";

import { connect, IndexTypeValues, SearchResult } from "videodb";

import demoVideosJson from "@/data/demo-videos.json";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getVideoCache } from "@/lib/storage";
import { telemetry, withSpan } from "@/lib/telemetry";
import type { DemoVideo, VideoEvidence } from "@/lib/types";

const demoVideos = demoVideosJson as DemoVideo[];

type SearchOutcome = {
  evidence: VideoEvidence[];
  streamUrl: string;
  matchType: "spoken_word" | "scene";
};

function sourceFor(videoId: string, videoTitle: string) {
  return async () => {
    const cache = await getVideoCache();
    const cached = cache.find((item) => item.videoDbId === videoId);
    return (
      cached ??
      demoVideos.find(
        (item) =>
          item.title.toLocaleLowerCase() === videoTitle.toLocaleLowerCase(),
      )
    );
  };
}

function uniqueShots(result: SearchResult) {
  const ordered = [...result.shots].sort(
    (a, b) => (b.searchScore ?? 0) - (a.searchScore ?? 0),
  );
  return ordered.filter((shot, index, all) => {
    return !all.slice(0, index).some((candidate) => {
      if (candidate.videoId !== shot.videoId) return false;
      return (
        Math.max(candidate.start, shot.start) <
        Math.min(candidate.end, shot.end)
      );
    });
  });
}

export async function searchEducationalArchive(
  query: string,
): Promise<SearchOutcome | null> {
  const started = performance.now();
  return withSpan(
    "videodb.search_concept",
    { "video.query": query },
    async (span) => {
      try {
        const conn = connect({ apiKey: requireEnv("VIDEODB_API_KEY") });
        const collection = await conn.getCollection(
          requireEnv("VIDEODB_COLLECTION_ID"),
        );

        const [spoken, scene] = await Promise.allSettled([
          collection.search(
            query,
            "semantic",
            IndexTypeValues.spoken,
            3,
          ),
          collection.search(query, "semantic", IndexTypeValues.scene, 3),
        ]);

        const candidates: Array<{
          result: SearchResult;
          type: "spoken_word" | "scene";
        }> = [];
        if (
          spoken.status === "fulfilled" &&
          spoken.value instanceof SearchResult
        ) {
          candidates.push({ result: spoken.value, type: "spoken_word" });
        }
        if (
          scene.status === "fulfilled" &&
          scene.value instanceof SearchResult
        ) {
          candidates.push({ result: scene.value, type: "scene" });
        }

        const selected = candidates
          .map((candidate) => ({
            ...candidate,
            shots: uniqueShots(candidate.result).slice(0, 3),
          }))
          .filter((candidate) => candidate.shots.length > 0)
          .sort(
            (a, b) =>
              (b.shots[0]?.searchScore ?? 0) -
              (a.shots[0]?.searchScore ?? 0),
          )[0];

        const duration = performance.now() - started;
        telemetry.videoSearchDuration.record(duration);
        telemetry.videoSearchResults.record(selected?.shots.length ?? 0);

        if (!selected) {
          telemetry.emptyVideoResults.add(1);
          span.setAttributes({
            "video.result_count": 0,
            "video.stream_generated": false,
          });
          logger.warn(
            { event: "videodb.search.empty", query, durationMs: duration },
            "VideoDB search returned no evidence",
          );
          return null;
        }

        selected.result.shots = selected.shots;
        const streamUrl = await withSpan(
          "videodb.compile_episode",
          {
            "video.query": query,
            "video.result_count": selected.shots.length,
          },
          async (compileSpan) => {
            const url = await selected.result.compile();
            compileSpan.setAttribute("video.stream_generated", Boolean(url));
            return url;
          },
        );

        const evidence = await Promise.all(
          selected.shots.map(async (shot): Promise<VideoEvidence> => {
            const source = await sourceFor(
              shot.videoId,
              shot.videoTitle,
            )();
            return {
              videoId: shot.videoId,
              videoTitle: shot.videoTitle,
              startSeconds: shot.start,
              endSeconds: shot.end,
              relevanceScore: shot.searchScore,
              sourceUrl: source?.sourcePage,
              licence: source?.licence,
              matchType: selected.type,
              text: shot.text,
            };
          }),
        );

        span.setAttributes({
          "video.result_count": evidence.length,
          "video.relevance_score": evidence[0]?.relevanceScore ?? 0,
          "video.stream_generated": Boolean(streamUrl),
          "video.index_type": selected.type,
        });
        logger.info(
          {
            event: "videodb.search.complete",
            query,
            resultCount: evidence.length,
            durationMs: duration,
            matchType: selected.type,
          },
          "VideoDB search and compilation complete",
        );

        return {
          evidence,
          streamUrl,
          matchType: selected.type,
        };
      } catch (error) {
        const duration = performance.now() - started;
        telemetry.videoSearchDuration.record(duration);
        logger.error(
          {
            event: "videodb.search.failed",
            query,
            durationMs: duration,
            error: error instanceof Error ? error.message : String(error),
          },
          "VideoDB search failed",
        );
        throw error;
      }
    },
  );
}
