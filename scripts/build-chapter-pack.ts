import { promises as fs } from "node:fs";
import path from "node:path";

import { extractText, getDocumentProxy } from "unpdf";

import type { ChapterPackItem } from "../lib/types";

const definitions: Array<
  Omit<ChapterPackItem, "text" | "pages"> & { file: string }
> = [
  {
    id: "volcanoes",
    file: "01_volcanoes_inside_the_earth.pdf",
    title: "Volcanoes: Inside the Earth",
    subject: "Earth science",
    summary: "Travel below Earth’s crust to meet magma, vents, lava, and new land.",
    ageRange: "Ages 8–12",
    accent: "coral",
  },
  {
    id: "water-cycle",
    file: "02_the_water_cycle.pdf",
    title: "The Water Cycle",
    subject: "Earth science",
    summary: "Follow one drop through evaporation, clouds, rain, and collection.",
    ageRange: "Ages 7–11",
    accent: "blue",
  },
  {
    id: "solar-system",
    file: "03_our_solar_system.pdf",
    title: "Our Solar System",
    subject: "Space science",
    summary: "Meet the Sun, rocky worlds, giant planets, moons, and orbits.",
    ageRange: "Ages 7–12",
    accent: "purple",
  },
  {
    id: "butterfly",
    file: "04_butterfly_metamorphosis.pdf",
    title: "A Butterfly’s Metamorphosis",
    subject: "Life science",
    summary: "See how an egg becomes a caterpillar, chrysalis, and butterfly.",
    ageRange: "Ages 6–10",
    accent: "yellow",
  },
  {
    id: "photosynthesis",
    file: "05_photosynthesis_and_plant_growth.pdf",
    title: "How Plants Make Food",
    subject: "Life science",
    summary: "Discover how leaves use sunlight, water, and air to help plants grow.",
    ageRange: "Ages 8–12",
    accent: "green",
  },
];

const root = process.cwd();
const chapters: ChapterPackItem[] = [];

for (const { file, ...definition } of definitions) {
  const bytes = new Uint8Array(
    await fs.readFile(path.join(root, "Chapter_Pack", file)),
  );
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: false });
  chapters.push({
    ...definition,
    pages: extracted.totalPages,
    text: extracted.text
      .map((page, index) => `[Page ${index + 1}]\n${page}`)
      .join("\n\n")
      .replace(/\u0000/g, "")
      .trim(),
  });
}

await fs.writeFile(
  path.join(root, "data", "chapter-pack.json"),
  `${JSON.stringify(chapters, null, 2)}\n`,
  "utf8",
);

console.log(`Built ${chapters.length} chapter-pack entries.`);
