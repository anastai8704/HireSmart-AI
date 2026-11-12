// Admin Revenue & Plans (Requirement 8). Every figure comes from GET /admin/revenue; nothing is calculated here.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Kpi from "../../components/ui/Kpi";
import Badge from "../../components/ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { adminApi } from "../../lib/api";
import { RANGE_PRESETS, istToday, validateCustomRange } from "../../lib/analyticsRange";
import {
  fmtCount,
  fmtInr,
  fmtIst,
  MODE_LABELS,
  PAYMENT_STATUS_LABELS,
  rangeParams,
  REFUND_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_TONE,
} from "../../lib/revenueFormat";
import { SearchableSelect } from "../../components/ui/SearchableSelect";

const MODE_OPTIONS = [
  { value: "all", label: "All modes" },
  { value: "test", label: "Test mode" },
  { value: "live", label: "Live" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "All payment statuses" },
  { value: "captured", label: "Captured" },
  { value: "refunded", label: "Captured, refunded" },
  { value: "failed", label: "Failed" },
  { value: "initiated", label: "Pending" },
  { value: "cancelled", label: "Cancelled" },
];
const REFUND_OPTIONS = [
  { value: "all", label: "All refund states" },
  { value: "refunded", label: "Refunded" },
  { value: "none", label: "Not refunded" },
];

