import { promises as fs } from "node:fs";
import path from "node:path";

import {
  connect,
  IndexTypeValues,
  SceneExtractionType,
  SearchResult,
  Video,
} from "videodb";

import demoVideosJson from "../data/demo-videos.json";
import type { DemoVideo, VideoDbCacheEntry } from "../lib/types";

const demoVideos = demoVideosJson as DemoVideo[];
const cachePath = path.join(process.cwd(), "data", "videodb-cache.json");
const indexVersion = 2;

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

async function readCache(): Promise<VideoDbCacheEntry[]> {
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8")) as VideoDbCacheEntry[];
  } catch {
    return [];
  }
}

async function saveCache(cache: VideoDbCacheEntry[]): Promise<void> {
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

async function seed() {
  const apiKey = required("VIDEODB_API_KEY");
  const collectionId = required("VIDEODB_COLLECTION_ID");
  const limit = Number(process.env.SEED_LIMIT ?? demoVideos.length);
  const conn = connect({ apiKey });
  const collection = await conn.getCollection(collectionId);
  const existingVideos = await collection.getVideos();
  const cache = await readCache();

  console.log(
    JSON.stringify({
      event: "seed.started",
      collectionId,
      requested: Math.min(limit, demoVideos.length),
      existingVideos: existingVideos.length,
    }),
  );

  for (const source of demoVideos.slice(0, limit)) {
    let cached = cache.find((entry) => entry.id === source.id);
    let video: Video | undefined;

    if (cached) {
      try {
        video = await collection.getVideo(cached.videoDbId);
      } catch {
        cached = undefined;
      }
    }

    if (!video) {
      video = existingVideos.find((item) => item.name === source.title);
    }

    if (!video) {
      console.log(
        JSON.stringify({ event: "seed.uploading", title: source.title }),
      );
      const uploaded = await collection.uploadURL({
        url: source.url,
        name: source.title,
        description: `${source.description} Licence: ${source.licence}. Source: ${source.sourcePage}`,
        mediaType: "video",
      });
      if (!(uploaded instanceof Video)) {
        throw new Error(`VideoDB did not return a video for ${source.title}`);
      }
      video = uploaded;
    }

    const entry: VideoDbCacheEntry = {
      ...cached,
      ...source,
      videoDbId: video.id,
      spokenIndexed: cached?.spokenIndexed ?? false,
      sceneIndexed: cached?.sceneIndexed ?? false,
      indexVersion: cached?.indexVersion ?? 1,
      updatedAt: cached?.updatedAt ?? new Date().toISOString(),
    };

    if (!entry.spokenIndexed) {
      console.log(
        JSON.stringify({
          event: "seed.indexing_spoken_words",
          videoId: video.id,
          title: source.title,
        }),
      );
      await video.indexSpokenWords("en", "sentence");
      entry.spokenIndexed = true;
      entry.updatedAt = new Date().toISOString();
      const index = cache.findIndex((item) => item.id === entry.id);
      if (index >= 0) cache[index] = entry;
      else cache.push(entry);
      await saveCache(cache);
    }

    if (!entry.sceneIndexed || (entry.indexVersion ?? 1) < indexVersion) {
      console.log(
        JSON.stringify({
          event: "seed.indexing_scenes",
          videoId: video.id,
          title: source.title,
        }),
      );
      const isLongVideo = video.length > 300;
      try {
        entry.sceneIndexId = await video.indexScenes({
          extractionType: SceneExtractionType.timeBased,
          extractionConfig: {
            time: isLongVideo ? 15 : 10,
            frame_count: 3,
          },
          prompt:
            `Create a precise educational scene record for children about these topics: ${source.topics.join(", ")}. Describe (1) exactly what is visible across the frames, (2) the process or change being demonstrated, (3) cause-and-effect evidence, (4) any labels or on-screen facts, and (5) which learning question this moment can answer. Be concrete and factual. Never infer something that is not visible.`,
          metadata: {
            archive: "kathaquest-kid-safe",
            licence: source.licence.slice(0, 30),
            source_id: source.id,
            kid_safe: "true",
            source_authority: source.sourceAuthority,
          },
          name: "kathaquest-educational-scenes-v2",
        });
      } catch (error) {
        console.log(
          JSON.stringify({
            event: "seed.scene_upgrade_skipped",
            videoId: video.id,
            title: source.title,
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      entry.sceneIndexed = true;
      try {
        entry.educationalAudioIndexId = await video.indexAudio({
          prompt:
            `Turn each transcript segment into a child-safe educational evidence record about ${source.topics.join(", ")}. Preserve concrete facts, definitions, explanations, examples, and cause-and-effect statements. State the learning question the segment directly answers. Do not add facts that the speaker did not say.`,
          modelName: "pro",
          languageCode: "en",
          batchConfig: { type: "sentence", value: 3 },
          name: "kathaquest-educational-explanations-v2",
        });
      } catch (error) {
        console.log(
          JSON.stringify({
            event: "seed.audio_upgrade_skipped",
            videoId: video.id,
            title: source.title,
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      entry.indexVersion = indexVersion;
      entry.updatedAt = new Date().toISOString();
      const index = cache.findIndex((item) => item.id === entry.id);
      if (index >= 0) cache[index] = entry;
      else cache.push(entry);
      await saveCache(cache);
    }

    console.log(
      JSON.stringify({
        event: "seed.video_ready",
        title: source.title,
        videoDbId: video.id,
        spokenIndexed: entry.spokenIndexed,
        sceneIndexed: entry.sceneIndexed,
      }),
    );
  }

  const [spokenSearch, sceneSearch] = await Promise.allSettled([
    collection.search(
      "what is a volcano opening vent magma below Earth surface",
      "semantic",
      IndexTypeValues.spoken,
      3,
    ),
    collection.search(
      "active volcano crater lava erupting from a vent",
      "semantic",
      IndexTypeValues.scene,
      3,
    ),
  ]);
  if (sceneSearch.status === "rejected") {
    console.log(
      JSON.stringify({
        event: "seed.scene_search_pending",
        detail:
          sceneSearch.reason instanceof Error
            ? sceneSearch.reason.message
            : String(sceneSearch.reason),
      }),
    );
  }
  const scene =
    sceneSearch.status === "fulfilled" ? sceneSearch.value : undefined;
  const spoken =
    spokenSearch.status === "fulfilled" ? spokenSearch.value : undefined;
  const result =
    scene instanceof SearchResult && scene.shots.length > 0
      ? scene
      : spoken instanceof SearchResult && spoken.shots.length > 0
        ? spoken
        : null;
  if (!result || result.shots.length === 0) {
    throw new Error("Seeded archive returned no validation search results");
  }
  result.shots = result.shots.slice(0, 3);
  const streamUrl = await result.compile();
  console.log(
    JSON.stringify({
      event: "seed.vertical_slice_ready",
      resultCount: result.shots.length,
      streamUrl,
      videosCached: cache.length,
    }),
  );
}

seed().catch((error) => {
  console.error(
    JSON.stringify({
      event: "seed.failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
