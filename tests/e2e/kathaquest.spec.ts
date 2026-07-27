import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import type {
  Episode,
  LessonLanguage,
  PublicLearningConcept,
  PublicLesson,
} from "../../lib/types";

const lessonId = "11111111-1111-4111-8111-111111111111";
const episodeIds = [
  "21111111-1111-4111-8111-111111111111",
  "21111111-1111-4111-8111-111111111112",
  "21111111-1111-4111-8111-111111111113",
];

function presentation(
  concepts: PublicLearningConcept[],
  episodes: Episode[],
  localized: boolean,
) {
  const types = [
    "guide",
    "diagram",
    "real_video",
    "animation",
    "real_video",
    "diagram",
    "keyword",
    "checkpoint",
    "recap",
  ] as const;
  const scenes = types.map((type, index) => {
    const concept = concepts[Math.min(2, Math.floor(Math.max(0, index - 1) / 2))];
    const episode = episodes[Math.min(2, Math.floor(Math.max(0, index - 1) / 2))];
    const realVideo = type === "real_video";
    return {
      id: `scene-${index + 1}`,
      type,
      conceptId:
        type === "guide" || type === "recap" || type === "checkpoint"
          ? undefined
          : concept.id,
      title: localized ? `দৃশ্য ${index + 1}` : `Scene ${index + 1}`,
      narration: localized
        ? "মায়া প্রমাণ, ছবি এবং সহজ ধাপে এই বিজ্ঞান ধারণাটি ব্যাখ্যা করছে।"
        : "Maya connects the chapter evidence, a clear visual model, and one simple step so the scientific idea becomes easier to remember.",
      subtitle: localized
        ? "প্রমাণ দেখে ধারণাটি বোঝো।"
        : "Follow the evidence and visual model.",
      durationSeconds: 20,
      keywords: localized
        ? ["প্রমাণ", "ধারণা"]
        : ["evidence", "idea"],
      transition: "fade" as const,
      visual: {
        diagramTemplate: "process" as const,
        labels: localized
          ? ["শুরু", "পরিবর্তন", "ফল"]
          : ["Start", "Change", "Result"],
        motion: realVideo ? ("pan_zoom" as const) : ("flow" as const),
        footageEpisodeId: realVideo ? episode.id : undefined,
        footageMediaUrl: realVideo
          ? "https://media.w3.org/2010/05/sintel/trailer.mp4"
          : undefined,
        footageStartSeconds: realVideo ? 0 : undefined,
        footageEndSeconds: realVideo ? 20 : undefined,
      },
      evidenceRefs: realVideo ? ["m-1:0-20"] : [`chapter:${concept.id}`],
      interactionPrompt:
        type === "checkpoint"
          ? localized
            ? "এরপর কী ঘটবে?"
            : "What happens next?"
          : undefined,
    };
  });
  const fullNarration = scenes.map((scene) => scene.narration).join(" ");
  return {
    schemaVersion: "presentation-v1" as const,
    promptVersion: "lesson-presentation-v1.0.0",
    guide: { name: "Maya" as const, role: "curious explorer" as const },
    plan: {
      version: "lesson-plan-v1" as const,
      title: localized ? "আগ্নেয়গিরির অভিযান" : "Volcano Adventure",
      bigQuestion: localized
        ? "আগ্নেয়গিরি কীভাবে বদলে যায়?"
        : "How does a volcano change?",
      audience: "8-10",
      targetDurationSeconds: 180,
      learningObjectives: concepts.map((concept) => ({
        conceptId: concept.id,
        objective: concept.learningObjective,
        sourceQuote: concept.sourceQuote,
      })),
      teachingArc: localized
        ? ["কৌতূহল", "মডেল", "প্রমাণ", "অনুমান"]
        : ["Wonder", "Model", "Evidence", "Predict"],
    },
    script: {
      version: "video-script-v1" as const,
      hook: scenes[0].narration,
      fullNarration,
      narrationWordCount: fullNarration.split(/\s+/).length,
      closingLine: scenes[8].narration,
    },
    storyboard: {
      version: "storyboard-v1" as const,
      fps: 30 as const,
      width: 1280 as const,
      height: 720 as const,
      totalDurationSeconds: 180,
      scenes,
    },
    quality: {
      checks: [
        "Every teaching scene is checked for source grounding.",
        "Narration duration is balanced against scene time.",
      ],
      engagement: 100,
      grounding: 100,
      issues: [],
      overall: 92,
      pacing: 89,
      readability: 100,
      tier: "excellent" as const,
      visualVariety: 92,
    },
  };
}

