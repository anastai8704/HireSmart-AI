// Grid of quick-action tiles for dashboards: icon + label + optional hint.
// Actions: [{ icon: LucideIcon, label, to, hint? }].

import { Link } from "react-router-dom";

import { cn } from "../../lib/utils";

export const QuickActions = ({ actions = [], columns = "sm:grid-cols-2 lg:grid-cols-4", className }) => (
  <div className={cn("grid gap-3 grid-cols-2", columns, className)}>
    {actions.map((action) => {
      const Icon = action.icon;
      return (
        <Link
          key={action.to}
          to={action.to}
          className={cn(
            "group flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3.5",
            "transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]",
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink-900">{action.label}</span>
            {action.hint && (
              <span className="block truncate text-xs text-ink-400">{action.hint}</span>
            )}
          </span>
        </Link>
      );
    })}
  </div>
);

export default QuickActions;
