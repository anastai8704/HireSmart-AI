import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  FileCheck2,
  Flag,
  Layers,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import Button from "../../components/ui/Button";
import Input, { Textarea } from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import { AdminAnalyticsPanel } from "./AdminAnalyticsPanel";
import { PlatformHealthPanel } from "../../components/admin/PlatformHealthPanel";
import { CandidateResumesModal } from "../../components/admin/CandidateResumesModal";
import { Candidate360Drawer } from "../../components/admin/Candidate360Drawer";
import { buildQueues } from "../../lib/controlCenter";
import { healthFrom } from "../../lib/platformHealth";
import { istToday, validateCustomRange } from "../../lib/analyticsRange";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import Kpi from "../../components/ui/Kpi";
import PipelineFunnel from "../../components/ui/PipelineFunnel";
import { ErrorState, LoadingState, SkeletonList } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { adminApi, verificationApi } from "../../lib/api";
import { useToast } from "../../components/ui/useToast";
import {
  formatDate,
  initials,
  downloadBlob,
} from "../../lib/utils";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";



const VERIFICATION_STATUS_OPTIONS = [
  { value: "all", label: "All verification states" },
  { value: "pending", label: "Pending Review" },
  { value: "under_review", label: "Under Review" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
];

const RISK_LEVEL_OPTIONS = [
  { value: "all", label: "All risk levels" },
  { value: "low", label: "Low risk (0-25)" },
  { value: "medium", label: "Medium risk (26-60)" },
  { value: "high", label: "High risk (61+)" },
];

const FilterBar = ({ children }) => (
  <div className="mb-6 flex flex-wrap items-center gap-3">{children}</div>
);

const DataTable = ({ headers, children, empty, emptyLabel = "No items match your filter" }) => (
  <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-xs">
    <table className="w-full text-left text-sm">
      <thead className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wider text-ink-500">
        <tr>
          {headers.map((h, i) => (
            <th key={i} className="px-5 py-3.5">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-100 text-ink-800">
        {empty ? (
          <tr>
            <td colSpan={headers.length} className="px-5 py-12 text-center text-sm text-ink-400">
              {emptyLabel}
            </td>
          </tr>
        ) : (
          children
        )}
      </tbody>
    </table>
  </div>
);


/* =========================================================================
   1. ADMIN HOME (Aggregated Overview Analytics & Placement Tracking)
   ========================================================================= */
export const AdminHome = () => {
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [range, setRange] = useState({ preset: "30d", from: "", to: "" });
  // Today's IST calendar day, captured once per mount (the reporting timezone is Asia/Kolkata).
  const [todayIst] = useState(() => istToday());
  const customError = range.preset === "custom" ? validateCustomRange(range.from, range.to, todayIst) : null;
  const rangeParams =
    range.preset === "custom" ? { range: "custom", from: range.from, to: range.to } : { range: range.preset };

  const pendingQuery = useQuery({
    queryKey: ["moderation-jobs", "pending"],
    queryFn: () => adminApi.moderation({ status: "pending", limit: 100 }),
  });
  const aiQuery = useQuery({
    queryKey: ["admin-ai-usage"],
    queryFn: adminApi.aiUsage,
  });
  const overviewQuery = useQuery({
    queryKey: ["admin-overview-analytics", selectedOrgId, rangeParams],
    enabled: !customError,
    queryFn: () =>
      adminApi.overviewAnalytics({
        ...rangeParams,
        ...(selectedOrgId ? { organizationId: selectedOrgId } : {}),
      }),
  });
  // Readiness is checked on its own schedule so a slow database never blocks the rest of the page.
  const healthQuery = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => adminApi.ready(),
    refetchInterval: 60 * 1000,
    retry: false,
  });

  const exportReport = async (type) => {
    const res = await adminApi.reportCsv(type, rangeParams);
    const from = range.preset === "custom" ? range.from : range.preset;
    const to = range.preset === "custom" ? range.to : "today";
    downloadBlob(res.data, `hiresmart-${type}-${from}-to-${to}.csv`);
  };

  const isLoading = overviewQuery.isLoading || pendingQuery.isLoading || aiQuery.isLoading;
  if (isLoading) return <LoadingState message="Loading control center…" />;

  const stats = overviewQuery.data?.data || null;
  const pendingJobs = pendingQuery.data?.data || [];
  const aiRows = aiQuery.data?.data || [];
  const queues = buildQueues(stats);
  const health = healthFrom({ data: healthQuery.data?.data, error: healthQuery.error });

  const totalAiRuns = aiRows.reduce((sum, r) => sum + (r.runs || 0), 0);
  const monthlyTrends = stats?.monthlyTrends || [];
  const companyWise = stats?.companyWiseStats || [];
  const deepDive = stats?.deepDive || null;

  const funnelStages = [
    { label: "Submitted", value: stats?.applications?.submitted || 0, tone: "ink" },
    { label: "Shortlisted", value: stats?.applications?.shortlisted || 0, tone: "warning" },
    { label: "Interview", value: stats?.applications?.interview || 0, tone: "brand" },
    { label: "Hired", value: stats?.applications?.hired || 0, tone: "success" },
    { label: "Joining Confirmed", value: stats?.placements?.joiningConfirmed || 0, tone: "success" },
    { label: "Verified Placement", value: stats?.placements?.verifiedPlacements || 0, tone: "success" },
  ];

  return (
    <div className="page-wrap space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader
          eyebrow="Platform Overview"
          title="Control Center"
          description="What needs attention now, platform health, and analytics for the range you choose. Every figure is read from the database."
        />
        {companyWise.length > 0 && (
          <div className="flex items-center gap-3">
            <SearchableSelect
              aria-label="Filter company deep dive"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              options={[
                { value: "", label: "All Platform Companies" },
                ...companyWise.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
              className="w-64"
            />
          </div>
        )}
      </div>

      {overviewQuery.isError && (
        <ErrorState
          title="Analytics could not be loaded"
          error={overviewQuery.error}
          onRetry={() => overviewQuery.refetch()}
        />
      )}

      {/* 1. Platform Headline KPIs */}
      <section aria-labelledby="headline-kpi-heading">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="headline-kpi-heading" className="text-sm font-bold uppercase tracking-wider text-ink-500">
              Platform Headline KPIs · All Time
            </h2>
            <p className="text-xs text-ink-500">Database-verified platform scale and monetization metrics</p>
          </div>
          <Badge tone="brand">System Live</Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label="Total users"
            value={stats?.users?.total ?? 0}
            detail={`${stats?.users?.candidates ?? 0} candidates · ${stats?.users?.recruiters ?? 0} recruiters`}
            tone="brand"
            icon={Users}
          />
          <Kpi
            label="Total organizations"
            value={stats?.companies?.total ?? 0}
            detail={`${stats?.companies?.verified ?? 0} verified on platform`}
            tone="ink"
            icon={Building2}
          />
          <Kpi
            label="Verified organizations"
            value={stats?.companies?.verified ?? 0}
            detail={`${stats?.companies?.total ? Math.round(((stats.companies.verified || 0) / stats.companies.total) * 100) : 0}% compliance rate`}
            tone="success"
            icon={ShieldCheck}
          />
          <Kpi
            label="Pending verifications"
            value={(stats?.companies?.pending || 0) + (stats?.companies?.underReview || 0)}
            detail={`${stats?.companies?.pending || 0} pending · ${stats?.companies?.underReview || 0} under review`}
            tone={((stats?.companies?.pending || 0) + (stats?.companies?.underReview || 0)) > 0 ? "warning" : "ink"}
            icon={Clock3}
          />
          <Kpi
            label="Total jobs"
            value={stats?.jobs?.total ?? 0}
            detail={`${stats?.jobs?.active ?? 0} active & published`}
            tone="brand"
            icon={BriefcaseBusiness}
          />
          <Kpi
            label="Jobs pending approval"
            value={stats?.jobs?.pending ?? 0}
            detail="Requires admin moderation"
            tone={(stats?.jobs?.pending || 0) > 0 ? "warning" : "ink"}
            icon={AlertTriangle}
          />
          <Kpi
            label="Total applications"
            value={stats?.applications?.total ?? 0}
            detail={`${stats?.applications?.shortlisted ?? 0} shortlisted · ${stats?.applications?.interview ?? 0} interviewed`}
            tone="brand"
            icon={Layers}
          />
          <Kpi
            label="Placements & hires"
            value={stats?.placements?.verifiedPlacements ?? 0}
            detail={`${stats?.applications?.hired ?? 0} hired · ${stats?.placements?.joiningConfirmed ?? 0} joinings`}
            tone="success"
            icon={FileCheck2}
          />
          <Kpi
            label="Active subscriptions"
            value={stats?.kpis?.activePaidSubscriptions ?? 0}
            detail={`${stats?.kpis?.subscriptionConversion ?? 0}% org conversion`}
            tone="brand"
            icon={CreditCard}
          />
          <Kpi
            label="Revenue (Test Mode)"
            value={`₹${(stats?.kpis?.testRevenue ?? stats?.kpis?.revenue ?? 0).toLocaleString("en-IN")}`}
            detail={`Test: ₹${(stats?.kpis?.testRevenue ?? stats?.kpis?.revenue ?? 0).toLocaleString("en-IN")} · Live: ₹${(stats?.kpis?.liveRevenue ?? 0).toLocaleString("en-IN")}`}
            tone="success"
            icon={DollarSign}
          />
          <Kpi
            label="Security & Risk Events"
            value={stats?.kpis?.fraudReviewQueue ?? 0}
            detail={`${stats?.kpis?.suspendedAccounts ?? 0} suspended · ${stats?.kpis?.failedPayments ?? 0} failed payments`}
            tone={(stats?.kpis?.fraudReviewQueue || 0) > 0 ? "warning" : "ink"}
            icon={ShieldAlert}
          />
          <Kpi
            label="AI runs"
            value={totalAiRuns}
            detail="Model matching & resume runs"
            tone="ink"
            icon={Sparkles}
          />
        </div>
      </section>

      {/* 2. Visual Analytics */}
      <AdminAnalyticsPanel
        analytics={stats}
        range={range}
        onRangeChange={setRange}
        customError={customError}
        onExportReport={exportReport}
      />

      {/* Deep Dive Banner if Company Selected */}
      {deepDive && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-6 shadow-xs">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="brand">Deep Dive</Badge>
                <h3 className="text-lg font-bold text-ink-950">{deepDive.name}</h3>
                <Badge tone={deepDive.verificationStatus === "verified" ? "success" : "warning"}>
                  {deepDive.verificationStatus}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-ink-600">
                Risk Score: {deepDive.riskScore}/100 · {deepDive.publishedJobsCount} Live Jobs · {deepDive.applicationCount} Total Applicants
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm font-semibold text-ink-800">
              <span className="rounded-xl bg-white px-3.5 py-1.5 shadow-xs">Shortlisted: {deepDive.shortlistCount}</span>
              <span className="rounded-xl bg-white px-3.5 py-1.5 shadow-xs">Hired: {deepDive.hiredCount}</span>
              <span className="rounded-xl bg-white px-3.5 py-1.5 shadow-xs">Placements: {deepDive.placementCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Long-run trend and pipeline (all time, last 12 months) */}
      {monthlyTrends.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink-900">12-Month Hiring Trends</h3>
                <p className="text-xs text-ink-500">Applications, hires and verified placements, by month (IST)</p>
              </div>
              <Badge tone="brand">Platform Aggregations</Badge>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="appGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0052cc" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0052cc" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="hireGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00875a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00875a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f2f5" />
                  <XAxis dataKey="yearMonth" stroke="#8993a4" fontSize={11} />
                  <YAxis stroke="#8993a4" fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #dfe1e6" }} />
                  <Legend />
                  <Area type="monotone" dataKey="applications" name="Applications" stroke="#0052cc" fillOpacity={1} fill="url(#appGradient)" strokeWidth={2} />
                  <Area type="monotone" dataKey="hires" name="Hires" stroke="#00875a" fillOpacity={1} fill="url(#hireGradient)" strokeWidth={2} />
                  <Line type="monotone" dataKey="verifiedPlacements" name="Verified Placements" stroke="#ffab00" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-bold text-ink-900">Platform Hiring Pipeline</h3>
              <p className="text-xs text-ink-500">Candidate conversion, all time</p>
            </div>
            <PipelineFunnel stages={funnelStages} />
          </div>
        </div>
      )}

      {/* 3. Operational Alerts & Attention Queues */}
      {(() => {
        const alerts = [];
        if ((stats?.jobs?.pending || 0) > 0) {
          alerts.push({
            id: "jobs",
            label: `${stats.jobs.pending} job postings awaiting moderation`,
            to: "/app/admin/moderation",
            tone: "warning",
          });
        }
        const pendingVerif = (stats?.companies?.pending || 0) + (stats?.companies?.underReview || 0);
        if (pendingVerif > 0) {
          alerts.push({
            id: "verif",
            label: `${pendingVerif} organization verification requests pending`,
            to: "/app/admin/verification",
            tone: "warning",
          });
        }
        if ((stats?.queues?.placementsAwaitingVerification || 0) > 0) {
          alerts.push({
            id: "placements",
            label: `${stats.queues.placementsAwaitingVerification} confirmed joinings need placement verification`,
            to: "/app/admin/placements",
            tone: "warning",
          });
        }
        if ((stats?.kpis?.fraudReviewQueue || 0) > 0) {
          alerts.push({
            id: "fraud",
            label: `${stats.kpis.fraudReviewQueue} organization(s) flagged for fraud review`,
            to: "/app/admin/organizations",
            tone: "danger",
          });
        }
        if ((stats?.queues?.subscriptionsPastDue || 0) > 0) {
          alerts.push({
            id: "pastDue",
            label: `${stats.queues.subscriptionsPastDue} subscriptions past due`,
            to: "/app/admin/subscriptions",
            tone: "warning",
          });
        }
        if ((stats?.kpis?.failedPayments || 0) > 0) {
          alerts.push({
            id: "failedPayments",
            label: `${stats.kpis.failedPayments} failed payment transactions recorded`,
            to: "/app/admin/revenue",
            tone: "danger",
          });
        }

        if (alerts.length === 0) {
          return (
            <div data-testid="platform-alerts-clear" className="flex items-center gap-3 rounded-2xl border border-success-200 bg-success-50/60 px-5 py-3.5 text-xs text-success-800 shadow-xs">
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-success-600" />
              <span>All platform operational queues are clear. No pending administrative bottlenecks.</span>
            </div>
          );
        }

        return (
          <div data-testid="platform-alerts-banner" className="rounded-2xl border border-warning-200 bg-warning-50/70 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning-700" />
                <h3 className="text-sm font-bold text-warning-900">Active Operational Alerts ({alerts.length})</h3>
              </div>
              <Badge tone="warning">Action Required</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {alerts.map((a) => (
                <Link
                  key={a.id}
                  to={a.to}
                  data-testid={`alert-${a.id}`}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xs transition hover:shadow-sm ${
                    a.tone === "danger"
                      ? "border-danger-300 bg-white text-danger-800 hover:bg-danger-50"
                      : "border-warning-300 bg-white text-warning-900 hover:bg-warning-50"
                  }`}
                >
                  <span>{a.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 opacity-70" />
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Operational queues: live counts that drill down to the page where the work is done */}
      <section aria-labelledby="queues-heading">
        <div className="mb-4">
          <h2 id="queues-heading" className="text-sm font-bold uppercase tracking-wider text-ink-500">
            Needs attention
          </h2>
          <p className="text-xs text-ink-500">Open a queue to work it. “—” means the count is not available.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {queues.map((q) => (
            <li key={q.key}>
              <Link
                to={q.to}
                data-testid={`queue-${q.key}`}
                className={`flex h-full items-center justify-between gap-3 rounded-2xl border bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  q.tone === "warning" ? "border-warning-200" : "border-ink-100"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{q.label}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">{q.hint}</p>
                </div>
                <span
                  className={`shrink-0 text-2xl font-extrabold tabular-nums ${
                    q.tone === "warning" ? "text-warning-700" : "text-ink-900"
                  }`}
                >
                  {q.count === null ? "—" : q.count.toLocaleString("en-IN")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Operational Cards: Approvals Waiting, Recent Organizations, Subscription & Revenue Overview */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending job approvals (the first items of the queue) */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink-900">Job approvals waiting</h3>
              <p className="text-xs text-ink-500">Oldest first from the moderation queue</p>
            </div>
            <Button as={Link} to="/app/admin/moderation" size="sm" variant="ghost">
              Review all ({pendingJobs.length})
            </Button>
          </div>
          {pendingJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">No job postings are waiting for approval.</p>
          ) : (
            <div className="divide-y divide-ink-100">
              {pendingJobs.slice(0, 4).map((j) => (
                <div key={j.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-semibold text-ink-900">{j.title}</p>
                    <p className="text-xs text-ink-500">{j.company} · {j.location}</p>
                  </div>
                  <Button as={Link} to="/app/admin/moderation" size="sm" variant="outline">
                    Review
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Card */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm" data-testid="recent-orgs-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink-900">Recent Activity</h3>
              <p className="text-xs text-ink-500">Active and recently registered companies</p>
            </div>
            <Button as={Link} to="/app/admin/organizations" size="sm" variant="ghost">
              View all ({companyWise.length})
            </Button>
          </div>
          {companyWise.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">No organizations registered on platform.</p>
          ) : (
            <div className="divide-y divide-ink-100">
              {companyWise.slice(0, 5).map((org) => {
                const riskTone =
                  (org.riskScore || 0) > 60
                    ? "danger"
                    : (org.riskScore || 0) > 25
                      ? "warning"
                      : "success";
                return (
                  <div key={org.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-ink-900">{org.name}</p>
                        <Badge
                          tone={
                            org.verificationStatus === "verified"
                              ? "success"
                              : org.verificationStatus === "rejected" || org.verificationStatus === "suspended"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {org.verificationStatus || "pending"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        Risk: <span className={riskTone === "danger" ? "font-bold text-danger-600" : riskTone === "warning" ? "font-semibold text-warning-700" : "text-success-700"}>{org.riskScore ?? 0}/100</span> · {org.publishedJobsCount ?? org.jobCount ?? 0} jobs · {org.applicationCount ?? 0} applicants
                      </p>
                    </div>
                    <Button as={Link} to="/app/admin/organizations" size="sm" variant="outline">
                      Inspect
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Subscription & Revenue Overview Card */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm" data-testid="subscription-overview-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink-900">Subscription & Revenue Overview</h3>
                <Badge tone="brand">Razorpay Test Mode</Badge>
              </div>
              <p className="text-xs text-ink-500">Active monetization and payment health</p>
            </div>
            <Button as={Link} to="/app/admin/subscriptions" size="sm" variant="ghost">
              Manage
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Active Paid Plans</p>
              <p className="mt-1 text-2xl font-bold text-ink-900">{stats?.kpis?.activePaidSubscriptions ?? 0}</p>
              <p className="text-xs text-ink-500">{stats?.kpis?.subscriptionConversion ?? 0}% company conversion</p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Test Mode Net Volume</p>
              <p className="mt-1 text-2xl font-bold text-ink-900">₹{(stats?.kpis?.testRevenue ?? stats?.kpis?.revenue ?? 0).toLocaleString("en-IN")}</p>
              <p className="text-xs text-ink-500">Simulated payments only</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3 text-xs text-ink-600">
            <span>
              Transactions: <strong>{stats?.kpis?.successfulPayments ?? 0}</strong> successful ·{" "}
              <strong className={(stats?.kpis?.failedPayments || 0) > 0 ? "text-danger-600" : ""}>{stats?.kpis?.failedPayments ?? 0}</strong> failed
            </span>
            {(stats?.queues?.subscriptionsPastDue || 0) > 0 && (
              <Badge tone="warning">{stats.queues.subscriptionsPastDue} past due</Badge>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button as={Link} to="/app/admin/subscriptions" size="sm" variant="outline" className="flex-1">
              Subscriptions
            </Button>
            <Button as={Link} to="/app/admin/revenue" size="sm" variant="outline" className="flex-1">
              Revenue Details
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Navigation Shortcuts to Core Admin Tools */}
      <section aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading" className="mb-4 text-sm font-bold uppercase tracking-wider text-ink-500">
          Admin Tool Shortcuts
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Job Moderation", to: "/app/admin/moderation", icon: BriefcaseBusiness, count: stats?.jobs?.pending },
            { label: "Company Verification", to: "/app/admin/verification", icon: ShieldCheck, count: (stats?.companies?.pending || 0) + (stats?.companies?.underReview || 0) },
            { label: "Placements Tracking", to: "/app/admin/placements", icon: BadgeCheck, count: stats?.queues?.placementsAwaitingVerification },
            { label: "Candidates & Users", to: "/app/admin/users", icon: UserRound },
            { label: "Organizations", to: "/app/admin/organizations", icon: Building2 },
            { label: "Global Search", to: "/app/admin/search", icon: Search },
            { label: "Subscriptions", to: "/app/admin/subscriptions", icon: CreditCard, count: stats?.queues?.subscriptionsPastDue },
            { label: "Revenue & Ledger", to: "/app/admin/revenue", icon: DollarSign },
            { label: "Security & Audit", to: "/app/admin/security", icon: ShieldAlert },
            { label: "AI Usage Analytics", to: "/app/admin/ai-usage", icon: Sparkles },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.to}
              data-testid={`shortcut-${item.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
              className="flex items-center justify-between rounded-xl border border-ink-100 bg-white p-3.5 shadow-xs transition hover:border-brand-400 hover:shadow-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <item.icon className="h-4.5 w-4.5 shrink-0 text-brand-600" />
                <span className="truncate text-xs font-semibold text-ink-800">{item.label}</span>
              </div>
              {Boolean(item.count && item.count > 0) && (
                <span className="ml-1.5 rounded-full bg-warning-100 px-2 py-0.5 text-[10px] font-bold text-warning-800">
                  {item.count}
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* 4. Platform Health (compact view below alerts/queues) */}
      <PlatformHealthPanel
        health={health}
        checkedAt={healthQuery.dataUpdatedAt || null}
        refreshing={healthQuery.isFetching}
        onRetry={() => healthQuery.refetch()}
      />
    </div>
  );
};

/* =========================================================================
   2. ADMIN ORGANIZATIONS (Verification & Fraud Detection Interface)
   ========================================================================= */
export const AdminOrganizations = () => {
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("all");
  const [riskLevel, setRiskLevel] = useState("all");
  const [viewOrgId, setViewOrgId] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionReason, setActionReason] = useState("");

  const debounced = useDebouncedValue(search, 300);
  const params = useMemo(
    () => ({
      search: debounced || undefined,
      verificationStatus: verificationStatus !== "all" ? verificationStatus : undefined,
      riskLevel: riskLevel !== "all" ? riskLevel : undefined,
      limit: 100,
    }),
    [debounced, verificationStatus, riskLevel],
  );

  const orgsQuery = useQuery({
    queryKey: ["admin-organizations", params],
    queryFn: () => adminApi.organizations(params),
  });

  const detailQuery = useQuery({
    queryKey: ["admin-org-verification-details", viewOrgId],
    queryFn: () =>
      adminApi.orgVerificationDetails
        ? adminApi.orgVerificationDetails(viewOrgId)
        : Promise.resolve({ data: null }),
    enabled: Boolean(viewOrgId),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ orgId, notes }) => adminApi.verifyOrg(orgId, notes),
    onSuccess: (res) => {
      toast.success(`${res.data?.name || "Company"} verified successfully`);
      qc.invalidateQueries({ queryKey: ["admin-organizations"] });
      qc.invalidateQueries({ queryKey: ["admin-org-verification-details"] });
      setActionModal(null);
      setViewOrgId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orgId, reason }) => adminApi.rejectOrg(orgId, reason),
    onSuccess: () => {
      toast.success("Company verification rejected");
      qc.invalidateQueries({ queryKey: ["admin-organizations"] });
      qc.invalidateQueries({ queryKey: ["admin-org-verification-details"] });
      setActionModal(null);
      setViewOrgId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const requestInfoMutation = useMutation({
    mutationFn: ({ orgId, notes }) => adminApi.requestMoreInfoOrg(orgId, notes),
    onSuccess: () => {
      toast.success("Additional information request sent to company");
      qc.invalidateQueries({ queryKey: ["admin-organizations"] });
      qc.invalidateQueries({ queryKey: ["admin-org-verification-details"] });
      setActionModal(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ orgId, reason }) => adminApi.suspendOrg(orgId, reason),
    onSuccess: () => {
      toast.success("Company verification suspended");
      qc.invalidateQueries({ queryKey: ["admin-organizations"] });
      qc.invalidateQueries({ queryKey: ["admin-org-verification-details"] });
      setActionModal(null);
      setViewOrgId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: ({ orgId, reason }) =>
      adminApi.reactivateOrg ? adminApi.reactivateOrg(orgId, reason) : adminApi.verifyOrg(orgId),
    onSuccess: () => {
      toast.success("Company reactivated successfully");
      qc.invalidateQueries({ queryKey: ["admin-organizations"] });
      qc.invalidateQueries({ queryKey: ["admin-org-verification-details"] });
      setActionModal(null);
      setViewOrgId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const rows = orgsQuery.data?.data || [];

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Company Governance"
        title="Companies"
        description="Verify legitimate employer businesses, inspect incorporation documents, and detect suspicious fraudulent hiring demands."
      />

      {/* Top Verification Summary KPIs (6 cards) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Total Companies"
          value={orgsQuery.data?.meta?.counts?.total ?? rows.length}
          detail="Registered business tenants"
          tone="ink"
          icon={Building2}
        />
        <Kpi
          label="Pending Review"
          value={orgsQuery.data?.meta?.counts?.pending ?? rows.filter((o) => o.verificationStatus === "pending").length}
          detail="Awaiting review"
          tone="warning"
          icon={Clock3}
        />
        <Kpi
          label="Under Review"
          value={orgsQuery.data?.meta?.counts?.underReview ?? rows.filter((o) => o.verificationStatus === "under_review").length}
          detail="Active investigation"
          tone="brand"
          icon={Clock3}
        />
        <Kpi
          label="Verified Employers"
          value={orgsQuery.data?.meta?.counts?.verified ?? rows.filter((o) => o.verificationStatus === "verified").length}
          detail="Active and authorized to post"
          tone="success"
          icon={ShieldCheck}
        />
        <Kpi
          label="Rejected"
          value={orgsQuery.data?.meta?.counts?.rejected ?? rows.filter((o) => o.verificationStatus === "rejected").length}
          detail="Requirements unmet"
          tone="danger"
          icon={AlertTriangle}
        />
        <Kpi
          label="Suspended"
          value={orgsQuery.data?.meta?.counts?.suspended ?? rows.filter((o) => o.verificationStatus === "suspended").length}
          detail="Authorization revoked"
          tone="danger"
          icon={ShieldAlert}
        />
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-ink-100 pb-2 shrink-0">
        {[
          { id: "all", label: "All Companies", count: orgsQuery.data?.meta?.counts?.total ?? rows.length },
          { id: "pending", label: "Pending Review", count: orgsQuery.data?.meta?.counts?.pending ?? rows.filter((o) => o.verificationStatus === "pending").length },
          { id: "under_review", label: "Under Review", count: orgsQuery.data?.meta?.counts?.underReview ?? rows.filter((o) => o.verificationStatus === "under_review").length },
          { id: "verified", label: "Verified", count: orgsQuery.data?.meta?.counts?.verified ?? rows.filter((o) => o.verificationStatus === "verified").length },
          { id: "rejected", label: "Rejected", count: orgsQuery.data?.meta?.counts?.rejected ?? rows.filter((o) => o.verificationStatus === "rejected").length },
          { id: "suspended", label: "Suspended", count: orgsQuery.data?.meta?.counts?.suspended ?? rows.filter((o) => o.verificationStatus === "suspended").length },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setVerificationStatus(tab.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              verificationStatus === tab.id
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-ink-50 text-ink-700 hover:bg-ink-100"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                verificationStatus === tab.id ? "bg-white/20 text-white" : "bg-ink-200/70 text-ink-600"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <FilterBar>
        <Input
          aria-label="Search companies"
          placeholder="Search by company name, email or GSTIN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xs"
        />
        <SearchableSelect
          aria-label="Filter by verification"
          value={verificationStatus}
          onChange={(e) => setVerificationStatus(e.target.value)}
          options={VERIFICATION_STATUS_OPTIONS}
          className="lg:max-w-44"
        />
        <SearchableSelect
          aria-label="Filter by risk score"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value)}
          options={RISK_LEVEL_OPTIONS}
          className="lg:max-w-44"
        />
      </FilterBar>

      {orgsQuery.isLoading ? (
        <SkeletonList />
      ) : orgsQuery.error ? (
        <ErrorState error={orgsQuery.error} onRetry={() => orgsQuery.refetch()} />
      ) : (
        <DataTable
          headers={[
            "Company name",
            "Industry",
            "Contact email",
            "Registration/GST",
            "Verification status",
            "Risk level",
            "Registration date",
            "Actions",
          ]}
          empty={rows.length === 0}
          emptyLabel="No companies match the selected verification filters."
        >
          {rows.map((o) => {
            const risk = o.riskScore || 0;
            const riskTone = risk <= 25 ? "success" : risk <= 60 ? "warning" : "danger";

            return (
              <tr key={o._id} className="transition-colors hover:bg-ink-50/60">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-950 text-xs font-bold text-white">
                      {initials(o.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{o.name}</p>
                      <p className="truncate text-xs text-ink-400">/{o.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-xs font-medium text-ink-700">
                  {o.industry || "General"}
                </td>
                <td className="px-5 py-4 text-xs">
                  <p className="font-medium text-ink-800">{o.businessEmail || "—"}</p>
                  <p className="text-ink-500">{o.phone || "—"}</p>
                </td>
                <td className="px-5 py-4 font-mono text-xs">
                  <p className="font-bold text-ink-900">{o.gstin || "No GSTIN"}</p>
                  <p className="text-ink-400">{o.registrationNumber || "No CIN"}</p>
                </td>
                <td className="px-5 py-4">
                  <Badge
                    tone={
                      o.verificationStatus === "verified"
                        ? "success"
                        : o.verificationStatus === "under_review" || o.verificationStatus === "pending"
                          ? "warning"
                          : o.verificationStatus === "rejected" || o.verificationStatus === "suspended"
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {o.verificationStatus === "verified"
                      ? "Verified"
                      : o.verificationStatus === "under_review"
                        ? "Under Review"
                        : o.verificationStatus === "pending"
                          ? "Pending Review"
                          : o.verificationStatus === "rejected"
                            ? "Rejected"
                            : o.verificationStatus === "suspended"
                              ? "Suspended"
                              : "Not Submitted for Review"}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  <Badge tone={riskTone}>
                    {risk}/100 {risk <= 25 ? "Low Risk" : risk <= 60 ? "Medium Risk" : "High Risk"}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-xs text-ink-500 whitespace-nowrap">
                  {formatDate(o.createdAt)}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewOrgId(o._id)}
                    >
                      Inspect
                    </Button>
                    {o.verificationStatus !== "verified" && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setActionModal({ type: "verify", org: o });
                          setActionReason("");
                        }}
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {/* Verification Details Modal / Drawer */}
      {viewOrgId && detailQuery.data?.data && (
        <Modal
          isOpen={Boolean(viewOrgId)}
          open={Boolean(viewOrgId)}
          onClose={() => setViewOrgId(null)}
          title={`Verification Review: ${detailQuery.data.data.organization?.name}`}
          size="lg"
        >
          {(() => {
            const org = detailQuery.data.data.organization || {};
            const owner = detailQuery.data.data.owner || {};
            const hiringStats = detailQuery.data.data.hiringStats || {};
            const risk = org.riskScore || 0;
            const riskFlags = org.riskFlags || [];
            const docs = org.documents || [];

            const verificationCase = detailQuery.data.data.verificationCase;

            return (
              <div className="space-y-6">
                {verificationCase ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
                    <p>
                      Case status: <strong>{verificationCase.case.status.replaceAll("_", " ")}</strong>
                      {verificationCase.case.risk.requiresManualReview ? " · elevated risk, manual review" : ""}
                    </p>
                    <Button as={Link} to={`/app/admin/verification/${verificationCase.case.id}`} size="sm" variant="outline">
                      Open full case review
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-xl border border-ink-100 p-4 text-sm text-ink-600">
                    No verification case exists for this company yet.
                  </p>
                )}
                {/* Legal & Business Overview */}
                <div className="grid gap-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-ink-500">Business Email</p>
                    <p className="text-sm font-semibold text-ink-900">{org.businessEmail || "None provided"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Official Phone</p>
                    <p className="text-sm font-semibold text-ink-900">{org.phone || "None provided"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">GSTIN Identification</p>
                    <p className="font-mono text-sm font-bold text-ink-900">{org.gstin || "Unsubmitted"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Registration / CIN</p>
                    <p className="font-mono text-sm font-bold text-ink-900">{org.registrationNumber || "Unsubmitted"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-ink-500">Physical Address</p>
                    <p className="text-sm text-ink-800">
                      {org.address?.street
                        ? `${org.address.street}, ${org.address.city}, ${org.address.state} - ${org.address.pincode}, ${org.address.country}`
                        : "Address not provided"}
                    </p>
                  </div>
                </div>

                {/* Recruiter Account Info */}
                <div className="rounded-xl border border-ink-100 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Primary Recruiter Owner</h4>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{owner.name || "Owner User"}</p>
                  <p className="text-xs text-ink-500">{owner.email} · {owner.phone || "No phone"}</p>
                </div>

                {/* Full Hiring & Placement Breakdown */}
                {hiringStats.totalJobs !== undefined && (
                  <div className="rounded-xl border border-ink-100 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                      Company Hiring & Placement Activity
                    </h4>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div className="rounded-lg bg-ink-50 p-2.5 text-center">
                        <span className="block font-bold text-base text-ink-950">{hiringStats.totalJobs || 0}</span>
                        <span className="text-ink-500">Total Jobs</span>
                      </div>
                      <div className="rounded-lg bg-ink-50 p-2.5 text-center">
                        <span className="block font-bold text-base text-brand-700">{hiringStats.pendingJobs || 0}</span>
                        <span className="text-ink-500">Pending Jobs</span>
                      </div>
                      <div className="rounded-lg bg-ink-50 p-2.5 text-center">
                        <span className="block font-bold text-base text-emerald-700">{hiringStats.totalApplications || 0}</span>
                        <span className="text-ink-500">Total Applicants</span>
                      </div>
                      <div className="rounded-lg bg-ink-50 p-2.5 text-center">
                        <span className="block font-bold text-base text-emerald-700">{hiringStats.hiredCount || 0}</span>
                        <span className="text-ink-500">Candidates Hired</span>
                      </div>
                      <div className="rounded-lg bg-ink-50 p-2.5 text-center">
                        <span className="block font-bold text-base text-brand-700">{hiringStats.shortlistedCount || 0}</span>
                        <span className="text-ink-500">Shortlisted</span>
                      </div>
                      <div className="rounded-lg bg-ink-50 p-2.5 text-center">
                        <span className="block font-bold text-base text-brand-700">{hiringStats.interviewCount || 0}</span>
                        <span className="text-ink-500">Interviews</span>
                      </div>
                      <div className="rounded-lg bg-ink-50 p-2.5 text-center">
                        <span className="block font-bold text-base text-emerald-700">{hiringStats.confirmedJoinings || 0}</span>
                        <span className="text-ink-500">Confirmed Joinings</span>
                      </div>
                      <div className="rounded-lg bg-ink-50 p-2.5 text-center">
                        <span className="block font-bold text-base text-emerald-700">{hiringStats.verifiedEmployees || 0}</span>
                        <span className="text-ink-500">Verified Employees</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Risk Indicators Card */}
                <div className="rounded-xl border border-ink-100 p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                      Fraud & Risk Assessment ({risk}/100)
                    </h4>
                    <Badge tone={risk <= 25 ? "success" : risk <= 60 ? "warning" : "danger"}>
                      {risk <= 25 ? "Low Risk" : risk <= 60 ? "Medium Risk" : "High Risk"}
                    </Badge>
                  </div>

                  {riskFlags.length === 0 ? (
                    <p className="mt-2 text-xs text-emerald-700">✓ No suspicious risk flags detected for this company.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {riskFlags.map((flag, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <AlertTriangle
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                              flag.severity === "high"
                                ? "text-danger-600"
                                : flag.severity === "medium"
                                  ? "text-amber-600"
                                  : "text-ink-400"
                            }`}
                          />
                          <div>
                            <span className="font-semibold text-ink-900">[{flag.code}]</span>{" "}
                            <span className="text-ink-700">{flag.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Uploaded Documents */}
                <div className="rounded-xl border border-ink-100 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Submitted Documents</h4>
                  {docs.length === 0 ? (
                    <p className="mt-2 text-xs text-ink-400">No verification documents attached.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-ink-100">
                      {docs.map((doc, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 text-xs">
                          <div>
                            <span className="font-semibold text-ink-900">{doc.fileName || doc.type}</span>
                            <span className="ml-2 text-ink-400">({doc.type?.replaceAll("_", " ")}) · {formatDate(doc.uploadedAt)}</span>
                          </div>
                          {(doc.id || doc._id) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  const blob = await verificationApi.adminDownloadDocument(doc.id || doc._id);
                                  downloadBlob(blob, doc.fileName || "document");
                                } catch (e) {
                                  toast.error(e.message || "Failed to download document");
                                }
                              }}
                            >
                              Download
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Controls */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-ink-100">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActionModal({ type: "request_info", org });
                      setActionReason("");
                    }}
                  >
                    Request More Info
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setActionModal({ type: "reject", org });
                      setActionReason("");
                    }}
                  >
                    Reject
                  </Button>
                  {org.verificationStatus === "verified" ? (
                    <Button
                      variant="danger"
                      onClick={() => {
                        setActionModal({ type: "suspend", org });
                        setActionReason("");
                      }}
                    >
                      Suspend
                    </Button>
                  ) : org.verificationStatus === "suspended" || org.verificationStatus === "rejected" ? (
                    <Button
                      variant="primary"
                      onClick={() => {
                        setActionModal({ type: "reactivate", org });
                        setActionReason("");
                      }}
                    >
                      Reactivate Company
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => {
                        setActionModal({ type: "verify", org });
                        setActionReason("");
                      }}
                    >
                      Approve Verification
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Confirmation Action Modal */}
      {actionModal && (
        <Modal
          isOpen={Boolean(actionModal)}
          open={Boolean(actionModal)}
          onClose={() => setActionModal(null)}
          title={
            actionModal.type === "verify"
              ? `Approve Verification for ${actionModal.org?.name}`
              : actionModal.type === "reactivate"
                ? `Reactivate Company: ${actionModal.org?.name}`
                : actionModal.type === "reject"
                  ? `Reject Verification for ${actionModal.org?.name}`
                  : actionModal.type === "suspend"
                    ? `Suspend Company: ${actionModal.org?.name}`
                    : `Request Additional Information from ${actionModal.org?.name}`
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-600">
              {actionModal.type === "verify" || actionModal.type === "reactivate"
                ? "Approving verification will enable this company to publish jobs and accept applications."
                : actionModal.type === "reject"
                  ? "Rejecting will unpublish any draft listings and notify the recruiter owner with the reason."
                  : actionModal.type === "suspend"
                    ? "Suspending will revoke active verification and pause all live job postings immediately."
                    : "Specify what documents or details are needed from the employer."}
            </p>

            {actionModal.type !== "verify" && actionModal.type !== "reactivate" ? (
              <Textarea
                label="Reason / Notes (Required)"
                placeholder="Enter detailed explanation..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                rows={3}
                required
              />
            ) : (
              <Textarea
                label="Verification Notes (Optional)"
                placeholder="Add optional internal verification notes..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                rows={2}
              />
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setActionModal(null)}>
                Cancel
              </Button>
              <Button
                variant={actionModal.type === "verify" || actionModal.type === "reactivate" ? "primary" : "danger"}
                onClick={() => {
                  if (actionModal.type === "verify") {
                    verifyMutation.mutate({ orgId: actionModal.org._id, notes: actionReason });
                  } else if (actionModal.type === "reactivate") {
                    reactivateMutation.mutate({ orgId: actionModal.org._id, reason: actionReason });
                  } else if (actionModal.type === "reject") {
                    if (!actionReason.trim()) return toast.error("Rejection reason is required");
                    rejectMutation.mutate({ orgId: actionModal.org._id, reason: actionReason });
                  } else if (actionModal.type === "request_info") {
                    if (!actionReason.trim()) return toast.error("Notes are required");
                    requestInfoMutation.mutate({ orgId: actionModal.org._id, notes: actionReason });
                  } else if (actionModal.type === "suspend") {
                    suspendMutation.mutate({ orgId: actionModal.org._id, reason: actionReason });
                  }
                }}
                loading={
                  verifyMutation.isPending ||
                  reactivateMutation.isPending ||
                  rejectMutation.isPending ||
                  requestInfoMutation.isPending ||
                  suspendMutation.isPending
                }
              >
                Confirm Action
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

/* =========================================================================
   3. ADMIN MODERATION — implemented in AdminModeration.jsx (Phase 3).
   Re-exported here so the route and existing imports keep working.
   ========================================================================= */
export { AdminModeration } from "./AdminModeration";

/* =========================================================================
   4. ADMIN USERS
   ========================================================================= */
export const AdminUsers = () => {
  const toast = useToast(),
    qc = useQueryClient(),
    [search, setSearch] = useState(""),
    [role, setRole] = useState(""),
    [status, setStatus] = useState(""),
    [sortBy, setSortBy] = useState("newest"),
    [cursor, setCursor] = useState(null),
    [target, setTarget] = useState(null),
    [flagTarget, setFlagTarget] = useState(null),
    [flagReason, setFlagReason] = useState(""),
    [resumeTarget, setResumeTarget] = useState(null),
    [candidate360Target, setCandidate360Target] = useState(null),
    [reason, setReason] = useState(""),
    [page, setPage] = useState(1),
    debounced = useDebouncedValue(search, 300);

  const params = useMemo(
    () => ({
      search: debounced || undefined,
      role: role || undefined,
      status: status || undefined,
      sortBy: sortBy || undefined,
      limit: 100,
      after: cursor || undefined,
    }),
    [debounced, role, status, sortBy, cursor],
  );

  const q = useQuery({ queryKey: ["admin-users", params], queryFn: () => adminApi.users(params) });

  const act = useMutation({
    mutationFn: () =>
      target.accountStatus === "suspended"
        ? adminApi.reactivate(target._id, reason || "Reactivated by platform administrator")
        : adminApi.suspend(target._id, reason || "Suspended by platform administrator"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(
        target.accountStatus === "suspended" ? "User reactivated" : "User suspended",
      );
      setTarget(null);
      setReason("");
    },
    onError: (error) => toast.error(error.message),
  });

  const flagMut = useMutation({
    mutationFn: () => adminApi.flagUser(flagTarget._id, flagReason || "Flagged for administrative review"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Candidate flagged for suspicious activity review");
      setFlagTarget(null);
      setFlagReason("");
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = useMemo(() => q.data?.data || [], [q.data?.data]);
  const counts = q.data?.meta?.counts || {};

  const pageSize = 15;
  const totalPages = Math.ceil(rows.length / pageSize) || 1;
  const pagedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);

  // Reset page when search or filters change
  const handleFilterChange = (setter, val) => {
    setter(val);
    setCursor(null);
    setPage(1);
  };

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Users & Candidates"
        title="Candidate & User Directory"
        description="Comprehensive candidate directory, profile 360° oversight, account status, and platform governance."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi
          label="Total Users"
          value={counts.total ?? rows.length}
          tone="neutral"
          icon={UserRound}
          caption="Registered on platform"
        />
        <Kpi
          label="Candidates"
          value={counts.candidates ?? rows.filter((r) => r.role === "candidate").length}
          tone="brand"
          icon={Users}
          caption="Active job seekers"
        />
        <Kpi
          label="Recruiters"
          value={counts.recruiters ?? rows.filter((r) => r.role === "recruiter").length}
          tone="info"
          icon={BriefcaseBusiness}
          caption="Employer accounts"
        />
        <Kpi
          label="Active Accounts"
          value={counts.active ?? rows.filter((r) => r.accountStatus === "active").length}
          tone="success"
          icon={CheckCircle2}
          caption="In good standing"
        />
        <Kpi
          label="Suspended Accounts"
          value={counts.suspended ?? rows.filter((r) => r.accountStatus === "suspended").length}
          tone="danger"
          icon={ShieldAlert}
          caption="Restricted by admin"
        />
      </div>

      <FilterBar>
        <Input
          aria-label="Search users"
          placeholder="Search by name, email, or user ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xs"
        />
        <SearchableSelect
          aria-label="Filter by role"
          value={role}
          onChange={(e) => handleFilterChange(setRole, e.target.value)}
          options={[
            { value: "", label: "All roles" },
            { value: "candidate", label: "Candidate" },
            { value: "recruiter", label: "Recruiter" },
            { value: "admin", label: "Admin" },
          ]}
          className="lg:max-w-40"
        />
        <SearchableSelect
          aria-label="Filter by status"
          value={status}
          onChange={(e) => handleFilterChange(setStatus, e.target.value)}
          options={[
            { value: "", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
          ]}
          className="lg:max-w-40"
        />
        <SearchableSelect
          aria-label="Sort users"
          value={sortBy}
          onChange={(e) => handleFilterChange(setSortBy, e.target.value)}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "name_asc", label: "Name (A–Z)" },
            { value: "name_desc", label: "Name (Z–A)" },
          ]}
          className="lg:max-w-40"
        />
      </FilterBar>

      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-4">
          <DataTable
            headers={["Candidate / User", "Role", "Status", "Profile Overview", "Created", "Actions"]}
            empty={rows.length === 0}
            emptyLabel="No users match your filters."
          >
            {pagedRows.map((u) => (
              <tr key={u._id} className="transition-colors hover:bg-ink-50/60">
                <td className="px-5 py-4 min-w-[200px]">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-xs font-bold text-white shadow-xs">
                      {initials(u.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900 truncate max-w-[180px]">{u.name}</p>
                      <p className="text-xs text-ink-400 truncate max-w-[180px]">{u.email}</p>
                      {u.headline && (
                        <p className="truncate text-xs text-ink-600 mt-0.5 max-w-[180px]">{u.headline}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 capitalize font-medium text-xs whitespace-nowrap">{u.role}</td>
                <td className="px-5 py-4 whitespace-nowrap">
                  <div className="flex flex-col gap-1 items-start">
                    <Badge tone={u.accountStatus === "active" ? "success" : "danger"}>
                      {u.accountStatus}
                    </Badge>
                    {u.emailVerified ? (
                      <span className="text-[11px] text-success-700 font-medium">✓ Verified</span>
                    ) : (
                      <span className="text-[11px] text-warning-700 font-medium">Unverified</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 min-w-[180px]">
                  {u.role === "candidate" ? (
                    <div className="space-y-1">
                      {u.location && (
                        <span className="inline-block rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700 mr-1.5 mb-1">
                          📍 {u.location}
                        </span>
                      )}
                      {(u.skills || []).length > 0 ? (
                        <div className="flex items-center flex-wrap gap-1">
                          {u.skills.slice(0, 2).map((sk, idx) => {
                            const name = typeof sk === "string" ? sk : sk.name || sk.skill;
                            return (
                              <span
                                key={idx}
                                title={name}
                                className="inline-block max-w-[95px] truncate rounded bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700"
                              >
                                {name}
                              </span>
                            );
                          })}
                          {u.skills.length > 2 && (
                            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">
                              +{u.skills.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-ink-400">Platform account</span>
                  )}
                </td>
                <td className="px-5 py-4 text-xs text-ink-500 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                <td className="px-5 py-4 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5 justify-end">
                    {u.role === "candidate" && (
                      <>
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => setCandidate360Target(u._id)}
                        >
                          360° Profile
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setResumeTarget(u)}
                        >
                          Resumes
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setFlagTarget(u)}
                          className="text-warning-700 hover:bg-warning-50 px-1.5"
                          title="Flag suspicious activity"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {u.role !== "admin" && (
                      <Button
                        size="xs"
                        variant={u.accountStatus === "suspended" ? "outline" : "danger"}
                        onClick={() => setTarget(u)}
                      >
                        {u.accountStatus === "suspended" ? "Reactivate" : "Suspend"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>

          {/* Pagination Controls */}
          {rows.length > pageSize && (
            <div className="flex items-center justify-between border-t border-ink-100 bg-white px-6 py-3 text-xs text-ink-600 rounded-b-xl border">
              <div>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of{" "}
                {rows.length} users (Page {page} of {totalPages})
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {resumeTarget && (
        <CandidateResumesModal candidate={resumeTarget} onClose={() => setResumeTarget(null)} />
      )}

      {candidate360Target && (
        <Candidate360Drawer candidateId={candidate360Target} onClose={() => setCandidate360Target(null)} />
      )}

      {flagTarget && (
        <Modal
          isOpen={Boolean(flagTarget)}
          onClose={() => setFlagTarget(null)}
          title={`Flag Suspicious Activity: ${flagTarget.name}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              Record a security event and audit log to flag this candidate account for suspicious behavior or platform review.
            </p>
            <div>
              <label className="block text-xs font-semibold text-ink-800 uppercase tracking-wider mb-1">
                Reason / Investigation Note
              </label>
              <Textarea
                rows={3}
                placeholder="Enter details of suspicious activity or duplicate profile suspicion..."
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setFlagTarget(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => flagMut.mutate()}
                loading={flagMut.isPending}
              >
                Record Flag
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {target && (
        <ConfirmModal
          open={Boolean(target)}
          onClose={() => setTarget(null)}
          onConfirm={() => act.mutate()}
          title={target.accountStatus === "suspended" ? "Reactivate User" : "Suspend User"}
          message={`Are you sure you want to ${
            target.accountStatus === "suspended" ? "reactivate" : "suspend"
          } ${target.name}?`}
          confirmLabel={target.accountStatus === "suspended" ? "Reactivate" : "Suspend"}
          danger={target.accountStatus !== "suspended"}
          loading={act.isPending}
        />
      )}
    </div>
  );
};

/* =========================================================================
   5. ADMIN AI USAGE
   ========================================================================= */
export const AdminAIUsage = () => {
  const q = useQuery({ queryKey: ["admin-ai-usage"], queryFn: adminApi.aiUsage });
  if (q.isLoading) return <LoadingState message="Loading AI telemetry…" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const rows = q.data?.data || [];
  const totalRuns = rows.reduce((s, r) => s + (r.runs || 0), 0);
  const totalFallbacks = rows.reduce((s, r) => s + (r.fallbacks || 0), 0);
  const totalTokens = rows.reduce((s, r) => s + (r.inputTokens || 0) + (r.outputTokens || 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.estimatedCostUsd || 0), 0);

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="AI Activity"
        title="AI Activity & Telemetry"
        description="Track model invocation counts, token consumption, fallback frequencies, and latency statistics."
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Total AI Runs" value={totalRuns} tone="brand" icon={Sparkles} />
        <Kpi label="Fallbacks" value={totalFallbacks} tone="warning" icon={Layers} />
        <Kpi label="Total Tokens" value={totalTokens.toLocaleString()} tone="ink" icon={Zap} />
        <Kpi label="Estimated Cost" value={`$${totalCost.toFixed(4)}`} tone="success" icon={DollarSign} />
      </div>

      <div className="rounded-2xl border border-ink-100 bg-white shadow-xs">
        <div className="border-b border-ink-100 p-6">
          <h3 className="text-base font-bold text-ink-900">Feature Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-50/70 text-xs font-semibold text-ink-500">
              <tr>
                <th className="px-6 py-3">Feature</th>
                <th className="px-6 py-3">Provider / Model</th>
                <th className="px-6 py-3">Invocations</th>
                <th className="px-6 py-3">Fallbacks</th>
                <th className="px-6 py-3">Avg Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-ink-800">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-ink-50/50">
                  <td className="px-6 py-4 font-semibold">{r._id?.feature}</td>
                  <td className="px-6 py-4 font-mono text-xs text-ink-500">
                    {r._id?.provider} ({r._id?.model})
                  </td>
                  <td className="px-6 py-4 font-bold">{r.runs}</td>
                  <td className="px-6 py-4 font-bold text-amber-600">{r.fallbacks || 0}</td>
                  <td className="px-6 py-4">{Math.round(r.averageLatencyMs || 0)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   6. ADMIN SECURITY
   ========================================================================= */
export { AdminSecurity } from "./AdminSecurity";

