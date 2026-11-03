import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Clock3,
  Database,
  DollarSign,
  FileCheck2,
  Layers,
  ShieldCheck,
  Sparkles,
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
import Input, { Select, Textarea } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import Kpi from "../../components/ui/Kpi";
import ActivityFeed from "../../components/ui/ActivityFeed";
import PipelineFunnel from "../../components/ui/PipelineFunnel";
import { EmptyState, ErrorState, LoadingState, SkeletonList } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { adminApi } from "../../lib/api";
import { useToast } from "../../components/ui/useToast";
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  initials,
  humanizeAction,
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

const HEALTH_SERVICES = [
  {
    key: "mongodb",
    name: "Database",
    icon: Database,
    description: "Stores platform accounts, companies, jobs and application data.",
  },
  {
    key: "jobStore",
    name: "Background Jobs",
    icon: Layers,
    description: "Processes resume parsing, recommendations, alerts, and verification tasks.",
  },
];

/* =========================================================================
   1. ADMIN HOME (Aggregated Overview Analytics & Placement Tracking)
   ========================================================================= */
export const AdminHome = () => {
  const [selectedOrgId, setSelectedOrgId] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin-users", {}],
    queryFn: () => adminApi.users({ limit: 100 }),
  });
  const orgsQuery = useQuery({
    queryKey: ["admin-organizations", {}],
    queryFn: () => adminApi.organizations({ limit: 100 }),
  });
  const pendingQuery = useQuery({
    queryKey: ["moderation-jobs", "pending"],
    queryFn: () => adminApi.moderation({ status: "pending", limit: 100 }),
  });
  const aiQuery = useQuery({
    queryKey: ["admin-ai-usage"],
    queryFn: adminApi.aiUsage,
  });
  const auditQuery = useQuery({
    queryKey: ["admin-audit", {}],
    queryFn: () => adminApi.audit({ limit: 10 }),
  });

  const overviewQuery = useQuery({
    queryKey: ["admin-overview-analytics", selectedOrgId],
    queryFn: () =>
      adminApi.overviewAnalytics
        ? adminApi.overviewAnalytics(selectedOrgId ? { organizationId: selectedOrgId } : {})
        : Promise.resolve({ data: null }),
  });

  const isLoading =
    usersQuery.isLoading ||
    orgsQuery.isLoading ||
    pendingQuery.isLoading ||
    aiQuery.isLoading ||
    overviewQuery.isLoading;

  if (isLoading) return <LoadingState message="Loading platform overview & analytics…" />;

  const stats = overviewQuery.data?.data || null;
  const usersList = usersQuery.data?.data || [];
  const pendingJobs = pendingQuery.data?.data || [];
  const aiRows = aiQuery.data?.data || [];
  const auditLogs = auditQuery.data?.data || [];

  const totalUsersCount = stats?.users?.total ?? usersList.length;
  const pendingApprovalsCount = stats?.jobs?.pending ?? pendingJobs.length;
  const totalAiRuns =
    stats?.ai?.totalRuns ?? aiRows.reduce((sum, r) => sum + (r.runs || 0), 0);
  const verifiedPlacementsCount = stats?.placements?.verifiedPlacements ?? 0;

  const monthlyTrends = stats?.monthlyTrends || [];
  const companyWise = stats?.companyWiseStats || [];
  const deepDive = stats?.deepDive || null;

  const activityItems = (stats?.recentActivity || auditLogs).slice(0, 8).map((a) => ({
    title: humanizeAction(a.action || a.type),
    meta: `${a.actor?.name || a.user?.name || "System"} · ${a.resourceType || "platform"}${
      a.organization?.name ? ` · ${a.organization.name}` : ""
    }`,
    tone:
      a.outcome === "failure" || a.outcome === "error"
        ? "danger"
        : a.outcome === "denied"
          ? "warning"
          : "brand",
    time: a.createdAt,
  }));

  const funnelStages = [
    { label: "Submitted", value: stats?.applications?.submitted || 0, tone: "ink" },
    { label: "Shortlisted", value: stats?.applications?.shortlisted || 0, tone: "warning" },
    { label: "Interview", value: stats?.applications?.interview || 0, tone: "brand" },
    { label: "Hired", value: stats?.applications?.hired || 0, tone: "success" },
    { label: "Joining Confirmed", value: stats?.placements?.joiningConfirmed || 0, tone: "success" },
    { label: "Verified Placement", value: verifiedPlacementsCount, tone: "success" },
  ];

  return (
    <div className="page-wrap space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader
          eyebrow="Platform Overview"
          title="HireSmart-AI Control Center"
          description="Platform governance, hiring analytics, company verification, and placement lifecycle tracking."
        />
        {companyWise.length > 0 && (
          <div className="flex items-center gap-3">
            <Select
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

      {/* Main KPI Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total Users"
          value={totalUsersCount}
          detail={`${stats?.users?.candidates ?? 0} candidates · ${stats?.users?.recruiters ?? 0} recruiters`}
          tone="brand"
          icon={Users}
        />
        <Kpi
          label="Pending Approvals"
          value={pendingApprovalsCount}
          detail="Job postings awaiting review"
          tone="warning"
          icon={Clock3}
        />
        <Kpi
          label="AI Operations"
          value={totalAiRuns}
          detail="Model matching & resume runs"
          tone="ink"
          icon={Sparkles}
        />
        <Kpi
          label="Verified Placements"
          value={verifiedPlacementsCount}
          detail={`${stats?.placements?.joiningConfirmed ?? 0} joinings confirmed`}
          tone="success"
          icon={FileCheck2}
        />
      </div>

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
              <span className="rounded-xl bg-white px-3.5 py-1.5 shadow-xs">
                Shortlisted: {deepDive.shortlistCount}
              </span>
              <span className="rounded-xl bg-white px-3.5 py-1.5 shadow-xs">
                Hired: {deepDive.hiredCount}
              </span>
              <span className="rounded-xl bg-white px-3.5 py-1.5 shadow-xs">
                Placements: {deepDive.placementCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Visual Charts: 12-Month Trends & Funnel */}
      {monthlyTrends.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink-900">12-Month Hiring Trends</h3>
                <p className="text-xs text-ink-500">Applications, candidate hires, and verified placements</p>
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
                  <Area
                    type="monotone"
                    dataKey="applications"
                    name="Applications"
                    stroke="#0052cc"
                    fillOpacity={1}
                    fill="url(#appGradient)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="hires"
                    name="Hires"
                    stroke="#00875a"
                    fillOpacity={1}
                    fill="url(#hireGradient)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="verifiedPlacements"
                    name="Verified Placements"
                    stroke="#ffab00"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-bold text-ink-900">Platform Hiring Pipeline</h3>
              <p className="text-xs text-ink-500">Live candidate conversion funnel</p>
            </div>
            <PipelineFunnel stages={funnelStages} />
          </div>
        </div>
      )}

      {/* Two Columns: Pending Actions & Platform Health / Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending Actions */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink-900">Pending Actions</h3>
              <p className="text-xs text-ink-500">Approvals requiring administrator intervention</p>
            </div>
            <Button as={Link} to="/app/admin/moderation" size="sm" variant="ghost">
              Review ({pendingJobs.length})
            </Button>
          </div>
          {pendingJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">All submissions are up to date.</p>
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

        {/* Platform Health */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-bold text-ink-900">Platform Health</h3>
            <p className="text-xs text-ink-500">Core operational telemetry</p>
          </div>
          <div className="space-y-3">
            {HEALTH_SERVICES.map((s) => (
              <div key={s.key} className="flex items-center justify-between rounded-xl bg-ink-50/70 p-3.5">
                <div className="flex items-center gap-3">
                  <s.icon className="h-5 w-5 text-brand-600" />
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{s.name}</p>
                    <p className="text-xs text-ink-500">{s.description}</p>
                  </div>
                </div>
                <Badge tone="success">Operational</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink-900">Recent Activity</h3>
              <p className="text-xs text-ink-500">Audit trail of administrative and security events</p>
            </div>
            <Button as={Link} to="/app/admin/security" size="sm" variant="ghost">
              Security & Audit
            </Button>
          </div>
          <ActivityFeed items={activityItems} />
        </div>
      </div>
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
  const pendingCount = rows.filter(
    (o) => o.verificationStatus === "pending" || o.verificationStatus === "under_review",
  ).length;
  const verifiedCount = rows.filter((o) => o.verificationStatus === "verified").length;

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Company Governance"
        title="Companies"
        description="Verify legitimate employer businesses, inspect incorporation documents, and detect suspicious fraudulent hiring demands."
      />

      {/* Top Verification Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          label="Total Companies"
          value={rows.length}
          detail="Registered business tenants"
          tone="ink"
          icon={Building2}
        />
        <Kpi
          label="Pending Review"
          value={pendingCount}
          detail="Awaiting verification"
          tone="warning"
          icon={Clock3}
        />
        <Kpi
          label="Verified Employers"
          value={verifiedCount}
          detail="Active and authorized to post"
          tone="success"
          icon={ShieldCheck}
        />
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
        <Select
          aria-label="Filter by verification"
          value={verificationStatus}
          onChange={(e) => setVerificationStatus(e.target.value)}
          options={VERIFICATION_STATUS_OPTIONS}
          className="lg:max-w-44"
        />
        <Select
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
            "Company",
            "Industry",
            "Contact & Email",
            "Tax & Reg No",
            "Verification",
            "Risk Assessment",
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
                          : "danger"
                    }
                  >
                    {o.verificationStatus || "pending"}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  <Badge tone={riskTone}>
                    {risk}/100 {risk <= 25 ? "Low Risk" : risk <= 60 ? "Medium Risk" : "High Risk"}
                  </Badge>
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

            return (
              <div className="space-y-6">
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
                          <span className="font-medium text-ink-800">{doc.fileName || doc.type}</span>
                          <span className="text-ink-400">{formatDate(doc.uploadedAt)}</span>
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
   3. ADMIN MODERATION (Company-Level Job Moderation & Bulk Approval)
   ========================================================================= */
export const AdminModeration = () => {
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("all");
  const [riskLevel, setRiskLevel] = useState("all");
  const [viewOrgJobs, setViewOrgJobs] = useState(null); // orgId
  const [inspectOrgId, setInspectOrgId] = useState(null); // orgId
  const [bulkApproveTarget, setBulkApproveTarget] = useState(null); // { orgId, companyName, count }
  const [target, setTarget] = useState(null); // { action: 'approve'|'reject', job, changes }
  const [reason, setReason] = useState("");
  const [detailJob, setDetailJob] = useState(null);

  const debounced = useDebouncedValue(search, 300);
  const params = useMemo(
    () => ({
      search: debounced || undefined,
      verificationStatus: verificationStatus !== "all" ? verificationStatus : undefined,
      riskLevel: riskLevel !== "all" ? riskLevel : undefined,
    }),
    [debounced, verificationStatus, riskLevel],
  );

  // 1. Company Moderation Summary Query
  const companiesQuery = useQuery({
    queryKey: ["admin-moderation-companies", params],
    queryFn: () => (adminApi.moderationCompanies ? adminApi.moderationCompanies(params) : Promise.resolve({ data: [] })),
  });

  // 2. Direct Jobs Query (for fallback / compatibility)
  const legacyJobsQuery = useQuery({
    queryKey: ["moderation-jobs", "pending"],
    queryFn: () => (adminApi.moderation ? adminApi.moderation({ status: "pending", limit: 50 }) : Promise.resolve({ data: [] })),
  });

  // 3. Company Jobs Details Query
  const companyJobsQuery = useQuery({
    queryKey: ["admin-company-jobs", viewOrgJobs],
    queryFn: () => adminApi.companyModerationJobs(viewOrgJobs),
    enabled: Boolean(viewOrgJobs),
  });

  // 4. Inspect Org Verification Details Query
  const orgInspectQuery = useQuery({
    queryKey: ["admin-org-verification-details", inspectOrgId],
    queryFn: () => adminApi.orgVerificationDetails(inspectOrgId),
    enabled: Boolean(inspectOrgId),
  });

  // Single Job Moderate Mutation
  const moderateMutation = useMutation({
    mutationFn: ({ jobId, action, reason }) =>
      adminApi.moderate(jobId, action, action === "reject" ? reason || undefined : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-moderation-companies"] });
      qc.invalidateQueries({ queryKey: ["moderation-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin-company-jobs"] });
      toast.success(
        target?.action === "approve"
          ? target?.changes
            ? "Changes approved — listing now live"
            : "Job approved successfully"
          : "Job rejected",
      );
      setTarget(null);
      setReason("");
      setDetailJob(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // Bulk Approve Mutation
  const bulkApproveMutation = useMutation({
    mutationFn: (orgId) => adminApi.bulkApproveJobs(orgId),
    onSuccess: (res) => {
      toast.success(res.data?.message || "All eligible jobs approved successfully!");
      qc.invalidateQueries({ queryKey: ["admin-moderation-companies"] });
      qc.invalidateQueries({ queryKey: ["moderation-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin-company-jobs"] });
      setBulkApproveTarget(null);
      setViewOrgJobs(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const loading = companiesQuery.isLoading && legacyJobsQuery.isLoading;
  const companiesList = companiesQuery.data?.data || [];
  const legacyJobs = legacyJobsQuery.data?.data || [];

  // Group legacy jobs by company if companiesQuery returned 0
  const effectiveCompanies = useMemo(() => {
    if (companiesList.length > 0) return companiesList;
    if (legacyJobs.length === 0) return [];

    const grouped = {};
    for (const j of legacyJobs) {
      const orgId = j.organization?._id || j.organization?.id || "legacy-org";
      if (!grouped[orgId]) {
        grouped[orgId] = {
          organizationId: orgId,
          _id: orgId,
          companyName: j.company || j.organization?.name || "Company",
          companySlug: j.organization?.slug || "",
          verificationStatus: j.organization?.verificationStatus || "verified",
          riskScore: j.organization?.riskScore || 0,
          riskFlags: j.organization?.riskFlags || [],
          jobCounts: { total: 0, pending: 0, approved: 0, rejected: 0 },
          latestSubmission: j.createdAt,
          jobs: [],
        };
      }
      grouped[orgId].jobCounts.total += 1;
      if (j.moderation?.status === "pending" || j.changeReview?.status === "pending") {
        grouped[orgId].jobCounts.pending += 1;
      } else if (j.moderation?.status === "approved") {
        grouped[orgId].jobCounts.approved += 1;
      } else {
        grouped[orgId].jobCounts.rejected += 1;
      }
      grouped[orgId].jobs.push(j);
    }
    return Object.values(grouped);
  }, [companiesList, legacyJobs]);

  const filteredCompanies = effectiveCompanies.filter((c) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      c.companyName?.toLowerCase().includes(term) ||
      c.companySlug?.toLowerCase().includes(term) ||
      (c.jobs || []).some((j) => j.title?.toLowerCase().includes(term))
    );
  });

  const totalPendingJobs = filteredCompanies.reduce((s, c) => s + (c.jobCounts?.pending || 0), 0);

  return (
    <div className="page-wrap space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader
          eyebrow="Job Moderation"
          title="Job Listing Moderation"
          description="Grouped by employer organization. Verify company authenticity, inspect job compensation, and approve or reject listings individually or in bulk."
        />
        <div className="flex items-center gap-2">
          <Badge tone={totalPendingJobs > 0 ? "warning" : "success"}>
            {totalPendingJobs} Total Pending Approval
          </Badge>
        </div>
      </div>

      <FilterBar>
        <Input
          aria-label="Search approvals"
          placeholder="Search by company or job title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xs"
        />
        <Select
          aria-label="Filter by verification"
          value={verificationStatus}
          onChange={(e) => setVerificationStatus(e.target.value)}
          options={VERIFICATION_STATUS_OPTIONS}
          className="lg:max-w-44"
        />
        <Select
          aria-label="Filter by risk score"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value)}
          options={RISK_LEVEL_OPTIONS}
          className="lg:max-w-44"
        />
      </FilterBar>

      {loading ? (
        <SkeletonList />
      ) : filteredCompanies.length === 0 ? (
        <EmptyState
          title="No job listings to moderate"
          description={
            search
              ? "No companies or job postings match your search criteria."
              : "When employer companies submit job listings, they will appear here grouped by company for review."
          }
        />
      ) : (
        <div className="grid gap-6">
          {filteredCompanies.map((c) => {
            const orgId = c.organizationId || c._id;
            const isVerified = c.verificationStatus === "verified";
            const risk = c.riskScore || 0;
            const riskTone = risk <= 25 ? "success" : risk <= 60 ? "warning" : "danger";
            const pendingCount = c.jobCounts?.pending || 0;

            return (
              <div
                key={orgId}
                className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition-all hover:border-brand-200"
              >
                {/* Company Card Header */}
                <div className="flex flex-col justify-between gap-4 border-b border-ink-100 bg-ink-50/50 p-5 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-950 font-bold text-white shadow-xs">
                      {initials(c.companyName)}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-ink-950">{c.companyName}</h3>
                        <Badge tone={isVerified ? "success" : "warning"}>
                          {c.verificationStatus}
                        </Badge>
                        <Badge tone={riskTone}>
                          Risk: {risk}/100
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {c.industry || "Technology"} · {c.jobCounts?.total || 0} Total Listings · Latest:{" "}
                        {c.latestSubmission ? formatRelativeTime(c.latestSubmission) : "Recent"}
                      </p>
                    </div>
                  </div>

                  {/* Company Level Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setInspectOrgId(orgId)}
                    >
                      Inspect Company
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewOrgJobs(orgId)}
                    >
                      View All Jobs ({c.jobCounts?.total || 0})
                    </Button>
                    {isVerified && pendingCount > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          setBulkApproveTarget({
                            orgId,
                            companyName: c.companyName,
                            count: pendingCount,
                          })
                        }
                      >
                        Approve All Eligible ({pendingCount})
                      </Button>
                    )}
                  </div>
                </div>

                {/* Direct Jobs Preview inside Card */}
                <div className="divide-y divide-ink-100 p-2">
                  {(c.jobs || legacyJobs.filter((j) => (j.organization?._id || j.organization?.id) === orgId))
                    .slice(0, 3)
                    .map((j) => {
                      const isChange = j.changeReview?.status === "pending";

                      return (
                        <div
                          key={j.id || j._id}
                          className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center hover:bg-ink-50/40 rounded-xl"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-ink-900">{j.title}</span>
                              <Badge tone={isChange ? "warning" : j.moderation?.status === "approved" ? "success" : "ink"}>
                                {isChange ? "Edits Pending" : j.moderation?.status || "pending"}
                              </Badge>
                            </div>
                            <p className="text-xs text-ink-500">
                              {j.location} · {j.workplaceMode} · ₹{((j.compensation?.min || j.salary || 0) / 100000).toFixed(1)} - {((j.compensation?.max || j.salary || 0) / 100000).toFixed(1)} LPA
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => setDetailJob(j)}>
                              View Details
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => setTarget({ action: "approve", job: j, changes: isChange })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setTarget({ action: "reject", job: j, changes: isChange })}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 1. Company Jobs Drawer / Modal */}
      {viewOrgJobs && companyJobsQuery.data?.data && (
        <Modal
          isOpen={Boolean(viewOrgJobs)}
          open={Boolean(viewOrgJobs)}
          onClose={() => setViewOrgJobs(null)}
          title={`Job Listings: ${companyJobsQuery.data.data.organization?.name}`}
          size="lg"
        >
          {(() => {
            const org = companyJobsQuery.data.data.organization || {};
            const jobs = companyJobsQuery.data.data.jobs || [];
            const isVerified = org.verificationStatus === "verified";
            const pendingJobs = jobs.filter(
              (j) => j.moderation?.status === "pending" || j.changeReview?.status === "pending",
            );

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={isVerified ? "success" : "warning"}>{org.verificationStatus}</Badge>
                    <span className="text-xs text-ink-500">{jobs.length} total job postings</span>
                  </div>
                  {isVerified && pendingJobs.length > 0 && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        setBulkApproveTarget({
                          orgId: org.id || org._id,
                          companyName: org.name,
                          count: pendingJobs.length,
                        })
                      }
                    >
                      Approve All Eligible ({pendingJobs.length})
                    </Button>
                  )}
                </div>

                <div className="max-h-[60vh] overflow-y-auto space-y-3">
                  {jobs.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-400">No jobs posted by this company yet.</p>
                  ) : (
                    jobs.map((j) => (
                      <div
                        key={j.id || j._id}
                        className="flex flex-col justify-between gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:flex-row sm:items-center"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-ink-900">{j.title}</span>
                            <Badge tone={j.moderation?.status === "approved" ? "success" : "warning"}>
                              {j.moderation?.status || "pending"}
                            </Badge>
                          </div>
                          <p className="text-xs text-ink-500">
                            {j.department} · {j.location} · {j.workplaceMode} · {j.salaryInrLpa} · {j.applicationCount} Applicants
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetailJob(j)}>
                            Details
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() =>
                              setTarget({ action: "approve", job: j, changes: j.changeReview?.status === "pending" })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setTarget({ action: "reject", job: j, changes: j.changeReview?.status === "pending" })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* 2. Full Company Inspection Modal */}
      {inspectOrgId && orgInspectQuery.data?.data && (
        <Modal
          isOpen={Boolean(inspectOrgId)}
          open={Boolean(inspectOrgId)}
          onClose={() => setInspectOrgId(null)}
          title={`Company Inspection: ${orgInspectQuery.data.data.organization?.name}`}
          size="lg"
        >
          {(() => {
            const org = orgInspectQuery.data.data.organization || {};
            const owner = orgInspectQuery.data.data.owner || {};
            const hiringStats = orgInspectQuery.data.data.hiringStats || {};
            const risk = org.riskScore || 0;
            const riskFlags = org.riskFlags || [];

            return (
              <div className="space-y-6">
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
                </div>

                <div className="rounded-xl border border-ink-100 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Primary Recruiter Owner</h4>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{owner.name || "Owner User"}</p>
                  <p className="text-xs text-ink-500">{owner.email} · {owner.phone || "No phone"}</p>
                </div>

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
                    </div>
                  </div>
                )}

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
                              flag.severity === "high" ? "text-danger-600" : "text-amber-600"
                            }`}
                          />
                          <span className="text-ink-700">{flag.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-ink-100">
                  <Button variant="outline" onClick={() => setInspectOrgId(null)}>Close</Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* 3. Bulk Approval Confirmation Modal */}
      {bulkApproveTarget && (
        <Modal
          isOpen={Boolean(bulkApproveTarget)}
          open={Boolean(bulkApproveTarget)}
          onClose={() => setBulkApproveTarget(null)}
          title={`Bulk Approve Job Listings`}
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              Are you sure you want to approve all <strong>{bulkApproveTarget.count}</strong> eligible pending job postings for <strong>{bulkApproveTarget.companyName}</strong>?
            </p>
            <p className="text-xs text-ink-500">
              Approved job postings will immediately become live and visible to candidates across the platform.
            </p>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setBulkApproveTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => bulkApproveMutation.mutate(bulkApproveTarget.orgId)}
                loading={bulkApproveMutation.isPending}
              >
                Approve All {bulkApproveTarget.count} Jobs
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 4. Single Job Detail Modal */}
      {detailJob && (
        <Modal isOpen={Boolean(detailJob)} open={Boolean(detailJob)} onClose={() => setDetailJob(null)} title={detailJob.title} size="lg">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge tone="ink">{detailJob.workplaceMode}</Badge>
              <Badge tone="brand">{detailJob.experience}</Badge>
            </div>

            <div className="rounded-xl bg-ink-50 p-4 text-xs text-ink-700">
              <p className="font-semibold text-ink-900">Company & Compensation:</p>
              <p className="mt-1">
                {detailJob.company} ({detailJob.location}) · ₹{((detailJob.compensation?.min || detailJob.salary || 0) / 100000).toFixed(1)} - {((detailJob.compensation?.max || detailJob.salary || 0) / 100000).toFixed(1)} LPA
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Required Skills</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(detailJob.requiredSkills || []).map((s, i) => (
                  <Badge key={i} tone="brand">{s}</Badge>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Job Description</h4>
              <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-ink-100 p-4 text-xs leading-relaxed text-ink-700">
                {detailJob.description}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-ink-100">
              <Button variant="outline" onClick={() => setDetailJob(null)}>Close</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setTarget({ action: "approve", job: detailJob, changes: detailJob.changeReview?.status === "pending" });
                  setDetailJob(null);
                }}
              >
                Approve Listing
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 5. Single Job Approve / Reject Modal */}
      {target && (
        <Modal
          isOpen={Boolean(target)}
          open={Boolean(target)}
          onClose={() => setTarget(null)}
          title={target.action === "approve" ? `Approve "${target.job?.title}"` : `Reject "${target.job?.title}"`}
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-600">
              {target.action === "approve"
                ? "Approving will make this job listing publicly visible and discoverable to candidates."
                : "Please provide a reason explaining why this job listing was rejected."}
            </p>

            {target.action === "reject" && (
              <Textarea
                label="Rejection Reason (Required)"
                placeholder="Explain what needs to be changed..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
              />
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
              <Button
                variant={target.action === "approve" ? "primary" : "danger"}
                onClick={() => {
                  if (target.action === "reject" && !reason.trim()) {
                    return toast.error("Rejection reason is required");
                  }
                  moderateMutation.mutate({ jobId: target.job.id || target.job._id, action: target.action, reason });
                }}
                loading={moderateMutation.isPending}
              >
                Confirm {target.action === "approve" ? "Approval" : "Rejection"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

/* =========================================================================
   4. ADMIN USERS
   ========================================================================= */
export const AdminUsers = () => {
  const toast = useToast(),
    qc = useQueryClient(),
    [search, setSearch] = useState(""),
    [role, setRole] = useState(""),
    [status, setStatus] = useState(""),
    [cursor, setCursor] = useState(null),
    [target, setTarget] = useState(null),
    [reason, setReason] = useState(""),
    debounced = useDebouncedValue(search, 300);

  const params = useMemo(
    () => ({
      search: debounced || undefined,
      role: role || undefined,
      status: status || undefined,
      limit: 100,
      after: cursor || undefined,
    }),
    [debounced, role, status, cursor],
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

  const rows = q.data?.data || [];

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Users"
        title="User Governance"
        description="Monitor user accounts, verify platform access, and manage suspensions."
      />
      <FilterBar>
        <Input
          aria-label="Search users"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xs"
        />
        <Select
          aria-label="Filter by role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setCursor(null);
          }}
          options={[
            { value: "", label: "All roles" },
            { value: "candidate", label: "Candidate" },
            { value: "recruiter", label: "Recruiter" },
            { value: "admin", label: "Admin" },
          ]}
          className="lg:max-w-40"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursor(null);
          }}
          options={[
            { value: "", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
          ]}
          className="lg:max-w-40"
        />
      </FilterBar>

      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          headers={["User", "Role", "Status", "Email Verified", "Created", "Actions"]}
          empty={rows.length === 0}
          emptyLabel="No users match your filters."
        >
          {rows.map((u) => (
            <tr key={u._id} className="transition-colors hover:bg-ink-50/60">
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-950 text-xs font-bold text-white">
                    {initials(u.name)}
                  </span>
                  <div>
                    <p className="font-semibold text-ink-900">{u.name}</p>
                    <p className="text-xs text-ink-400">{u.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4 capitalize">{u.role}</td>
              <td className="px-5 py-4">
                <Badge tone={u.accountStatus === "active" ? "success" : "danger"}>
                  {u.accountStatus}
                </Badge>
              </td>
              <td className="px-5 py-4">{u.emailVerified ? "Yes" : "No"}</td>
              <td className="px-5 py-4 text-xs text-ink-500">{formatDate(u.createdAt)}</td>
              <td className="px-5 py-4 text-right">
                {u.role !== "admin" && (
                  <Button
                    size="sm"
                    variant={u.accountStatus === "suspended" ? "outline" : "danger"}
                    onClick={() => setTarget(u)}
                  >
                    {u.accountStatus === "suspended" ? "Reactivate" : "Suspend"}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
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
export const AdminSecurity = () => {
  const [tab, setTab] = useState("security");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);

  const params = useMemo(
    () => ({ search: debounced || undefined, limit: 100 }),
    [debounced],
  );

  const q = useQuery({
    queryKey: ["admin-security-audit", tab, params],
    queryFn: () => (tab === "security" ? adminApi.security(params) : adminApi.audit(params)),
  });

  const rows = q.data?.data || [];

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Security & Governance"
        title="Security & Audit"
        description="Audit sign-in events, session revocations, role changes, and compliance events across tenants."
      />
      <div className="flex gap-2">
        <button
          onClick={() => setTab("security")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            tab === "security" ? "bg-ink-950 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
          }`}
        >
          Security Events
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            tab === "audit" ? "bg-ink-950 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
          }`}
        >
          Audit Log
        </button>
      </div>

      <FilterBar>
        <Input
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xs"
        />
      </FilterBar>

      {q.isLoading ? (
        <SkeletonList />
      ) : (
        <DataTable
          headers={["Event / Action", "User", "Organization", "Outcome / Severity", "Timestamp"]}
          empty={rows.length === 0}
        >
          {rows.map((row) => (
            <tr key={row._id} className="hover:bg-ink-50/60">
              <td className="px-5 py-4 font-mono text-xs font-semibold">{row.type || row.action}</td>
              <td className="px-5 py-4 text-xs">{row.user?.name || row.actor?.name || "System"}</td>
              <td className="px-5 py-4 text-xs">{row.organization?.name || "—"}</td>
              <td className="px-5 py-4">
                <Badge tone={row.severity === "high" || row.outcome === "failure" ? "danger" : "brand"}>
                  {row.severity || row.outcome || "info"}
                </Badge>
              </td>
              <td className="px-5 py-4 text-xs text-ink-500">{formatDateTime(row.createdAt)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
};
