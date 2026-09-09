import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  Eye,
  Layers,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Select } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, SkeletonList } from "../../components/ui/States";
import { PageHeader, StatusPill } from "../../components/Product";
import Kpi from "../../components/ui/Kpi";
import SectionCard from "../../components/ui/SectionCard";
import ActivityFeed from "../../components/ui/ActivityFeed";
import {
  DataTable,
  DetailRow,
  Drawer,
  FilterBar,
  LoadMore,
  SeverityBadge,
} from "../../components/admin/AdminUi";
import { adminApi, jobsApi } from "../../lib/api";
import { useToast } from "../../components/ui/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatDate, formatRelativeTime, humanizeAction, initials, shortId } from "../../lib/utils";

const ROLE_OPTIONS = ["candidate", "recruiter", "admin"].map((x) => ({
  value: x,
  label: x.charAt(0).toUpperCase() + x.slice(1),
}));
const USER_STATUS_OPTIONS = ["active", "pending_verification", "suspended", "deletion_pending"].map(
  (x) => ({ value: x, label: x.replace("_", " ") }),
);
const ORG_STATUS_OPTIONS = ["active", "suspended", "archived"].map((x) => ({
  value: x,
  label: x.charAt(0).toUpperCase() + x.slice(1),
}));
const SEVERITY_OPTIONS = ["info", "low", "medium", "high", "critical"].map((x) => ({
  value: x,
  label: x.charAt(0).toUpperCase() + x.slice(1),
}));
/* Plain-English labels for every AI feature the platform actually runs. */
const FEATURE_LABELS = {
  resume_extraction: "Resume parsing",
  resume_rewrite: "Resume rewriting",
  resume_improvement: "Resume improvement",
  resume_analysis: "Resume analysis",
  jd_generation: "Job description writing",
  jd_parse: "Job description parsing",
  jd_improvement: "Job description assist",
  interview_questions: "Interview questions",
  interview_preparation: "Interview preparation",
  recruiter_copilot: "Recruiter Assistant",
  career_copilot: "Career Assistant",
  candidate_matching: "Candidate matching",
  nl_job_search: "Smart job search",
};
const featureLabel = (f) => FEATURE_LABELS[f] || humanizeAction(f);

const UserAvatar = ({ name, size = "h-9 w-9 text-xs" }) => (
  <span
    className={`grid shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700 ${size}`}
  >
    {initials(name)}
  </span>
);

/* ------------------------------ overview ------------------------------ */

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
    description:
      "Processes resume processing, recommendation refreshes, alerts and email delivery in the background.",
  },
];

const isCheckUp = (value) => value === "up" || value === "ok" || value === true;