function lesson(
  language: LessonLanguage = "en-IN",
  localized = false,
): PublicLesson {
  const titles = localized
    ? ["ম্যাগমা ও লাভা", "অগ্ন্যুৎপাত", "নিরাপদ পর্যবেক্ষণ"]
    : ["Magma and lava", "How eruptions happen", "Watching volcanoes safely"];
  const chapterTitle = localized
    ? "আগ্নেয়গিরির অভিযান"
    : "Volcano Adventure";
  const concepts = titles.map((title, index) => ({
    id: `concept-${index + 1}`,
    title,
    learningObjective: localized
      ? "শিশুরা ধারণাটি ধাপে ধাপে বুঝবে।"
      : "Understand the idea step by step.",
    sourceQuote: "Magma below the ground is called lava at the surface.",
    sourcePage: 1,
    explanation: localized
      ? "চলো আমরা প্রমাণ দেখে ধাপে ধাপে এই মজার বিজ্ঞান ধারণাটি বুঝি। ভিডিওর প্রতিটি অংশ বইয়ের তথ্যের সঙ্গে মিলিয়ে নেওয়া হয়েছে।"
      : "Let us follow the evidence step by step. Each part of the video is matched to a fact in the chapter, so the pictures support what we learn.",
    videoSearchQueries: ["volcano educational explanation"],
    quiz: {
      question: localized ? "সঠিক উত্তরটি বেছে নাও।" : "Choose the correct answer.",
      options: localized
        ? ["প্রথম", "দ্বিতীয়", "তৃতীয়", "চতুর্থ"]
        : ["First", "Second", "Third", "Fourth"],
    },
  }));
  const episodes = concepts.map((concept, index) => ({
    id: episodeIds[index],
    conceptId: concept.id,
    mediaMode: "videodb" as const,
    title: concept.title,
    explanation: concept.explanation,
    sourceQuote: concept.sourceQuote,
    sourcePage: 1,
    whyThisClip: localized
      ? "এই দৃশ্যগুলি ধারণাটির প্রত্যক্ষ প্রমাণ দেখায়।"
      : "These moments directly demonstrate the learning objective.",
    streamUrl: `https://media.example.invalid/episode-${index + 1}.m3u8`,
    durationSeconds: 75,
    evidence: [
      {
        videoId: `m-${index + 1}`,
        videoTitle: "Reviewed science source",
        mediaUrl: "https://media.w3.org/2010/05/sintel/trailer.mp4",
        startSeconds: 10,
        endSeconds: 85,
        relevanceScore: 0.72,
        reviewConfidence: 0.91,
        sourceUrl: "https://science.nasa.gov",
        licence: "Public educational source",
        kidSafe: true,
        selectionReason: "Directly shows the process being explained.",
      },
    ],
    coverageScore: 0.81,
    kidSafe: true,
  }));
  return {
    id: lessonId,
    title: chapterTitle,
    ageGroup: "8-10",
    language,
    status: "ready",
    concepts,
    episodes,
    presentation: presentation(concepts, episodes, localized),
    traceId: "trace-test",
    generationTimeMs: 24000,
    overallCoverage: 0.81,
    sourceKind: "chapter-pack",
    createdAt: new Date().toISOString(),
  };
}

