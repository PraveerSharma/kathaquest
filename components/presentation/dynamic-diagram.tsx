import {
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { StoryboardScene } from "@/lib/types";

const colors = ["#FF775F", "#4F76D9", "#22A879", "#F3B742", "#8A5BD1"];

function AnimatedArrow({
  delay = 0,
  x1,
  x2,
  y1,
  y2,
}: {
  delay?: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}) {
  const frame = useCurrentFrame();
  const draw = interpolate(frame - delay, [0, 18], [1, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const particle = interpolate((frame - delay) % 45, [0, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <g>
      <line
        markerEnd="url(#arrow)"
        stroke="#342A54"
        strokeDasharray="12 10"
        strokeDashoffset={draw * 180}
        strokeLinecap="round"
        strokeWidth="5"
        x1={x1}
        x2={x2}
        y1={y1}
        y2={y2}
      />
      <circle
        cx={x1 + (x2 - x1) * particle}
        cy={y1 + (y2 - y1) * particle}
        fill="#fff"
        r="7"
        stroke="#342A54"
        strokeWidth="3"
      />
    </g>
  );
}

function SvgDefs() {
  return (
    <defs>
      <filter id="node-shadow" height="160%" width="160%" x="-30%" y="-30%">
        <feDropShadow
          dx="0"
          dy="12"
          floodColor="#342A54"
          floodOpacity=".18"
          stdDeviation="10"
        />
      </filter>
      <marker
        id="arrow"
        markerHeight="10"
        markerWidth="10"
        orient="auto"
        refX="8"
        refY="3"
      >
        <path d="M0,0 L0,6 L9,3 z" fill="#342A54" />
      </marker>
      <linearGradient id="shine" x1="0" x2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".06" />
        <stop offset=".5" stopColor="#fff" stopOpacity=".5" />
        <stop offset="1" stopColor="#fff" stopOpacity=".06" />
      </linearGradient>
    </defs>
  );
}

function safeLabels(scene: StoryboardScene) {
  const labels = scene.visual.labels.filter(Boolean).slice(0, 5);
  return labels.length > 0 ? labels : [scene.title];
}

function LabelText({
  label,
  size = 21,
  x = 0,
  y = 0,
}: {
  label: string;
  size?: number;
  x?: number;
  y?: number;
}) {
  const words = label.trim().split(/\s+/);
  const midpoint = Math.ceil(words.length / 2);
  const lines =
    label.length > 15 && words.length > 1
      ? [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")]
      : [label];
  return (
    <text
      fill="#fff"
      fontSize={size}
      fontWeight="900"
      textAnchor="middle"
      x={x}
      y={y}
    >
      {lines.map((line, index) => (
        <tspan
          dy={index === 0 ? (lines.length === 1 ? 7 : -2) : size + 4}
          key={`${line}-${index}`}
          x={x}
        >
          {line.slice(0, 18)}
        </tspan>
      ))}
    </text>
  );
}

export function DynamicDiagram({ scene }: { scene: StoryboardScene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const labels = safeLabels(scene);
  const reveal = labels.map((_, index) =>
    spring({
      frame: frame - index * 9,
      fps,
      config: { damping: 15, mass: 0.72, stiffness: 105 },
    }),
  );
  const breathe = 1 + Math.sin(frame / 15) * 0.025;

  if (scene.visual.diagramTemplate === "orbit") {
    return (
      <svg
        style={{ filter: "drop-shadow(0 24px 35px rgba(52,42,84,.12))" }}
        viewBox="0 0 820 470"
        width="850"
      >
        <SvgDefs />
        <circle
          cx="410"
          cy="235"
          fill="#F3B742"
          opacity=".18"
          r={98 * breathe}
        />
        <circle
          cx="410"
          cy="235"
          fill="#F3B742"
          filter="url(#node-shadow)"
          r="68"
          stroke="#fff"
          strokeWidth="7"
        />
        {[0, 1, 2].map((index) => {
          const radiusX = 150 + index * 82;
          const radiusY = 72 + index * 38;
          const angle = ((frame * (0.45 + index * 0.08) + index * 115) * Math.PI) / 180;
          const x = 410 + Math.cos(angle) * radiusX;
          const y = 235 + Math.sin(angle) * radiusY;
          return (
            <g key={index}>
              <ellipse
                cx="410"
                cy="235"
                fill="none"
                rx={radiusX}
                ry={radiusY}
                stroke={colors[index + 1]}
                strokeDasharray="9 10"
                strokeOpacity=".38"
                strokeWidth="4"
              />
              <circle
                cx={x}
                cy={y}
                fill={colors[index + 1]}
                filter="url(#node-shadow)"
                r={23 + index * 3}
                stroke="#fff"
                strokeWidth="5"
              />
            </g>
          );
        })}
        <text
          fill="#342A54"
          fontSize="24"
          fontWeight="950"
          textAnchor="middle"
          x="410"
          y="244"
        >
          {labels[0].slice(0, 18)}
        </text>
      </svg>
    );
  }

  if (scene.visual.diagramTemplate === "cycle") {
    const points = labels.map((label, index) => {
      const angle = (index / labels.length) * Math.PI * 2 - Math.PI / 2;
      return {
        label,
        x: 410 + Math.cos(angle) * 275,
        y: 235 + Math.sin(angle) * 165,
      };
    });
    return (
      <svg viewBox="0 0 820 470" width="850">
        <SvgDefs />
        <circle
          cx="410"
          cy="235"
          fill="none"
          r={88 + Math.sin(frame / 14) * 5}
          stroke="#F3B742"
          strokeDasharray="8 9"
          strokeWidth="4"
        />
        <text
          fill="#342A54"
          fontSize="21"
          fontWeight="950"
          textAnchor="middle"
          x="410"
          y="242"
        >
          REPEAT
        </text>
        {points.map((point, index) => {
          const next = points[(index + 1) % points.length];
          return (
            <AnimatedArrow
              delay={index * 7}
              key={`arrow-${point.label}`}
              x1={point.x}
              x2={next.x}
              y1={point.y}
              y2={next.y}
            />
          );
        })}
        {points.map((point, index) => (
          <g
            key={`${point.label}-${index}`}
            style={{
              filter: "url(#node-shadow)",
              opacity: reveal[index],
              transform: `translate(${point.x}px, ${point.y}px) scale(${reveal[index]})`,
              transformOrigin: "0 0",
            }}
          >
            <circle
              fill={colors[index]}
              r="66"
              stroke="#fff"
              strokeWidth="6"
            />
            <LabelText label={point.label} />
          </g>
        ))}
      </svg>
    );
  }

  if (scene.visual.diagramTemplate === "comparison") {
    return (
      <div
        style={{
          display: "grid",
          gap: 38,
          gridTemplateColumns: "1fr 1fr",
          perspective: 1200,
          width: 870,
        }}
      >
        {labels.slice(0, 2).map((label, index) => (
          <div
            key={label}
            style={{
              background:
                index === 0
                  ? "linear-gradient(145deg, #FFF7F3, #FFE4DD)"
                  : "linear-gradient(145deg, #F7F9FF, #DDE7FF)",
              border: `5px solid ${colors[index]}`,
              borderRadius: 34,
              boxShadow: "0 24px 55px rgba(52,42,84,.17)",
              color: "#342A54",
              fontSize: 34,
              fontWeight: 900,
              minHeight: 270,
              opacity: reveal[index],
              overflow: "hidden",
              padding: 44,
              position: "relative",
              transform: `translateX(${interpolate(reveal[index], [0, 1], [index === 0 ? -95 : 95, 0])}px) rotateY(${interpolate(reveal[index], [0, 1], [index === 0 ? 10 : -10, 0])}deg)`,
            }}
          >
            <span
              style={{
                color: colors[index],
                display: "block",
                fontSize: 68,
                marginBottom: 24,
              }}
            >
              {index === 0 ? "A" : "B"}
            </span>
            {label}
            <div
              style={{
                background:
                  "linear-gradient(110deg, transparent, rgba(255,255,255,.7), transparent)",
                height: "160%",
                left: `${interpolate(frame % 120, [0, 119], [-70, 130])}%`,
                position: "absolute",
                top: "-30%",
                transform: "rotate(15deg)",
                width: 65,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (scene.visual.diagramTemplate === "concept_map") {
    const outer = labels.slice(1, 5);
    const positions = [
      { x: 165, y: 100 },
      { x: 655, y: 100 },
      { x: 165, y: 370 },
      { x: 655, y: 370 },
    ];
    return (
      <svg viewBox="0 0 820 470" width="850">
        <SvgDefs />
        {outer.map((label, index) => (
          <AnimatedArrow
            delay={index * 7}
            key={`map-arrow-${label}`}
            x1={410}
            x2={positions[index].x}
            y1={235}
            y2={positions[index].y}
          />
        ))}
        <g
          style={{
            filter: "url(#node-shadow)",
            transform: `translate(410px, 235px) scale(${breathe})`,
            transformOrigin: "0 0",
          }}
        >
          <circle fill="#342A54" r="82" stroke="#fff" strokeWidth="7" />
          <LabelText label={labels[0]} />
        </g>
        {outer.map((label, index) => (
          <g
            key={`${label}-${index}`}
            style={{
              filter: "url(#node-shadow)",
              opacity: reveal[index + 1],
              transform: `translate(${positions[index].x}px, ${positions[index].y}px) scale(${reveal[index + 1]})`,
              transformOrigin: "0 0",
            }}
          >
            <circle
              fill={colors[(index + 1) % colors.length]}
              r="63"
              stroke="#fff"
              strokeWidth="6"
            />
            <LabelText label={label} size={19} />
          </g>
        ))}
      </svg>
    );
  }

  if (
    scene.visual.diagramTemplate === "process" ||
    scene.visual.diagramTemplate === "cause_effect"
  ) {
    const positions = labels.map((_, index) => {
      const spacing = Math.min(190, 760 / Math.max(labels.length, 1));
      return {
        x: 410 + (index - (labels.length - 1) / 2) * spacing,
        y:
          scene.visual.diagramTemplate === "cause_effect"
            ? 220 + (index % 2 === 0 ? -34 : 34)
            : 235,
      };
    });
    return (
      <svg viewBox="0 0 820 470" width="850">
        <SvgDefs />
        {positions.slice(0, -1).map((point, index) => (
          <AnimatedArrow
            delay={index * 8}
            key={`process-arrow-${index}`}
            x1={point.x + 62}
            x2={positions[index + 1].x - 62}
            y1={point.y}
            y2={positions[index + 1].y}
          />
        ))}
        {positions.map((point, index) => (
          <g
            key={`${labels[index]}-${index}`}
            style={{
              filter: "url(#node-shadow)",
              opacity: reveal[index],
              transform: `translate(${point.x}px, ${point.y}px) scale(${reveal[index]})`,
              transformOrigin: "0 0",
            }}
          >
            <circle
              fill={colors[index % colors.length]}
              r="68"
              stroke="#fff"
              strokeWidth="6"
            />
            <circle
              fill="none"
              r={77 + Math.sin((frame + index * 8) / 13) * 3}
              stroke={colors[index % colors.length]}
              strokeOpacity=".28"
              strokeWidth="4"
            />
            <LabelText label={labels[index]} size={19} />
          </g>
        ))}
      </svg>
    );
  }

  const isLayers = scene.visual.diagramTemplate === "layers";
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: isLayers ? "column" : "row",
        gap: isLayers ? 9 : 18,
        justifyContent: "center",
        perspective: 1200,
        width: 920,
      }}
    >
      {labels.map((label, index) => (
        <div
          key={`${label}-${index}`}
          style={{
            alignItems: "center",
            background: `linear-gradient(135deg, ${colors[index]}, ${colors[index]}cc)`,
            border: "5px solid rgba(255,255,255,.92)",
            borderRadius: isLayers ? 22 : 999,
            boxShadow: `0 ${14 + index * 2}px 34px rgba(52,42,84,.19)`,
            color: "#fff",
            display: "flex",
            fontSize: 24,
            fontWeight: 900,
            height: isLayers ? 64 : 158,
            justifyContent: "center",
            opacity: reveal[index],
            overflow: "hidden",
            padding: "18px 28px",
            position: "relative",
            textAlign: "center",
            transform: `scale(${reveal[index]}) translateY(${interpolate(reveal[index], [0, 1], [38, 0])}px) rotateX(${interpolate(reveal[index], [0, 1], [12, 0])}deg)`,
            width: isLayers ? `${88 - index * 8}%` : 158,
          }}
        >
          {label}
          <div
            style={{
              background:
                "linear-gradient(110deg, transparent, rgba(255,255,255,.42), transparent)",
              height: "180%",
              left: `${interpolate((frame + index * 17) % 130, [0, 129], [-50, 130])}%`,
              position: "absolute",
              top: "-40%",
              transform: "rotate(18deg)",
              width: 42,
            }}
          />
        </div>
      ))}
    </div>
  );
}
