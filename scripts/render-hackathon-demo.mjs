import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) throw new Error("SARVAM_API_KEY is required");

const outputDir = resolve("artifacts");
const workDir = resolve("artifacts/demo-work");
mkdirSync(outputDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const segments = [
  {
    image: "public/demo/01-home.png",
    text: "Meet KathaQuest, an AI lesson studio for young learners. A child can choose one of the included chapter packs, or upload any school PDF, select an age group and language, and turn the chapter into a visual, narrated learning experience.",
  },
  {
    image: "public/demo/02-content.png",
    text: "The first prototype only extracted topics and found short video clips. That was not enough to teach. The new pipeline creates a lesson plan, a complete educational script, and a scene-by-scene storyboard before it searches for media.",
  },
  {
    image: "public/demo/03-lesson.png",
    text: "Each scene can combine trusted real footage from VideoDB with diagrams, highlighted keywords, captions, transitions, and knowledge checks. The result feels like one coherent explanation instead of a playlist of unrelated clips.",
  },
  {
    image: "public/demo/01-home.png",
    text: "KathaQuest supports eleven Indian languages. Learners can switch narration without rebuilding the visual lesson. Sarvam provides regional language speech, and ElevenLabs is available behind the same provider interface when valid credentials are configured.",
  },
  {
    image: "public/blog/signoz-traces.png",
    text: "A single lesson crosses document parsing, OpenAI, VideoDB, storyboarding, narration, and storage. I instrumented those stages with OpenTelemetry. In SigNoz, one lesson trace shows exactly where time is spent and which provider, language, relevance score, and fallback path were used.",
  },
  {
    image: "public/blog/signoz-service.png",
    text: "The live test produced three hundred and twenty spans across thirty-four lesson traces, eighteen completed lessons, and twenty-seven product metrics. The data exposed VideoDB latency near six point five seconds at p ninety-five and an average media relevance score around zero point six one five.",
  },
  {
    image: "public/demo/04-blog.png",
    text: "The repository includes Foundry casting files, a reproducible ten-panel KathaQuest dashboard, and alert configuration for failed lessons, slow generation, and low relevance. The public build story documents the actual architecture, measurements, limitations, and decisions.",
  },
  {
    image: "public/demo/02-content.png",
    text: "The biggest lesson was simple. Observability did more than prove the app was running. It showed where the product was wasting a child's time. KathaQuest is now a stronger foundation for interactive, multilingual learning, and every next optimization can be measured. Thank you.",
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

function wrapText(text, width = 76) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const narration = [];
const segmentFiles = [];
let cursor = 0;
let captionIndex = 1;

for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  const audioFile = resolve(workDir, `audio-${index}.mp3`);
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
        speaker: "ishita",
        output_audio_codec: "mp3",
        speech_sample_rate: 48_000,
        pace: 0.94,
        temperature: 0.55,
        enable_preprocessing: true,
      }),
    });
    if (!response.ok) {
      throw new Error(`Sarvam narration failed: ${response.status}`);
    }
    const body = await response.json();
    writeFileSync(audioFile, Buffer.from(body.audios[0], "base64"));
  }
  const duration = probeDuration(audioFile) + 0.35;
  const captionLines = wrapText(segment.text);
  const captionSvg = `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <rect x="45" y="${705 - captionLines.length * 34 - 38}" width="1190" height="${captionLines.length * 34 + 28}" rx="16" fill="#17233A" fill-opacity="0.93"/>
    <text x="640" y="${705 - captionLines.length * 34}" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" font-weight="600" fill="#FFFFFF">
      ${captionLines.map((line, lineIndex) => `<tspan x="640" dy="${lineIndex === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`).join("")}
    </text>
  </svg>`;
  const captionedImage = resolve(workDir, `caption-${index}.png`);
  await sharp(resolve(segment.image))
    .resize(1280, 720, {
      fit: "contain",
      background: "#f7f0e4",
    })
    .composite([{ input: Buffer.from(captionSvg) }])
    .png()
    .toFile(captionedImage);
  const videoFile = resolve(workDir, `segment-${index}.mp4`);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loop",
      "1",
      "-i",
      captionedImage,
      "-i",
      audioFile,
      "-vf",
      "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#f7f0e4,fade=t=in:st=0:d=0.35,fade=t=out:st=" +
        Math.max(0, duration - 0.4).toFixed(2) +
        ":d=0.35",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "stillimage",
      "-r",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      "-t",
      duration.toFixed(2),
      videoFile,
    ],
    { stdio: "ignore" },
  );
  segmentFiles.push(videoFile);

  const sentences = segment.text.match(/[^.!?]+[.!?]+/g) ?? [segment.text];
  const totalWords = sentences.reduce(
    (sum, sentence) => sum + sentence.trim().split(/\s+/).length,
    0,
  );
  let localCursor = cursor;
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).length;
    const sentenceDuration = (duration * words) / totalWords;
    narration.push(
      `${captionIndex}\n${srtTime(localCursor)} --> ${srtTime(localCursor + sentenceDuration)}\n${sentence.trim()}\n`,
    );
    captionIndex += 1;
    localCursor += sentenceDuration;
  }
  cursor += duration;
}

const concatFile = resolve(workDir, "concat.txt");
writeFileSync(
  concatFile,
  segmentFiles.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"),
);
const srtFile = resolve(outputDir, "kathaquest-hackathon-demo.srt");
writeFileSync(srtFile, narration.join("\n"));

const silentVideo = resolve(workDir, "joined.mp4");
execFileSync(
  "ffmpeg",
  ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", silentVideo],
  { stdio: "ignore" },
);

const finalVideo = resolve(outputDir, "kathaquest-hackathon-demo.mp4");
copyFileSync(silentVideo, finalVideo);

const duration = probeDuration(finalVideo);
writeFileSync(
  resolve(outputDir, "kathaquest-hackathon-demo-script.txt"),
  segments.map((segment) => segment.text).join("\n\n"),
);
console.log(`Rendered ${finalVideo} (${duration.toFixed(1)} seconds)`);
if (duration >= 180) throw new Error("Demo exceeds the three-minute limit");
