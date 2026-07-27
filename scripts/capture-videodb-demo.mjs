import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { resolve } from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.DEMO_BASE_URL ?? "https://kathaquest.vercel.app";
const lessonPath = resolve(
  process.env.DEMO_LESSON_FILE ?? "artifacts/videodb-real-lesson.json",
);
if (!existsSync(lessonPath)) {
  throw new Error(
    "A real lesson response is required at artifacts/videodb-real-lesson.json",
  );
}

const response = JSON.parse(readFileSync(lessonPath, "utf8"));
const savedSession = {
  lesson: response.lesson,
  lessonToken: response.lessonToken,
};
const outputDir = resolve("artifacts/videodb-demo-captures");
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function pause(page, milliseconds) {
  await page.waitForTimeout(milliseconds);
}

async function smoothScrollTo(page, selector) {
  await page.locator(selector).first().evaluate((element) => {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  await pause(page, 1_400);
}

async function record(name, task, withLesson = false) {
  const before = new Set(readdirSync(outputDir));
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: outputDir,
      size: { width: 1280, height: 720 },
    },
  });
  if (withLesson) {
    await context.addInitScript(
      (session) =>
        localStorage.setItem("kathaquest.lesson.v1", JSON.stringify(session)),
      savedSession,
    );
  }
  const page = await context.newPage();
  await task(page);
  await context.close();
  const created = readdirSync(outputDir).filter(
    (file) => file.endsWith(".webm") && !before.has(file),
  );
  if (created.length !== 1) {
    throw new Error(
      `Expected one recording for ${name}, found ${created.length}`,
    );
  }
  renameSync(
    resolve(outputDir, created[0]),
    resolve(outputDir, `${name}.webm`),
  );
}

await record("01-home", async (page) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await pause(page, 1_600);
  await smoothScrollTo(page, ".quest-builder");
  const waterCycle = page
    .locator(".chapter-card")
    .filter({ hasText: "The Water Cycle" });
  await waterCycle.click();
  await pause(page, 1_200);
  await smoothScrollTo(page, ".builder-controls");
  await page.getByLabel("Adventure language").selectOption("en-IN");
  await pause(page, 1_000);
  await page
    .getByRole("button", { name: /Create my video adventure/i })
    .click();
  await page.getByText("Your lesson film is taking shape.").waitFor({
    timeout: 20_000,
  });
  await pause(page, 2_600);
});

await record(
  "02-adventure",
  async (page) => {
    await page.goto(`${baseUrl}/adventure/${response.lesson.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.getByRole("heading", { name: response.lesson.title }).waitFor({
      timeout: 60_000,
    });
    await pause(page, 2_000);
    await smoothScrollTo(page, ".episode-card");
    const video = page.locator(".episode-card video").first();
    if (await video.isVisible().catch(() => false)) {
      await video.evaluate((element) => {
        void element.play().catch(() => undefined);
      });
    }
    await pause(page, 5_000);
    await page.mouse.wheel(0, 520);
    await pause(page, 2_000);
  },
  true,
);

await record(
  "03-lesson-studio",
  async (page) => {
    await page.goto(`${baseUrl}/lesson/${response.lesson.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.locator(".presentation-player-shell").waitFor({
      timeout: 60_000,
    });
    await pause(page, 2_000);
    const sceneButtons = page.locator(".scene-rail button");
    await sceneButtons.nth(2).click();
    await pause(page, 4_500);
    await sceneButtons.nth(3).click();
    await pause(page, 3_000);
  },
  true,
);

await record("04-observability", async (page) => {
  await page.goto(`${baseUrl}/observability`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByText("Live telemetry").waitFor({ timeout: 60_000 });
  await pause(page, 2_000);
  await smoothScrollTo(page, ".telemetry-layout");
  await pause(page, 2_500);
  await smoothScrollTo(page, ".dependency-section");
  await pause(page, 2_500);
});

await record("05-videodb-story", async (page) => {
  await page.goto(`${baseUrl}/blog/kathaquest-videodb`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page
    .getByRole("heading", {
      name: /I stopped asking VideoDB for a clip/i,
    })
    .waitFor({ timeout: 60_000 });
  await pause(page, 2_000);
  await smoothScrollTo(page, ".blog-cover");
  await pause(page, 2_000);
  await smoothScrollTo(page, ".blog-wide-figure");
  await pause(page, 3_000);
});

await browser.close();
console.log(`Captured five real product flows in ${outputDir}`);
