import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  Download,
  FileText,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import Button from "../components/ui/Button";
import Input, { Select } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, SkeletonList } from "../components/ui/States";
import { ErrorCallout, Metric, PageHeader, StatusPill } from "../components/Product";
import { adminApi, authApi, downloadBlob, notificationApi, userApi } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useToast } from "../components/ui/useToast";
import { formatDate, formatRelativeTime } from "../lib/utils";
const notificationIcon = (title = "") => {
  const t = title.toLowerCase();
  if (t.includes("interview")) return Video;
  if (t.includes("application") || t.includes("apply") || t.includes("resume")) return FileText;
  if (t.includes("offer") || t.includes("hired") || t.includes("job")) return BriefcaseBusiness;
  if (t.includes("security") || t.includes("password") || t.includes("suspend")) return ShieldCheck;
  return Bell;
};
export const NotificationsPage = () => {
  const qc = useQueryClient(),
    q = useQuery({
      queryKey: ["notifications", {}],
      queryFn: () => notificationApi.list({ limit: 100 }),
    }),
    read = useMutation({
      mutationFn: notificationApi.read,
      onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    }),
    all = useMutation({
      mutationFn: notificationApi.readAll,
      onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    });
  return (
    <div className="page-wrap max-w-4xl">
      <PageHeader
        eyebrow="Updates"
        title="Notifications"
        description="Everything about your applications, interviews and account — in one place."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => all.mutate()}
            isLoading={all.isPending}
          >
            Mark all read
          </Button>
        }
      />
      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : q.data?.data?.length ? (
        <div className="space-y-3">
          {q.data.data.map((n) => (
            <button
              key={n._id}
              onClick={() => !n.readAt && read.mutate(n._id)}
              className={`panel flex w-full items-start gap-4 p-5 text-left ${!n.readAt ? "border-brand-200 bg-brand-50/30" : ""}`}
            >
              {(() => {
                const Icon = notificationIcon(n.title);
                return (
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                      !n.readAt ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                );
              })()}
              <span className="flex-1">
                <span className="font-semibold">{n.title}</span>
                <span className="mt-1 block text-sm text-ink-600">{n.message}</span>
                <span className="mt-2 block text-xs text-ink-400">
                  {formatRelativeTime(n.createdAt)}
                </span>
              </span>
              {!n.readAt && <span className="mt-2 h-2.5 w-2.5 rounded-full bg-brand-500" />}
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="You're all caught up"
          description="New hiring updates will appear here."
        />
      )}
    </div>
  );
};
export const SettingsPage = () => {
  const auth = useAuth(),
    toast = useToast(),
    [password, setPassword] = useState({ currentPassword: "", newPassword: "" }),
    [deleteOpen, setDeleteOpen] = useState(false),
    sessions = useQuery({ queryKey: ["sessions"], queryFn: authApi.sessions }),
    consents = useQuery({ queryKey: ["consents"], queryFn: userApi.consents }),
    change = useMutation({
      mutationFn: () => authApi.changePassword(password),
      onSuccess: () => toast.success("Password updated"),
    }),
    revoke = useMutation({
      mutationFn: authApi.revokeSession,
      onSuccess: () => sessions.refetch(),
    }),
    consent = useMutation({
      mutationFn: ({ purpose, granted }) =>
        userApi.consent(purpose, { granted, policyVersion: "2026-08" }),
      onSuccess: () => consents.refetch(),
    }),
    remove = useMutation({
      mutationFn: () => userApi.remove("Requested from account settings"),
      onSuccess: () => auth.logout(),
    });
  return (
    <div className="page-wrap max-w-5xl">
      <PageHeader
        eyebrow="Account"
        title="Security & privacy"
        description="Manage sessions, consent and your data lifecycle."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="flex items-center gap-2 font-bold">
            <KeyRound className="h-4 w-4 text-brand-600" />
            Password & Login
          </h2>
          <div className="mt-4 space-y-3">
            <Input
              label="Current password"
              type="password"
              value={password.currentPassword}
              onChange={(e) => setPassword((p) => ({ ...p, currentPassword: e.target.value }))}
            />
            <Input
              label="New password"
              type="password"
              minLength={12}
              hint="At least 12 characters"
              value={password.newPassword}
              onChange={(e) => setPassword((p) => ({ ...p, newPassword: e.target.value }))}
            />
            <Button
              disabled={!password.currentPassword || password.newPassword.length < 12}
              isLoading={change.isPending}
              onClick={() => change.mutate()}
            >
              Update Password
            </Button>
            {change.error && <ErrorCallout error={change.error} />}
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="flex items-center gap-2 font-bold">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            AI & Data Permissions
          </h2>
          <p className="mt-2 text-sm text-ink-500">
            Choose how your information is used. You can change this at any time.
          </p>
          <div className="mt-4 space-y-3">
            {[
              {
                purpose: "ai_processing",
                label: "AI Processing",
                copy: "Let AI analyze your resume and profile to generate matches and suggestions.",
              },
              {
                purpose: "talent_pool",
                label: "Talent Pool",
                copy: "Let companies you apply to see your profile in their talent pool.",
              },
              {
                purpose: "marketing",
                label: "Marketing",
                copy: "Receive product updates and news from HireSmart.",
              },
            ].map(({ purpose, label, copy }) => {
              const active = consents.data?.data?.some(
                (c) => c.purpose === purpose && !c.revokedAt,
              );
              return (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 p-4"
                  key={purpose}
                >
                  <div>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-ink-500">{copy}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={active ? "secondary" : "primary"}
                    onClick={() => consent.mutate({ purpose, granted: !active })}
                  >
                    {active ? "Revoke" : "Grant"}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel p-6 lg:col-span-2">
          <h2 className="font-bold">Active Sessions</h2>
          <div className="mt-4 space-y-3">
            {sessions.data?.data?.length ? (
              sessions.data.data.map((s) => (
                <div
                  className="flex flex-col gap-3 rounded-xl bg-ink-50 p-4 sm:flex-row sm:items-center"
                  key={s.id}
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {s.userAgent || "Unknown device"}{" "}
                      {s.current && <Badge variant="success">current</Badge>}
                    </p>
                    <p className="text-xs text-ink-500">
                      Last used {formatRelativeTime(s.lastUsedAt)} · expires{" "}
                      {formatDate(s.expiresAt)}
                    </p>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="danger" onClick={() => revoke.mutate(s.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-500">No active sessions.</p>
            )}
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="font-bold">Export Your Data</h2>
          <p className="mt-2 text-sm text-ink-500">
            Download a JSON copy of your profile, resumes and applications.
          </p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={async () => downloadBlob(await userApi.exportData(), "hiresmart-export.json")}
            leftIcon={<Download className="h-4 w-4" />}
          >
            Export My Data
          </Button>
        </section>
        <section className="rounded-2xl border border-danger-500/20 bg-danger-50 p-6">
          <h2 className="font-bold text-danger-700">Delete Account</h2>
          <p className="mt-2 text-sm text-danger-700/80">
            This signs you out, revokes all sessions and starts the account deletion process.
          </p>
          <Button
            className="mt-4"
            variant="danger"
            onClick={() => setDeleteOpen(true)}
            leftIcon={<Trash2 className="h-4 w-4" />}
          >
            Request deletion
          </Button>
        </section>
      </div>
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Request account deletion?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => remove.mutate()} isLoading={remove.isPending}>
              Delete account
            </Button>
          </>
        }
      >
        You will be signed out immediately. Referenced hiring records may be retained according to
        policy.
      </Modal>
    </div>
  );
};
export const AdminHome = () => {
  const users = useQuery({
      queryKey: ["admin-users", {}],
      queryFn: () => adminApi.users({ limit: 100 }),
    }),
    orgs = useQuery({
      queryKey: ["admin-organizations", {}],
      queryFn: () => adminApi.organizations({ limit: 100 }),
    }),
    security = useQuery({
      queryKey: ["admin-security", {}],
      queryFn: () => adminApi.security({ limit: 20 }),
    }),
    ready = useQuery({ queryKey: ["health-ready"], queryFn: adminApi.ready, retry: false });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Platform"
        title="Platform Overview"
        description="Live platform health, security signals and growth at a glance."
      />
      <div className="panel grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total Users" value={users.data?.data?.length || 0} />
        <Metric label="Companies" value={orgs.data?.data?.length || 0} />
        <Metric label="Security Events" value={security.data?.data?.length || 0} />
        <Metric
          label="Readiness"
          value={ready.data?.data?.status || "unknown"}
          tone={ready.data?.data?.status === "ready" ? "success" : "ink"}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="font-bold">Recent security events</h2>
          <div className="mt-4 space-y-3">
            {security.data?.data?.slice(0, 8).map((e) => (
              <div className="flex gap-3 rounded-xl bg-ink-50 p-4" key={e._id}>
                <ShieldAlert className="h-4 w-4 text-warning-700" />
                <div>
                  <p className="text-sm font-semibold">{e.type}</p>
                  <p className="text-xs text-ink-500">
                    {e.severity} · {formatRelativeTime(e.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl bg-ink-950 p-6 text-white">
          <h2 className="font-bold">Health checks</h2>
          {Object.entries(ready.data?.data?.checks || {}).map(([k, v]) => (
            <div className="mt-3 flex justify-between rounded-xl bg-white/6 p-4" key={k}>
              <span>{k}</span>
              <StatusPill status={v} />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};
export const AdminUsers = () => {
  const [status, setStatus] = useState(""),
    q = useQuery({
      queryKey: ["admin-users", status],
      queryFn: () => adminApi.users({ status, limit: 100 }),
    }),
    [target, setTarget] = useState(null),
    suspend = useMutation({
      mutationFn: () =>
        target.accountStatus === "suspended"
          ? adminApi.reactivate(target._id, "Reactivated by platform administrator")
          : adminApi.suspend(target._id, "Suspended by platform administrator"),
      onSuccess: () => {
        q.refetch();
        setTarget(null);
      },
    });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Users"
        title="Manage Users"
        description="Suspension revokes sessions; reactivation restores access without restoring old sessions."
      />
      <Select
        className="mb-5 max-w-xs"
        placeholder="All statuses"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        options={["active", "pending_verification", "suspended", "deletion_pending"].map((x) => ({
          value: x,
          label: x.replace("_", " "),
        }))}
      />
      {q.isLoading ? (
        <SkeletonList />
      ) : (
        <div className="space-y-3">
          {q.data?.data?.map((u) => (
            <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center" key={u._id}>
              <div className="flex-1">
                <p className="font-semibold">{u.name}</p>
                <p className="text-sm text-ink-500">
                  {u.email} · {u.role}
                </p>
              </div>
              <StatusPill status={u.accountStatus} />
              <Button
                size="sm"
                variant={u.accountStatus === "suspended" ? "secondary" : "danger"}
                onClick={() => setTarget(u)}
              >
                {u.accountStatus === "suspended" ? "Reactivate" : "Suspend"}
              </Button>
            </div>
          ))}
        </div>
      )}
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
        {target?.accountStatus === "suspended"
          ? "This restores sign-in access. The user must create a new session."
          : "This immediately revokes active sessions."}
      </Modal>
    </div>
  );
};
export const AdminOrganizations = () => {
  const q = useQuery({
    queryKey: ["admin-organizations", {}],
    queryFn: () => adminApi.organizations({ limit: 100 }),
  });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Companies"
        title="Manage Companies"
        description="Inspect organization state without crossing tenant boundaries."
      />
      {q.isLoading ? (
        <SkeletonList />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data?.data?.map((o) => (
            <article className="panel p-5" key={o._id}>
              <div className="flex justify-between">
                <Building2 className="h-5 w-5 text-brand-600" />
                <StatusPill status={o.status} />
              </div>
              <h2 className="mt-4 text-lg font-bold">{o.name}</h2>
              <p className="text-sm text-ink-500">
                {o.industry || "Industry not set"} · {o.size}
              </p>
              <p className="mt-4 font-mono text-xs text-ink-400">{o._id}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
export const AdminAIUsage = () => {
  const q = useQuery({ queryKey: ["admin-ai-usage"], queryFn: adminApi.aiUsage });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="AI"
        title="AI Activity"
        description="Provider, model, fallback, token, latency and estimated cost telemetry across organizations."
      />
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {q.data?.data?.map((x) => (
            <article className="panel p-5" key={JSON.stringify(x._id)}>
              <Sparkles className="h-5 w-5 text-brand-600" />
              <h2 className="mt-3 font-bold">{x._id.feature}</h2>
              <p className="mt-1 text-sm text-ink-500">
                {x._id.provider} · {x._id.model}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-ink-400">
                Org {x._id.organization || "none"}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Metric label="Runs" value={x.runs} />
                <Metric label="Fallbacks" value={x.fallbacks} />
                <Metric label="Input tokens" value={x.inputTokens || 0} />
                <Metric
                  label="Est. cost"
                  value={`$${Number(x.estimatedCostUsd || 0).toFixed(4)}`}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
export const AdminSecurity = () => {
  const [tab, setTab] = useState("security"),
    q = useQuery({
      queryKey: [`admin-${tab}`, {}],
      queryFn: () =>
        tab === "security" ? adminApi.security({ limit: 100 }) : adminApi.audit({ limit: 100 }),
    });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Security"
        title="Security & Audit"
        description="Operational evidence from backend security and audit records."
      />
      <div className="mb-5 flex gap-2">
        <Button
          variant={tab === "security" ? "primary" : "secondary"}
          onClick={() => setTab("security")}
        >
          Security events
        </Button>
        <Button variant={tab === "audit" ? "primary" : "secondary"} onClick={() => setTab("audit")}>
          Audit log
        </Button>
      </div>
      <div className="space-y-3">
        {q.data?.data?.map((x) => (
          <article
            className="panel flex flex-col gap-2 p-5 sm:flex-row sm:items-center"
            key={x._id}
          >
            <div className="flex-1">
              <p className="font-semibold">{x.type || x.action}</p>
              <p className="text-xs text-ink-500">
                {x.resourceType} {x.resourceId} · {formatDate(x.createdAt)}
              </p>
            </div>
            {x.severity && (
              <Badge variant={x.severity === "critical" ? "danger" : "warning"}>{x.severity}</Badge>
            )}
            {x.outcome && <StatusPill status={x.outcome} />}
          </article>
        ))}
      </div>
    </div>
  );
};
export const AdminModeration = () => {
  const toast = useToast(),
    qc = useQueryClient(),
    [status, setStatus] = useState("pending"),
    [target, setTarget] = useState(null),
    [reason, setReason] = useState(""),
    q = useQuery({
      queryKey: ["moderation-jobs", status],
      queryFn: () => adminApi.moderation({ status, limit: 50 }),
    }),
    act = useMutation({
      mutationFn: ({ jobId, action }) =>
        adminApi.moderate(jobId, action, action === "reject" ? reason : undefined),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["moderation-jobs"] });
        toast.success(target?.action === "approve" ? "Job approved" : "Job rejected");
        setTarget(null);
        setReason("");
      },
      onError: (error) => toast.error(error.message),
    });
  return (
    <div className="page-wrap max-w-5xl">
      <PageHeader
        eyebrow="Approvals"
        title="Job Approval Queue"
        description="Approve or reject listings for organizations with approval enabled — or use the platform override on any job."
      />
      <div className="mb-4 flex gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${status === s ? "bg-ink-950 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"}`}
          >
            {s}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="space-y-3">
          {q.data.data.map((job) => (
            <div key={job.id} className="panel flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-56 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{job.title}</p>
                  <StatusPill status={job.moderation.status} />
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  {job.company} · {job.location} · {job.workplaceMode} ·{" "}
                  {job.organization?.name || "Unknown org"}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  Skills: {job.requiredSkills?.join(", ") || "—"}
                </p>
                {job.moderation.reason && (
                  <p className="mt-1 text-xs text-red-600">Reason: {job.moderation.reason}</p>
                )}
              </div>
              {status === "pending" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setTarget({ jobId: job.id, action: "approve" })}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => setTarget({ jobId: job.id, action: "reject" })}
                  >
                    Reject
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-ink-400">
                  Reviewed {formatRelativeTime(job.moderation.reviewedAt)}
                </span>
              )}
            </div>
          ))}
          {!q.data.data.length && (
            <EmptyState
              title={`No ${status} jobs`}
              description="New submissions will appear here."
            />
          )}
        </div>
      )}
      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={target?.action === "reject" ? "Reject job" : "Approve job"}
      >
        {target?.action === "reject" ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              The organization owner will be notified. A reason helps them fix the listing.
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
            The job becomes visible on public search and the company page immediately.
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
