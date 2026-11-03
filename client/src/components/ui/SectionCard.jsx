// Consistent dashboard section: a titled card with an optional "view all" action.
// Keeps the header/body rhythm identical across role-specific dashboards.

import { cn } from "../../lib/utils";

export const SectionCard = ({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  tone = "light",
}) => (
  <section
    className={cn(
      "rounded-[var(--radius-card)] border p-5 sm:p-6 transition-colors",
      tone === "dark"
        ? "border-transparent bg-ink-950 text-white"
        : "border-ink-100 bg-white",
      className,
    )}
  >
    {(title || action) && (
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className={cn(
              "text-[15px] font-bold tracking-tight",
              tone === "dark" ? "text-white" : "text-ink-950",
            )}
          >
            {title}
          </h2>
          {description && (
            <p className={cn("mt-0.5 text-xs", tone === "dark" ? "text-ink-400" : "text-ink-500")}>
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
    )}
    <div className={bodyClassName}>{children}</div>
  </section>
);

export default SectionCard;
