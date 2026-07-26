import { promises as fs } from "node:fs";
import path from "node:path";

import chapterPackJson from "../data/chapter-pack.json";
import type { ChapterPackItem, Lesson } from "../lib/types";

const root = process.cwd();
const sourcePath = path.join(root, "data", "demo-lessons.json");
const outputPath = path.join(root, "data", "curated-lessons.json");
const chapters = chapterPackJson as ChapterPackItem[];
const stored = JSON.parse(await fs.readFile(sourcePath, "utf8")) as Record<
  string,
  Lesson
>;

const titleHints: Record<string, string[]> = {
  volcanoes: ["volcano", "ज्वालामुखी"],
  "water-cycle": ["water cycle"],
  "solar-system": ["solar system"],
  butterfly: ["butterfly", "metamorphosis"],
  photosynthesis: ["photosynthesis", "plants make food"],
};

const candidates = Object.values(stored)
  .filter(
    (lesson) =>
      lesson.presentation?.storyboard.scenes.length === 9 &&
      lesson.episodes.length === 3,
  )
  .sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

const curated = chapters.flatMap((chapter) => {
  const hints = titleHints[chapter.id] ?? [chapter.title.toLocaleLowerCase()];
  return (["en-IN", "hi-IN"] as const).flatMap((language) => {
    const lesson = candidates.find(
      (candidate) =>
        candidate.language === language &&
        hints.some((hint) =>
          candidate.title.toLocaleLowerCase().includes(hint),
        ),
    );
    if (lesson?.language === "hi-IN") {
      lesson.episodes = lesson.episodes.map((episode) => ({
        ...episode,
        whyThisClip: `इन ${episode.evidence.length} समीक्षा किए गए वीडियो हिस्सों को इसलिए चुना गया है क्योंकि वे “${episode.title}” को सीधे दिखाते या समझाते हैं। हर स्रोत, समय-सीमा और समीक्षा स्कोर नीचे दिया गया है।`,
      }));
    }
    return lesson
      ? [
          {
            chapterId: chapter.id,
            ageGroup: lesson.ageGroup,
            language,
            lesson,
          },
        ]
      : [];
  });
});

await fs.writeFile(outputPath, `${JSON.stringify(curated, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${curated.length} curated lessons to ${path.relative(root, outputPath)}`,
);
