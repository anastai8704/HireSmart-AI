// Horizontal stage funnel for candidate/application pipelines.
// Each stage renders a bar scaled to its share of the largest stage, with a count.
// Stages: [{ label, value, tone? }]. tone: ink | brand | success | warning | danger.

import { cn } from "../../lib/utils";

const BAR_TONES = {
  ink: "bg-ink-300",
  brand: "bg-brand-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
};

export const PipelineFunnel = ({ stages = [], className, dark = false }) => {
  const max = Math.max(1, ...stages.map((s) => Number(s.value) || 0));
  return (
    <div className={cn("space-y-3", className)} role="list" aria-label="Pipeline stages">
      {stages.map((stage) => {
        const value = Number(stage.value) || 0;
        const pct = Math.round((value / max) * 100);
        const tone = BAR_TONES[stage.tone] || BAR_TONES.brand;
        return (
          <div key={stage.label} role="listitem" className="flex items-center gap-3">
            <p
              className={cn(
                "w-24 shrink-0 truncate text-xs font-medium sm:w-28",
                dark ? "text-ink-300" : "text-ink-500",
              )}
            >
              {stage.label}
            </p>
            <div
              className={cn(
                "h-2.5 flex-1 overflow-hidden rounded-full",
                dark ? "bg-white/10" : "bg-ink-100",
              )}
            >
              <div
                className={cn("h-full rounded-full transition-[width] duration-700 ease-out", tone)}
                style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span
              className={cn(
                "w-8 shrink-0 text-right text-sm font-bold tabular-nums",
                dark ? "text-white" : "text-ink-900",
              )}
            >
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default PipelineFunnel;
