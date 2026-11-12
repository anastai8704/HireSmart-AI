// Plan badge (Requirement 17). Renders the server-derived plan name and status. Compact for menus and the
// workspace switcher; full for settings and profile. Renders nothing for platform admins (no plan).
import { Link } from "react-router-dom";

import { usePlanEntitlement } from "../../hooks/usePlanEntitlement";
import { cn } from "../../lib/utils";

const TONES = {
  paid: "border-brand-200 bg-brand-50 text-brand-800",
  warning: "border-warning-200 bg-warning-50 text-warning-700",
  danger: "border-danger-500 bg-danger-50 text-danger-700",
  neutral: "border-ink-200 bg-ink-100 text-ink-700",
  loading: "border-ink-200 bg-white text-ink-400",
};

export const PlanBadge = ({ compact = false, className, billingHref }) => {
  const { isAdmin, badge, isLoading } = usePlanEntitlement();
  if (isAdmin || (!badge && !isLoading)) return null;

  const current = badge || { label: "Checking plan", status: "", tone: "loading" };
  const text = current.status ? `${current.label}, ${current.status}` : current.label;

  const chip = (
    <span
      data-testid="plan-badge"
      data-tone={current.tone}
      aria-label={`Plan: ${text}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide",
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONES[current.tone] || TONES.neutral,
        className,
      )}
    >
      <span className="truncate">{current.label}</span>
      {current.status && (
        <span className={cn("truncate font-medium", compact ? "hidden sm:inline" : "", "opacity-80")}>· {current.status}</span>
      )}
    </span>
  );

  if (!billingHref) return chip;
  return (
    <Link to={billingHref} className="inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      {chip}
    </Link>
  );
};

export default PlanBadge;
