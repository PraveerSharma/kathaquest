import {
  AbsoluteFill,
  Easing,
  Html5Audio,
  Html5Video,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { DynamicDiagram } from "@/components/presentation/dynamic-diagram";
import { MayaGuide } from "@/components/presentation/maya-guide";
import type {
  LessonPresentation,
  NarrationTrack,
  StoryboardScene,
} from "@/lib/types";

const palettes = [
  { background: "#FFF8EE", glow: "#FFB34F", accent: "#FF775F" },
  { background: "#EFF4FF", glow: "#6F8FF2", accent: "#4F76D9" },
  { background: "#EDFBF5", glow: "#43C894", accent: "#15956B" },
  { background: "#FFF2EE", glow: "#FF8C76", accent: "#D95D4B" },
];

function AmbientBackdrop({ index }: { index: number }) {
  const frame = useCurrentFrame();
  const palette = palettes[index % palettes.length];
  const drift = Math.sin(frame / 34);
  const counterDrift = Math.cos(frame / 42);

  return (
    <AbsoluteFill
      style={{
        background: palette.background,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          backgroundImage:
            "radial-gradient(rgba(52,42,84,.11) 1.5px, transparent 1.5px)",
          backgroundSize: "30px 30px",
          inset: 0,
          maskImage:
            "linear-gradient(110deg, rgba(0,0,0,.7), transparent 70%)",
          opacity: 0.45,
          position: "absolute",
          transform: `translate(${drift * 9}px, ${counterDrift * 6}px)`,
        }}
      />
      <div
        style={{
          background: palette.glow,
          borderRadius: "50%",
          filter: "blur(18px)",
          height: 430,
          opacity: 0.19,
          position: "absolute",
          right: -110 + drift * 30,
          top: -150 + counterDrift * 20,
          transform: `scale(${1 + drift * 0.04})`,
          width: 430,
        }}
      />
      <div
        style={{
          background: palette.accent,
          borderRadius: "50%",
          bottom: -230 + drift * 20,
          filter: "blur(24px)",
          height: 460,
          left: -150 + counterDrift * 25,
          opacity: 0.12,
          position: "absolute",
          width: 460,
        }}
      />
    </AbsoluteFill>
  );
}

function CameraStage({
  children,
  motion,
}: {
  children: React.ReactNode;
  motion: StoryboardScene["visual"]["motion"];
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const settle = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.75, stiffness: 95 },
  });
  const slow = frame / fps;
  const transforms = {
    reveal: `translateY(${interpolate(settle, [0, 1], [34, 0])}px) scale(${interpolate(settle, [0, 1], [0.94, 1])})`,
    flow: `translateX(${Math.sin(slow * 0.8) * 8}px) translateY(${interpolate(settle, [0, 1], [24, 0])}px)`,
    orbit: `perspective(1200px) rotateY(${Math.sin(slow * 0.55) * 2.1}deg) rotateX(${Math.cos(slow * 0.45) * 1.2}deg)`,
    pulse: `scale(${1 + Math.sin(slow * 2.2) * 0.012})`,
    pan_zoom: `translateX(${Math.sin(slow * 0.35) * 6}px) scale(${1.015 + Math.sin(slow * 0.45) * 0.008})`,
  } satisfies Record<StoryboardScene["visual"]["motion"], string>;

  return (
    <div
      style={{
        inset: 0,
        position: "absolute",
        transform: transforms[motion],
        transformOrigin: "50% 48%",
      }}
    >
      {children}
    </div>
  );
}

