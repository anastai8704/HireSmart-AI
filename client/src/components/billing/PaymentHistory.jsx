// Payment history with status and IST date filters and cursor pagination (Requirement 2).
// Rows come from the server; mode labels separate Test Mode and Live Mode from sandbox records.
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { Input, Select } from "../ui/Input";
import { EmptyState, ErrorState, LoadingState } from "../ui/States";
import { subscriptionApi } from "../../lib/api";
import { formatDate } from "../../lib/utils";
import {
  HISTORY_STATUS_OPTIONS,
  historyModeLabel,
  historyModeTone,
  historyParams,
  historyStatusLabel,
  historyStatusTone,
} from "../../lib/billingModel";

const PAGE_SIZE = 10;

const planLabel = (tier, plans) => {
  const match = (plans || []).find((p) => p.tier === tier);
  if (match) return match.name;
  return tier ? tier.replace(/^(candidate|recruiter)_/, "").replace(/_/g, " ") : "-";
};

export const PaymentHistory = ({ queryKeyBase, organizationId, plans, title = "Payment history" }) => {
  const [filters, setFilters] = useState({ status: "all", from: "", to: "" });
  const [draft, setDraft] = useState(filters);
  const [dateError, setDateError] = useState("");

  const params = historyParams(filters);
  const query = useInfiniteQuery({
    queryKey: [...queryKeyBase, filters],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      subscriptionApi.invoices({ ...historyParams({ ...filters, after: pageParam }), limit: PAGE_SIZE }, organizationId),
    getNextPageParam: (last) => (last?.meta?.hasMore ? last.meta.nextCursor : undefined),
  });

  const rows = (query.data?.pages || []).flatMap((page) => page.data || []);
  const total = query.data?.pages?.[0]?.meta?.total;

  const applyFilters = (e) => {
    e.preventDefault();
    if (draft.from && draft.to && draft.to < draft.from) {
      setDateError("The end date must be on or after the start date.");
      return;
    }
    setDateError("");
    setFilters(draft);
  };

  const clear = () => {
    const empty = { status: "all", from: "", to: "" };
    setDraft(empty);
    setDateError("");
    setFilters(empty);
  };

  const filtered = Object.keys(params).length > 0;

  return (
    <section aria-labelledby="payment-history-heading" className="rounded-2xl border border-ink-100 bg-white shadow-sm">
      <div className="border-b border-ink-100 p-6">
        <h2 id="payment-history-heading" className="text-base font-bold text-ink-900">
          {title}
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Dates are in Indian Standard Time (IST). Sandbox records are shown for reference and are never counted as revenue.
        </p>
        <form onSubmit={applyFilters} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" aria-label="Filter payments">
          <Select
            label="Status"
            value={draft.status}
            options={HISTORY_STATUS_OPTIONS}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
          />
          <Input
            label="From (IST)"
            type="date"
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
          <Input
            label="To (IST)"
            type="date"
            value={draft.to}
            error={dateError || undefined}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary">
              Apply
            </Button>
            {filtered && (
              <Button type="button" variant="ghost" onClick={clear}>
                Clear
              </Button>
            )}
          </div>
        </form>
      </div>

      {query.isLoading ? (
        <LoadingState message="Loading payments…" className="p-8" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} className="p-6" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No payments match these filters" : "No payments yet"}
          description={filtered ? "Try a different status or date range." : "Payments appear here after you upgrade a plan."}
          className="p-8"
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Payments, newest first</caption>
              <thead className="bg-ink-50/70 text-xs font-semibold text-ink-500">
                <tr>
                  <th scope="col" className="px-6 py-3">Reference</th>
                  <th scope="col" className="px-6 py-3">Date (IST)</th>
                  <th scope="col" className="px-6 py-3">Plan</th>
                  <th scope="col" className="px-6 py-3">Amount</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-ink-800">
                {rows.map((inv) => (
                  <tr key={inv._id} className="hover:bg-ink-50/50">
                    <td className="px-6 py-4 font-mono text-xs font-bold text-ink-900">{inv.invoiceNumber || inv.transactionNumber || "-"}</td>
                    <td className="px-6 py-4 text-xs text-ink-500">{formatDate(inv.createdAt, "Asia/Kolkata")}</td>
                    <td className="px-6 py-4">{planLabel(inv.planTier, plans)}</td>
                    <td className="px-6 py-4 font-bold text-ink-900">₹{Number(inv.amount || 0).toLocaleString("en-IN")}</td>
                    <td className="px-6 py-4">
                      <Badge variant={historyStatusTone(inv.status)}>{historyStatusLabel(inv.status)}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={historyModeTone(inv.mode)}>{historyModeLabel(inv.mode)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 p-4 text-xs text-ink-500">
            <span>
              Showing {rows.length}
              {total !== undefined ? ` of ${total}` : ""} payments
            </span>
            {query.hasNextPage && (
              <Button variant="outline" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                Load more
              </Button>
            )}
          </div>
        </>
      )}
      <p className="border-t border-ink-100 px-6 py-3 text-xs text-ink-400">
        Downloadable GST receipts are not available yet. Ask support for a receipt for any payment listed here.
      </p>
    </section>
  );
};

export default PaymentHistory;
