import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(".");
const envFile = resolve(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) throw new Error("SARVAM_API_KEY is required in .env.local");

const captureDir = resolve(root, "artifacts/videodb-demo-captures");
const workDir = resolve(root, "public/demo-video-work");
const artifactDir = resolve(root, "artifacts");
const publicDemoDir = resolve(root, "public/demo");
mkdirSync(workDir, { recursive: true });
mkdirSync(artifactDir, { recursive: true });
mkdirSync(publicDemoDir, { recursive: true });

const segments = [
  {
    capture: "01-home.webm",
    eyebrow: "01 · THE USE CASE",
    headline: "A chapter should become one lesson",
    text: "A textbook chapter can explain a process, but children often need to see it move. KathaQuest turns that chapter into one interactive lesson instead of sending a learner through a pile of short, loosely related clips.",
    visual: { kind: "video", src: "demo-video-work/01-home.mp4" },
  },
  {
    capture: "01-home.webm",
    eyebrow: "02 · LESSON DESIGN",
    headline: "Plan first. Search second.",
    text: "The learner selects a chapter or uploads a PDF, chooses an age and language, then starts the build. KathaQuest extracts three source-quoted objectives, writes the educational script, and plans a nine-scene storyboard before it asks for footage.",
    visual: { kind: "video", src: "demo-video-work/01-home.mp4" },
  },
  {
    eyebrow: "03 · VIDEODB ARCHIVE",
    headline: "Search speech and what the camera sees",
    text: "VideoDB holds twelve real educational videos from NASA, NOAA, the US Geological Survey, and the National Park Service. The ingestion job creates spoken-word and visual scene indexes, so narration and what the camera actually shows can both answer a search.",
    visual: { kind: "image", src: "blog/videodb-architecture.svg" },
  },
  {
    capture: "02-adventure.webm",
    eyebrow: "04 · EVIDENCE RETRIEVAL",
    headline: "Keep only the moments that teach",
    text: "For each objective, KathaQuest runs focused queries across both indexes, pools the timestamps, removes overlaps, checks the reviewed-source allowlist, and uses a precision reviewer. Only strong moments survive. VideoDB then compiles complementary ranges into a playable evidence reel with the source, licence, and exact time beside it.",
    visual: { kind: "video", src: "demo-video-work/02-adventure.mp4" },
  },
  {
    capture: "03-lesson-studio.webm",
    eyebrow: "05 · ONE LESSON FILM",
    headline: "Real footage meets a programmable story",
    text: "The retrieved moments feed one Remotion lesson. Maya guides the child through diagrams, captions, real footage, and a pause to predict. The learner can change the whole lesson language, ask a spoken question, or revisit a missed idea with a shorter VideoDB revision reel.",
    visual: { kind: "video", src: "demo-video-work/03-lesson-studio.mp4" },
  },
  {
    eyebrow: "06 · HONEST FALLBACK",
    headline: "The archive is allowed to say no",
    text: "Our Sound chapter had no strong match, so KathaQuest kept the chapter-grounded explanation and rendered diagrams instead of lowering the threshold. That makes every VideoDB clip meaningful when one does appear.",
    visual: { kind: "image", src: "blog/videodb-lesson-studio.png" },
  },
  {
    capture: "04-observability.webm",
    eyebrow: "07 · PRODUCTION PROOF",
    headline: "Every lesson is visible in SigNoz",
    text: "A live SigNoz dashboard traces planning, retrieval, composition, and narration, including latency and relevance. The two engineering stories explain both sides of the build: how VideoDB turns footage into evidence, and how SigNoz shows whether that pipeline is healthy.",
    visual: { kind: "video", src: "demo-video-work/04-observability.mp4" },
  },
  {
    capture: "05-videodb-story.webm",
    eyebrow: "08 · READY TO EXPLORE",
    headline: "An AI lesson studio grounded in real media",
    text: "KathaQuest is an AI lesson studio grounded in real media. The app, public repository, build stories, and this working demo are ready to explore.",
    visual: { kind: "video", src: "demo-video-work/05-videodb-story.mp4" },
  },
];

