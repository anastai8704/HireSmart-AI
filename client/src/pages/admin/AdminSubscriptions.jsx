// Admin Subscriptions & Revenue Management (Phase 4F)
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Users,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Eye,
  RefreshCw,
  Building,
  User,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import Kpi from "../../components/ui/Kpi";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import * as toastModule from "../../components/ui/useToast";
import { adminApi } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/utils";

const getSafeToast = () => {
  try {
    const fn = toastModule.useToast || toastModule.default;
    if (typeof fn === "function") return fn() || { success: () => {}, error: () => {} };
  } catch {
    // fallback
  }
  return { success: () => {}, error: () => {} };
};

const COLORS = ["#0052cc", "#00875a", "#ffab00", "#de350b", "#6554c0", "#00b8d9"];

const STATUS_TONES = {
  active: "success",
  past_due: "danger",
  canceled: "neutral",
  expired: "warning",
};

export const AdminSubscriptions = () => {
  const queryClient = useQueryClient();

  // Search & Filter States
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  // Selected Subscription for Inspection Modal
  const [selectedSubId, setSelectedSubId] = useState(null);

  // 1. Revenue Analytics Query (MRR, ARR, charts)
  const analyticsQuery = useQuery({
    queryKey: ["admin-revenue-analytics"],
    queryFn: adminApi.revenueAnalytics,
  });

  // 2. Subscriptions Directory Query
  const subscriptionsQuery = useQuery({
    queryKey: ["admin-subscriptions", { q, status: statusFilter, planTier: planFilter, subscriberType: typeFilter, sort, page }],
    queryFn: () =>
      typeof adminApi.subscriptions === "function"
        ? adminApi.subscriptions({
            ...(q.trim() ? { q: q.trim() } : {}),
            status: statusFilter,
            planTier: planFilter,
            subscriberType: typeFilter,
            sort,
            page,
            limit: 15,
          })
        : Promise.resolve({ data: [], meta: { page: 1, pages: 1, total: 0, counts: {} } }),
  });

  const analytics = analyticsQuery.data?.data || {};
  const metrics = analytics.metrics || {};
  const monthlyTrends = analytics.monthlyTrends || analytics.monthlyRevenueTrend || [];
  const planDistribution = analytics.planDistribution || analytics.planBreakdown || [];
  const recentTransactions = analytics.recentTransactions || [];

  const subData = subscriptionsQuery.data?.data || [];
  const subMeta = subscriptionsQuery.data?.meta || { page: 1, pages: 1, total: 0, counts: {} };
  const counts = subMeta.counts || {};

  const handleFilterChange = (setter, val) => {
    setter(val);
    setPage(1);
  };

  return (
    <div className="page-wrap space-y-8">
      <PageHeader
        eyebrow="Financial & Subscription Governance"
        title="Subscriptions & Revenue Management"
        description="Oversee candidate & recruiter subscriptions, plan entitlements, payment records, past-due accounts, and administrative lifecycle actions."
        action={
          <div className="flex items-center gap-3">
            <Link
              to="/app/admin/revenue"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 shadow-sm hover:bg-ink-50"
            >
              <CreditCard className="h-4 w-4 text-ink-500" />
              Payment Ledger & Revenue →
            </Link>
          </div>
        }
      />

      {/* Top Financial KPI Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Monthly Recurring (MRR)"
          value={`₹${(metrics.monthlyRecurringRevenue || metrics.mrrInr || 0).toLocaleString("en-IN")}`}
          detail={`${counts.activePaid || metrics.activePaidSubscribers || 0} active paid subscriptions`}
          tone="brand"
          icon={DollarSign}
        />
        <Kpi
          label="Annual Run Rate (ARR)"
          value={`₹${((metrics.monthlyRecurringRevenue || 0) * 12).toLocaleString("en-IN")}`}
          detail="12x annualized recurring run rate"
          tone="success"
          icon={TrendingUp}
        />
        <Kpi
          label="Gross Captured Revenue"
          value={`₹${(metrics.totalGrossRevenue || 0).toLocaleString("en-IN")}`}
          detail={`${metrics.totalCapturedTransactions || 0} successful provider charges`}
          tone="ink"
          icon={CreditCard}
        />
        <Kpi
          label="Net Provider Revenue"
          value={`₹${(metrics.netRevenue || 0).toLocaleString("en-IN")}`}
          detail={`₹${(metrics.totalRefunds || 0).toLocaleString("en-IN")} total refunds accounted`}
          tone="ink"
          icon={Users}
        />
      </div>

      {/* Subscription Status Metric Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Subscription status breakdown">
        <div
          onClick={() => handleFilterChange(setStatusFilter, "all")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            statusFilter === "all" ? "border-brand-500 bg-brand-50/40 ring-1 ring-brand-500" : "border-ink-100 bg-white hover:border-ink-200"
          }`}
        >
          <div className="text-xs font-medium text-ink-500">Total Subscriptions</div>
          <div className="mt-1 text-2xl font-bold text-ink-900">{counts.total ?? 0}</div>
          <div className="mt-1 text-[11px] text-ink-400">All registered plans</div>
        </div>

        <div
          onClick={() => handleFilterChange(setStatusFilter, "active")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            statusFilter === "active" ? "border-success-500 bg-success-50/40 ring-1 ring-success-500" : "border-ink-100 bg-white hover:border-ink-200"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-success-700">
            <CheckCircle className="h-3.5 w-3.5" />
            Active Paid
          </div>
          <div className="mt-1 text-2xl font-bold text-success-900">{counts.activePaid ?? 0}</div>
          <div className="mt-1 text-[11px] text-success-700 font-medium">Paying subscribers</div>
        </div>

        <div
          onClick={() => handleFilterChange(setStatusFilter, "all")}
          className="rounded-xl border border-ink-100 bg-white p-4"
        >
          <div className="text-xs font-medium text-ink-500">Free Tier</div>
          <div className="mt-1 text-2xl font-bold text-ink-900">{counts.free ?? 0}</div>
          <div className="mt-1 text-[11px] text-ink-400">Candidate & Recruiter free</div>
        </div>

        <div
          onClick={() => handleFilterChange(setStatusFilter, "past_due")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            statusFilter === "past_due" ? "border-danger-500 bg-danger-50/40 ring-1 ring-danger-500" : "border-ink-100 bg-white hover:border-ink-200"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-danger-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Past Due
          </div>
          <div className="mt-1 text-2xl font-bold text-danger-900">{counts.pastDue ?? 0}</div>
          <div className="mt-1 text-[11px] text-danger-700 font-medium">Renewal failures</div>
        </div>

        <div
          onClick={() => handleFilterChange(setStatusFilter, "canceled")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            statusFilter === "canceled" ? "border-ink-400 bg-ink-50 ring-1 ring-ink-400" : "border-ink-100 bg-white hover:border-ink-200"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
            <XCircle className="h-3.5 w-3.5" />
            Canceled
          </div>
          <div className="mt-1 text-2xl font-bold text-ink-800">{counts.canceled ?? 0}</div>
          <div className="mt-1 text-[11px] text-ink-400">Terminated plans</div>
        </div>

        <div
          onClick={() => handleFilterChange(setStatusFilter, "expired")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            statusFilter === "expired" ? "border-warning-500 bg-warning-50/40 ring-1 ring-warning-500" : "border-ink-100 bg-white hover:border-ink-200"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-warning-700">
            <Clock className="h-3.5 w-3.5" />
            Expired / Demo
          </div>
          <div className="mt-1 text-2xl font-bold text-warning-900">{counts.expired ?? 0}</div>
          <div className="mt-1 text-[11px] text-warning-700">Period concluded</div>
        </div>
      </div>

      {/* Visual Analytics Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Revenue Trend */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink-900">Monthly Captured Revenue (INR)</h3>
              <p className="text-xs text-ink-500">Real provider transaction volume over time</p>
            </div>
            <Badge tone="brand">Provider Aggregations</Badge>
          </div>
          {monthlyTrends.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-ink-400">
              No revenue captured in database yet.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f2f5" />
                  <XAxis dataKey="yearMonth" stroke="#8993a4" fontSize={12} />
                  <YAxis stroke="#8993a4" fontSize={12} tickFormatter={(v) => `₹${v / 1000}k`} />
                  <Tooltip
                    formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Gross Captured"]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #dfe1e6" }}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Gross Revenue (₹)" fill="#0052cc" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Plan Distribution Pie Chart */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-bold text-ink-900">Plan Distribution</h3>
            <p className="text-xs text-ink-500">Breakdown of subscribers across platform tiers</p>
          </div>
          {planDistribution.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-ink-400">
              No subscription records available.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={planDistribution}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {planDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, `Subscribers (${name})`]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Subscriptions Directory Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Subscriptions Directory</h2>
            <p className="text-xs text-ink-500">Manage individual subscription accounts, entitlements, and lifecycle</p>
          </div>
          <button
            type="button"
            onClick={() => subscriptionsQuery.refetch()}
            className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh List
          </button>
        </div>

        {/* Search & Filters Bar */}
        <div className="grid gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <input
              type="search"
              aria-label="Search subscriptions"
              placeholder="Search by company, candidate, plan, or ID…"
              className="w-full rounded-lg border border-ink-200 pl-9 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              value={q}
              onChange={(e) => handleFilterChange(setQ, e.target.value)}
            />
          </div>

          <label className="flex flex-col text-xs font-semibold text-ink-600">
            Status
            <select
              aria-label="Filter by status"
              className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
              <option value="expired">Expired</option>
            </select>
          </label>

          <label className="flex flex-col text-xs font-semibold text-ink-600">
            Plan Tier
            <select
              aria-label="Filter by plan"
              className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
              value={planFilter}
              onChange={(e) => handleFilterChange(setPlanFilter, e.target.value)}
            >
              <option value="all">All plans</option>
              <option value="recruiter_growth">Recruiter Growth</option>
              <option value="recruiter_starter">Recruiter Starter</option>
              <option value="recruiter_enterprise">Recruiter Enterprise</option>
              <option value="recruiter_free">Recruiter Free</option>
              <option value="candidate_plus">Candidate Plus</option>
              <option value="candidate_free">Candidate Free</option>
            </select>
          </label>

          <label className="flex flex-col text-xs font-semibold text-ink-600">
            Subscriber Type
            <select
              aria-label="Filter by subscriber type"
              className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
              value={typeFilter}
              onChange={(e) => handleFilterChange(setTypeFilter, e.target.value)}
            >
              <option value="all">All types</option>
              <option value="organization">Companies</option>
              <option value="candidate">Candidates</option>
            </select>
          </label>

          <label className="flex flex-col text-xs font-semibold text-ink-600">
            Sort By
            <select
              aria-label="Sort subscriptions"
              className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
              value={sort}
              onChange={(e) => handleFilterChange(setSort, e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="expiry">Expiry / Renewal</option>
              <option value="price">Highest price</option>
            </select>
          </label>
        </div>

        {/* Directory Content */}
        {subscriptionsQuery.isLoading && <LoadingState message="Loading platform subscriptions…" />}
        {subscriptionsQuery.isError && (
          <ErrorState error={subscriptionsQuery.error} onRetry={() => subscriptionsQuery.refetch()} />
        )}

        {subscriptionsQuery.isSuccess && subData.length === 0 && (
          <EmptyState
            title="No subscriptions match this view"
            description="Try modifying search keywords or clearing status and plan filters."
          />
        )}

        {subscriptionsQuery.isSuccess && subData.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-ink-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" aria-label="Subscriptions list">
                <thead className="bg-ink-50/70 text-xs font-semibold text-ink-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">Subscriber</th>
                    <th scope="col" className="px-6 py-3.5">Plan Tier</th>
                    <th scope="col" className="px-6 py-3.5">Price & Cycle</th>
                    <th scope="col" className="px-6 py-3.5">Status</th>
                    <th scope="col" className="px-6 py-3.5">Current Period / Renewal</th>
                    <th scope="col" className="px-6 py-3.5">Quotas & Usage</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 text-ink-800">
                  {subData.map((sub) => {
                    const isOrg = sub.subscriberType === "organization";
                    return (
                      <tr key={sub.id} className="hover:bg-ink-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                              {isOrg ? <Building className="h-4 w-4" /> : <User className="h-4 w-4" />}
                            </div>
                            <div>
                              <div className="font-semibold text-ink-900">{sub.subscriber?.name || "Subscriber"}</div>
                              <div className="text-xs text-ink-400">
                                {sub.subscriber?.email || (isOrg ? "Organization" : "Candidate")}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <Badge tone="brand">{sub.planName || sub.planTier}</Badge>
                          {sub.isDemo && (
                            <span className="ml-1.5 inline-block text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">
                              Demo
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-semibold text-ink-900">
                            {sub.priceInr > 0 ? `₹${sub.priceInr.toLocaleString("en-IN")}` : "Free"}
                          </div>
                          <div className="text-xs text-ink-400 capitalize">{sub.billingCycle}</div>
                        </td>

                        <td className="px-6 py-4">
                          <Badge tone={STATUS_TONES[sub.status] || "neutral"}>
                            {sub.status?.replace("_", " ")}
                          </Badge>
                          {sub.cancelAtPeriodEnd && (
                            <div className="mt-1 text-[11px] text-amber-700 font-medium">Cancels at period end</div>
                          )}
                          {sub.renewalFailures > 0 && (
                            <div className="mt-1 text-[11px] text-danger-700 font-medium">
                              {sub.renewalFailures} renewal failures
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 text-xs">
                          <div className="text-ink-700">Ends: {formatDate(sub.currentPeriodEnd)}</div>
                          <div className="text-ink-400">Started: {formatDate(sub.currentPeriodStart)}</div>
                        </td>

                        <td className="px-6 py-4 text-xs">
                          {isOrg ? (
                            <div className="space-y-0.5 text-ink-600">
                              <div>
                                Jobs: <span className="font-medium text-ink-900">{sub.usage?.activeJobsCount || 0}</span> / {sub.limits?.activeJobs ?? "∞"}
                              </div>
                              <div>
                                AI: <span className="font-medium text-ink-900">{sub.usage?.aiAnalysesUsedThisMonth || 0}</span> / {sub.limits?.aiAnalysesPerMonth ?? "∞"}
                              </div>
                            </div>
                          ) : (
                            <div className="text-ink-600">
                              AI: <span className="font-medium text-ink-900">{sub.usage?.aiAnalysesUsedThisMonth || 0}</span> / {sub.limits?.aiAnalysesPerMonth ?? "∞"}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedSubId(sub.id)}
                            icon={Eye}
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between border-t border-ink-100 px-6 py-3 text-xs text-ink-600">
              <div>
                Page {subMeta.page} of {subMeta.pages} · {subMeta.total} subscriptions
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={subMeta.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={subMeta.page >= subMeta.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Platform Transactions Table */}
      <div className="rounded-2xl border border-ink-100 bg-white shadow-sm">
        <div className="border-b border-ink-100 p-6">
          <h3 className="text-base font-bold text-ink-900">Recent Payment Transactions</h3>
          <p className="text-xs text-ink-500">Audit trail of verified payment orders and subscriptions</p>
        </div>
        {recentTransactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">No payment transactions recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/70 text-xs font-semibold text-ink-500">
                <tr>
                  <th className="px-6 py-3">Transaction / Invoice #</th>
                  <th className="px-6 py-3">Customer / Subscriber</th>
                  <th className="px-6 py-3">Plan Tier</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Gateway</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-ink-800">
                {recentTransactions.map((tx) => (
                  <tr key={tx._id || tx.id} className="hover:bg-ink-50/50">
                    <td className="px-6 py-4 font-mono text-xs font-bold text-ink-900">
                      <div>{tx.invoiceNumber || tx.transactionNumber}</div>
                      {tx.invoiceNumber && tx.transactionNumber && (
                        <div className="text-[10px] font-normal text-ink-400">{tx.transactionNumber}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink-900">
                        {tx.customerName || tx.user?.name || tx.organization?.name || "Subscriber"}
                      </p>
                      <p className="text-xs text-ink-400">
                        {tx.customerEmail || tx.user?.email || tx.subscriberType}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone="brand">{tx.planTier?.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-6 py-4 font-bold text-ink-900">
                      ₹{tx.amount?.toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 capitalize text-ink-500">
                      {tx.gateway || "Razorpay"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        tone={
                          tx.status === "captured"
                            ? "success"
                            : tx.status === "failed"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-xs text-ink-500">{formatDate(tx.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Subscription Details & Management Drawer/Modal */}
      {selectedSubId && (
        <SubscriptionDetailModal
          subscriptionId={selectedSubId}
          onClose={() => setSelectedSubId(null)}
          onSubscriptionUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
            queryClient.invalidateQueries({ queryKey: ["admin-revenue-analytics"] });
          }}
        />
      )}
    </div>
  );
};

/**
 * Detailed Subscription Inspection & Lifecycle Governance Modal
 */
const SubscriptionDetailModal = ({ subscriptionId, onClose, onSubscriptionUpdated }) => {
  const toast = getSafeToast();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState("");
  const [immediateCancel, setImmediateCancel] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const query = useQuery({
    queryKey: ["admin-subscription-detail", subscriptionId],
    queryFn: () => adminApi.subscriptionDetails(subscriptionId),
    enabled: Boolean(subscriptionId),
  });

  const cancelMutation = useMutation({
    mutationFn: (body) => adminApi.cancelSubscription(subscriptionId, body),
    onSuccess: (res) => {
      toast.success(res.message || "Subscription updated successfully");
      setShowCancelConfirm(false);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-detail", subscriptionId] });
      onSubscriptionUpdated?.();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to cancel subscription");
    },
  });

  const data = query.data?.data;
  const sub = data?.subscription;
  const subscriber = data?.subscriber;
  const paymentHistory = data?.paymentHistory || [];
  const auditHistory = data?.auditHistory || [];

  const handleCancelSubmit = (e) => {
    e.preventDefault();
    if (!cancelReason || cancelReason.trim().length < 3) {
      toast.error("Please provide a valid reason of at least 3 characters");
      return;
    }
    cancelMutation.mutate({ reason: cancelReason.trim(), immediate: immediateCancel });
  };

  return (
    <Modal
      open={Boolean(subscriptionId)}
      onClose={onClose}
      title="Subscription Details & Governance"
      size="xl"
    >
      {query.isLoading && <LoadingState message="Loading subscription record…" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      {query.isSuccess && sub && (
        <div className="space-y-6">
          {/* Header Summary Card */}
          <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
                  {sub.subscriberType === "organization" ? "Company Account" : "Candidate Account"}
                </span>
                <h3 className="text-lg font-bold text-ink-900">{subscriber?.name || "Subscriber"}</h3>
                <p className="text-xs text-ink-500">{subscriber?.email || "No contact email on file"}</p>
              </div>

              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONES[sub.status] || "neutral"}>
                  {sub.status?.toUpperCase()}
                </Badge>
                <Badge tone="brand">{sub.planName || sub.planTier}</Badge>
              </div>
            </div>
          </div>

          {/* Plan & Cycle Facts */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-xs text-ink-500">Plan Price</div>
              <div className="text-base font-bold text-ink-900">
                {sub.priceInr > 0 ? `₹${sub.priceInr.toLocaleString("en-IN")}` : "Free"}
              </div>
              <div className="text-[11px] text-ink-400 capitalize">{sub.billingCycle} billing</div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-xs text-ink-500">Current Period Start</div>
              <div className="text-sm font-semibold text-ink-900">{formatDate(sub.currentPeriodStart)}</div>
              <div className="text-[11px] text-ink-400">Activation timestamp</div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-xs text-ink-500">Next Renewal / Expiry</div>
              <div className="text-sm font-semibold text-ink-900">{formatDate(sub.currentPeriodEnd)}</div>
              <div className="text-[11px] text-ink-400">
                {sub.cancelAtPeriodEnd ? "Scheduled to terminate" : "Auto-renews"}
              </div>
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-3">
              <div className="text-xs text-ink-500">Provider Subscription</div>
              <div className="font-mono text-xs font-semibold text-ink-900 truncate">
                {sub.providerSubscriptionId || "Local / Demo"}
              </div>
              <div className="text-[11px] text-ink-400">
                {sub.providerStatus ? `Status: ${sub.providerStatus}` : "No external provider ID"}
              </div>
            </div>
          </div>

          {/* Entitlements vs Actual Usage */}
          <div className="rounded-xl border border-ink-100 bg-white p-4">
            <h4 className="text-sm font-bold text-ink-900 mb-3">Entitlements & Live Usage</h4>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-ink-50/60 p-3">
                <div className="text-xs text-ink-500">Active Job Postings</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-ink-900">{sub.usage?.activeJobsCount || 0}</span>
                  <span className="text-xs text-ink-500">/ {sub.limits?.activeJobs ?? "∞"} limit</span>
                </div>
              </div>

              <div className="rounded-lg bg-ink-50/60 p-3">
                <div className="text-xs text-ink-500">Team Seats</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-ink-900">{sub.usage?.teamMembersCount || 0}</span>
                  <span className="text-xs text-ink-500">/ {sub.limits?.teamMembers ?? "∞"} limit</span>
                </div>
              </div>

              <div className="rounded-lg bg-ink-50/60 p-3">
                <div className="text-xs text-ink-500">Monthly AI Analyses</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-ink-900">{sub.usage?.aiAnalysesUsedThisMonth || 0}</span>
                  <span className="text-xs text-ink-500">/ {sub.limits?.aiAnalysesPerMonth ?? "∞"} limit</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment History Table */}
          <div className="rounded-xl border border-ink-100 bg-white p-4">
            <h4 className="text-sm font-bold text-ink-900 mb-2">Payment Transaction History</h4>
            {paymentHistory.length === 0 ? (
              <p className="text-xs text-ink-400 py-3">No captured payment orders recorded for this account.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-ink-50 text-ink-500">
                    <tr>
                      <th className="px-3 py-2">Transaction #</th>
                      <th className="px-3 py-2">Invoice #</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Gateway</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {paymentHistory.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono font-semibold text-ink-900">{p.transactionNumber}</td>
                        <td className="px-3 py-2 font-mono text-ink-600">{p.invoiceNumber || "—"}</td>
                        <td className="px-3 py-2 font-semibold">₹{p.amount?.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2 capitalize">{p.gateway} ({p.mode})</td>
                        <td className="px-3 py-2">
                          <Badge tone={p.status === "captured" ? "success" : p.status === "failed" ? "danger" : "warning"}>
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-ink-500">{formatDate(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Audit History */}
          <div className="rounded-xl border border-ink-100 bg-white p-4">
            <h4 className="text-sm font-bold text-ink-900 mb-2">Audit History</h4>
            {auditHistory.length === 0 ? (
              <p className="text-xs text-ink-400 py-3">No security or governance events logged for this subscription.</p>
            ) : (
              <div className="space-y-2">
                {auditHistory.map((a) => (
                  <div key={a.id} className="rounded-lg bg-ink-50 p-2.5 text-xs">
                    <div className="flex items-center justify-between font-medium text-ink-800">
                      <span>{a.action}</span>
                      <span className="text-ink-400">{formatDateTime(a.createdAt)}</span>
                    </div>
                    {a.reason && <p className="mt-1 text-ink-600">Reason: {a.reason}</p>}
                    <div className="mt-0.5 text-[11px] text-ink-400">Actor: {a.actorName}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Administrative Actions */}
          <div className="rounded-xl border border-danger-200 bg-danger-50/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-danger-900">Administrative Cancellation</h4>
                <p className="text-xs text-danger-700">
                  Cancel or suspend this subscription. Requires mandatory audit documentation.
                </p>
              </div>
              {sub.status !== "canceled" ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowCancelConfirm(!showCancelConfirm)}
                >
                  {showCancelConfirm ? "Close Form" : "Cancel Subscription"}
                </Button>
              ) : (
                <Badge tone="neutral">Already Canceled</Badge>
              )}
            </div>

            {showCancelConfirm && sub.status !== "canceled" && (
              <form onSubmit={handleCancelSubmit} className="mt-4 space-y-3 border-t border-danger-200 pt-4">
                <label className="block text-xs font-semibold text-danger-900">
                  Mandatory Cancellation Reason:
                  <textarea
                    required
                    rows={2}
                    placeholder="Enter explicit governance reason for this administrative cancellation…"
                    className="mt-1 w-full rounded-lg border border-danger-300 p-2.5 text-sm focus:border-danger-500 focus:outline-none"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </label>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="immediateCancelToggle"
                    checked={immediateCancel}
                    onChange={(e) => setImmediateCancel(e.target.checked)}
                    className="h-4 w-4 rounded border-ink-300 text-danger-600 focus:ring-danger-500"
                  />
                  <label htmlFor="immediateCancelToggle" className="text-xs font-medium text-danger-900">
                    Immediate Termination (immediately revokes plan without waiting for current period end)
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    Dismiss
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    type="submit"
                    loading={cancelMutation.isPending}
                  >
                    Confirm Cancellation
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AdminSubscriptions;