function SceneChrome({
  scene,
  index,
  children,
}: {
  scene: StoryboardScene;
  index: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palette = palettes[index % palettes.length];
  const durationInFrames = scene.durationSeconds * fps;
  const entrance = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.8, stiffness: 105 },
  });
  const exit = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const transform =
    scene.transition === "slide"
      ? `translateX(${interpolate(entrance, [0, 1], [92, 0])}px)`
      : scene.transition === "zoom"
        ? `scale(${interpolate(entrance, [0, 1], [0.88, 1])})`
        : scene.transition === "wipe"
          ? `translateY(${interpolate(entrance, [0, 1], [72, 0])}px)`
          : `scale(${interpolate(entrance, [0, 1], [0.98, 1])})`;

  return (
    <AbsoluteFill
      style={{
        color: "#342A54",
        fontFamily: "Arial, sans-serif",
        opacity: exit,
        overflow: "hidden",
        transform,
      }}
    >
      <AmbientBackdrop index={index} />
      <CameraStage motion={scene.visual.motion}>{children}</CameraStage>

      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 15,
          left: 42,
          opacity: entrance,
          position: "absolute",
          right: 42,
          top: 30,
          transform: `translateY(${interpolate(entrance, [0, 1], [-22, 0])}px)`,
          zIndex: 30,
        }}
      >
        <span
          style={{
            backdropFilter: "blur(10px)",
            background: "rgba(52,42,84,.92)",
            border: "1px solid rgba(255,255,255,.22)",
            borderRadius: 999,
            boxShadow: "0 10px 26px rgba(31,24,58,.18)",
            color: "#fff",
            fontSize: 17,
            fontWeight: 900,
            letterSpacing: 1.4,
            padding: "10px 17px",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <strong
          style={{
            background: "rgba(255,255,255,.72)",
            border: "1px solid rgba(255,255,255,.68)",
            borderRadius: 16,
            boxShadow: "0 12px 30px rgba(52,42,84,.10)",
            fontSize: 27,
            maxWidth: 840,
            padding: "10px 18px",
          }}
        >
          {scene.title}
        </strong>
        <span
          style={{
            color: "#5F5874",
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: 1.2,
            marginLeft: "auto",
            textTransform: "uppercase",
          }}
        >
          {scene.type.replace("_", " ")}
        </span>
      </div>

      <div
        style={{
          alignItems: "center",
          bottom: 28,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          left: 64,
          position: "absolute",
          right: 64,
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", gap: 9 }}>
          {scene.keywords.map((keyword, keywordIndex) => {
            const keywordReveal = spring({
              frame: frame - 12 - keywordIndex * 5,
              fps,
              config: { damping: 17 },
            });
            return (
              <span
                key={keyword}
                style={{
                  background: palette.glow,
                  border: "2px solid rgba(255,255,255,.8)",
                  borderRadius: 999,
                  boxShadow: "0 7px 18px rgba(52,42,84,.14)",
                  color: "#342A54",
                  fontSize: 17,
                  fontWeight: 900,
                  opacity: keywordReveal,
                  padding: "7px 14px",
                  transform: `translateY(${interpolate(keywordReveal, [0, 1], [14, 0])}px)`,
                }}
              >
                {keyword}
              </span>
            );
          })}
        </div>
        <div
          style={{
            backdropFilter: "blur(14px)",
            background: "rgba(25,20,43,.91)",
            border: "1px solid rgba(255,255,255,.16)",
            borderRadius: 18,
            boxShadow: "0 18px 45px rgba(20,16,38,.28)",
            color: "#fff",
            fontSize: 25,
            fontWeight: 800,
            lineHeight: 1.25,
            maxWidth: 1080,
            padding: "13px 24px",
            textAlign: "center",
            transform: `translateY(${interpolate(entrance, [0, 1], [28, 0])}px)`,
          }}
        >
          {scene.subtitle}
        </div>
      </div>

      <div
        style={{
          background: "rgba(52,42,84,.12)",
          bottom: 0,
          height: 6,
          left: 0,
          position: "absolute",
          right: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            background: `linear-gradient(90deg, ${palette.accent}, ${palette.glow})`,
            boxShadow: `0 0 16px ${palette.glow}`,
            height: "100%",
            transform: `scaleX(${progress})`,
            transformOrigin: "left center",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

function MediaLessonScene({
  generated,
  scene,
}: {
  generated: boolean;
  scene: StoryboardScene;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mediaUrl = generated
    ? scene.visual.generatedAsset?.mediaUrl
    : scene.visual.footageMediaUrl;
  const reveal = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.85 },
  });
  const cameraX = Math.sin(frame / 55) * 8;

  return (
    <AbsoluteFill style={{ background: "#171326" }}>
      <div
        style={{
          border: "2px solid rgba(255,255,255,.24)",
          borderRadius: 28,
          boxShadow: "0 30px 80px rgba(10,8,24,.48)",
          inset: "94px 46px 122px",
          overflow: "hidden",
          position: "absolute",
          transform: `scale(${interpolate(reveal, [0, 1], [0.92, 1])})`,
        }}
      >
        <Html5Video
          muted
          src={mediaUrl!}
          startFrom={
            generated
              ? undefined
              : Math.round((scene.visual.footageStartSeconds ?? 0) * fps)
          }
          style={{
            height: "100%",
            objectFit: "cover",
            transform: `translateX(${cameraX}px) scale(1.055)`,
            width: "100%",
          }}
        />
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, rgba(18,14,34,.32), transparent 38%, rgba(18,14,34,.56))",
          }}
        />
        <div
          style={{
            background:
              "linear-gradient(110deg, transparent 20%, rgba(255,255,255,.14) 48%, transparent 72%)",
            inset: 0,
            position: "absolute",
            transform: `translateX(${interpolate(frame % 150, [0, 149], [-900, 900], {
              easing: Easing.inOut(Easing.ease),
            })}px)`,
          }}
        />
      </div>
      <div
        style={{
          background: generated ? "#7651C8" : "#15956B",
          borderRadius: 999,
          color: "#fff",
          fontSize: 16,
          fontWeight: 900,
          letterSpacing: 1.2,
          padding: "9px 15px",
          position: "absolute",
          right: 70,
          top: 108,
          zIndex: 5,
        }}
      >
        {generated ? "GENERATED CONCEPT VISUAL" : "REVIEWED REAL-WORLD CLIP"}
      </div>
    </AbsoluteFill>
  );
}

function GuideScene({
  scene,
  recap = false,
}: {
  scene: StoryboardScene;
  recap?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        alignItems: "center",
        display: "grid",
        gridTemplateColumns: "350px 1fr",
        height: "100%",
        padding: "86px 92px 144px",
      }}
    >
      <MayaGuide expression={recap ? "excited" : "curious"} />
      <div style={{ paddingLeft: 30 }}>
        <div
          style={{
            color: "#D95744",
            fontSize: 22,
            fontWeight: 950,
            letterSpacing: 2.4,
          }}
        >
          {recap ? "MAYA CONNECTS THE CLUES" : "MAYA WONDERS"}
        </div>
        <div
          style={{
            fontSize: 53,
            fontWeight: 950,
            lineHeight: 1.08,
            marginTop: 15,
            maxWidth: 770,
          }}
        >
          {scene.subtitle}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 24,
          }}
        >
          {scene.visual.labels.slice(0, 4).map((label, index) => {
            const reveal = spring({
              frame: frame - 10 - index * 7,
              fps,
              config: { damping: 16 },
            });
            return (
              <div
                key={label}
                style={{
                  background: "#fff",
                  border: "2px solid rgba(79,118,217,.22)",
                  borderRadius: 16,
                  boxShadow: "0 10px 24px rgba(52,42,84,.10)",
                  fontSize: 20,
                  fontWeight: 850,
                  opacity: reveal,
                  padding: "11px 16px",
                  transform: `translateX(${interpolate(reveal, [0, 1], [26, 0])}px)`,
                }}
              >
                <span style={{ color: "#FF775F", marginRight: 8 }}>✦</span>
                {label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CheckpointScene({ scene }: { scene: StoryboardScene }) {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 8) * 0.035;
  return (
    <div
      style={{
        alignItems: "center",
        display: "grid",
        gridTemplateColumns: "330px 1fr",
        height: "100%",
        padding: "82px 110px 138px",
      }}
    >
      <div style={{ transform: `scale(${pulse * 0.82})` }}>
        <MayaGuide expression="thinking" />
      </div>
      <div>
        <div
          style={{
            alignItems: "center",
            background: "#F3B742",
            border: "7px solid #fff",
            borderRadius: "50%",
            boxShadow: "0 18px 45px rgba(52,42,84,.2)",
            color: "#342A54",
            display: "flex",
            fontSize: 54,
            fontWeight: 950,
            height: 92,
            justifyContent: "center",
            marginBottom: 20,
            transform: `rotate(${Math.sin(frame / 13) * 4}deg)`,
            width: 92,
          }}
        >
          ?
        </div>
        <div
          style={{
            fontSize: 49,
            fontWeight: 950,
            lineHeight: 1.08,
            maxWidth: 760,
          }}
        >
          {scene.interactionPrompt ?? scene.subtitle}
        </div>
        <div
          style={{
            color: "#5F5874",
            display: "flex",
            fontSize: 21,
            fontWeight: 900,
            gap: 12,
            marginTop: 24,
          }}
        >
          {["Think", "Predict", "Explain"].map((step) => (
            <span
              key={step}
              style={{
                background: "rgba(255,255,255,.8)",
                borderRadius: 999,
                padding: "9px 15px",
              }}
            >
              {step}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LessonScene({
  scene,
  index,
}: {
  scene: StoryboardScene;
  index: number;
}) {
  if (scene.visual.generatedAsset?.mediaUrl) {
    return (
      <SceneChrome index={index} scene={scene}>
        <MediaLessonScene generated scene={scene} />
      </SceneChrome>
    );
  }
  if (scene.type === "real_video" && scene.visual.footageMediaUrl) {
    return (
      <SceneChrome index={index} scene={scene}>
        <MediaLessonScene generated={false} scene={scene} />
      </SceneChrome>
    );
  }
  if (scene.type === "guide" || scene.type === "recap") {
    return (
      <SceneChrome index={index} scene={scene}>
        <GuideScene recap={scene.type === "recap"} scene={scene} />
      </SceneChrome>
    );
  }
  if (scene.type === "checkpoint") {
    return (
      <SceneChrome index={index} scene={scene}>
        <CheckpointScene scene={scene} />
      </SceneChrome>
    );
  }
  return (
    <SceneChrome index={index} scene={scene}>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          paddingBottom: 100,
          paddingTop: 70,
        }}
      >
        <DynamicDiagram scene={scene} />
      </div>
    </SceneChrome>
  );
}

export function LessonComposition({
  presentation,
  narrationTracks,
  narrationUrl,
}: {
  presentation: LessonPresentation;
  narrationTracks?: NarrationTrack[];
  narrationUrl?: string;
}) {
  const fps = presentation.storyboard.fps;
  return (
    <AbsoluteFill style={{ background: "#171326" }}>
      {presentation.storyboard.scenes.map((scene, index) => {
        const durationInFrames = Math.round(scene.durationSeconds * fps);
        const from = presentation.storyboard.scenes
          .slice(0, index)
          .reduce(
            (total, previous) =>
              total + Math.round(previous.durationSeconds * fps),
            0,
          );
        return (
          <Sequence
            durationInFrames={durationInFrames}
            from={from}
            key={scene.id}
            name={`${index + 1}. ${scene.title}`}
            premountFor={fps}
          >
            <LessonScene index={index} scene={scene} />
          </Sequence>
        );
      })}
      {narrationTracks?.length
        ? narrationTracks.map((track, index) => (
            <Sequence
              durationInFrames={track.durationInFrames}
              from={track.fromFrame}
              key={`${track.sceneIds.join("-")}-${index}`}
              name={`Narration act ${index + 1}`}
            >
              <Html5Audio
                src={track.audioUrl}
                volume={(frame) =>
                  interpolate(
                    frame,
                    [
                      0,
                      Math.min(10, track.durationInFrames / 4),
                      Math.max(10, track.durationInFrames - 12),
                      track.durationInFrames,
                    ],
                    [0, 0.96, 0.96, 0],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    },
                  )
                }
              />
            </Sequence>
          ))
        : narrationUrl
          ? <Html5Audio src={narrationUrl} volume={0.96} />
          : null}
    </AbsoluteFill>
  );
}
