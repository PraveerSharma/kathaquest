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

    const entry: VideoDbCacheEntry = cached ?? {
      ...source,
      videoDbId: video.id,
      spokenIndexed: false,
      sceneIndexed: false,
      updatedAt: new Date().toISOString(),
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

    if (!entry.sceneIndexed) {
      console.log(
        JSON.stringify({
          event: "seed.indexing_scenes",
          videoId: video.id,
          title: source.title,
        }),
      );
      const isLongVideo = video.length > 300;
      entry.sceneIndexId = await video.indexScenes({
        extractionType: SceneExtractionType.timeBased,
        extractionConfig: {
          time: isLongVideo ? 30 : 10,
          frame_count: 1,
        },
        prompt:
          "Describe visible educational evidence about volcano shape, vents, craters, magma, lava, ash, gas, eruption processes, hazards, and changes to the landscape. Be concrete and factual.",
        metadata: {
          archive: "kathaquest-demo",
          licence: source.licence,
          source_id: source.id,
        },
        name: "kathaquest-educational-scenes",
      });
      entry.sceneIndexed = true;
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