function lessonWithVisualFallback() {
  const result = lesson();
  result.episodes[0] = {
    ...result.episodes[0],
    mediaMode: "visual_explainer",
    streamUrl: "",
    durationSeconds: 0,
    evidence: [],
    coverageScore: 0,
    whyThisClip:
      "No reviewed VideoDB clip passed the relevance, duration, and kid-safety gates for this concept. KathaQuest kept the explanation grounded in the uploaded chapter and switched to diagrams and animation.",
  };
  result.fallbackUsed = true;
  result.overallCoverage =
    result.episodes.reduce(
      (total, episode) => total + episode.coverageScore,
      0,
    ) / result.episodes.length;
  return result;
}

async function mockGeneratedLesson(page: Page) {
  await page.route("**/api/lessons/generate", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lessonId,
        status: "ready",
        lesson: lesson(),
        lessonToken: "kq1.mock-secure-lesson-token-that-is-long-enough",
      }),
    });
  });
}

async function openReadyApp(page: Page) {
  await page.goto("/");
  await expect(page.locator('.app-shell[data-ready="true"]')).toBeVisible();
}

test("chapter selection, all languages, and real PDF extraction are usable", async ({
  page,
}) => {
  await openReadyApp(page);
  await expect(
    page.getByRole("heading", { name: /Turn any chapter into a video quest/i }),
  ).toBeVisible();
  await expect(page.getByRole("button").filter({ hasText: /Volcanoes/ })).toBeVisible();
  await expect(page.locator(".chapter-card")).toHaveCount(5);

  const language = page.getByLabel("Adventure language");
  await expect(language.locator("option")).toHaveCount(11);
  await language.selectOption("ta-IN");
  await expect(language).toHaveValue("ta-IN");

  await expect(page.locator(".sample-pdf-card")).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "Download" }).first(),
  ).toHaveAttribute(
    "href",
    "/sample-chapters/how-bees-help-plants-grow.pdf",
  );
  await page.getByRole("button", { name: "Use this PDF" }).nth(1).click();
  await expect(
    page.getByText("How_Sound_Travels.pdf is ready", { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(
    path.resolve("Chapter_Pack/02_the_water_cycle.pdf"),
  );
  await expect(
    page.getByText(/02_the_water_cycle\.pdf is ready/),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(".upload-zone")).toHaveClass(/is-uploaded/);
  await expect(
    page.getByRole("button", { name: /Create my video adventure/i }),
  ).toBeEnabled();
});

test("missing VideoDB coverage becomes an honest visual lesson instead of a dead end", async ({
  page,
}) => {
  let narrationRequests = 0;
  await page.route("**/api/lessons/generate", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lessonId,
        status: "ready",
        lesson: lessonWithVisualFallback(),
        lessonToken: "kq1.visual-fallback-token-that-is-long-enough",
      }),
    });
  });
  await page.route("**/api/narration", async (route) => {
    narrationRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        audioUrl: "data:audio/mpeg;base64,SUQz",
        provider: "sarvam",
        fallbackUsed: false,
        syncMode: "browser",
      }),
    });
  });

  await openReadyApp(page);
  await page.locator(".chapter-card").first().click();
  await page.getByRole("button", { name: /Create my video adventure/i }).click();
  await expect(page).toHaveURL(new RegExp(`/adventure/${lessonId}$`), {
    timeout: 15_000,
  });
  await expect(page.locator(".episode-visual-player")).toHaveCount(1);
  await expect(
    page.getByText("No unrelated footage was substituted.").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Watch the narrated visual" }),
  ).toHaveCount(0);
  await expect.poll(() => narrationRequests).toBe(3);
  await expect(page.locator(".media-preparation-gate")).toHaveCount(0);
});

