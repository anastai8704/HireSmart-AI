import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Users,
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
import { ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { adminApi } from "../../lib/api";
import { formatDate } from "../../lib/utils";

const COLORS = ["#0052cc", "#00875a", "#ffab00", "#de350b", "#6554c0"];

export const AdminSubscriptions = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-revenue-analytics"],
    queryFn: adminApi.revenueAnalytics,
  });

  if (isLoading) return <LoadingState message="Loading revenue & subscription analytics…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const analytics = data?.data || {};
  const metrics = analytics.metrics || {};
  const monthlyTrends = analytics.monthlyTrends || [];
  const planDistribution = analytics.planDistribution || [];
  const recentTransactions = analytics.recentTransactions || [];

  return (
    <div className="page-wrap space-y-8">
      <PageHeader
        eyebrow="Financial Governance"
        title="Revenue & Subscriptions"
        description="Monitor platform gross revenue, monthly recurring revenue (MRR), net profit estimates, and subscriber breakdown."
      />

      {/* Top Financial KPI Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Monthly Recurring (MRR)"
          value={`₹${(metrics.mrrInr || metrics.monthlyRecurringRevenue || 0).toLocaleString("en-IN")}`}
          detail={`${metrics.activeSubscriptions || metrics.activePaidSubscribers || 0} active subscriptions`}
          tone="brand"
          icon={DollarSign}
        />
        <Kpi
          label="Annual Run Rate (ARR)"
          value={`₹${(metrics.arrInr || (metrics.monthlyRecurringRevenue || 0) * 12).toLocaleString("en-IN")}`}
          detail="12x annualized revenue projection"
          tone="success"
          icon={TrendingUp}
        />
        <Kpi
          label="Total Gross Revenue"
          value={`₹${(metrics.lifetimeRevenueInr || metrics.totalGrossRevenue || 0).toLocaleString("en-IN")}`}
          detail={`${metrics.totalTransactionsCount || metrics.totalCapturedTransactions || 0} successful transactions`}
          tone="ink"
          icon={CreditCard}
        />
        <Kpi
          label="Paid Subscribers"
          value={metrics.activeSubscriptions || metrics.activePaidSubscribers || 0}
          detail={`${metrics.activePaidCandidates || 0} Candidates · ${metrics.activePaidRecruiters || 0} Companies`}
          tone="ink"
          icon={Users}
        />
      </div>

      {/* Visual Revenue & Plan Breakdown Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Revenue Trend */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink-900">Monthly Revenue Trend (INR)</h3>
              <p className="text-xs text-ink-500">Captured transaction revenue over time</p>
            </div>
            <Badge tone="brand">Real Aggregations</Badge>
          </div>
          {monthlyTrends.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-ink-400">
              No revenue records captured yet.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f2f5" />
                  <XAxis dataKey="yearMonth" stroke="#8993a4" fontSize={12} />
                  <YAxis stroke="#8993a4" fontSize={12} tickFormatter={(v) => `₹${v / 1000}k`} />
                  <Tooltip
                    formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Revenue"]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #dfe1e6" }}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue (₹)" fill="#0052cc" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Plan Distribution Pie Chart */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-bold text-ink-900">Active Plan Breakdown</h3>
            <p className="text-xs text-ink-500">Distribution across subscription tiers</p>
          </div>
          {planDistribution.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-ink-400">
              No active subscription records.
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
                    outerRadius={80}
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
                  <tr key={tx._id} className="hover:bg-ink-50/50">
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
    </div>
  );
};
