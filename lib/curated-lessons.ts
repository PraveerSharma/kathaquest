import "server-only";

import { randomUUID } from "node:crypto";

import chapterPackJson from "@/data/chapter-pack.json";
import curatedLessonsJson from "@/data/curated-lessons.json";
import type {
  ChapterPackItem,
  Lesson,
  LessonLanguage,
} from "@/lib/types";

type CuratedLessonEntry = {
  chapterId: string;
  ageGroup: string;
  language: LessonLanguage;
  lesson: Lesson;
};

const chapters = chapterPackJson as ChapterPackItem[];
const curatedLessons = curatedLessonsJson as CuratedLessonEntry[];

export function getCuratedLesson({
  chapterText,
  ageGroup,
  language,
  sourceKind,
}: {
  chapterText: string;
  ageGroup: string;
  language: LessonLanguage;
  sourceKind: Lesson["sourceKind"];
}): Lesson | undefined {
  if (sourceKind !== "chapter-pack") return undefined;
  const chapter = chapters.find((item) => item.text === chapterText);
  if (!chapter) return undefined;
  const entry = curatedLessons.find(
    (item) =>
      item.chapterId === chapter.id &&
      item.ageGroup === ageGroup &&
      item.language === language,
  );
  if (!entry) return undefined;

  const lesson = structuredClone(entry.lesson);
  const lessonId = randomUUID();
  const episodeIds = new Map(
    lesson.episodes.map((episode) => [episode.id, randomUUID()]),
  );
  lesson.id = lessonId;
  lesson.createdAt = new Date().toISOString();
  lesson.episodes = lesson.episodes.map((episode) => ({
    ...episode,
    id: episodeIds.get(episode.id) ?? episode.id,
  }));
  if (lesson.presentation) {
    lesson.presentation.storyboard.scenes =
      lesson.presentation.storyboard.scenes.map((scene) => ({
        ...scene,
        visual: {
          ...scene.visual,
          footageEpisodeId: scene.visual.footageEpisodeId
            ? episodeIds.get(scene.visual.footageEpisodeId)
            : undefined,
        },
      }));
  }
  return lesson;
}
