import "server-only";

import { connect, IndexTypeValues, SearchResult, type Shot } from "videodb";

import demoVideosJson from "@/data/demo-videos.json";
import { requireEnv } from "@/lib/env";
import {
  selectVideoCandidates,
  type VideoCandidateForReview,
} from "@/lib/llm";
import { logger } from "@/lib/logger";
import { getVideoCache } from "@/lib/storage";
import { telemetry, withSpan } from "@/lib/telemetry";
import type {
  DemoVideo,
  VideoDbCacheEntry,
  VideoEvidence,
} from "@/lib/types";

const demoVideos = demoVideosJson as DemoVideo[];

type SearchOutcome = {
  evidence: VideoEvidence[];
  streamUrl: string;
  matchType: "spoken_word" | "scene";
  queryUsed: string;
  coverageScore: number;
  selectionSummary: string;
};

type SearchPurpose = "lesson" | "answer" | "revision";

type ArchiveSearchOptions = {
  conceptTitle?: string;
  learningObjective?: string;
  purpose?: SearchPurpose;
};

type Candidate = {
  id: string;
  result: SearchResult;
  shot: Shot;
  type: "spoken_word" | "scene";
  query: string;
  source?: VideoDbCacheEntry | DemoVideo;
  blendedScore: number;
};

function overlapRatio(
  left: { start: number; end: number },
  right: { start: number; end: number },
) {
  const overlap = Math.max(
    0,
    Math.min(left.end, right.end) - Math.max(left.start, right.start),
  );
  return overlap / Math.max(1, Math.min(left.end - left.start, right.end - right.start));
}

function expandShot(shot: Shot, purpose: SearchPurpose): Shot {
  const desired = purpose === "lesson" ? 30 : purpose === "revision" ? 24 : 18;
  const originalDuration = Math.max(1, shot.end - shot.start);
  const duration = Math.min(
    purpose === "lesson" ? 38 : 26,
    Math.max(desired, originalDuration + 12),
  );
  const videoLength = Number.isFinite(shot.videoLength)
    ? shot.videoLength
    : shot.end + duration;
  let start = Math.max(0, shot.start - Math.min(9, duration * 0.35));
  const end = Math.min(videoLength, start + duration);
  start = Math.max(0, end - duration);
  return {
    ...shot,
    start,
    end,
  } as Shot;
}

