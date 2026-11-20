// Admin Revenue & Plans (Requirement 8). Every figure comes from GET /admin/revenue; nothing is calculated here.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye } from "lucide-react";
import Kpi from "../../components/ui/Kpi";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import * as toastModule from "../../components/ui/useToast";
import { adminApi, downloadBlob } from "../../lib/api";
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
import DatePicker from "../../components/ui/DatePicker";

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
  let toast = { success: () => {}, error: () => {} };
  try {
    const fn = toastModule.useToast || toastModule.default;
    if (typeof fn === "function") {
      toast = fn() || toast;
    }
  } catch {
    // Outside ToastProvider (e.g. isolated test environments)
  }
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
  const [exporting, setExporting] = useState(false);
  const [selectedTxnId, setSelectedTxnId] = useState(null);

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

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const blob = await adminApi.revenueExportCsv(params);
      downloadBlob(blob, `revenue-export-${range.preset || "transactions"}.csv`);
      toast.success("Revenue ledger exported as CSV");
    } catch (err) {
      toast.error(err.message || "Failed to export revenue CSV");
    } finally {
      setExporting(false);
    }
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
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              loading={exporting}
              onClick={handleExportCsv}
            >
              Export CSV
            </Button>
            <Link to="/app/admin/subscriptions" className="text-sm font-semibold text-brand-700 hover:underline">
              Plan breakdown →
            </Link>
          </div>
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
              <div className="flex flex-col text-xs font-semibold text-ink-600">
                <DatePicker
                  label="From (IST)"
                  value={range.from}
                  max={todayIst}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                />
              </div>
              <div className="flex flex-col text-xs font-semibold text-ink-600">
                <DatePicker
                  label="To (IST)"
                  value={range.to}
                  max={todayIst}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                />
              </div>
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
                  <th scope="col" className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((t) => (
                  <tr key={t.id} data-testid="revenue-row" className="hover:bg-ink-50/50">
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
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Eye className="h-3.5 w-3.5" />}
                        onClick={() => setSelectedTxnId(t.id || t._id)}
                      >
                        Inspect
                      </Button>
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

      {/* Transaction Details Inspection Modal */}
      {selectedTxnId && (
        <TransactionDetailModal
          transactionId={selectedTxnId}
          onClose={() => setSelectedTxnId(null)}
        />
      )}
    </div>
  );
};

const TransactionDetailModal = ({ transactionId, onClose }) => {
  const query = useQuery({
    queryKey: ["admin-transaction-detail", transactionId],
    queryFn: () => adminApi.transactionDetails(transactionId),
    enabled: Boolean(transactionId),
  });

  const txn = query.data?.data;

  return (
    <Modal
      isOpen={Boolean(transactionId)}
      open={Boolean(transactionId)}
      onClose={onClose}
      title="Payment Transaction Details"
      description="Cryptographically safe transaction record from payment ledger."
      size="xl"
    >
      {query.isLoading && <LoadingState message="Loading payment details…" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      {query.isSuccess && txn && (
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-ink-500 font-mono">Order / Transaction ID</div>
                <div className="text-base font-bold text-ink-900 font-mono">{txn.transactionNumber}</div>
                {txn.invoiceNumber && (
                  <div className="text-xs text-ink-600 font-mono">Invoice: {txn.invoiceNumber}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-ink-900">
                  {fmtInr(txn.amount)} <span className="text-xs font-normal text-ink-500">{txn.currency}</span>
                </div>
                <Badge variant={txn.status === "captured" ? "success" : txn.status === "failed" ? "danger" : "default"}>
                  {txn.status?.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>

          {/* Test Mode Warning if applicable */}
          {txn.mode !== "live" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span className="font-bold">Test Mode Record:</span> This payment was conducted in test or simulation mode and is isolated from live revenue accounting.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-ink-500">Subscriber Name</div>
              <div className="font-semibold text-ink-900">{txn.subscriber?.name || "Subscriber"}</div>
              <div className="text-ink-400">{txn.subscriber?.email || txn.subscriberType}</div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-ink-500">Plan Tier</div>
              <div className="font-semibold text-ink-900">{txn.planName || txn.planTier}</div>
              <div className="text-ink-400 capitalize">Tier: {txn.planTier}</div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-ink-500">Gateway Order ID</div>
              <div className="font-mono text-ink-900">{txn.gatewayOrderId || "—"}</div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-ink-500">Gateway Payment ID</div>
              <div className="font-mono text-ink-900">{txn.gatewayPaymentId || "—"}</div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-ink-500">Refund Status</div>
              <div className="font-medium text-ink-900 capitalize">{txn.refundStatus || "Not Refunded"}</div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-ink-500">Payment Environment</div>
              <div className="font-medium text-ink-900">{txn.mode === "live" ? "Live Production" : "Razorpay Test Simulation"}</div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-ink-500">Created At (IST)</div>
              <div className="text-ink-900">{fmtIst(txn.createdAt)}</div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-ink-500">Subscription Association</div>
              <div className="font-mono text-ink-900 truncate">{txn.providerSubscriptionId || "None"}</div>
            </div>
          </div>

          <div className="flex justify-end border-t border-ink-100 pt-3">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AdminRevenue;
