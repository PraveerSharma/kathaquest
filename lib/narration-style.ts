export const NARRATION_RENDER_VERSION = "warm-storyteller-v2";

const sentenceBoundary = /(?<=[.!?।॥])\s+/u;

function cleanSpeechText(text: string) {
  return text
    .replace(/[*_#`]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*([,;:!?।॥])[ \t]*/g, "$1 ")
    .replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .trim();
}

/**
 * Shapes generated lesson copy into short spoken paragraphs. Sarvam uses the
 * paragraph breaks directly; ElevenLabs turns them into exact, restrained
 * pauses. Keeping this deterministic also makes cached narration reproducible.
 */
export function naturalNarrationParagraphs(text: string): string[] {
  const cleaned = cleanSpeechText(text);
  if (!cleaned) return [];

  const sourceParagraphs = cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const paragraphs: string[] = [];

  for (const source of sourceParagraphs) {
    const sentences = source.split(sentenceBoundary).filter(Boolean);
    if (sentences.length <= 2) {
      paragraphs.push(source);
      continue;
    }
    for (let index = 0; index < sentences.length; index += 2) {
      paragraphs.push(sentences.slice(index, index + 2).join(" "));
    }
  }
  return paragraphs;
}

export function prepareSarvamNarration(text: string) {
  return naturalNarrationParagraphs(text).join("\n\n");
}

export function prepareElevenLabsNarration(text: string) {
  return naturalNarrationParagraphs(text).join(
    ' <break time="0.75s" /> ',
  );
}

export function composeSceneNarration(
  scenes: ReadonlyArray<{ narration: string }>,
) {
  return scenes
    .map((scene) => cleanSpeechText(scene.narration))
    .filter(Boolean)
    .join("\n\n");
}