test("complete lesson workflow stays clear through language, video, Q&A, quiz, and reset", async ({
  page,
}) => {
  await mockGeneratedLesson(page);
  await page.route("**/api/lessons/localize", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lesson: lesson("bn-IN", true),
        lessonToken: "kq1.localized-secure-token-that-is-long-enough",
      }),
    });
  });
  await page.route("**/api/narration", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        audioUrl: "data:audio/mpeg;base64,SUQz",
        provider: "sarvam",
        fallbackUsed: false,
        streamUrl: "https://media.example.invalid/localized.m3u8",
        syncMode: "videodb-timeline",
      }),
    });
  });
  await page.route("**/api/questions/ask", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        answer: "The chapter explains this safely and clearly.",
        evidence: [],
        videoUnavailable: true,
      }),
    });
  });
  await page.route("**/api/quiz/submit", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        score: 3,
        total: 3,
        incorrectConceptIds: [],
      }),
    });
  });

  await openReadyApp(page);
  await page.locator(".chapter-card").first().click();
  await page.getByRole("button", { name: /Create my video adventure/i }).click();
  await expect(page).toHaveURL(new RegExp(`/adventure/${lessonId}$`), {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Volcano Adventure" })).toBeVisible();
  await expect(page.locator(".episode-card")).toHaveCount(3);
  await expect(page.getByText("1m 15s").first()).toBeVisible();

  await page.getByLabel("Learning language").selectOption("bn-IN");
  await expect(page.getByRole("heading", { name: "আগ্নেয়গিরির অভিযান" })).toBeVisible();
  await expect(page.getByText("Everything is ready to play.")).toBeVisible();
  await expect(
    page.getByText(/Bengali is ready across the complete lesson and all 3 episodes/i),
  ).toBeVisible();

  await page.getByLabel("Your question").fill("Why does this happen?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(/left out the video/i)).toBeVisible();

  for (const [index, concept] of lesson("bn-IN", true).concepts.entries()) {
    await page
      .locator(".quiz-list")
      .getByRole("button", { name: concept.quiz.options[0], exact: true })
      .nth(index)
      .click();
  }
  await page.getByRole("button", { name: /Check my answers/i }).click();
  await expect(page.getByText(/scored 3 out of 3/i)).toBeVisible();

  await page.getByRole("button", { name: /Start a different chapter/i }).click();
  await expect(
    page.getByRole("heading", { name: /Where should we explore/i }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("content navigation and the continuous lesson studio are usable", async ({
  page,
}) => {
  await mockGeneratedLesson(page);
  await page.route("**/api/lessons/localize", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lesson: lesson("mr-IN", true),
        lessonToken: "kq1.marathi-secure-token-that-is-long-enough",
      }),
    });
  });
  await page.route("**/api/presentations/narrate", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        audioUrl: "data:audio/mpeg;base64,SUQz",
        provider: "sarvam",
        fallbackUsed: true,
        language: "mr-IN",
        narrationTracks: [
          {
            audioUrl: "data:audio/mpeg;base64,SUQz",
            durationInFrames: 1800,
            fromFrame: 0,
            sceneIds: ["scene-1", "scene-2", "scene-3"],
          },
          {
            audioUrl: "data:audio/mpeg;base64,SUQz",
            durationInFrames: 1800,
            fromFrame: 1800,
            sceneIds: ["scene-4", "scene-5", "scene-6"],
          },
          {
            audioUrl: "data:audio/mpeg;base64,SUQz",
            durationInFrames: 1800,
            fromFrame: 3600,
            sceneIds: ["scene-7", "scene-8", "scene-9"],
          },
        ],
        durationSeconds: 180,
      }),
    });
  });
  await page.route("**/api/narration", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        audioUrl: "data:audio/mpeg;base64,SUQz",
        provider: "sarvam",
        fallbackUsed: false,
        syncMode: "browser",
      }),
    });
  });

  await openReadyApp(page);
  const contentLink = page.getByRole("link", { name: "Explore chapters" });
  await expect(contentLink).toHaveAttribute("href", "/content");
  await page.goto("/content");
  await expect(page).toHaveURL(/\/content$/);
  await expect(
    page.getByRole("heading", { name: /Choose the next world/i }),
  ).toBeVisible();
  await expect(page.locator(".content-library-card")).toHaveCount(5);

  await page.goto("/");
  await expect(page.locator('.app-shell[data-ready="true"]')).toBeVisible();
  await page.locator(".chapter-card").first().click();
  await page.getByRole("button", { name: /Create my video adventure/i }).click();
  await expect(page).toHaveURL(new RegExp(`/adventure/${lessonId}$`), {
    timeout: 15_000,
  });
  const lessonLink = page.getByRole("link", {
    name: /Watch complete lesson/i,
  });
  await expect(lessonLink).toHaveAttribute("href", `/lesson/${lessonId}`);
  await lessonLink.click();

  await expect(page).toHaveURL(new RegExp(`/lesson/${lessonId}$`), {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", { name: "Volcano Adventure" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".presentation-player-shell")).toBeVisible();
  await expect(page.getByText(/Film quality 92\/100/i).first()).toBeVisible();
  await expect(page.locator(".presentation-player-shell")).toHaveAttribute(
    "data-narration-mode",
    "scene-synced",
  );
  await expect(page.locator(".scene-rail button")).toHaveCount(9);
  await expect(page.getByText(/Layer 1/)).toBeHidden();
  const studioDimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(studioDimensions.content).toBeLessThanOrEqual(
    studioDimensions.viewport + 1,
  );

  await page.getByLabel("Learning language").selectOption("mr-IN");
  await expect(page.getByText("Voice: Sarvam AI")).toBeVisible();
  await page
    .getByLabel("Voice engine for the complete lesson")
    .selectOption("elevenlabs");
  await expect(page.getByText("Voice: Sarvam AI")).toBeVisible();
  await expect(
    page.getByText(/backup voice kept your lesson film ready/i),
  ).toBeVisible();
});