export const AdminHome = () => {
  const users = useQuery({
    queryKey: ["admin-users", {}],
    queryFn: () => adminApi.users({ limit: 100 }),
  });
  const orgs = useQuery({
    queryKey: ["admin-organizations", {}],
    queryFn: () => adminApi.organizations({ limit: 100 }),
  });
  const pending = useQuery({
    queryKey: ["moderation-jobs", "pending"],
    queryFn: () => adminApi.moderation({ status: "pending", limit: 100 }),
  });
  const ai = useQuery({ queryKey: ["admin-ai-usage"], queryFn: adminApi.aiUsage });
  const security = useQuery({
    queryKey: ["admin-security", {}],
    queryFn: () => adminApi.security({ limit: 100 }),
  });
  const audit = useQuery({
    queryKey: ["admin-audit", {}],
    queryFn: () => adminApi.audit({ limit: 100 }),
  });
  const ready = useQuery({ queryKey: ["health-ready"], queryFn: adminApi.ready, retry: false });
  const publishedJobs = useQuery({
    queryKey: ["admin-jobs-count"],
    queryFn: () => jobsApi.list({ limit: 1 }),
    retry: false,
  });
  const loading = users.isLoading || orgs.isLoading || pending.isLoading;
  const userList = users.data?.data || [];
  const orgList = orgs.data?.data || [];
  const userTotal = users.data?.meta?.total ?? userList.length;
  const orgTotal = orgs.data?.meta?.total ?? orgList.length;
  const pendingTotal = pending.data?.meta?.total ?? pending.data?.data?.length ?? 0;
  const highRisk = (security.data?.data || []).filter(
    (e) => e.severity === "high" || e.severity === "critical",
  );
  const totalRuns = (ai.data?.data || []).reduce((sum, row) => sum + (row.runs || 0), 0);
  const candidates = userList.filter((u) => u.role === "candidate").length;
  const recruiters = userList.filter((u) => u.role === "recruiter").length;
  const suspended = userList.filter((u) => u.accountStatus === "suspended").length;
  const activityItems = (audit.data?.data || []).slice(0, 8).map((a) => ({
    title: humanizeAction(a.action),
    meta: `${a.actor?.name || "System"} · ${a.resourceType}${
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
  const quickActions = [
    ["Review Approvals", "/app/admin/moderation", Clock3],
    ["Manage Users", "/app/admin/users", UserRound],
    ["Review Companies", "/app/admin/organizations", Building2],
    ["View AI Activity", "/app/admin/ai-usage", Sparkles],
    ["Security & Audit", "/app/admin/security", ShieldCheck],
  ];

  /* Platform status comes straight from the /health/ready checks — the two
     services the backend actually reports (database + job queue). */
  const checks = ready.data?.data?.checks || {};
  const queue = ready.data?.data?.queue;
  const upCount = HEALTH_SERVICES.filter((s) => isCheckUp(checks[s.key])).length;
  const overall = ready.error
    ? "error"
    : ready.isLoading
      ? "checking"
      : upCount === HEALTH_SERVICES.length
        ? "operational"
        : upCount === 1
          ? "degraded"
          : "unavailable";
  const overallCopy = {
    operational: "Platform operational",
    degraded: "Platform degraded",
    unavailable: "Platform unavailable",
    error: "Health check failed",
    checking: "Checking platform status",
  }[overall];
  const statusDot = {
    operational: "bg-success-500",
    degraded: "bg-warning-500",
    unavailable: "bg-danger-500",
    error: "bg-danger-500",
    checking: "bg-ink-500",
  }[overall];

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Platform"
        title="Platform Overview"
        description="Monitor hiring activity, platform health, approvals and AI usage from one place."
      />
      {loading ? (
        <SkeletonList />
      ) : (
        <>
          {/* status strip */}
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-ink-950 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot} ${
                  overall === "operational" ? "animate-pulse" : ""
                }`}
                aria-hidden="true"
              />
              <p className="text-sm font-semibold">{overallCopy}</p>
              {ready.dataUpdatedAt > 0 && (
                <p className="hidden text-xs text-ink-400 sm:block">
                  · Checked {formatRelativeTime(new Date(ready.dataUpdatedAt))}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {queue?.queued != null && (
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-ink-200">
                  {queue.queued} background job{queue.queued === 1 ? "" : "s"} queued
                </span>
              )}
              {pendingTotal > 0 && (
                <span className="rounded-full bg-warning-500/15 px-2.5 py-1 text-xs font-semibold text-warning-500">
                  {pendingTotal} approval{pendingTotal === 1 ? "" : "s"} pending
                </span>
              )}
              {highRisk.length > 0 && (
                <Link
                  to="/app/admin/security"
                  className="rounded-full bg-danger-500/15 px-2.5 py-1 text-xs font-semibold text-danger-500 transition-colors hover:bg-danger-500/25"
                >
                  {highRisk.length} high-risk event{highRisk.length === 1 ? "" : "s"}
                </Link>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi
              label="Total Users"
              value={userTotal}
              icon={UsersRound}
              detail={`${candidates} candidates · ${recruiters} recruiters`}
            />
            <Kpi label="Companies" value={orgTotal} icon={Building2} />
            <Kpi
              label="Active Jobs"
              value={publishedJobs.data?.meta?.count ?? publishedJobs.data?.data?.length ?? "—"}
              icon={BriefcaseBusiness}
              detail="Published on platform"
            />
            <Kpi
              label="Pending Approvals"
              value={pendingTotal}
              tone={pendingTotal ? "warning" : "ink"}
              icon={Clock3}
              detail={pendingTotal ? "Awaiting review" : "All clear"}
            />
            <Kpi label="AI Operations" value={totalRuns} tone="brand" icon={Sparkles} />
            <Kpi
              label="High-risk events"
              value={highRisk.length}
              tone={highRisk.length ? "danger" : "success"}
              icon={ShieldAlert}
              detail={highRisk.length ? "Needs review" : "No open incidents"}
            />
          </div>

          {/* quick actions — operational commands, not decorative cards */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {quickActions.map(([label, to, Icon]) => (
              <Link
                key={to}
                to={to}
                className="panel group flex items-center gap-3 px-4 py-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="truncate text-sm font-semibold text-ink-800 group-hover:text-brand-700">
                  {label}
                </span>
                <ChevronRight
                  className="ml-auto h-4 w-4 shrink-0 text-ink-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SectionCard
              title="Pending Actions"
              description="Approvals, security and account items awaiting review"
              action={
                <Link
                  to="/app/admin/moderation"
                  className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  Review approvals →
                </Link>
              }
            >
              <div className="space-y-3">
                {(pending.data?.data || []).slice(0, 4).map((job) => (
                  <Link
                    key={job.id}
                    to="/app/admin/moderation"
                    className="group flex items-center gap-3 rounded-xl border border-ink-100 p-4 transition-colors hover:border-brand-200"
                  >
                    <Clock3 className="h-4 w-4 shrink-0 text-warning-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold transition-colors group-hover:text-brand-700">
                        {job.title}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {job.organization?.name || job.company} · submitted{" "}
                        {formatRelativeTime(job.createdAt)}
                      </p>
                    </div>
                    <StatusPill status="pending" />
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  </Link>
                ))}
                {highRisk.length > 0 && (
                  <div className="rounded-xl border border-danger-500/20 bg-danger-50 p-4">
                    <p className="text-sm font-semibold text-danger-700">
                      {highRisk.length} high or critical security event
                      {highRisk.length > 1 ? "s" : ""}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {highRisk.slice(0, 3).map((e) => (
                        <li key={e._id} className="flex items-center gap-2 text-xs text-ink-700">
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-danger-500" />
                          <span className="truncate">
                            {humanizeAction(e.type)}
                            {e.user?.name ? ` · ${e.user.name}` : ""}
                          </span>
                          <span className="ml-auto shrink-0 text-ink-400">
                            {formatRelativeTime(e.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/app/admin/security"
                      className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Review security events
                    </Link>
                  </div>
                )}
                {suspended > 0 && (
                  <Link
                    to="/app/admin/users"
                    className="group flex items-center gap-3 rounded-xl border border-ink-100 p-4 transition-colors hover:border-brand-200"
                  >
                    <UserRound className="h-4 w-4 shrink-0 text-ink-400" />
                    <p className="text-sm font-semibold">
                      {suspended} suspended account{suspended > 1 ? "s" : ""}
                    </p>
                    <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  </Link>
                )}
                {!(pending.data?.data || []).length && !highRisk.length && suspended === 0 && (
                  <p className="text-sm text-ink-500">
                    Nothing needs attention — all approvals and security items are up to date.
                  </p>
                )}
              </div>
            </SectionCard>
            <SectionCard
              title="Recent Activity"
              description="System events from the audit log"
              action={
                <Link
                  to="/app/admin/security"
                  className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  Audit log
                </Link>
              }
            >
              <ActivityFeed
                items={activityItems}
                emptyText="No recorded activity yet. Administrative actions appear here as they happen."
              />
            </SectionCard>
          </div>

          {/* platform health — only the services the backend actually reports */}
          <SectionCard
            title="Platform Health"
            description="Database and background job queue, checked when this page loads"
            tone="dark"
            className="mt-6"
          >
            {ready.isLoading ? (
              <p className="text-sm text-ink-400">Checking…</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-white/6 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2 w-2 rounded-full ${statusDot}`}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold">Overall status</p>
                  </div>
                  <Badge
                    variant={
                      overall === "operational"
                        ? "success"
                        : overall === "degraded"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {overall === "checking"
                      ? "Checking"
                      : overall.charAt(0).toUpperCase() + overall.slice(1)}
                  </Badge>
                </div>
                {HEALTH_SERVICES.map((service) => {
                  const up = isCheckUp(checks[service.key]);
                  return (
                    <div
                      key={service.key}
                      className="flex flex-col gap-2 rounded-xl bg-white/6 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-cyan-300">
                          <service.icon className="h-4.5 w-4.5" aria-hidden="true" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{service.name}</p>
                          <p className="mt-0.5 max-w-md text-xs leading-5 text-ink-400">
                            {service.description}
                          </p>
                        </div>
                      </div>
                      <Badge variant={up ? "success" : "danger"}>
                        {up ? "Operational" : "Unavailable"}
                      </Badge>
                    </div>
                  );
                })}
                {queue?.staleProcessing > 0 && (
                  <p className="rounded-xl border border-warning-500/30 bg-warning-500/10 px-4 py-2.5 text-xs font-medium text-warning-500">
                    {queue.staleProcessing} background job{queue.staleProcessing === 1 ? " has" : "s have"}
                    been processing for over 15 minutes.
                  </p>
                )}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
};

/* ------------------------------ approvals ------------------------------ */

export const AdminModeration = () => {
  const toast = useToast(),
    qc = useQueryClient(),
    [tab, setTab] = useState("pending"),
    [search, setSearch] = useState(""),
    [target, setTarget] = useState(null),
    [reason, setReason] = useState(""),
    [view, setView] = useState(null);
  const effectiveStatus = (job) =>
    job.changeReview?.status === "pending" ? "changes_pending" : job.moderation?.status;
  const statuses = tab === "all" ? ["pending", "approved", "rejected"] : [tab];
  const results = useQueries({
    queries: statuses.map((s) => ({
      queryKey: ["moderation-jobs", s],
      queryFn: () => adminApi.moderation({ status: s, limit: 50 }),
    })),
  });
  const act = useMutation({
    mutationFn: ({ jobId, action }) =>
      adminApi.moderate(jobId, action, action === "reject" ? reason || undefined : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moderation-jobs"] });
      toast.success(
        target?.action === "approve"
          ? target?.changes
            ? "Changes approved — now live"
            : "Job approved"
          : target?.changes
            ? "Changes rejected — previous version stays live"
            : "Job rejected",
      );
      setTarget(null);
      setReason("");
    },
    onError: (error) => toast.error(error.message),
  });
  const loading = results.some((r) => r.isLoading);
  const all = results
    .flatMap((r) => r.data?.data || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const jobs = all.filter((j) => {
    if (!search) return true;
    const hay = `${j.title} ${j.company} ${j.location} ${j.organization?.name || ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });
  const countFor = (s) =>
    s === "all"
      ? all.length
      : all.filter(
          (j) =>
            effectiveStatus(j) === s || (s === "pending" && j.moderation?.status === "pending"),
        ).length;
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Approvals"
        title="Approvals"
        description="Review job listings submitted by companies. Approving makes a listing public; rejecting notifies the owner with your reason."
      />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Approval status">
        {["all", "pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
              tab === s ? "bg-ink-950 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
            }`}
          >
            {s} ({loading ? "…" : countFor(s)})
          </button>
        ))}
      </div>
      <FilterBar>
        <Input
          aria-label="Search approvals"
          placeholder="Search by job, company or location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-sm"
        />
      </FilterBar>
      {loading ? (
        <SkeletonList />
      ) : results.some((r) => r.error) ? (
        <ErrorState
          error={results.find((r) => r.error)?.error}
          onRetry={() => results.forEach((r) => r.refetch())}
        />
      ) : (
        <>
          <DataTable
            headers={["Job", "Company", "Location", "Submitted", "Status", "Actions"]}
            empty={jobs.length === 0}
            emptyLabel={
              tab === "pending" || tab === "all"
                ? "No pending approvals — all submitted jobs are up to date."
                : `No ${tab} jobs yet.`
            }
          >
            {jobs.map((job) => (
              <tr key={job.id} className="transition-colors hover:bg-ink-50/60">
                <td className="max-w-64 px-5 py-4">
                  <p className="truncate font-semibold">{job.title}</p>
                  <p className="text-xs text-ink-400">
                    {job.workplaceMode || "—"} · v{job.version}
                  </p>
                </td>
                <td className="max-w-48 truncate px-5 py-4 text-ink-600">
                  {job.organization?.name || job.company || "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-ink-600">{job.location}</td>
                <td className="whitespace-nowrap px-5 py-4 text-ink-500">
                  {formatRelativeTime(job.createdAt)}
                </td>
                <td className="px-5 py-4">
                  <StatusPill status={effectiveStatus(job)} />
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setView(job)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      View
                    </Button>
                    {["pending", "changes_pending"].includes(effectiveStatus(job)) && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setTarget({
                              jobId: job.id,
                              action: "approve",
                              changes: effectiveStatus(job) === "changes_pending",
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger-600 hover:text-danger-700"
                          onClick={() =>
                            setTarget({
                              jobId: job.id,
                              action: "reject",
                              changes: effectiveStatus(job) === "changes_pending",
                            })
                          }
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
      <Drawer open={Boolean(view)} onClose={() => setView(null)} title="Job details">
        {view && (
          <dl>
            <DetailRow label="Job" value={view.title} />
            <DetailRow label="Company" value={view.organization?.name || view.company || "—"} />
            <DetailRow label="Location" value={view.location} />
            <DetailRow label="Work mode" value={view.workplaceMode || "—"} />
            <DetailRow label="Version" value={`v${view.version}`} mono />
            <DetailRow label="Status" value={<StatusPill status={view.moderation?.status} />} />
            <DetailRow label="Skills" value={view.requiredSkills?.join(", ") || "—"} />
            <DetailRow
              label="Submitted"
              value={`${formatDate(view.createdAt)} · ${formatRelativeTime(view.createdAt)}`}
            />
            {view.moderation?.reviewedAt && (
              <DetailRow
                label="Reviewed"
                value={`${formatDate(view.moderation.reviewedAt)} · ${formatRelativeTime(
                  view.moderation.reviewedAt,
                )}`}
              />
            )}
            {view.moderation?.reason && <DetailRow label="Reason" value={view.moderation.reason} />}
            {view.changeReview && (
              <>
                <DetailRow
                  label="Change review"
                  value={<StatusPill status={view.changeReview.status} />}
                />
                {view.changeReview.submittedAt && (
                  <DetailRow
                    label="Changes submitted"
                    value={`${formatDate(view.changeReview.submittedAt)} · ${formatRelativeTime(
                      view.changeReview.submittedAt,
                    )}`}
                  />
                )}
                {view.changeReview.reason && (
                  <DetailRow label="Change review reason" value={view.changeReview.reason} />
                )}
                {view.changeReview.status === "pending" &&
                  view.changeReview.fields &&
                  Object.keys(view.changeReview.fields).length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                        Proposed changes
                      </p>
                      <ul className="mt-2 space-y-2">
                        {Object.entries(view.changeReview.fields).map(([field, value]) => (
                          <li key={field} className="rounded-lg bg-ink-50 p-3 text-sm">
                            <p className="font-semibold capitalize">{field.replaceAll("_", " ")}</p>
                            <p className="mt-0.5 break-words text-ink-600">
                              {Array.isArray(value)
                                ? value.join(", ")
                                : value && typeof value === "object"
                                  ? JSON.stringify(value)
                                  : String(value ?? "—")}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </>
            )}
          </dl>
        )}
      </Drawer>
      <Modal
        isOpen={Boolean(target)}
        onClose={() => setTarget(null)}
        title={
          target?.changes
            ? target?.action === "reject"
              ? "Reject changes"
              : "Approve changes"
            : target?.action === "reject"
              ? "Reject job"
              : "Approve job"
        }
      >
        {target?.action === "reject" ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              {target?.changes
                ? "The proposed changes are discarded and the previously approved version stays visible to candidates. The owner is notified with your reason."
                : "The organization owner will be notified. A reason helps them fix the listing."}
            </p>
            <Input
              label="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Salary band contradicts the experience requirement"
            />
          </div>
        ) : (
          <p className="text-sm text-ink-600">
            {target?.changes
              ? "The updated job details become live and the owner is notified."
              : "The job becomes visible on public search and the company page immediately."}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>
            Cancel
          </Button>
          <Button
            variant={target?.action === "reject" ? "danger" : "primary"}
            isLoading={act.isPending}
            onClick={() => target && act.mutate(target)}
          >
            {target?.action === "approve" ? "Approve" : "Reject"}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

/* ------------------------------- users ------------------------------- */

export const AdminUsers = () => {
  const toast = useToast(),
    qc = useQueryClient(),
    [search, setSearch] = useState(""),
    [role, setRole] = useState(""),
    [status, setStatus] = useState(""),
    [cursor, setCursor] = useState(null),
    [target, setTarget] = useState(null),
    [reason, setReason] = useState(""),
    [view, setView] = useState(null),
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
  const q = useQuery({
    queryKey: ["admin-users", params],
    queryFn: () => adminApi.users(params),
  });
  const suspend = useMutation({
    mutationFn: () =>
      target.accountStatus === "suspended"
        ? adminApi.reactivate(target._id, reason || "Reactivated by platform administrator")
        : adminApi.suspend(target._id, reason || "Suspended by platform administrator"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(
        target.accountStatus === "suspended" ? "Account reactivated" : "Account suspended",
      );
      setTarget(null);
      setReason("");
    },
    onError: (error) => toast.error(error.message),
  });
  const rows = q.data?.data || [];
  const isSelf = (u) => u.role === "admin";
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Users"
        title="User Management"
        description="Manage platform accounts, access and account status. Suspension revokes sessions immediately."
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
          placeholder="All roles"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setCursor(null);
          }}
          options={ROLE_OPTIONS}
          className="lg:max-w-36"
        />
        <Select
          aria-label="Filter by status"
          placeholder="All statuses"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursor(null);
          }}
          options={USER_STATUS_OPTIONS}
          className="lg:max-w-44"
        />
      </FilterBar>
      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <DataTable
            headers={["User", "Role", "Status", "Joined", "Last Updated", "Actions"]}
            empty={rows.length === 0}
            emptyLabel="No users match your filters."
          >
            {rows.map((u) => (
              <tr key={u._id} className="transition-colors hover:bg-ink-50/60">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={u.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{u.name}</p>
                      <p className="truncate text-xs text-ink-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <Badge variant={u.role === "admin" ? "brand" : "default"}>{u.role}</Badge>
                </td>
                <td className="px-5 py-4">
                  <StatusPill status={u.accountStatus} />
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-ink-500">
                  {formatDate(u.createdAt)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-ink-500">
                  {formatDate(u.updatedAt)}
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setView(u)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      View
                    </Button>
                    {u.accountStatus === "suspended" ? (
                      <Button size="sm" variant="secondary" onClick={() => setTarget(u)}>
                        Reactivate
                      </Button>
                    ) : (
                      !isSelf(u) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger-600 hover:text-danger-700"
                          onClick={() => setTarget(u)}
                        >
                          Suspend
                        </Button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
          <LoadMore
            hasMore={Boolean(q.data?.meta?.hasMore)}
            isLoading={q.isFetching}
            onClick={() => setCursor(q.data.meta.nextCursor)}
          />
        </>
      )}
      <Drawer open={Boolean(view)} onClose={() => setView(null)} title="User profile">
        {view && (
          <div>
            <div className="flex items-center gap-3">
              <UserAvatar name={view.name} size="h-12 w-12 text-sm" />
              <div className="min-w-0">
                <p className="truncate font-bold">{view.name}</p>
                <p className="truncate text-sm text-ink-500">{view.email}</p>
              </div>
            </div>
            <dl className="mt-5">
              <DetailRow
                label="Role"
                value={<Badge variant={view.role === "admin" ? "brand" : "default"}>{view.role}</Badge>}
              />
              <DetailRow label="Status" value={<StatusPill status={view.accountStatus} />} />
              <DetailRow label="Email verified" value={view.emailVerified ? "Yes" : "No"} />
              <DetailRow label="Joined" value={formatDate(view.createdAt)} />
              <DetailRow label="Last updated" value={formatDate(view.updatedAt)} />
              <DetailRow label="User ID" value={shortId(view._id)} mono />
            </dl>
          </div>
        )}
      </Drawer>
      <Modal
        isOpen={Boolean(target)}
        onClose={() => setTarget(null)}
        title={target?.accountStatus === "suspended" ? "Reactivate account?" : "Suspend account?"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={target?.accountStatus === "suspended" ? "primary" : "danger"}
              isLoading={suspend.isPending}
              onClick={() => suspend.mutate()}
            >
              {target?.accountStatus === "suspended" ? "Reactivate" : "Suspend"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            {target?.accountStatus === "suspended"
              ? "This restores sign-in access. The user must create a new session."
              : "This immediately revokes all active sessions for this user."}
          </p>
          <Input
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Recorded in the audit log"
          />
          {suspend.error && <p className="text-sm text-danger-600">{suspend.error.message}</p>}
        </div>
      </Modal>
    </div>
  );
};

/* ------------------------------ companies ------------------------------ */

export const AdminOrganizations = () => {
  const { organizationId } = useParams(),
    navigate = useNavigate(),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [cursor, setCursor] = useState(null),
    [view, setView] = useState(null),
    debounced = useDebouncedValue(search, 300);
  const params = useMemo(
    () => ({
      search: debounced || undefined,
      status: status || undefined,
      limit: 100,
      after: cursor || undefined,
    }),
    [debounced, status, cursor],
  );
  const q = useQuery({
    queryKey: ["admin-organizations", params],
    queryFn: () => adminApi.organizations(params),
  });
  const rows = q.data?.data || [];
  const selected = view || rows.find((o) => String(o._id) === String(organizationId)) || null;
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Companies"
        title="Company Management"
        description="Review registered companies and their platform status without crossing tenant boundaries."
      />
      <FilterBar>
        <Input
          aria-label="Search companies"
          placeholder="Search by company name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xs"
        />
        <Select
          aria-label="Filter by status"
          placeholder="All statuses"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursor(null);
          }}
          options={ORG_STATUS_OPTIONS}
          className="lg:max-w-40"
        />
      </FilterBar>
      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <DataTable
            headers={["Company", "Industry", "Team Size", "Status", "Created", "Actions"]}
            empty={rows.length === 0}
            emptyLabel="No companies match your filters."
          >
            {rows.map((o) => (
              <tr key={o._id} className="transition-colors hover:bg-ink-50/60">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-950 text-xs font-bold text-white">
                      {initials(o.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{o.name}</p>
                      <p className="truncate text-xs text-ink-400">/{o.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="max-w-48 truncate px-5 py-4 text-ink-600">{o.industry || "—"}</td>
                <td className="whitespace-nowrap px-5 py-4 text-ink-600">{o.size || "—"}</td>
                <td className="px-5 py-4">
                  <StatusPill status={o.status} />
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-ink-500">
                  {formatDate(o.createdAt)}
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setView(o)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      View
                    </Button>
                    <Link
                      to={`/companies/${o.slug}`}
                      className="inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
                    >
                      Public page
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
          <LoadMore
            hasMore={Boolean(q.data?.meta?.hasMore)}
            isLoading={q.isFetching}
            onClick={() => setCursor(q.data.meta.nextCursor)}
          />
        </>
      )}
      <Drawer
        open={Boolean(selected)}
        onClose={() => {
          setView(null);
          if (organizationId) navigate("/app/admin/organizations", { replace: true });
        }}
        title="Company details"
      >
        {selected && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Overview</p>
            <dl className="mt-2">
              <DetailRow label="Name" value={selected.name} />
              <DetailRow label="Slug" value={`/${selected.slug}`} mono />
              <DetailRow label="Industry" value={selected.industry || "—"} />
              <DetailRow label="Team size" value={selected.size || "—"} />
              <DetailRow label="Timezone" value={selected.timezone || "—"} mono />
            </dl>
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-ink-400">
              Account status
            </p>
            <dl className="mt-2">
              <DetailRow label="Status" value={<StatusPill status={selected.status} />} />
              <DetailRow label="Created" value={formatDate(selected.createdAt)} />
              <DetailRow label="Last updated" value={formatDate(selected.updatedAt)} />
              <DetailRow label="Company ID" value={shortId(selected._id)} mono />
            </dl>
            <div className="mt-5">
              <Button as={Link} to={`/companies/${selected.slug}`} variant="secondary" size="sm">
                View public company page <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

/* ----------------------------- ai activity ----------------------------- */

export const AdminAIUsage = () => {
  const [feature, setFeature] = useState(""),
    [provider, setProvider] = useState(""),
    [org, setOrg] = useState(""),
    [view, setView] = useState(null);
  const q = useQuery({ queryKey: ["admin-ai-usage"], queryFn: adminApi.aiUsage });
  const activity = useQuery({
    queryKey: ["admin-ai-activity"],
    queryFn: () => adminApi.aiActivity({ limit: 8 }),
  });
  const rows = useMemo(() => q.data?.data || [], [q.data]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          runs: acc.runs + (row.runs || 0),
          fallbacks: acc.fallbacks + (row.fallbacks || 0),
          inputTokens: acc.inputTokens + (row.inputTokens || 0),
          outputTokens: acc.outputTokens + (row.outputTokens || 0),
          cost: acc.cost + (row.estimatedCostUsd || 0),
        }),
        { runs: 0, fallbacks: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
      ),
    [rows],
  );
  const byFeature = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      map.set(row._id.feature, (map.get(row._id.feature) || 0) + (row.runs || 0));
    }
    const list = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...list.map(([, runs]) => runs));
    return list.map(([key, runs]) => ({ key, runs, max }));
  }, [rows]);
  const featureOptions = [...new Set(rows.map((r) => r._id.feature))].map((f) => ({
    value: f,
    label: featureLabel(f),
  }));
  const providerOptions = [...new Set(rows.map((r) => r._id.provider))].map((p) => ({
    value: p,
    label: p,
  }));
  const orgOptions = [...new Set(rows.map((r) => r._id.organization).filter(Boolean))].map((o) => ({
    value: o,
    label: shortId(o),
  }));
  const filtered = rows
    .filter(
      (r) =>
        (!feature || r._id.feature === feature) &&
        (!provider || r._id.provider === provider) &&
        (!org || r._id.organization === org),
    )
    .sort((a, b) => b.runs - a.runs);
  const tokens = totals.inputTokens + totals.outputTokens;
  const activityItems = (activity.data?.data || []).map((run) => ({
    title: featureLabel(run.feature),
    meta: `${run.user?.name || "Platform user"}${
      run.organization?.name ? ` · ${run.organization.name}` : ""
    } · ${run.fallbackUsed ? "fallback response" : "AI response"}`,
    tone: run.status === "failed" ? "danger" : run.fallbackUsed ? "warning" : "success",
    time: run.createdAt,
  }));
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="AI"
        title="AI Activity"
        description="Monitor how AI features are being used across HireSmart. Fallback responses are labeled separately from AI completions."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Total AI Runs" value={totals.runs} icon={Cpu} />
        <Kpi
          label="Successful Runs"
          value={totals.runs - totals.fallbacks}
          tone="success"
          icon={Sparkles}
        />
        <Kpi label="Fallbacks" value={totals.fallbacks} icon={ShieldAlert} />
        <Kpi
          label="Tokens Used"
          value={tokens > 0 ? tokens.toLocaleString("en-IN") : "Not available"}
          icon={Cpu}
        />
        <Kpi
          label="Estimated Cost"
          value={totals.cost > 0 ? `$${totals.cost.toFixed(4)}` : "Not available"}
          tone="brand"
          icon={Cpu}
        />
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Usage by feature" description="Share of total AI runs">
          {q.isLoading ? (
            <LoadingState />
          ) : byFeature.length ? (
            <ul className="space-y-3">
              {byFeature.map(({ key, runs, max }) => (
                <li key={key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-ink-800">{featureLabel(key)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-500">
                      {runs} run{runs === 1 ? "" : "s"} ·{" "}
                      {totals.runs > 0 ? Math.round((runs / totals.runs) * 100) : 0}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400"
                      style={{ width: `${Math.max(4, (runs / max) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">
              No AI runs recorded yet. Usage appears here as AI features are used.
            </p>
          )}
        </SectionCard>
        <SectionCard title="Recent AI activity" description="Latest runs, newest first">
          {activity.isLoading ? (
            <LoadingState />
          ) : activity.error ? (
            <ErrorState
              title="Couldn't load AI activity."
              error={activity.error}
              onRetry={() => activity.refetch()}
            />
          ) : activityItems.length ? (
            <ActivityFeed items={activityItems} />
          ) : (
            <p className="text-sm text-ink-500">
              No AI activity yet. Runs appear here as AI features are used across the platform.
            </p>
          )}
        </SectionCard>
      </div>
      <div className="mt-6">
        <FilterBar>
          <Select
            aria-label="Filter by feature"
            placeholder="All features"
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            options={featureOptions}
            className="lg:max-w-56"
          />
          <Select
            aria-label="Filter by provider"
            placeholder="All providers"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            options={providerOptions}
            className="lg:max-w-40"
          />
          <Select
            aria-label="Filter by organization"
            placeholder="All organizations"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            options={orgOptions}
            className="lg:max-w-44"
          />
        </FilterBar>
        {q.isLoading ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            headers={[
              "Feature",
              "Provider",
              "Model",
              "Organization",
              "Runs",
              "Fallbacks",
              "Tokens",
              "Est. Cost",
              "",
            ]}
            empty={filtered.length === 0}
            emptyLabel="No AI activity recorded for these filters yet."
          >
            {filtered.map((row) => {
              const tokensRow = (row.inputTokens || 0) + (row.outputTokens || 0);
              return (
                <tr
                  key={JSON.stringify(row._id)}
                  className="cursor-pointer transition-colors hover:bg-ink-50/60"
                  onClick={() => setView(row)}
                >
                  <td className="max-w-52 truncate px-5 py-4 font-semibold">
                    {featureLabel(row._id.feature)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-ink-600">{row._id.provider}</td>
                  <td className="max-w-40 truncate px-5 py-4 text-ink-500">{row._id.model}</td>
                  <td className="px-5 py-4 font-mono text-xs text-ink-500">
                    {row._id.organization ? shortId(row._id.organization) : "Platform"}
                  </td>
                  <td className="px-5 py-4 tabular-nums">{row.runs}</td>
                  <td className="px-5 py-4">
                    <span className="tabular-nums">{row.fallbacks}</span>
                    {row.runs > 0 && (
                      <span className="ml-1 text-xs text-ink-400">
                        ({Math.round((row.fallbacks / row.runs) * 100)}%)
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 tabular-nums text-ink-500">
                    {tokensRow > 0 ? tokensRow.toLocaleString("en-IN") : "—"}
                  </td>
                  <td className="px-5 py-4 tabular-nums text-ink-500">
                    {(row.estimatedCostUsd || 0) > 0
                      ? `$${Number(row.estimatedCostUsd).toFixed(4)}`
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-ink-300">
                    <ArrowRight className="h-4 w-4" />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
        <p className="mt-3 text-xs text-ink-400">
          Token and cost figures come from provider-reported usage. Deterministic fallback runs do
          not report usage and show as “—”.
        </p>
      </div>
      <Drawer open={Boolean(view)} onClose={() => setView(null)} title="AI operation details">
        {view && (
          <dl>
            <DetailRow label="Feature" value={featureLabel(view._id.feature)} />
            <DetailRow label="Provider" value={view._id.provider} />
            <DetailRow label="Model" value={view._id.model} mono />
            <DetailRow
              label="Organization"
              value={view._id.organization ? shortId(view._id.organization) : "Platform"}
              mono
            />
            <DetailRow label="Runs" value={view.runs} />
            <DetailRow label="Fallbacks" value={view.fallbacks} />
            <DetailRow
              label="AI completion rate"
              value={
                view.runs > 0
                  ? `${Math.round(((view.runs - view.fallbacks) / view.runs) * 100)}%`
                  : "—"
              }
            />
            <DetailRow
              label="Input tokens"
              value={
                (view.inputTokens || 0) > 0
                  ? view.inputTokens.toLocaleString("en-IN")
                  : "Not reported"
              }
            />
            <DetailRow
              label="Output tokens"
              value={
                (view.outputTokens || 0) > 0
                  ? view.outputTokens.toLocaleString("en-IN")
                  : "Not reported"
              }
            />
            <DetailRow
              label="Estimated cost"
              value={
                (view.estimatedCostUsd || 0) > 0
                  ? `$${Number(view.estimatedCostUsd).toFixed(4)}`
                  : "Not reported"
              }
            />
            <DetailRow
              label="Avg latency"
              value={
                view.averageLatencyMs ? `${Math.round(view.averageLatencyMs)} ms` : "Not reported"
              }
            />
          </dl>
        )}
      </Drawer>
    </div>
  );
};

/* --------------------------- security & audit --------------------------- */

const TAB_COPY = {
  security: "Important account and security-related events that may require attention.",
  audit: "A record of important actions performed across the platform.",
};

export const AdminSecurity = () => {
  const [tab, setTab] = useState("security"),
    [severity, setSeverity] = useState(""),
    [search, setSearch] = useState(""),
    [cursor, setCursor] = useState(null),
    [view, setView] = useState(null),
    debounced = useDebouncedValue(search, 300);
  const params = useMemo(
    () => ({
      severity: tab === "security" ? severity || undefined : undefined,
      search: debounced || undefined,
      limit: 100,
      after: cursor || undefined,
    }),
    [tab, severity, debounced, cursor],
  );
  const q = useQuery({
    queryKey: [`admin-${tab}`, params],
    queryFn: () =>
      tab === "security" ? adminApi.security(params) : adminApi.audit(params),
    enabled: Boolean(tab),
  });
  const rows = q.data?.data || [];
  const filtered = Boolean(severity || debounced);
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Security"
        title="Security & Audit"
        description="Operational evidence from platform security events and the administrative audit log."
      />
      <div className="mb-3 flex gap-2" role="tablist" aria-label="Security views">
        <Button
          variant={tab === "security" ? "primary" : "secondary"}
          onClick={() => {
            setTab("security");
            setCursor(null);
          }}
        >
          <ShieldAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Security Events
        </Button>
        <Button
          variant={tab === "audit" ? "primary" : "secondary"}
          onClick={() => {
            setTab("audit");
            setCursor(null);
          }}
        >
          <ScrollText className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Audit Log
        </Button>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-ink-500">{TAB_COPY[tab]}</p>
      <FilterBar>
        <Input
          aria-label={tab === "security" ? "Search security events" : "Search audit log"}
          placeholder={tab === "security" ? "Search by event type" : "Search by action or resource"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xs"
        />
        {tab === "security" && (
          <Select
            aria-label="Filter by severity"
            placeholder="All severities"
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value);
              setCursor(null);
            }}
            options={SEVERITY_OPTIONS}
            className="lg:max-w-40"
          />
        )}
      </FilterBar>
      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        tab === "security" ? (
          <EmptyState
            icon={ShieldCheck}
            title={
              filtered
                ? "No security events match your filters."
                : "No security events recorded yet."
            }
            description={
              filtered
                ? "Try a different severity or search term."
                : "Security events appear here when the platform detects important account activity — for example a failed sign-in, a password change or a reused session token."
            }
          />
        ) : (
          <EmptyState
            icon={ScrollText}
            title={filtered ? "No audit entries match your filters." : "No audit activity yet."}
            description={
              filtered
                ? "Try a different search term."
                : "Administrative actions — job approvals, suspensions, configuration changes — are recorded here as they happen."
            }
          />
        )
      ) : (
        <>
          <DataTable
            headers={
              tab === "security"
                ? ["Event", "Severity", "Context", "Status", "Time", ""]
                : ["Who", "What", "Where", "When", "Result", ""]
            }
          >
            {rows.map((x) => (
              <tr
                key={x._id}
                className="cursor-pointer transition-colors hover:bg-ink-50/60"
                onClick={() => setView(x)}
              >
                {tab === "security" ? (
                  <>
                    <td className="max-w-72 px-5 py-4">
                      <p className="truncate font-semibold">{humanizeAction(x.type)}</p>
                      {x.requestId && (
                        <p className="truncate font-mono text-xs text-ink-400">{x.requestId}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <SeverityBadge severity={x.severity} />
                    </td>
                    <td className="max-w-44 truncate px-5 py-4 text-ink-600">
                      {x.user?.name || x.organization?.name || "—"}
                    </td>
                    <td className="px-5 py-4">
                      {x.resolvedAt ? (
                        <Badge variant="success">Resolved</Badge>
                      ) : (
                        <Badge variant="outline">Open</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-ink-500">
                      {formatRelativeTime(x.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-ink-300">
                      <ArrowRight className="h-4 w-4" />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="max-w-40 truncate px-5 py-4 font-semibold">
                      {x.actor?.name || "System"}
                    </td>
                    <td className="max-w-72 px-5 py-4">
                      <p className="truncate font-semibold">{humanizeAction(x.action)}</p>
                      <p className="truncate text-xs text-ink-400">
                        {x.resourceType}
                        {x.resourceId ? ` · ${shortId(x.resourceId)}` : ""}
                      </p>
                    </td>
                    <td className="max-w-40 truncate px-5 py-4 text-ink-600">
                      {x.organization?.name || "Platform"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-ink-500">
                      {formatRelativeTime(x.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        variant={
                          x.outcome === "success"
                            ? "success"
                            : x.outcome === "denied"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {x.outcome === "success"
                          ? "Successful"
                          : x.outcome === "denied"
                            ? "Denied"
                            : "Failed"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-ink-300">
                      <ArrowRight className="h-4 w-4" />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </DataTable>
          <LoadMore
            hasMore={Boolean(q.data?.meta?.hasMore)}
            isLoading={q.isFetching}
            onClick={() => setCursor(q.data.meta.nextCursor)}
          />
        </>
      )}
      <Drawer
        open={Boolean(view)}
        onClose={() => setView(null)}
        title={tab === "security" ? "Security event" : "Audit entry"}
      >
        {view && (
          <dl>
            {tab === "security" ? (
              <>
                <DetailRow label="Event" value={humanizeAction(view.type)} />
                <DetailRow label="Severity" value={<SeverityBadge severity={view.severity} />} />
                <DetailRow label="Status" value={view.resolvedAt ? "Resolved" : "Open"} />
                <DetailRow label="User" value={view.user?.name || "—"} />
                <DetailRow label="Organization" value={view.organization?.name || "—"} />
                <DetailRow
                  label="Raised"
                  value={`${formatDate(view.createdAt)} · ${formatRelativeTime(view.createdAt)}`}
                />
                {view.resolvedAt && (
                  <DetailRow
                    label="Resolved"
                    value={`${formatDate(view.resolvedAt)} · ${formatRelativeTime(view.resolvedAt)}`}
                  />
                )}
                {view.requestId && <DetailRow label="Request ID" value={view.requestId} mono />}
                {view.ipHash && <DetailRow label="IP hash" value={view.ipHash} mono />}
                {view.details && Object.keys(view.details).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                      Technical details
                    </p>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink-50 p-3 text-xs text-ink-700">
                      {JSON.stringify(view.details, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <>
                <DetailRow label="Who" value={view.actor?.name || "System"} />
                {view.actor?.email && <DetailRow label="Actor email" value={view.actor.email} mono />}
                <DetailRow label="What" value={humanizeAction(view.action)} />
                <DetailRow
                  label="Resource"
                  value={`${view.resourceType}${view.resourceId ? ` · ${shortId(view.resourceId)}` : ""}`}
                  mono
                />
                <DetailRow label="Where" value={view.organization?.name || "Platform"} />
                <DetailRow
                  label="Result"
                  value={
                    <Badge
                      variant={
                        view.outcome === "success"
                          ? "success"
                          : view.outcome === "denied"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {view.outcome === "success"
                        ? "Successful"
                        : view.outcome === "denied"
                          ? "Denied"
                          : "Failed"}
                    </Badge>
                  }
                />
                <DetailRow
                  label="When"
                  value={`${formatDate(view.createdAt)} · ${formatRelativeTime(view.createdAt)}`}
                />
                {view.requestId && <DetailRow label="Request ID" value={view.requestId} mono />}
                {view.metadata && Object.keys(view.metadata).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                      Technical details
                    </p>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink-50 p-3 text-xs text-ink-700">
                      {JSON.stringify(view.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            )}
          </dl>
        )}
      </Drawer>
    </div>
  );
};
