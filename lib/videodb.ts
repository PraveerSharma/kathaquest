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
  queryUsed: string;
  coverageScore: number;
};

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
  queryInput: string | string[],
): Promise<SearchOutcome | null> {
  const queries = [...new Set(Array.isArray(queryInput) ? queryInput : [queryInput])]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  const query = queries.join(" | ");
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

        const searches = await Promise.allSettled(
          queries.flatMap((searchQuery) => [
            collection
              .search(searchQuery, "semantic", IndexTypeValues.spoken, 5)
              .then((result) => ({
                result,
                type: "spoken_word" as const,
                query: searchQuery,
              })),
            collection
              .search(searchQuery, "semantic", IndexTypeValues.scene, 5)
              .then((result) => ({
                result,
                type: "scene" as const,
                query: searchQuery,
              })),
          ]),
        );

        const candidates: Array<{
          result: SearchResult;
          type: "spoken_word" | "scene";
          query: string;
        }> = [];
        for (const search of searches) {
          if (
            search.status === "fulfilled" &&
            search.value.result instanceof SearchResult
          ) {
            candidates.push({
              result: search.value.result,
              type: search.value.type,
              query: search.value.query,
            });
          }
        }

        const cache = await getVideoCache();
        const sourceById = new Map(
          cache
            .filter((item) => item.kidSafe)
            .map((item) => [item.videoDbId, item]),
        );
        const selected = candidates
          .map((candidate) => {
            const shots = uniqueShots(candidate.result)
              .filter((shot) => {
                const cached = sourceById.get(shot.videoId);
                return (
                  cached?.kidSafe ||
                  demoVideos.some(
                    (item) =>
                      item.kidSafe &&
                      item.title.toLocaleLowerCase() ===
                        shot.videoTitle?.toLocaleLowerCase(),
                  )
                );
              })
              .slice(0, 3);
            return {
              ...candidate,
              shots,
              blendedScore:
                shots.reduce(
                  (total, shot, index) =>
                    total +
                    Math.max(0, Math.min(1, shot.searchScore ?? 0)) /
                      (index + 1),
                  0,
                ) + (candidate.type === "spoken_word" ? 0.05 : 0),
            };
          })
          .filter((candidate) => candidate.shots.length > 0)
          .sort((a, b) => b.blendedScore - a.blendedScore)[0];

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
            const source =
              sourceById.get(shot.videoId) ??
              demoVideos.find(
                (item) =>
                  item.title.toLocaleLowerCase() ===
                  shot.videoTitle?.toLocaleLowerCase(),
              );
            return {
              videoId: shot.videoId,
              videoTitle: shot.videoTitle || source?.title || "Educational video",
              startSeconds: shot.start,
              endSeconds: shot.end,
              relevanceScore: shot.searchScore,
              sourceUrl: source?.sourcePage,
              licence: source?.licence,
              matchType: selected.type,
              text: shot.text,
              kidSafe: source?.kidSafe ?? false,
              sourceAuthority: source?.sourceAuthority,
              topics: source?.topics,
            };
          }),
        );
        const coverageScore =
          evidence.reduce(
            (total, item) =>
              total + Math.max(0, Math.min(1, item.relevanceScore ?? 0)),
            0,
          ) / evidence.length;

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
            queryUsed: selected.query,
            coverageScore,
          },
          "VideoDB search and compilation complete",
        );

        return {
          evidence,
          streamUrl,
          matchType: selected.type,
          queryUsed: selected.query,
          coverageScore,
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
