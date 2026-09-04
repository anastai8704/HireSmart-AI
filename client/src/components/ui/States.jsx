// Loading (Skeleton/Spinner), empty and error states for data-driven views.

import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";

import Button from "./Button";
import { Card } from "./Card";
import { cn } from "../../lib/utils";

/** Inline spinner for buttons and small regions. */
export const Spinner = ({ className, size = 20 }) => (
  <Loader2
    className={cn("animate-spin text-brand-500", className)}
    style={{ width: size, height: size }}
    aria-hidden="true"
  />
);

/** Full-area loading indicator with an accessible status message. */
export const LoadingState = ({ message = "Loading...", className }) => (
  <div
    className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}
    role="status"
    aria-live="polite"
  >
    <Spinner size={28} />
    <p className="text-sm text-ink-500">{message}</p>
  </div>
);

/**
 * A grey placeholder shaped like the content that is coming.
 * Skeletons feel faster than spinners because the layout does not jump once
 * the real data arrives.
 */
export const Skeleton = ({ className }) => (
  <div className={cn("skeleton rounded-md", className)} aria-hidden="true" />
);

/** Skeleton shaped like a list of cards - used on the jobs and applicants lists. */
export const SkeletonList = ({ count = 3, className }) => (
  <div className={cn("flex flex-col gap-4", className)} aria-hidden="true">
    {Array.from({ length: count }).map((_, index) => (
      <Card key={index} className="p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />

          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>

          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </Card>
    ))}
  </div>
);

/** Skeleton for the dashboard stat row. */
export const SkeletonStats = ({ count = 4 }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
    {Array.from({ length: count }).map((_, index) => (
      <Card key={index} className="p-5">
        <Skeleton className="mb-3 h-3 w-20" />
        <Skeleton className="h-8 w-14" />
      </Card>
    ))}
  </div>
);

/**
 * Shown when a request succeeded but returned nothing.
 * Always offers the next useful action rather than a dead end.
 */
export const EmptyState = ({
  icon: Icon = Inbox,
  title = "Nothing here yet",
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-6 py-14 text-center",
      className,
    )}
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100">
      <Icon className="h-6 w-6 text-ink-400" aria-hidden="true" />
    </div>

    <div className="max-w-sm space-y-1">
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="text-sm text-ink-500">{description}</p>}
    </div>

    {action}
  </div>
);

/**
 * Shown when a request failed. Surfaces the real server message so the user
 * (and you, while debugging) can see what actually went wrong.
 */
export const ErrorState = ({ title = "Something went wrong", error, onRetry, className }) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-danger-500/30 bg-danger-50 px-6 py-12 text-center",
      className,
    )}
    role="alert"
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-500/10">
      <AlertCircle className="h-6 w-6 text-danger-700" aria-hidden="true" />
    </div>

    <div className="max-w-md space-y-1">
      <h3 className="text-base font-semibold text-danger-700">{title}</h3>
      <p className="text-sm text-danger-700/80">
        {error?.message || "An unexpected error occurred. Please try again."}
      </p>
    </div>

    {onRetry && (
      <Button
        variant="secondary"
        size="sm"
        onClick={onRetry}
        leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
      >
        Try again
      </Button>
    )}
  </div>
);

/** A compact inline error, for use inside forms. */
export const InlineError = ({ error, className }) => {
  if (!error) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-danger-500/30 bg-danger-50 px-3 py-2.5 text-sm text-danger-700",
        className,
      )}
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{error.message || error}</span>
    </div>
  );
};

export default LoadingState;
