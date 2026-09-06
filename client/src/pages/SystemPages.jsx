import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  FileText,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Video,
} from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { EmptyState, ErrorState, SkeletonList } from "../components/ui/States";
import { ErrorCallout, PageHeader } from "../components/Product";
import { authApi, downloadBlob, notificationApi, userApi } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useToast } from "../components/ui/useToast";
import { formatDate, formatRelativeTime, initials } from "../lib/utils";

const notificationIcon = (title = "") => {
  const t = title.toLowerCase();
  if (t.includes("interview")) return Video;
  if (t.includes("application") || t.includes("apply") || t.includes("resume")) return FileText;
  if (t.includes("offer") || t.includes("hired") || t.includes("job")) return BriefcaseBusiness;
  if (t.includes("security") || t.includes("password") || t.includes("suspend")) return ShieldCheck;
  return Bell;
};

/* Classifies real notification types/titles into portal categories. */
const CATEGORY_DEFS = [
  ["all", "All"],
  ["approvals", "Approvals"],
  ["security", "Security"],
  ["ai-system", "AI & System"],
  ["account", "Account"],
];
const categoryOf = (n) => {
  const t = `${n.type || ""} ${n.title || ""} ${n.message || ""}`.toLowerCase();
  if (t.includes("moderation") || t.includes("approv") || t.includes("job")) return "approvals";
  if (
    t.includes("security") ||
    t.includes("password") ||
    t.includes("session") ||
    t.includes("suspend") ||
    t.includes("deletion")
  )
    return "security";
  if (
    t.includes("ai ") ||
    t.includes("ai_") ||
    t.includes("analysis") ||
    t.includes("copilot") ||
    t.includes("system")
  )
    return "ai-system";
  return "account";
};