export async function searchEducationalArchive(
  queryInput: string | string[],
  options: ArchiveSearchOptions = {},
): Promise<SearchOutcome | null> {
  const queries = [...new Set(Array.isArray(queryInput) ? queryInput : [queryInput])]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  const query = queries.join(" | ");
  const purpose = options.purpose ?? "lesson";
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
              .search(
                searchQuery,
                "semantic",
                IndexTypeValues.spoken,
                8,
                0.3,
                45,
              )
              .then((result) => ({
                result,
                type: "spoken_word" as const,
                query: searchQuery,
              })),
            collection
              .search(
                searchQuery,
                "semantic",
                IndexTypeValues.scene,
                8,
                0.3,
                45,
              )
              .then((result) => ({
                result,
                type: "scene" as const,
                query: searchQuery,
              })),
          ]),
        );

        const searchResults: Array<{
          result: SearchResult;
          type: "spoken_word" | "scene";
          query: string;
        }> = [];
        for (const search of searches) {
          if (
            search.status === "fulfilled" &&
            search.value.result instanceof SearchResult
          ) {
            searchResults.push({
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

        const pool: Candidate[] = [];
        for (const searchResult of searchResults) {
          for (const shot of searchResult.result.shots) {
            const source =
              sourceById.get(shot.videoId) ??
              demoVideos.find(
                (item) =>
                  item.title.toLocaleLowerCase() ===
                  shot.videoTitle?.toLocaleLowerCase(),
              );
            if (!source?.kidSafe) continue;
            const topicText = source.topics.join(" ").toLocaleLowerCase();
            const queryTerms = searchResult.query
              .toLocaleLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((term) => term.length > 4);
            const topicBoost = queryTerms.some((term) => topicText.includes(term))
              ? 0.08
              : 0;
            pool.push({
              id: "",
              result: searchResult.result,
              shot,
              type: searchResult.type,
              query: searchResult.query,
              source,
              blendedScore:
                Math.max(0, Math.min(1, shot.searchScore ?? 0)) +
                (searchResult.type === "spoken_word" ? 0.05 : 0) +
                topicBoost,
            });
          }
        }

        const uniqueCandidates = pool
          .sort((a, b) => b.blendedScore - a.blendedScore)
          .filter(
            (candidate, index, all) =>
              !all.slice(0, index).some(
                (earlier) =>
                  earlier.shot.videoId === candidate.shot.videoId &&
                  overlapRatio(earlier.shot, candidate.shot) > 0.45,
              ),
          )
          .slice(0, 24)
          .map((candidate, index) => ({ ...candidate, id: `clip-${index + 1}` }));

        const duration = performance.now() - started;
        telemetry.videoSearchDuration.record(duration);
        telemetry.videoSearchResults.record(uniqueCandidates.length);

        if (uniqueCandidates.length === 0) {
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

        const reviewCandidates: VideoCandidateForReview[] =
          uniqueCandidates.map((candidate) => ({
            id: candidate.id,
            videoTitle: candidate.shot.videoTitle || candidate.source?.title || "Educational video",
            startSeconds: candidate.shot.start,
            endSeconds: candidate.shot.end,
            relevanceScore: candidate.shot.searchScore ?? 0,
            matchType: candidate.type,
            text: candidate.shot.text,
            topics: candidate.source?.topics ?? [],
            query: candidate.query,
          }));
        const review = await selectVideoCandidates({
          conceptTitle: options.conceptTitle ?? queries[0],
          learningObjective: options.learningObjective ?? queries.join("; "),
          candidates: reviewCandidates,
        });
        const candidateById = new Map(
          uniqueCandidates.map((candidate) => [candidate.id, candidate]),
        );
        const expanded: Array<{
          candidate: Candidate;
          shot: Shot;
          confidence: number;
          reason: string;
        }> = [];
        for (const selected of review.selected) {
          const candidate = candidateById.get(selected.id);
          if (!candidate) continue;
          const combinedConfidence =
            selected.confidence * 0.68 +
            Math.max(0, Math.min(1, candidate.shot.searchScore ?? 0)) * 0.32;
          const minimumReviewConfidence =
            purpose === "answer" ? 0.68 : purpose === "lesson" ? 0.62 : 0.55;
          const minimumCombinedConfidence =
            purpose === "answer" ? 0.61 : purpose === "lesson" ? 0.57 : 0.52;
          if (
            selected.confidence < minimumReviewConfidence ||
            combinedConfidence < minimumCombinedConfidence
          ) {
            continue;
          }
          const shot = expandShot(candidate.shot, purpose);
          if (
            expanded.some(
              (item) =>
                item.shot.videoId === shot.videoId &&
                overlapRatio(item.shot, shot) > 0.35,
            )
          ) {
            continue;
          }
          expanded.push({
            candidate,
            shot,
            confidence: selected.confidence,
            reason: selected.reason,
          });
          const selectedDuration = expanded.reduce(
            (total, item) => total + item.shot.end - item.shot.start,
            0,
          );
          if (
            expanded.length >= (purpose === "lesson" ? 4 : 2) ||
            selectedDuration >= (purpose === "lesson" ? 105 : 38)
          ) {
            break;
          }
        }

        if (
          purpose === "lesson" &&
          expanded.length === 1 &&
          expanded[0].confidence >= 0.55
        ) {
          const item = expanded[0];
          const videoLength = item.shot.videoLength;
          const desiredDuration = Math.min(60, videoLength);
          let start = Math.max(0, item.shot.start - 15);
          const end = Math.min(videoLength, start + desiredDuration);
          start = Math.max(0, end - desiredDuration);
          item.shot = { ...item.shot, start, end } as Shot;
        }

        const totalDuration = expanded.reduce(
          (total, item) => total + item.shot.end - item.shot.start,
          0,
        );
        const minimumDuration =
          purpose === "lesson" ? 50 : purpose === "revision" ? 22 : 12;
        if (
          expanded.length < 1 ||
          totalDuration < minimumDuration
        ) {
          telemetry.emptyVideoResults.add(1);
          logger.warn(
            {
              event: "videodb.search.rejected",
              query,
              selectedCount: expanded.length,
              totalDuration,
              selectionSummary: review.coverageSummary,
            },
            "VideoDB evidence was too weak or short for a useful lesson",
          );
          return null;
        }

        const compilationResult = expanded[0].candidate.result;
        compilationResult.shots = expanded.map((item) => item.shot);
        const streamUrl = await withSpan(
          "videodb.compile_episode",
          {
            "video.query": query,
            "video.result_count": expanded.length,
            "video.duration_seconds": totalDuration,
          },
          async (compileSpan) => {
            const url = await compilationResult.compile();
            compileSpan.setAttribute("video.stream_generated", Boolean(url));
            return url;
          },
        );

        const evidence = await Promise.all(
          expanded.map(async (item): Promise<VideoEvidence> => {
            const shot = item.shot;
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
              mediaUrl: source?.url,
              startSeconds: shot.start,
              endSeconds: shot.end,
              relevanceScore: shot.searchScore,
              sourceUrl: source?.sourcePage,
              licence: source?.licence,
              matchType: item.candidate.type,
              text: shot.text,
              kidSafe: source?.kidSafe ?? false,
              sourceAuthority: source?.sourceAuthority,
              topics: source?.topics,
              reviewConfidence: item.confidence,
              selectionReason: item.reason,
            };
          }),
        );
        const coverageScore =
          evidence.reduce(
            (total, item) =>
              total +
              Math.max(
                0,
                Math.min(
                  1,
                  ((item.relevanceScore ?? 0) + (item.reviewConfidence ?? 0)) /
                    2,
                ),
              ),
            0,
          ) / evidence.length;

        span.setAttributes({
          "video.result_count": evidence.length,
          "video.relevance_score": evidence[0]?.relevanceScore ?? 0,
          "video.stream_generated": Boolean(streamUrl),
          "video.index_type": "multimodal",
          "video.duration_seconds": totalDuration,
        });
        logger.info(
          {
            event: "videodb.search.complete",
            query,
            resultCount: evidence.length,
            durationMs: duration,
            matchType: "multimodal",
            queryUsed: expanded.map((item) => item.candidate.query),
            coverageScore,
            totalDuration,
          },
          "VideoDB search and compilation complete",
        );

        return {
          evidence,
          streamUrl,
          matchType: expanded.some(
            (item) => item.candidate.type === "spoken_word",
          )
            ? "spoken_word"
            : "scene",
          queryUsed: [...new Set(expanded.map((item) => item.candidate.query))].join(
            " + ",
          ),
          coverageScore,
          selectionSummary: review.coverageSummary,
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
