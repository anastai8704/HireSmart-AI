import { useEffect } from "react";
import { X } from "lucide-react";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { cn } from "../../lib/utils";

const SEVERITY_STYLES = {
  info: ["outline", "Info"],
  low: ["default", "Low"],
  medium: ["warning", "Medium"],
  high: ["danger", "High"],
  critical: ["danger", "Critical"],
};

export const SeverityBadge = ({ severity }) => {
  const [variant, label] = SEVERITY_STYLES[String(severity || "info")] || SEVERITY_STYLES.info;
  return (
    <Badge variant={variant}>
      {String(severity || "info") === "critical" && (
        <span
          className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-danger-500"
          aria-hidden="true"
        />
      )}
      {label}
    </Badge>
  );
};

/** Right-side detail drawer. */
export const Drawer = ({ open, onClose, title, children, footer }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-ink-950/40"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-ink-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
};

/** Filter row: search + selects + optional right-aligned actions. */
export const FilterBar = ({ children }) => (
  <div className="panel mb-5 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">{children}</div>
);

/** Responsive table wrapper with admin table chrome. */
export const DataTable = ({
  headers,
  children,
  empty = false,
  emptyLabel = "Nothing to show yet.",
}) => (
  <div className="panel overflow-x-auto">
    <table className="w-full min-w-[40rem] text-left text-sm">
      <thead>
        <tr className="border-b border-ink-100">
          {headers.map((h) => (
            <th
              key={h}
              scope="col"
              className="whitespace-nowrap px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-400"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-100">{children}</tbody>
    </table>
    {empty && <div className="px-5 py-8 text-center text-sm text-ink-500">{emptyLabel}</div>}
  </div>
);

export const LoadMore = ({ hasMore, isLoading, onClick }) =>
  hasMore ? (
    <div className="mt-4 text-center">
      <Button variant="secondary" size="sm" isLoading={isLoading} onClick={onClick}>
        Load more
      </Button>
    </div>
  ) : null;

export const DetailRow = ({ label, value, mono = false }) => (
  <div className="flex items-start justify-between gap-4 border-b border-ink-100 py-3 last:border-0">
    <dt className="shrink-0 text-xs font-bold uppercase tracking-wider text-ink-400">{label}</dt>
    <dd className={cn("text-right text-sm text-ink-800", mono && "font-mono text-xs")}>{value}</dd>
  </div>
);
