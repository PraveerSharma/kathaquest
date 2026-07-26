import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const lessonId = "11111111-1111-4111-8111-111111111111";
const episodeIds = [
  "21111111-1111-4111-8111-111111111111",
  "21111111-1111-4111-8111-111111111112",
  "21111111-1111-4111-8111-111111111113",
];

function lesson(language = "en-IN", localized = false) {
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
  return {
    id: lessonId,
    title: chapterTitle,
    ageGroup: "8-10",
    language,
    status: "ready",
    concepts,
    episodes: concepts.map((concept, index) => ({
      id: episodeIds[index],
      conceptId: concept.id,
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
    })),
    traceId: "trace-test",
    generationTimeMs: 24000,
    overallCoverage: 0.81,
    sourceKind: "chapter-pack",
    createdAt: new Date().toISOString(),
  };
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

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(
    path.resolve("Chapter_Pack/02_the_water_cycle.pdf"),
  );
  await expect(page.getByText(/02_the_water_cycle\.pdf/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("button", { name: /Create my video adventure/i }),
  ).toBeEnabled();
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
  await expect(page.getByRole("heading", { name: "Volcano Adventure" })).toBeVisible();
  await expect(page.locator(".episode-card")).toHaveCount(3);
  await expect(page.getByText("1m 15s").first()).toBeVisible();

  await page.getByLabel("Learning language").selectOption("bn-IN");
  await expect(page.getByRole("heading", { name: "আগ্নেয়গিরির অভিযান" })).toBeVisible();
  await page
    .getByRole("button", { name: /Add friendly বাংলা voice/i })
    .first()
    .click();
  await expect(page.getByText("বাংলা narrated reel").first()).toBeVisible();
  await expect(
    page.getByText(/narration synchronized with the stitched video/i).first(),
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

  await page.getByRole("button", { name: /Make another quest/i }).click();
  await expect(
    page.getByRole("heading", { name: /Where should we explore/i }),
  ).toBeVisible();
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
  await openReadyApp(page);
  await page.locator(".chapter-card").first().click();
  await page.getByRole("button", { name: /Create my video adventure/i }).click();
  await page.getByRole("button", { name: "Record a question" }).click();
  await expect(
    page.getByText("Microphone recording is not supported in this browser."),
  ).toBeVisible();
});