const SummaryCard = ({ label, value, detail, to, testId }) => {
  const body = <Kpi label={label} value={value} detail={detail} tone={to ? "brand" : "ink"} className="h-full" />;
  return (
    <div data-testid={testId}>
      {to ? (
        <Link to={to} className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-brand-500">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
};

export const AdminRevenue = () => {
  const [range, setRange] = useState({ preset: "30d", from: "", to: "" });
  // Charts link here with filters in the URL (for example ?status=failed). Read once, on first render.
  const [searchParams] = useSearchParams();
  const pick = (key, allowed, fallback) => (allowed.includes(searchParams.get(key)) ? searchParams.get(key) : fallback);
  const [filters, setFilters] = useState(() => ({
    mode: pick("mode", ["all", "test", "live"], "all"),
    status: pick("status", ["all", "captured", "refunded", "failed", "initiated", "cancelled"], "all"),
    refund: pick("refund", ["all", "refunded", "none"], "all"),
    q: "",
  }));
  const [page, setPage] = useState(1);
  const [todayIst] = useState(() => istToday());

  const customError = range.preset === "custom" ? validateCustomRange(range.from, range.to, todayIst) : null;
  const rangeQuery = rangeParams(range);

  const params = {
    ...(rangeQuery || { range: "30d" }),
    mode: filters.mode,
    status: filters.status,
    refund: filters.refund,
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    page,
    limit: 20,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-revenue", params],
    queryFn: () => adminApi.revenue(params),
    enabled: !customError && Boolean(rangeQuery),
  });

  const changeFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const summary = data?.data?.summary;
  const rows = data?.data?.transactions || [];
  const meta = data?.meta || { page: 1, pages: 1, total: 0 };

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Financial governance"
        title="Revenue & Plans"
        description="Real provider payments only. Net revenue is captured payments minus refunds processed in the selected dates. Sandbox, failed and pending records are excluded."
        action={
          <Link to="/app/admin/subscriptions" className="text-sm font-semibold text-brand-700 hover:underline">
            Plan breakdown →
          </Link>
        }
      />

      <section aria-label="Date range" className="rounded-xl border border-ink-100 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-semibold text-ink-600">
            Period
            <SearchableSelect
              aria-label="Date range"
              className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
              value={range.preset}
              onChange={(e) => {
                setRange((r) => ({ ...r, preset: e.target.value }));
                setPage(1);
              }}
            >
              {RANGE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </SearchableSelect>
          </label>
          {range.preset === "custom" && (
            <>
              <label className="flex flex-col text-xs font-semibold text-ink-600">
                From (IST)
                <input
                  type="date"
                  className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm"
                  value={range.from}
                  max={todayIst}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                />
              </label>
              <label className="flex flex-col text-xs font-semibold text-ink-600">
                To (IST)
                <input
                  type="date"
                  className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm"
                  value={range.to}
                  max={todayIst}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                />
              </label>
            </>
          )}
        </div>
        {customError && (
          <p role="alert" className="mt-2 text-sm text-danger-700">
            {customError}
          </p>
        )}
      </section>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Revenue summary">
          <SummaryCard
            testId="card-net-test"
            label="Net revenue, test mode"
            value={fmtInr(summary.test.netRevenue)}
            detail={`${fmtCount(summary.test.successfulPayments)} captured payments`}
          />
          <SummaryCard
            testId="card-net-live"
            label="Net revenue, live"
            value={fmtInr(summary.live.netRevenue)}
            detail="Live billing is not offered in this release"
          />
          <SummaryCard
            testId="card-refunds"
            label="Refunds processed"
            value={fmtInr(summary.total.refunds)}
            detail={`${fmtCount(summary.total.refundedPayments)} refunded payments`}
          />
          <SummaryCard
            testId="card-failed"
            label="Failed payments"
            value={fmtCount(summary.failedPayments)}
            detail={`${fmtCount(summary.pendingAttempts)} pending attempts`}
          />
        </div>
      )}
      {summary && <p className="text-xs text-ink-500">{summary.rule}</p>}

      <section aria-label="Filters" className="grid gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col text-xs font-semibold text-ink-600">
          Mode
          <SearchableSelect aria-label="Mode" className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm" value={filters.mode} onChange={(e) => changeFilter("mode", e.target.value)}>
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label className="flex flex-col text-xs font-semibold text-ink-600">
          Payment status
          <SearchableSelect aria-label="Payment status" className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm" value={filters.status} onChange={(e) => changeFilter("status", e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label className="flex flex-col text-xs font-semibold text-ink-600">
          Refund
          <SearchableSelect aria-label="Refund" className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm" value={filters.refund} onChange={(e) => changeFilter("refund", e.target.value)}>
            {REFUND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label className="flex flex-col text-xs font-semibold text-ink-600 sm:col-span-2 lg:col-span-2">
          Search
          <input
            type="search"
            aria-label="Search payments"
            placeholder="Transaction, payment, order or plan"
            className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm"
            value={filters.q}
            onChange={(e) => changeFilter("q", e.target.value)}
          />
        </label>
      </section>

      {isLoading && <LoadingState message="Loading payments…" />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {data && rows.length === 0 && (
        <EmptyState title="No payments in this view" description="Try a wider period or clear the filters." />
      )}

      {data && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
            <table className="w-full min-w-[960px] text-left text-sm" aria-label="Payment records">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Subscriber</th>
                  <th scope="col" className="px-3 py-2">Plan</th>
                  <th scope="col" className="px-3 py-2">Payment ID</th>
                  <th scope="col" className="px-3 py-2">Subscription ID</th>
                  <th scope="col" className="px-3 py-2 text-right">Amount</th>
                  <th scope="col" className="px-3 py-2">Date (IST)</th>
                  <th scope="col" className="px-3 py-2">Payment</th>
                  <th scope="col" className="px-3 py-2">Refund</th>
                  <th scope="col" className="px-3 py-2">Mode</th>
                  <th scope="col" className="px-3 py-2">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((t) => (
                  <tr key={t.id} data-testid="revenue-row">
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink-900">{t.organizationName || t.subscriberName || "—"}</div>
                      <div className="text-xs text-ink-500">{t.subscriberType === "organization" ? "Company" : "Candidate"}</div>
                    </td>
                    <td className="px-3 py-2 capitalize">{String(t.planTier || "").replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 font-mono text-xs break-all">{t.gatewayPaymentId || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs break-all">{t.subscriptionId || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtInr(t.amount)} <span className="text-xs text-ink-500">{t.currency}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtIst(t.createdAt)}</td>
                    <td className="px-3 py-2">{PAYMENT_STATUS_LABELS[t.status] || t.status}</td>
                    <td className="px-3 py-2">
                      <Badge variant={t.refundStatus === "refunded" ? "warning" : "default"}>
                        {REFUND_LABELS[t.refundStatus] || t.refundStatus}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={t.mode === "live" ? "brand" : "outline"}>{MODE_LABELS[t.mode] || t.mode}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={VERIFICATION_TONE[t.verification] || "default"}>
                        {VERIFICATION_LABELS[t.verification] || t.verification}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-ink-600">
            <span>
              Page {meta.page} of {meta.pages} · {fmtCount(meta.total)} records
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-ink-200 px-3 py-1.5 disabled:opacity-50"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-lg border border-ink-200 px-3 py-1.5 disabled:opacity-50"
                disabled={meta.page >= meta.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
};

export default AdminRevenue;