test("a durable lesson URL can restore a session in a fresh browser", async ({
  page,
}) => {
  let narrationRequests = 0;
  await page.route(`**/api/lessons/${lessonId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        lesson: lesson(),
        lessonToken: "kq1.shared-secure-token-that-is-long-enough",
      }),
    });
  });
  await page.route("**/api/narration", async (route) => {
    narrationRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        audioUrl: "data:audio/mpeg;base64,SUQz",
        provider: "sarvam",
        fallbackUsed: false,
        syncMode: "browser",
      }),
    });
  });

  await page.goto(`/adventure/${lessonId}`);
  await expect(
    page.getByRole("heading", { name: "Volcano Adventure" }),
  ).toBeVisible();
  await expect(page.locator(".episode-card")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /Share lesson/i })).toBeVisible();
  await expect.poll(() => narrationRequests).toBe(3);
  await expect(page.locator(".media-preparation-gate")).toHaveCount(0);

  await page.goto("/content");
  await page.goto(`/adventure/${lessonId}`);
  await expect(page.locator(".episode-card")).toHaveCount(3);
  await expect(page.locator(".media-preparation-gate")).toHaveCount(0);
  await expect.poll(() => narrationRequests).toBe(3);

  const savedId = await page.evaluate(() => {
    const raw = window.localStorage.getItem("kathaquest.lesson.v1");
    return raw ? JSON.parse(raw).lesson.id : null;
  });
  expect(savedId).toBe(lessonId);
});

test("generation failures recover without trapping the child", async ({ page }) => {
  await page.route("**/api/lessons/generate", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "This archive does not yet have enough relevant teaching footage for that topic.",
      }),
    });
  });
  await openReadyApp(page);
  await page.locator(".chapter-card").first().click();
  await page.getByRole("button", { name: /Create my video adventure/i }).click();
  await expect(page.locator('.form-error[role="alert"]')).toContainText(
    "does not yet have enough relevant teaching footage",
  );
  await expect(
    page.getByRole("button", { name: /Create my video adventure/i }),
  ).toBeVisible();
});

test("mobile layout has no horizontal overflow and keeps primary actions reachable", async ({
  page,
}) => {
  await openReadyApp(page);
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await expect(page.locator(".chapter-card")).toHaveCount(5);
  await page.locator(".chapter-card").last().click();
  await page
    .getByRole("button", { name: /Create my video adventure/i })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: /Create my video adventure/i }),
  ).toBeInViewport();
});

test("microphone-unavailable feedback is explicit", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  await mockGeneratedLesson(page);
  await page.route("**/api/narration", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        audioUrl: "data:audio/mpeg;base64,SUQz",
        provider: "sarvam",
        fallbackUsed: false,
        syncMode: "browser",
      }),
    });
  });
  await openReadyApp(page);
  await page.locator(".chapter-card").first().click();
  await page.getByRole("button", { name: /Create my video adventure/i }).click();
  await expect(page).toHaveURL(new RegExp(`/adventure/${lessonId}$`), {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Record a question" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Microphone recording is not supported in this browser.",
    }),
  ).toBeVisible();
});

test("SigNoz Live Dashboard makes telemetry understandable", async ({
  page,
}) => {
  await page.route("**/api/observability/summary", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "live",
        service: "kathaquest",
        windowHours: 24,
        generatedAt: new Date().toISOString(),
        latestSpanAt: "2026-07-26 23:00:00.000",
        metrics: {
          traces: 42,
          spans: 318,
          errors: 3,
          errorRate: 0.94,
          lessons: 12,
          successfulLessons: 10,
          lessonSuccessRate: 83.3,
          p95LatencyMs: 8400,
          lessonP95LatencyMs: 92400,
          relevanceScore: 0.78,
          openaiCalls: 38,
          videoDbCalls: 24,
          narrations: 11,
          quizChecks: 7,
        },
        trend: [
          { bucket: "2026-07-26 18:00:00", traces: 8, spans: 52 },
          { bucket: "2026-07-26 20:00:00", traces: 13, spans: 91 },
          { bucket: "2026-07-26 22:00:00", traces: 21, spans: 175 },
        ],
        recent: [
          {
            event_time: "2026-07-26 23:00:00.000",
            name: "lesson.generate",
            duration_ms: 48200,
            has_error: 0,
            language: "hi-IN",
            provider: "",
          },
          {
            event_time: "2026-07-26 22:58:00.000",
            name: "videodb.search_concept",
            duration_ms: 8500,
            has_error: 0,
            language: "",
            provider: "",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  const signozDashboard = page.getByRole("link", {
    name: "SigNoz live dashboard",
  });
  await expect(signozDashboard).toHaveAttribute("href", "/observability");
  await page.goto("/observability");

  await expect(page).toHaveURL(/\/observability$/);
  await expect(
    page.getByRole("heading", { name: "See each lesson being built." }),
  ).toBeVisible();
  await expect(page.getByText("Live telemetry")).toBeVisible();
  await expect(page.getByText("83.3%")).toBeVisible();
  await expect(page.getByText("78%", { exact: true })).toBeVisible();
  await expect(page.getByText("Complete lesson")).toBeVisible();
  await expect(page.getByText("Search VideoDB")).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

  await page.goto("/blog/kathaquest-signoz");
  await expect(page.locator(".blog-hero .eyebrow")).toHaveText(
    "BUILD STORY · SIGNOZ",
  );
  await expect(page.getByText(/SIGNOZ HACKATHON 2026/i)).toHaveCount(0);

  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "SigNoz engineering story" }),
  ).toHaveAttribute("href", "/blog/kathaquest-signoz");
  await expect(
    page.getByRole("link", { name: "VideoDB engineering story" }),
  ).toHaveAttribute("href", "/blog/kathaquest-videodb");

  await page.goto("/blog/kathaquest-videodb");
  await expect(page.locator(".blog-hero .eyebrow")).toHaveText(
    "BUILD STORY | VIDEODB",
  );
  await expect(
    page.getByRole("heading", {
      name: /I stopped asking VideoDB for a clip/i,
    }),
  ).toBeVisible();
  await expect(page.locator(".blog-article figure img")).toHaveCount(3);
  await expect(page.locator(".blog-wide-figure img")).toHaveCount(1);
});
