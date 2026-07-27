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
  mediaUrl?: string;
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

export type StoryboardSceneType =
  | "guide"
  | "real_video"
  | "diagram"
  | "animation"
  | "keyword"
  | "checkpoint"
  | "recap";

export type DiagramTemplate =
  | "cycle"
  | "process"
  | "comparison"
  | "layers"
  | "orbit"
  | "cause_effect"
  | "concept_map";

export type GeneratedVisualAsset = {
  kind: "manim" | "image_to_video";
  status: "ready" | "fallback";
  mediaUrl?: string;
  renderer: "manim-worker" | "openai-image-motion";
  selectionReason: string;
};

export type StoryboardScene = {
  id: string;
  type: StoryboardSceneType;
  conceptId?: string;
  title: string;
  narration: string;
  subtitle: string;
  durationSeconds: number;
  keywords: string[];
  transition: "fade" | "slide" | "zoom" | "wipe";
  visual: {
    diagramTemplate: DiagramTemplate;
    labels: string[];
    motion: "reveal" | "flow" | "orbit" | "pulse" | "pan_zoom";
    footageEpisodeId?: string;
    footageMediaUrl?: string;
    footageStartSeconds?: number;
    footageEndSeconds?: number;
    generatedAsset?: GeneratedVisualAsset;
  };
  evidenceRefs: string[];
  interactionPrompt?: string;
};

export type EducationalLessonPlan = {
  version: "lesson-plan-v1";
  title: string;
  bigQuestion: string;
  audience: string;
  targetDurationSeconds: number;
  learningObjectives: Array<{
    conceptId: string;
    objective: string;
    sourceQuote: string;
  }>;
  teachingArc: string[];
};

export type EducationalVideoScript = {
  version: "video-script-v1";
  hook: string;
  fullNarration: string;
  narrationWordCount: number;
  closingLine: string;
};

export type LessonStoryboard = {
  version: "storyboard-v1";
  fps: 30;
  width: 1280;
  height: 720;
  totalDurationSeconds: number;
  scenes: StoryboardScene[];
};

export type PresentationQualityReport = {
  checks: string[];
  engagement: number;
  grounding: number;
  issues: string[];
  overall: number;
  pacing: number;
  readability: number;
  tier: "excellent" | "strong" | "needs-review";
  visualVariety: number;
};

export type LessonPresentation = {
  schemaVersion: "presentation-v1";
  promptVersion: string;
  guide: {
    name: "Maya";
    role: "curious explorer";
  };
  plan: EducationalLessonPlan;
  script: EducationalVideoScript;
  storyboard: LessonStoryboard;
  quality?: PresentationQualityReport;
};

export type CuriosityClip = {
  id: string;
  question: string;
  answer: string;
  language: LessonLanguage;
  presentation: LessonPresentation;
  evidence: VideoEvidence[];
  videoEvidenceUsed: boolean;
  createdAt: string;
};

export type CuriosityRequest = {
  id: string;
  question: string;
  answer: string;
  language: LessonLanguage;
  createdAt: string;
};

export type NarrationTrack = {
  audioUrl: string;
  durationInFrames: number;
  fromFrame: number;
  sceneIds: string[];
};

export type Episode = {
  id: string;
  conceptId: string;
  mediaMode?: "videodb" | "visual_explainer";
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
  /**
   * Original chapter text retained only inside server storage and the
   * encrypted lesson token. It is intentionally removed from PublicLesson.
   */
  sourceContext?: string;
  concepts: LearningConcept[];
  episodes: Episode[];
  presentation?: LessonPresentation;
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

export type PublicLesson = Omit<Lesson, "concepts" | "sourceContext"> & {
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