export const NotificationsPage = () => {
  const auth = useAuth(),
    qc = useQueryClient(),
    [category, setCategory] = useState("all"),
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
  const items = q.data?.data || [];
  const filtered = category === "all" ? items : items.filter((n) => categoryOf(n) === category);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="page-wrap max-w-4xl">
      <PageHeader
        eyebrow="Updates"
        title="Notifications"
        description="Everything about approvals, security, AI activity and your account — in one place."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => all.mutate()}
            isLoading={all.isPending}
            disabled={unread === 0}
          >
            Mark all read
          </Button>
        }
      />
      <div
        className="mb-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Notification categories"
      >
        {CATEGORY_DEFS.map(([key, label]) => {
          const count =
            key === "all" ? items.length : items.filter((n) => categoryOf(n) === key).length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={category === key}
              onClick={() => setCategory(key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                category === key
                  ? "bg-ink-950 text-white"
                  : "bg-ink-50 text-ink-600 hover:bg-ink-100"
              }`}
            >
              {label}
              {count > 0 && (
                <span
                  className={`ml-1.5 text-xs ${category === key ? "text-ink-300" : "text-ink-400"}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : filtered.length ? (
        <div className="space-y-3">
          {filtered.map((n) => {
            const Icon = notificationIcon(n.title);
            const isUnread = !n.readAt;
            const related =
              auth.role === "admin" && n.type === "job_moderation"
                ? { to: "/app/admin/moderation", label: "Review approvals" }
                : null;
            return (
              <button
                key={n._id}
                onClick={() => isUnread && read.mutate(n._id)}
                className={`panel flex w-full items-start gap-4 p-5 text-left transition-colors ${
                  isUnread ? "border-brand-200 bg-brand-50/30" : "hover:bg-ink-50/60"
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    isUnread ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{n.title}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      {categoryOf(n) === "ai-system" ? "AI & System" : categoryOf(n)}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-ink-600">{n.message}</span>
                  <span className="mt-2 flex items-center gap-3 text-xs text-ink-400">
                    {formatRelativeTime(n.createdAt)}
                    {related && (
                      <Link
                        to={related.to}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-brand-600 hover:text-brand-700"
                      >
                        {related.label}
                      </Link>
                    )}
                  </span>
                </span>
                {isUnread && (
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="panel p-10">
          <EmptyState
            icon={category === "all" ? Bell : CheckCircle2}
            title={
              category === "all"
                ? "You're all caught up"
                : `No ${CATEGORY_DEFS.find(([k]) => k === category)?.[1].toLowerCase()} notifications`
            }
            description={
              category === "all"
                ? "New approvals, security alerts and account updates will appear here."
                : "When something happens in this category it will show up here."
            }
            action={
              category !== "all" ? (
                <Button variant="secondary" size="sm" onClick={() => setCategory("all")}>
                  View all notifications
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
    </div>
  );
};

const SectionLabel = ({ children }) => (
  <p className="mb-3 mt-8 text-[11px] font-bold uppercase tracking-widest text-ink-400 first:mt-0">
    {children}
  </p>
);

export const SettingsPage = () => {
  const auth = useAuth(),
    toast = useToast(),
    [password, setPassword] = useState({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    }),
    [deleteOpen, setDeleteOpen] = useState(false),
    sessions = useQuery({ queryKey: ["sessions"], queryFn: authApi.sessions }),
    consents = useQuery({ queryKey: ["consents"], queryFn: userApi.consents }),
    change = useMutation({
      mutationFn: () =>
        authApi.changePassword({
          currentPassword: password.currentPassword,
          newPassword: password.newPassword,
        }),
      onSuccess: () => {
        toast.success("Password updated");
        setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
      },
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
  const canSavePassword =
    password.currentPassword.length > 0 &&
    password.newPassword.length >= 12 &&
    password.newPassword === password.confirmPassword;
  return (
    <div className="page-wrap max-w-5xl">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your account, security, AI data permissions and data lifecycle."
      />
      <SectionLabel>Account</SectionLabel>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="font-bold">Profile</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
                {initials(auth.user?.displayName)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {auth.user?.displayName || auth.user?.name}
                </p>
                <p className="truncate text-sm text-ink-500">{auth.user?.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-ink-50 p-4">
              <p className="text-sm font-semibold">Account role</p>
              <Badge variant="brand">{(auth.workspaceRole || "").replace("_", " ") || "—"}</Badge>
            </div>
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="flex items-center gap-2 font-bold">
            <KeyRound className="h-4 w-4 text-brand-600" />
            Password & Login
          </h2>
          <div className="mt-4 space-y-3">
            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={password.currentPassword}
              onChange={(e) => setPassword((p) => ({ ...p, currentPassword: e.target.value }))}
            />
            <Input
              label="New password"
              type="password"
              minLength={12}
              hint="At least 12 characters"
              autoComplete="new-password"
              value={password.newPassword}
              onChange={(e) => setPassword((p) => ({ ...p, newPassword: e.target.value }))}
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={password.confirmPassword}
              onChange={(e) => setPassword((p) => ({ ...p, confirmPassword: e.target.value }))}
              hint={
                password.confirmPassword.length > 0 &&
                password.confirmPassword !== password.newPassword
                  ? "Passwords do not match"
                  : "Enter the new password again"
              }
            />
            <Button
              disabled={!canSavePassword}
              isLoading={change.isPending}
              onClick={() => change.mutate()}
            >
              Update Password
            </Button>
            {change.error && <ErrorCallout error={change.error} />}
            {change.isSuccess && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-success-600">
                <CheckCircle2 className="h-4 w-4" />
                Password updated successfully
              </p>
            )}
          </div>
        </section>
      </div>
      <SectionLabel>Security</SectionLabel>
      <section className="panel p-6">
        <h2 className="font-bold">Active Sessions</h2>
        <p className="mt-2 text-sm text-ink-500">
          Devices currently signed in to your account. Revoke any session you do not recognize.
        </p>
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
                    Last used {formatRelativeTime(s.lastUsedAt)} · expires {formatDate(s.expiresAt)}
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
      <SectionLabel>AI & Data</SectionLabel>
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
            const active = consents.data?.data?.some((c) => c.purpose === purpose && !c.revokedAt);
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
      <SectionLabel>Data</SectionLabel>
      <div className="grid gap-6 lg:grid-cols-2">
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
          <h2 className="flex items-center gap-2 font-bold text-danger-700">
            <ShieldAlert className="h-4 w-4" />
            Delete Account
          </h2>
          <p className="mt-2 text-sm text-danger-700/80">
            This signs you out, revokes all sessions and starts the account deletion process. It
            cannot be undone.
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
        description="This is permanent. You will be signed out immediately and all your data is scheduled for deletion."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => remove.mutate()} isLoading={remove.isPending}>
              I understand — delete my account
            </Button>
          </>
        }
      >
        Referenced hiring records may be retained according to policy. If this is a mistake, cancel
        now — there is no way to restore the account later.
      </Modal>
    </div>
  );
};
