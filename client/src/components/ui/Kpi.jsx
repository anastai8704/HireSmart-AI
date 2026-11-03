// Premium KPI card: icon chip, large tabular value, optional delta/trend and link.
// API-compatible with (and a superset of) the existing `Metric` component.

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "../../lib/utils";

const ICON_TONES = {
  ink: "bg-white text-ink-400 border border-ink-100",
  brand: "bg-brand-50 text-brand-600 border border-brand-100",
  success: "bg-success-50 text-success-600 border border-success-100",
  warning: "bg-warning-50 text-warning-700 border border-warning-100",
  danger: "bg-danger-50 text-danger-600 border border-danger-100",
};

const VALUE_TONES = {
  ink: "text-ink-950",
  brand: "text-brand-700",
  success: "text-success-700",
  warning: "text-warning-700",
  danger: "text-danger-600",
};

export const Kpi = ({
  label,
  value,
  detail,
  tone = "ink",
  icon: Icon,
  delta,
  trend,
  loading = false,
  className,
}) => {
  const trendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const TrendIcon = trendIcon;
  const trendTone =
    trend === "up" ? "text-success-600" : trend === "down" ? "text-danger-600" : "text-ink-400";

  if (loading) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-4">
        <div className="h-3.5 w-24 animate-pulse rounded bg-ink-100" />
        <div className="mt-3 h-7 w-16 animate-pulse rounded bg-ink-100" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group rounded-xl border border-ink-100 bg-white p-4 transition-all duration-200",
        "hover:border-brand-200 hover:shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-bold uppercase tracking-wider text-ink-400">
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-105",
              ICON_TONES[tone] || ICON_TONES.ink,
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <p
          className={cn(
            "text-[28px] font-extrabold leading-none tabular-nums tracking-tight",
            VALUE_TONES[tone] || VALUE_TONES.ink,
          )}
        >
          {value}
        </p>
        {delta && (
          <span className={cn("flex items-center gap-0.5 text-xs font-semibold", trendTone)}>
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {delta}
          </span>
        )}
      </div>
      {detail && <p className="mt-2 text-xs text-ink-500">{detail}</p>}
    </div>
  );
};

export default Kpi;