function probeDuration(file) {
  return Number(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
}

function srtTime(seconds) {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  const ms = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function sentences(text) {
  return text.match(/[^.!?]+[.!?]+/g)?.map((item) => item.trim()) ?? [text];
}

for (const segment of segments) {
  if (!segment.capture) continue;
  const source = resolve(captureDir, segment.capture);
  if (!existsSync(source)) {
    throw new Error(`Missing real browser capture: ${source}. Run npm run demo:capture first.`);
  }
  const destination = resolve(workDir, segment.visual.src.split("/").at(-1));
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      source,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      destination,
    ],
    { stdio: "ignore" },
  );
}

let cursor = 0;
let srtCursor = 0;
let captionNumber = 1;
const captions = [];
const renderedSegments = [];

for (const segment of segments) {
  const hash = createHash("sha256").update(segment.text).digest("hex").slice(0, 12);
  const audioName = `narration-${hash}.mp3`;
  const audioFile = resolve(workDir, audioName);
  if (!existsSync(audioFile)) {
    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: segment.text,
        target_language_code: "en-IN",
        model: "bulbul:v3",
        speaker: "aayan",
        output_audio_codec: "mp3",
        speech_sample_rate: 48_000,
        pace: 0.92,
        temperature: 0.48,
        enable_preprocessing: true,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Sarvam narration failed (${response.status}): ${detail.slice(0, 240)}`);
    }
    const body = await response.json();
    if (!body.audios?.[0]) throw new Error("Sarvam returned no narration audio");
    writeFileSync(audioFile, Buffer.from(body.audios[0], "base64"));
  }

  const audioDuration = probeDuration(audioFile);
  const durationInFrames = Math.ceil((audioDuration + 0.5) * 30);
  const segmentSentences = sentences(segment.text);
  const wordTotal = segmentSentences.reduce(
    (sum, sentence) => sum + sentence.split(/\s+/).length,
    0,
  );
  let captionFrame = 0;
  const segmentCaptions = segmentSentences.map((sentence, index) => {
    const wordCount = sentence.split(/\s+/).length;
    const sentenceFrames =
      index === segmentSentences.length - 1
        ? durationInFrames - captionFrame
        : Math.round((audioDuration * 30 * wordCount) / wordTotal);
    const caption = {
      startFrame: captionFrame,
      endFrame: captionFrame + sentenceFrames,
      text: sentence,
    };
    captions.push(
      `${captionNumber}\n${srtTime(srtCursor + caption.startFrame / 30)} --> ${srtTime(
        srtCursor + caption.endFrame / 30,
      )}\n${sentence}\n`,
    );
    captionNumber += 1;
    captionFrame += sentenceFrames;
    return caption;
  });

  renderedSegments.push({
    ...segment,
    audio: `demo-video-work/${audioName}`,
    captions: segmentCaptions,
    durationInFrames,
    startFrame: cursor,
  });
  cursor += durationInFrames;
  srtCursor += durationInFrames / 30;
}

const manifest = {
  totalFrames: cursor,
  segments: renderedSegments.map((segment) => ({
    audio: segment.audio,
    captions: segment.captions,
    durationInFrames: segment.durationInFrames,
    eyebrow: segment.eyebrow,
    headline: segment.headline,
    startFrame: segment.startFrame,
    visual: segment.visual,
  })),
};
writeFileSync(
  resolve(root, "demo-video/generated-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
writeFileSync(
  resolve(artifactDir, "kathaquest-videodb-demo.srt"),
  captions.join("\n"),
);
writeFileSync(
  resolve(artifactDir, "kathaquest-videodb-demo-script.txt"),
  segments.map((segment) => segment.text).join("\n\n"),
);

const finalVideo = resolve(
  publicDemoDir,
  "kathaquest-videodb-hackathon-demo.mp4",
);
execFileSync(
  resolve(root, "node_modules/.bin/remotion"),
  [
    "render",
    "demo-video/index.ts",
    "KathaQuestVideoDBDemo",
    finalVideo,
    "--codec=h264",
    "--crf=18",
    "--pixel-format=yuv420p",
    "--overwrite",
  ],
  { cwd: root, stdio: "inherit" },
);
copyFileSync(
  finalVideo,
  resolve(artifactDir, "kathaquest-videodb-hackathon-demo.mp4"),
);

const duration = probeDuration(finalVideo);
console.log(`Rendered ${finalVideo} (${duration.toFixed(1)} seconds)`);
if (duration < 60 || duration > 180) {
  throw new Error(`VideoDB demo must be 60 to 180 seconds, got ${duration.toFixed(1)}`);
}
