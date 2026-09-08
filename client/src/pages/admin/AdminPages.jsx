import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  BriefcaseBusiness,
  Clock3,
  Cpu,
  Eye,
  ShieldAlert,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Select } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { ErrorState, LoadingState, SkeletonList } from "../../components/ui/States";
import { PageHeader, Metric, StatusPill } from "../../components/Product";
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
import { useDebouncedValue } from "../../hooks/useApi";
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
const FEATURE_LABELS = {
  recruiter_copilot: "AI Assistant (Recruiter)",
  career_copilot: "Career Assistant",
  resume_improvement: "Resume Improvement",
  interview_preparation: "Interview Preparation",
  jd_improvement: "Job Description Assist",
  resume_analysis: "Resume Analysis",
  candidate_matching: "Candidate Matching",
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
  const highRisk = (security.data?.data || []).filter(
    (e) => e.severity === "high" || e.severity === "critical",
  );
  const totalRuns = (ai.data?.data || []).reduce((sum, row) => sum + (row.runs || 0), 0);
  const candidates = userList.filter((u) => u.role === "candidate").length;
  const recruiters = userList.filter((u) => u.role === "recruiter").length;
  const suspended = userList.filter((u) => u.accountStatus === "suspended").length;
  const activityItems = (audit.data?.data || []).slice(0, 8).map((a) => ({
    title: humanizeAction(a.action),
    meta: `${a.resourceType} · ${a.outcome}`,
    tone:
      a.outcome === "failure" || a.outcome === "error"
        ? "danger"
        : String(a.action).includes("suspend")
          ? "warning"
          : "brand",
    time: a.createdAt,
  }));
  const quickActions = [
    ["Review Approvals", "/app/admin/moderation"],
    ["Manage Users", "/app/admin/users"],
    ["Manage Companies", "/app/admin/organizations"],
    ["AI Activity", "/app/admin/ai-usage"],
    ["Security Events", "/app/admin/security"],
  ];
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Platform"
        title="Admin Overview"
        description="Monitor users, companies, recruitment activity and platform health."
      />
      {loading ? (
        <SkeletonList />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi
              label="Total Users"
              value={userList.length}
              icon={UsersRound}
              detail={`${candidates} candidates · ${recruiters} recruiters`}
            />
            <Kpi label="Companies" value={orgList.length} icon={Building2} />
            <Kpi
              label="Active Jobs"
              value={publishedJobs.data?.meta?.count ?? publishedJobs.data?.data?.length ?? "—"}
              icon={BriefcaseBusiness}
              detail="Published on platform"
            />
            <Kpi
              label="Pending Approvals"
              value={pending.data?.data?.length || 0}
              tone={pending.data?.data?.length ? "warning" : "ink"}
              icon={Clock3}
              detail={pending.data?.data?.length ? "Awaiting review" : "All clear"}
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
          <div className="mt-4 flex flex-wrap gap-2">
            {quickActions.map(([label, to]) => (
              <Button key={to} as={Link} to={to} size="sm" variant="secondary">
                {label}
              </Button>
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
                  View all
                </Link>
              }
            >
              <div className="space-y-3">
                {(pending.data?.data || []).slice(0, 3).map((job) => (
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
                          <span className="truncate">{humanizeAction(e.type)}</span>
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
          <SectionCard title="Platform Health" tone="dark" className="mt-6">
            {ready.isLoading ? (
              <p className="text-sm text-ink-400">Checking…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(ready.data?.data?.checks || {}).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between rounded-xl bg-white/6 p-4"
                  >
                    <span className="text-sm text-ink-100">{humanizeAction(k)}</span>
                    <StatusPill status={v} />
                  </div>
                ))}
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
        title="Users"
        description="Manage candidates, recruiters and platform accounts. Suspension revokes sessions immediately."
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
              <DetailRow label="Role" value={view.role} />
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
        title="Companies"
        description="Inspect registered companies and their platform state without crossing tenant boundaries."
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
            headers={["Company", "Industry", "Status", "Created", "Actions"]}
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
                <td className="px-5 py-4">
                  <StatusPill status={o.status} />
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-ink-500">
                  {formatDate(o.createdAt)}
                </td>
                <td className="px-5 py-4">
                  <Button size="sm" variant="ghost" onClick={() => setView(o)}>
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    View
                  </Button>
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
          <dl>
            <DetailRow label="Name" value={selected.name} />
            <DetailRow label="Slug" value={`/${selected.slug}`} mono />
            <DetailRow label="Industry" value={selected.industry || "—"} />
            <DetailRow label="Size" value={selected.size || "—"} />
            <DetailRow label="Timezone" value={selected.timezone || "—"} mono />
            <DetailRow label="Status" value={<StatusPill status={selected.status} />} />
            <DetailRow label="Created" value={formatDate(selected.createdAt)} />
            <DetailRow label="Last updated" value={formatDate(selected.updatedAt)} />
            <DetailRow label="Company ID" value={shortId(selected._id)} mono />
          </dl>
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
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="AI"
        title="AI Activity"
        description="How often AI features ran across the platform. Fallback responses are labeled separately from AI completions."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Metric label="Total AI Runs" value={totals.runs} icon={Cpu} />
        <Metric
          label="Successful Runs"
          value={totals.runs - totals.fallbacks}
          tone="success"
          icon={Sparkles}
        />
        <Metric label="Fallbacks" value={totals.fallbacks} icon={ShieldAlert} />
        <Metric
          label="Tokens Used"
          value={tokens > 0 ? tokens.toLocaleString("en-IN") : "Not available"}
          icon={Cpu}
        />
        <Metric
          label="Estimated Cost"
          value={totals.cost > 0 ? `$${totals.cost.toFixed(4)}` : "Not available"}
          tone="brand"
          icon={Cpu}
        />
      </div>
      <div className="mt-5">
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

export const AdminSecurity = () => {
  const [tab, setTab] = useState("security"),
    [severity, setSeverity] = useState(""),
    [search, setSearch] = useState(""),
    [cursor, setCursor] = useState(null),
    [view, setView] = useState(null);
  const params = useMemo(
    () => ({ severity: severity || undefined, limit: 100, after: cursor || undefined }),
    [severity, cursor],
  );
  const q = useQuery({
    queryKey: [`admin-${tab}`, params],
    queryFn: () =>
      tab === "security"
        ? adminApi.security(params)
        : adminApi.audit({ limit: 100, after: cursor || undefined }),
  });
  const rows = (q.data?.data || []).filter((x) => {
    if (!search) return true;
    const hay = `${x.type || ""} ${x.action || ""} ${x.resourceType || ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Security"
        title="Security & Audit"
        description="Operational evidence from platform security events and the administrative audit log."
      />
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Security views">
        <Button
          variant={tab === "security" ? "primary" : "secondary"}
          onClick={() => setTab("security")}
        >
          Security Events
        </Button>
        <Button variant={tab === "audit" ? "primary" : "secondary"} onClick={() => setTab("audit")}>
          Audit Log
        </Button>
      </div>
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
      ) : (
        <>
          <DataTable
            headers={
              tab === "security"
                ? ["Event", "Severity", "Status", "Time", ""]
                : ["Action", "Resource", "Result", "Time", ""]
            }
            empty={rows.length === 0}
            emptyLabel={
              tab === "security"
                ? "No security events for these filters."
                : "No audit entries for these filters."
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
                    <td className="max-w-72 px-5 py-4">
                      <p className="truncate font-semibold">{humanizeAction(x.action)}</p>
                    </td>
                    <td className="px-5 py-4 text-ink-600">
                      {x.resourceType}
                      {x.resourceId ? (
                        <span className="ml-1 font-mono text-xs text-ink-400">
                          {shortId(x.resourceId)}
                        </span>
                      ) : null}
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
                        {x.outcome}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-ink-500">
                      {formatRelativeTime(x.createdAt)}
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
                      Details
                    </p>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink-50 p-3 text-xs text-ink-700">
                      {JSON.stringify(view.details, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <>
                <DetailRow label="Action" value={humanizeAction(view.action)} />
                <DetailRow
                  label="Resource"
                  value={`${view.resourceType}${view.resourceId ? ` · ${shortId(view.resourceId)}` : ""}`}
                  mono
                />
                <DetailRow label="Result" value={view.outcome} />
                <DetailRow
                  label="Time"
                  value={`${formatDate(view.createdAt)} · ${formatRelativeTime(view.createdAt)}`}
                />
                {view.requestId && <DetailRow label="Request ID" value={view.requestId} mono />}
                {view.metadata && Object.keys(view.metadata).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                      Metadata
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
