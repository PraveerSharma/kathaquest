import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export function MayaGuide({
  expression = "curious",
}: {
  expression?: "curious" | "excited" | "thinking";
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 13 } });
  const bob = Math.sin(frame / 10) * 6;
  const eyeOffset = expression === "thinking" ? -2 : 0;
  const smile =
    expression === "excited"
      ? "M 88 126 Q 120 154 152 126"
      : "M 92 128 Q 120 145 148 128";

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        transform: `translateY(${interpolate(entrance, [0, 1], [80, bob])}px) scale(${interpolate(entrance, [0, 1], [0.65, 1])})`,
      }}
    >
      <svg
        aria-label="Maya the Explorer"
        role="img"
        style={{ filter: "drop-shadow(0 20px 30px rgba(42, 38, 76, .22))" }}
        viewBox="0 0 240 300"
        width="280"
      >
        <path d="M57 105c0-55 29-86 64-86 46 0 68 38 64 91l-9 72H66l-9-77Z" fill="#302652" />
        <circle cx="120" cy="104" fill="#B56E4D" r="65" />
        <path d="M60 83c7-47 35-67 67-63 26 3 48 22 57 50-26-15-43-31-52-45-12 26-38 48-72 58Z" fill="#302652" />
        <ellipse cx="96" cy={105 + eyeOffset} fill="#271F3D" rx="6" ry="8" />
        <ellipse cx="145" cy={105 + eyeOffset} fill="#271F3D" rx="6" ry="8" />
        <circle cx="98" cy={102 + eyeOffset} fill="#fff" r="2" />
        <circle cx="147" cy={102 + eyeOffset} fill="#fff" r="2" />
        <path d={smile} fill="none" stroke="#6C2F36" strokeLinecap="round" strokeWidth="5" />
        <path d="M86 161h68l8 34H77l9-34Z" fill="#B56E4D" />
        <path d="M53 190c18-15 44-22 67-22 25 0 52 7 69 23l18 92H34l19-93Z" fill="#4F76D9" />
        <path d="m93 175 27 23 27-23 12 12-39 42-39-42 12-12Z" fill="#F3B742" />
        <path d="M70 210h100v73H70z" fill="#5D86E8" opacity=".65" />
        <circle cx="120" cy="244" fill="#F3B742" r="17" />
        <path d="m120 234 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1 3-7Z" fill="#fff" />
      </svg>
      <div
        style={{
          background: "#fff",
          border: "4px solid #302652",
          borderRadius: 999,
          color: "#302652",
          fontFamily: "var(--font-body, sans-serif)",
          fontSize: 25,
          fontWeight: 900,
          marginTop: -18,
          padding: "12px 28px",
        }}
      >
        Maya · Curious Explorer
      </div>
    </div>
  );
}
