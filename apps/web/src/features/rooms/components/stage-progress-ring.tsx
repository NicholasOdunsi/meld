"use client";

// A determinate percent ring. The design system ships only a linear ProgressBar
// and an indeterminate Spinner, so the collapsed pill's progress dial is a small
// custom SVG. Colours come from theme tokens, so it tracks light/dark for free.
export function StageProgressRing({
  ratio,
  size = 22,
  strokeWidth = 3,
  label,
}: {
  ratio: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference * clamped;
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      style={{ display: "block", flex: "none" }}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--color-border-emphasized)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--color-success)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${progress} ${circumference - progress}`}
        transform={`rotate(-90 ${center} ${center})`}
        style={{
          transition:
            "stroke-dasharray var(--duration-slow-max, 0.4s) var(--ease-standard, ease)",
        }}
      />
    </svg>
  );
}
