// Platform health panel (Requirement 7). Shows only what the readiness check reported.
import { Activity, Database, Layers, RefreshCw } from "lucide-react";

import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { formatDateTime } from "../../lib/utils";

const OVERALL = {
  operational: { tone: "success", label: "All checks passing" },
  degraded: { tone: "warning", label: "Degraded" },
  down: { tone: "danger", label: "Service down" },
  unreachable: { tone: "danger", label: "Status unavailable" },
};

const STATE = {
  up: { tone: "success", label: "Up" },
  down: { tone: "danger", label: "Down" },
  unknown: { tone: "default", label: "Not reported" },
};

const ICONS = { mongodb: Database, jobStore: Layers };

export const PlatformHealthPanel = ({ health, checkedAt, onRetry, refreshing = false }) => {
  const overall = OVERALL[health.overall] || OVERALL.unreachable;
  return (
    <section aria-labelledby="platform-health-heading" className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="platform-health-heading" className="text-base font-bold text-ink-900">
              Platform health
            </h2>
            <p className="text-xs text-ink-500">Live readiness check of the database and background job store.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={overall.tone} data-testid="health-overall">
            {overall.label}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onRetry} loading={refreshing}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Check now
          </Button>
        </div>
      </div>

      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        {health.services.map((s) => {
          const Icon = ICONS[s.key] || Layers;
          const state = STATE[s.state] || STATE.unknown;
          return (
            <li key={s.key} className="flex items-center justify-between gap-3 rounded-xl bg-ink-50/70 p-3.5">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">{s.name}</p>
                  <p className="text-xs text-ink-500">{s.description}</p>
                </div>
              </div>
              <Badge variant={state.tone} data-testid={`health-${s.key}`}>
                {state.label}
              </Badge>
            </li>
          );
        })}
      </ul>

      {health.queue && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:max-w-md">
          <div className="rounded-xl border border-ink-100 p-3">
            <dt className="text-xs text-ink-500">Runs queued</dt>
            <dd className="font-bold text-ink-900" data-testid="health-queued">
              {health.queue.queued ?? "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-ink-100 p-3">
            <dt className="text-xs text-ink-500">Stuck over 15 minutes</dt>
            <dd
              className={`font-bold ${health.queue.staleProcessing > 0 ? "text-warning-700" : "text-ink-900"}`}
              data-testid="health-stale"
            >
              {health.queue.staleProcessing ?? "—"}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-4 text-xs text-ink-400">
        {checkedAt ? `Last checked ${formatDateTime(checkedAt)}` : "Not checked yet"}
      </p>
    </section>
  );
};

export default PlatformHealthPanel;
