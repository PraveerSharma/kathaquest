"use client";

export type PreparedMedia = {
  audioUrl: string;
  fallbackUsed: boolean;
  provider: "sarvam" | "elevenlabs";
  savedAt: number;
  streamUrl?: string;
  syncMode?: "videodb-timeline" | "browser";
};

const databaseName = "kathaquest-media-v1";
const storeName = "prepared-media";
const fallbackPrefix = "kathaquest.media.";
const maxAgeMs = 7 * 24 * 60 * 60 * 1000;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readFromIndexedDb(key: string): Promise<PreparedMedia | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as PreparedMedia | undefined);
    transaction.oncomplete = () => database.close();
  });
}

async function writeToIndexedDb(key: string, media: PreparedMedia): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(media, key);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}

function readFallback(key: string): PreparedMedia | undefined {
  try {
    const raw = window.sessionStorage.getItem(`${fallbackPrefix}${key}`);
    return raw ? (JSON.parse(raw) as PreparedMedia) : undefined;
  } catch {
    return undefined;
  }
}

function writeFallback(key: string, media: PreparedMedia) {
  try {
    window.sessionStorage.setItem(
      `${fallbackPrefix}${key}`,
      JSON.stringify(media),
    );
  } catch {
    // IndexedDB is the primary store. A full session store is non-fatal.
  }
}

export function episodeMediaKey({
  episodeId,
  language,
  lessonId,
  provider,
}: {
  episodeId: string;
  language: string;
  lessonId: string;
  provider: string;
}) {
  return `episode:${lessonId}:${episodeId}:${language}:${provider}`;
}

export function filmMediaKey({
  language,
  lessonId,
  provider,
}: {
  language: string;
  lessonId: string;
  provider: string;
}) {
  return `film:${lessonId}:${language}:${provider}`;
}

export async function readPreparedMedia(
  key: string,
): Promise<PreparedMedia | undefined> {
  if (typeof window === "undefined") return undefined;
  let media: PreparedMedia | undefined;
  if ("indexedDB" in window) {
    try {
      media = await readFromIndexedDb(key);
    } catch {
      media = readFallback(key);
    }
  } else {
    media = readFallback(key);
  }
  if (!media || Date.now() - media.savedAt > maxAgeMs) return undefined;
  return media;
}

export async function savePreparedMedia(
  key: string,
  media: Omit<PreparedMedia, "savedAt">,
): Promise<void> {
  if (typeof window === "undefined") return;
  const prepared = { ...media, savedAt: Date.now() };
  if ("indexedDB" in window) {
    try {
      await writeToIndexedDb(key, prepared);
      return;
    } catch {
      writeFallback(key, prepared);
      return;
    }
  }
  writeFallback(key, prepared);
}
