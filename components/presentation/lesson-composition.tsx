import {
  AbsoluteFill,
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
import type { LessonPresentation, StoryboardScene } from "@/lib/types";

const sceneColors = ["#FFF8EE", "#EFF4FF", "#EDFBF5", "#FFF2EE"];

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
  const entrance = spring({ frame, fps, config: { damping: 16 } });
  const opacity = interpolate(
    frame,
    [scene.durationSeconds * fps - 8, scene.durationSeconds * fps],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const transform =
    scene.transition === "slide"
      ? `translateX(${interpolate(entrance, [0, 1], [100, 0])}px)`
      : scene.transition === "zoom"
        ? `scale(${interpolate(entrance, [0, 1], [0.84, 1])})`
        : scene.transition === "wipe"
          ? `translateY(${interpolate(entrance, [0, 1], [80, 0])}px)`
          : "none";
  return (
    <AbsoluteFill
      style={{
        background: sceneColors[index % sceneColors.length],
        color: "#342A54",
        fontFamily: "Arial, sans-serif",
        opacity,
        overflow: "hidden",
        transform,
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 18,
          left: 46,
          position: "absolute",
          top: 34,
          zIndex: 10,
        }}
      >
        <span
          style={{
            background: "#342A54",
            borderRadius: 999,
            color: "#fff",
            fontSize: 19,
            fontWeight: 900,
            padding: "10px 18px",
          }}
        >
          SCENE {index + 1}
        </span>
        <strong style={{ fontSize: 30 }}>{scene.title}</strong>
      </div>
      {children}
      <div
        style={{
          alignItems: "center",
          bottom: 34,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          left: 70,
          position: "absolute",
          right: 70,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          {scene.keywords.map((keyword) => (
            <span
              key={keyword}
              style={{
                background: "#F3B742",
                borderRadius: 999,
                color: "#342A54",
                fontSize: 18,
                fontWeight: 900,
                padding: "8px 15px",
              }}
            >
              {keyword}
            </span>
          ))}
        </div>
        <div
          style={{
            background: "rgba(25,20,43,.9)",
            borderRadius: 20,
            color: "#fff",
            fontSize: 27,
            fontWeight: 800,
            lineHeight: 1.25,
            maxWidth: 1060,
            padding: "15px 26px",
            textAlign: "center",
          }}
        >
          {scene.subtitle}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function LessonScene({
  scene,
  index,
}: {
  scene: StoryboardScene;
  index: number;
}) {
  const { fps } = useVideoConfig();
  if (scene.visual.generatedAsset?.mediaUrl) {
    return (
      <SceneChrome index={index} scene={scene}>
        <AbsoluteFill style={{ background: "#131020" }}>
          <Html5Video
            muted
            src={scene.visual.generatedAsset.mediaUrl}
            style={{ height: "100%", objectFit: "cover", width: "100%" }}
          />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(18,14,34,.48), transparent 32%, rgba(18,14,34,.58))",
            }}
          />
        </AbsoluteFill>
      </SceneChrome>
    );
  }
  if (scene.type === "real_video" && scene.visual.footageMediaUrl) {
    return (
      <SceneChrome index={index} scene={scene}>
        <AbsoluteFill style={{ background: "#131020" }}>
          <Html5Video
            muted
            src={scene.visual.footageMediaUrl}
            startFrom={Math.round(
              (scene.visual.footageStartSeconds ?? 0) * fps,
            )}
            style={{ height: "100%", objectFit: "cover", width: "100%" }}
          />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(18,14,34,.52), transparent 35%, rgba(18,14,34,.58))",
            }}
          />
        </AbsoluteFill>
      </SceneChrome>
    );
  }
  if (scene.type === "guide" || scene.type === "recap") {
    return (
      <SceneChrome index={index} scene={scene}>
        <div
          style={{
            alignItems: "center",
            display: "grid",
            gridTemplateColumns: "360px 1fr",
            height: "100%",
            padding: "80px 100px 150px",
          }}
        >
          <MayaGuide expression={scene.type === "recap" ? "excited" : "curious"} />
          <div>
            <div style={{ color: "#FF775F", fontSize: 26, fontWeight: 900, letterSpacing: 2 }}>
              MAYA ASKS
            </div>
            <div style={{ fontSize: 58, fontWeight: 950, lineHeight: 1.08, marginTop: 18 }}>
              {scene.subtitle}
            </div>
          </div>
        </div>
      </SceneChrome>
    );
  }
  if (scene.type === "checkpoint") {
    return (
      <SceneChrome index={index} scene={scene}>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            justifyContent: "center",
            paddingBottom: 120,
          }}
        >
          <div style={{ transform: "scale(.72)", marginBottom: -34 }}>
            <MayaGuide expression="thinking" />
          </div>
          <div style={{ fontSize: 58, fontWeight: 950, marginTop: 20, maxWidth: 900, textAlign: "center" }}>
            {scene.interactionPrompt ?? scene.subtitle}
          </div>
          <div style={{ color: "#5F5874", fontSize: 26, fontWeight: 800, marginTop: 24 }}>
            Pause the film and say your prediction aloud.
          </div>
        </div>
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
  narrationUrl,
}: {
  presentation: LessonPresentation;
  narrationUrl?: string;
}) {
  const fps = presentation.storyboard.fps;
  return (
    <AbsoluteFill>
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
      {narrationUrl ? <Html5Audio src={narrationUrl} /> : null}
    </AbsoluteFill>
  );
}
