import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { StoryboardScene } from "@/lib/types";

const colors = ["#FF775F", "#4F76D9", "#22A879", "#F3B742", "#8A5BD1"];

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g>
      <line
        markerEnd="url(#arrow)"
        stroke="#342A54"
        strokeLinecap="round"
        strokeWidth="6"
        x1={x1}
        x2={x2}
        y1={y1}
        y2={y2}
      />
    </g>
  );
}

export function DynamicDiagram({ scene }: { scene: StoryboardScene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const labels = scene.visual.labels.slice(0, 5);
  const reveal = labels.map((_, index) =>
    spring({
      frame: frame - index * 8,
      fps,
      config: { damping: 14 },
    }),
  );
  const orbitRotation = frame * 0.7;

  if (scene.visual.diagramTemplate === "orbit") {
    return (
      <svg viewBox="0 0 760 430" width="790">
        <circle cx="380" cy="215" fill="#F3B742" r="64" />
        {[0, 1, 2].map((index) => {
          const radiusX = 140 + index * 80;
          const radiusY = 65 + index * 35;
          const angle = ((orbitRotation + index * 110) * Math.PI) / 180;
          const x = 380 + Math.cos(angle) * radiusX;
          const y = 215 + Math.sin(angle) * radiusY;
          return (
            <g key={index}>
              <ellipse
                cx="380"
                cy="215"
                fill="none"
                rx={radiusX}
                ry={radiusY}
                stroke="#C6D3F8"
                strokeWidth="4"
              />
              <circle cx={x} cy={y} fill={colors[index + 1]} r={22 + index * 3} />
            </g>
          );
        })}
        <text fill="#342A54" fontSize="28" fontWeight="900" textAnchor="middle" x="380" y="225">
          {labels[0]}
        </text>
      </svg>
    );
  }

  if (scene.visual.diagramTemplate === "cycle") {
    const points = labels.map((label, index) => {
      const angle = (index / labels.length) * Math.PI * 2 - Math.PI / 2;
      return {
        label,
        x: 380 + Math.cos(angle) * 245,
        y: 220 + Math.sin(angle) * 150,
      };
    });
    return (
      <svg viewBox="0 0 760 440" width="790">
        <defs>
          <marker id="arrow" markerHeight="10" markerWidth="10" orient="auto" refX="8" refY="3">
            <path d="M0,0 L0,6 L9,3 z" fill="#342A54" />
          </marker>
        </defs>
        {points.map((point, index) => {
          const next = points[(index + 1) % points.length];
          return <Arrow key={`arrow-${point.label}`} x1={point.x} x2={next.x} y1={point.y} y2={next.y} />;
        })}
        {points.map((point, index) => (
          <g
            key={point.label}
            style={{
              opacity: reveal[index],
              transform: `translate(${point.x}px, ${point.y}px) scale(${reveal[index]})`,
              transformOrigin: "0 0",
            }}
          >
            <circle fill={colors[index]} r="65" />
            <text fill="#fff" fontSize="22" fontWeight="900" textAnchor="middle">
              <tspan x="0" y="-3">{point.label.slice(0, 16)}</tspan>
            </text>
          </g>
        ))}
      </svg>
    );
  }

  if (scene.visual.diagramTemplate === "comparison") {
    return (
      <div style={{ display: "grid", gap: 34, gridTemplateColumns: "1fr 1fr", width: 820 }}>
        {labels.slice(0, 2).map((label, index) => (
          <div
            key={label}
            style={{
              background: index === 0 ? "#FFF0EC" : "#EEF3FF",
              border: `5px solid ${colors[index]}`,
              borderRadius: 36,
              color: "#342A54",
              fontSize: 36,
              fontWeight: 900,
              minHeight: 260,
              opacity: reveal[index],
              padding: 48,
              transform: `translateX(${interpolate(reveal[index], [0, 1], [index === 0 ? -90 : 90, 0])}px)`,
            }}
          >
            <span style={{ color: colors[index], display: "block", fontSize: 72, marginBottom: 28 }}>
              {index === 0 ? "A" : "B"}
            </span>
            {label}
          </div>
        ))}
      </div>
    );
  }

  const isLayers = scene.visual.diagramTemplate === "layers";
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: isLayers ? "column" : "row",
        gap: isLayers ? 10 : 18,
        justifyContent: "center",
        width: 900,
      }}
    >
      {labels.map((label, index) => (
        <div
          key={`${label}-${index}`}
          style={{
            alignItems: "center",
            background: colors[index],
            border: "5px solid #fff",
            borderRadius: isLayers ? 24 : 999,
            boxShadow: "0 16px 34px rgba(52,42,84,.18)",
            color: "#fff",
            display: "flex",
            fontSize: 25,
            fontWeight: 900,
            height: isLayers ? 65 : 155,
            justifyContent: "center",
            opacity: reveal[index],
            padding: "18px 30px",
            textAlign: "center",
            transform: `scale(${reveal[index]}) translateY(${interpolate(reveal[index], [0, 1], [35, 0])}px)`,
            width: isLayers ? `${85 - index * 8}%` : 155,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
