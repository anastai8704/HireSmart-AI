// Compact timeline feed for "recent activity" / "team activity".
// Items: [{ icon: LucideIcon, tone?, title, meta, to?, time }]. Renders an empty state by default.

import { Link } from "react-router-dom";

import { cn, formatRelativeTime } from "../../lib/utils";

const DOT_TONES = {
  ink: "bg-ink-300",
  brand: "bg-brand-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
};

const renderTitle = (item) =>
  item.to ? (
    <Link
      to={item.to}
      className="text-sm font-semibold text-ink-800 transition-colors hover:text-brand-600"
    >
      {item.title}
    </Link>
  ) : (
    <span className="text-sm font-semibold text-ink-800">{item.title}</span>
  );

export const ActivityFeed = ({ items = [], emptyText = "No activity yet." }) => {
  if (!items.length) {
    return <p className="text-sm text-ink-500">{emptyText}</p>;
  }

  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-ink-100">
      {items.map((item, index) => (
        <li key={index} className="relative flex items-start gap-3 pl-1">
          <span
            className={cn(
              "relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white",
              DOT_TONES[item.tone] || DOT_TONES.brand,
            )}
          />
          <div className="min-w-0 flex-1">
            {renderTitle(item)}
            {item.meta && <p className="mt-0.5 text-xs text-ink-500">{item.meta}</p>}
          </div>
          {item.time && <span className="shrink-0 text-xs text-ink-400">{formatRelativeTime(item.time)}</span>}
        </li>
      ))}
    </ol>
  );
};

export default ActivityFeed;
