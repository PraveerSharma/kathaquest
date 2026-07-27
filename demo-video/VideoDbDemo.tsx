import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import manifest from "./generated-manifest.json";

type Caption = {
  endFrame: number;
  startFrame: number;
  text: string;
};

type DemoSegment = {
  audio: string;
  captions: Caption[];
  durationInFrames: number;
  eyebrow: string;
  headline: string;
  startFrame: number;
  visual: {
    kind: "image" | "video";
    src: string;
  };
};

const colors = {
  cream: "#f5eddd",
  coral: "#ef695c",
  green: "#0a6045",
  ink: "#15261f",
  yellow: "#ffd75a",
};

const CaptionCard = ({ captions }: { captions: Caption[] }) => {
  const frame = useCurrentFrame();
  const active =
    captions.find(
      (caption) =>
        frame >= caption.startFrame && frame < caption.endFrame,
    ) ?? captions.at(-1);

  if (!active) return null;

  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(16, 27, 23, 0.94)",
        border: "1px solid rgba(255, 255, 255, 0.18)",
        borderRadius: 18,
        bottom: 24,
        color: "white",
        display: "flex",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 25,
        fontWeight: 700,
        justifyContent: "center",
        left: 110,
        lineHeight: 1.25,
        minHeight: 70,
        padding: "12px 28px",
        position: "absolute",
        right: 110,
        textAlign: "center",
        textShadow: "0 2px 12px rgba(0, 0, 0, 0.4)",
      }}
    >
      {active.text}
    </div>
  );
};

const Segment = ({ segment }: { segment: DemoSegment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 105 },
  });
  const fadeOut = interpolate(
    frame,
    [segment.durationInFrames - 14, segment.durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const motion = interpolate(
    frame,
    [0, segment.durationInFrames],
    [1.015, 1.055],
    { extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 8% 8%, #fff7c9 0, transparent 30%), radial-gradient(circle at 92% 15%, #eedffa 0, transparent 30%), #f5eddd",
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          height: 7,
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      >
        <div
          style={{
            background: colors.coral,
            height: "100%",
            width: `${Math.min(100, (frame / segment.durationInFrames) * 100)}%`,
          }}
        />
      </div>

      <header
        style={{
          alignItems: "center",
          display: "flex",
          height: 104,
          justifyContent: "space-between",
          left: 48,
          opacity: reveal,
          position: "absolute",
          right: 48,
          top: 8,
          transform: `translateY(${(1 - reveal) * -20}px)`,
        }}
      >
        <div>
          <div
            style={{
              color: colors.green,
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 15,
              fontWeight: 900,
              letterSpacing: 2,
              marginBottom: 7,
              textTransform: "uppercase",
            }}
          >
            {segment.eyebrow}
          </div>
          <div
            style={{
              color: colors.ink,
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: -1.1,
              lineHeight: 1,
            }}
          >
            {segment.headline}
          </div>
        </div>
        <div
          style={{
            alignItems: "center",
            background: colors.yellow,
            border: `2px solid ${colors.ink}`,
            borderRadius: 14,
            boxShadow: `4px 4px 0 ${colors.ink}`,
            color: colors.ink,
            display: "flex",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: 19,
            fontWeight: 900,
            height: 52,
            justifyContent: "center",
            width: 192,
          }}
        >
          KathaQuest × VideoDB
        </div>
      </header>

      <div
        style={{
          background: "#fff",
          border: `2px solid ${colors.ink}`,
          borderRadius: 24,
          bottom: 92,
          boxShadow: "0 22px 55px rgba(21, 38, 31, 0.18)",
          left: 48,
          overflow: "hidden",
          position: "absolute",
          right: 48,
          top: 112,
          transform: `scale(${motion})`,
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#17241f",
            display: "flex",
            gap: 8,
            height: 29,
            paddingLeft: 16,
          }}
        >
          {["#ef695c", "#ffd75a", "#75cf9c"].map((color) => (
            <span
              key={color}
              style={{
                background: color,
                borderRadius: "50%",
                height: 9,
                width: 9,
              }}
            />
          ))}
          <span
            style={{
              color: "rgba(255,255,255,.65)",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 12,
              marginLeft: 12,
            }}
          >
            kathaquest.vercel.app
          </span>
        </div>
        <div
          style={{
            height: "calc(100% - 29px)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {segment.visual.kind === "video" ? (
            <OffthreadVideo
              muted
              pauseWhenBuffering
              src={staticFile(segment.visual.src)}
              style={{
                height: "100%",
                objectFit: "cover",
                width: "100%",
              }}
            />
          ) : (
            <Img
              src={staticFile(segment.visual.src)}
              style={{
                height: "100%",
                objectFit: "cover",
                width: "100%",
              }}
            />
          )}
        </div>
      </div>

      <CaptionCard captions={segment.captions} />
      <Audio src={staticFile(segment.audio)} />
    </AbsoluteFill>
  );
};

export const VideoDbDemo = () => (
  <AbsoluteFill style={{ backgroundColor: colors.cream }}>
    {(manifest.segments as DemoSegment[]).map((segment) => (
      <Sequence
        key={`${segment.startFrame}-${segment.headline}`}
        from={segment.startFrame}
        durationInFrames={segment.durationInFrames}
        premountFor={30}
      >
        <Segment segment={segment} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
