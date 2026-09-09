// Circular progress ring for profile completion / readiness.
// Uses the shared `ring-fill` keyframe so it animates on mount and respects reduced motion.

import { cn } from "../../lib/utils";

export const CompletionRing = ({
  value = 0,
  size = 120,
  strokeWidth = 10,
  label,
  sublabel,
  tone = "brand",
}) => {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const stroke =
    tone === "success"
      ? "var(--color-success-500)"
      : tone === "warning"
        ? "var(--color-warning-500)"
        : "var(--color-brand-500)";

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="img"
        aria-label={label ? `${label}: ${clamped}%` : `${clamped}% complete`}
      >
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-ink-100)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{
              ["--ring-c"]: `${circumference}`,
              strokeDashoffset: offset,
              animation: "ring-fill 0.9s ease-out both",
              transition: "stroke-dashoffset 0.6s ease-out",
            }}
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 grid place-items-center text-2xl font-extrabold tabular-nums tracking-tight",
            tone === "success"
              ? "text-success-700"
              : tone === "warning"
                ? "text-warning-700"
                : "text-ink-950",
          )}
        >
          {clamped}
          <span className="text-sm font-bold text-ink-400">%</span>
        </span>
      </div>
      {label && <p className="text-sm font-semibold text-ink-700">{label}</p>}
      {sublabel && <p className="max-w-[16rem] text-center text-xs text-ink-500">{sublabel}</p>}
    </div>
  );
};

export default CompletionRing;
