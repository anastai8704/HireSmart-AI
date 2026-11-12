// The plan in force, its status, renewal or expiry, quota meters and the actions that status allows (Requirement 2).
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

import Button from "../ui/Button";
import Badge from "../ui/Badge";
import { ConfirmModal } from "../ui/ConfirmModal";
import { cn, formatDate } from "../../lib/utils";
import { quotaRowsFor } from "../../lib/billingModel";

const STATUS_ICON = { success: CheckCircle2, warning: Clock, danger: XCircle, neutral: AlertTriangle };
const STATUS_CLASS = {
  success: "border-success-500/30 bg-success-50 text-success-800",
  warning: "border-warning-200 bg-warning-50 text-warning-900",
  danger: "border-danger-500/40 bg-danger-50 text-danger-800",
  neutral: "border-ink-200 bg-ink-50 text-ink-700",
};

export const QuotaMeter = ({ row }) => (
  <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-xs">
    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-600">
      <span>{row.label}</span>
      <span data-testid={`quota-${row.key}`}>
        {row.used} of {row.limit}
      </span>
    </div>
    <div
      role="meter"
      aria-label={row.label}
      aria-valuemin={0}
      aria-valuemax={row.limit}
      aria-valuenow={Math.min(row.used, row.limit)}
      aria-valuetext={`${row.used} of ${row.limit} used`}
      className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100"
    >
      <div
        className={cn("h-full rounded-full transition-all", row.atLimit ? "bg-danger-500" : "bg-brand-600")}
        style={{ width: `${row.percent}%` }}
      />
    </div>
    {row.atLimit && <p className="mt-2 text-xs text-danger-700">Limit reached for this plan.</p>}
  </div>
);

export const CurrentPlanPanel = ({
  model,
  subscription,
  entitlement,
  usage,
  isRecruiter,
  onUpgrade,
  onCancelRenewal,
  cancelling = false,
  loading = false,
}) => {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const Icon = STATUS_ICON[model.status.tone] || AlertTriangle;
  const quotas = quotaRowsFor({ limits: entitlement?.limits, usage, isRecruiter });
  const price = subscription?.priceInr;

  return (
    <section aria-labelledby="current-plan-heading" className="rounded-2xl border border-brand-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Current plan</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 id="current-plan-heading" className="text-xl font-bold text-ink-950">
              {model.headline}
            </h2>
            <Badge variant={model.badge.tone === "paid" ? "success" : model.badge.tone === "danger" ? "danger" : model.badge.tone === "warning" ? "warning" : "default"}>
              {model.badge.status ? `${model.badge.label} · ${model.badge.status}` : model.badge.label}
            </Badge>
          </div>
          {model.paidInForce && price > 0 && (
            <p className="mt-1 text-xs text-ink-500">
              ₹{Number(price).toLocaleString("en-IN")} / {subscription?.billingCycle === "yearly" ? "year" : "month"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {model.canUpgrade && !model.paidInForce && (
            <Button variant="primary" onClick={onUpgrade} disabled={loading}>
              View plans
            </Button>
          )}
          {model.canCancelRenewal && (
            <Button variant="outline" loading={cancelling} onClick={() => setConfirmCancel(true)}>
              Cancel renewal
            </Button>
          )}
        </div>
      </div>

      <div role="status" className={cn("mt-4 flex gap-3 rounded-xl border p-4 text-sm", STATUS_CLASS[model.status.tone])}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{model.status.text}</p>
      </div>

      {quotas.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-ink-900">Plan limits</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quotas.map((row) => (
              <QuotaMeter key={row.key} row={row} />
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          onCancelRenewal();
        }}
        title="Stop renewal?"
        description={`Your plan stays active until ${formatDate(model.periodEnd || subscription?.currentPeriodEnd)}. It will not renew after that.`}
        confirmLabel="Stop renewal"
        tone="warning"
      />
    </section>
  );
};

export default CurrentPlanPanel;
