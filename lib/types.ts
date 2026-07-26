export type LessonStatus =
  | "queued"
  | "extracting"
  | "searching"
  | "narrating"
  | "compiling"
  | "ready"
  | "failed";

export type LessonLanguage = "en-IN" | "hi-IN";

export type LearningConcept = {
  id: string;
  title: string;
  explanation: string;
  videoSearchQuery: string;
  quiz: {
    question: string;
    options: string[];
    correctAnswer: string;
  };
};

export type VideoEvidence = {
  videoId: string;
  videoTitle: string;
  startSeconds: number;
  endSeconds: number;
  relevanceScore?: number;
  sourceUrl?: string;
  licence?: string;
  matchType?: "spoken_word" | "scene";
  text?: string;
};

export type Episode = {
  id: string;
  conceptId: string;
  title: string;
  explanation: string;
  whyThisClip: string;
  streamUrl: string;
  durationSeconds: number;
  narrationUrl?: string;
  narrationProvider?: "sarvam" | "elevenlabs";
  evidence: VideoEvidence[];
};

export type Lesson = {
  id: string;
  title: string;
  ageGroup: string;
  language: LessonLanguage;
  status: LessonStatus;
  concepts: LearningConcept[];
  episodes: Episode[];
  traceId?: string;
  generationTimeMs?: number;
  fallbackUsed?: boolean;
  createdAt: string;
};

export type DemoVideo = {
  id: string;
  title: string;
  url: string;
  sourcePage: string;
  licence: string;
  creator: string;
  description: string;
};

export type VideoDbCacheEntry = DemoVideo & {
  videoDbId: string;
  spokenIndexed: boolean;
  sceneIndexed: boolean;
  sceneIndexId?: string;
  updatedAt: string;
};

export type ServiceHealth = {
  status: "ok" | "degraded" | "missing";
  latencyMs?: number;
  detail?: string;
};
