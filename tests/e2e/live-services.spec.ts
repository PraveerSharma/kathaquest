import { expect, test } from "@playwright/test";

test.skip(
  process.env.RUN_LIVE_E2E !== "1",
  "Set RUN_LIVE_E2E=1 to exercise paid live AI and media services.",
);

test("real child journey generates, plays, localizes, narrates, asks, and quizzes", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await expect(page.locator('.app-shell[data-ready="true"]')).toBeVisible();
  await page.locator(".chapter-card").first().click();
  await page.getByLabel("Adventure language").selectOption("en-IN");
  await page.getByRole("button", { name: /Create my video adventure/i }).click();

  await expect(page.locator(".lesson-wrap")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".episode-card")).toHaveCount(3);
  await expect(page.locator(".episode-kicker").first()).not.toContainText(
    /^Episode 1\s+[0-4]\d?s$/,
  );

  const firstVideo = page.locator(".episode-card video").first();
  await firstVideo.evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    await video.play();
  });
  await expect
    .poll(
      () =>
        firstVideo.evaluate(
          (video: HTMLVideoElement) =>
            video.readyState >= 2 && video.currentTime > 0,
        ),
      { timeout: 45_000 },
    )
    .toBe(true);

  await page.getByLabel("Learning language").selectOption("hi-IN");
  await expect(page.getByText(/Content and narration: Hindi/i)).toBeVisible({
    timeout: 120_000,
  });
  await page
    .getByRole("button", { name: /Add friendly हिंदी voice/i })
    .first()
    .click();
  await expect(page.getByText("हिंदी narrated reel").first()).toBeVisible({
    timeout: 120_000,
  });

  await page.getByLabel("Your question").fill("मैग्मा और लावा में क्या अंतर है?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".answer-box")).toBeVisible({ timeout: 90_000 });

  for (const question of await page.locator(".quiz-list > div").all()) {
    await question.locator(".option-button").first().click();
  }
  await page.getByRole("button", { name: /Check my answers/i }).click();
  await expect(page.locator(".quiz-result")).toBeVisible({ timeout: 90_000 });
});
