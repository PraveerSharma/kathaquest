export type LessonStatus =
  | "queued"
  | "extracting"
  | "searching"
  | "narrating"
  | "compiling"
  | "ready"
  | "failed";

export type LessonLanguage =
  | "en-IN"
  | "hi-IN"
  | "bn-IN"
  | "ta-IN"
  | "te-IN"
  | "mr-IN"
  | "gu-IN"
  | "kn-IN"
  | "ml-IN"
  | "pa-IN"
  | "od-IN";

export type LearningConcept = {
  id: string;
  title: string;
  learningObjective: string;
  sourceQuote: string;
  sourcePage?: number;
  explanation: string;
  videoSearchQueries: string[];
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
  kidSafe: boolean;
  sourceAuthority?: string;
  topics?: string[];
  reviewConfidence?: number;
  selectionReason?: string;
};

export type Episode = {
  id: string;
  conceptId: string;
  title: string;
  explanation: string;
  sourceQuote: string;
  sourcePage?: number;
  whyThisClip: string;
  streamUrl: string;
  durationSeconds: number;
  narrationUrl?: string;
  narrationProvider?: "sarvam" | "elevenlabs";
  evidence: VideoEvidence[];
  coverageScore: number;
  kidSafe: boolean;
  selectionSummary?: string;
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
  overallCoverage: number;
  sourceKind: "chapter-pack" | "uploaded-pdf";
  createdAt: string;
};

export type PublicLearningConcept = Omit<LearningConcept, "quiz"> & {
  quiz: Omit<LearningConcept["quiz"], "correctAnswer">;
};

export type PublicLesson = Omit<Lesson, "concepts"> & {
  concepts: PublicLearningConcept[];
};

export type LessonResponse = {
  lessonId: string;
  status: "ready";
  lesson: PublicLesson;
  lessonToken: string;
};

export type DemoVideo = {
  id: string;
  title: string;
  url: string;
  sourcePage: string;
  licence: string;
  creator: string;
  description: string;
  topics: string[];
  ageRange: { min: number; max: number };
  kidSafe: boolean;
  safetyNotes: string;
  sourceAuthority: string;
  contentRating: "all-ages";
};

export type ChapterPackItem = {
  id: string;
  title: string;
  subject: string;
  summary: string;
  ageRange: string;
  pages: number;
  accent: "coral" | "blue" | "green" | "purple" | "yellow";
  text: string;
};

export type VideoDbCacheEntry = DemoVideo & {
  videoDbId: string;
  spokenIndexed: boolean;
  sceneIndexed: boolean;
  sceneIndexId?: string;
  educationalAudioIndexId?: string;
  indexVersion?: number;
  updatedAt: string;
};

export type ServiceHealth = {
  status: "ok" | "degraded" | "missing";
  latencyMs?: number;
  detail?: string;
};
