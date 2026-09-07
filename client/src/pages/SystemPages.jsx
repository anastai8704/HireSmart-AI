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
  Sparkles,
  UserRound,
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
import { cn, formatDate, formatRelativeTime, notificationTarget } from "../lib/utils";

const notificationIcon = (n) => {
  const t = `${n?.type || ""} ${n?.title || ""}`.toLowerCase();
  if (t.includes("interview")) return Video;
  if (t.includes("application") || t.includes("resume") || t.includes("apply")) return FileText;
  if (t.includes("job") || t.includes("offer") || t.includes("hired")) return BriefcaseBusiness;
  if (
    t.includes("security") ||
    t.includes("password") ||
    t.includes("suspend") ||
    t.includes("email")
  )
    return ShieldCheck;
  if (t.includes("profile") || t.includes("account")) return UserRound;
  return Bell;
};

/* Role-appropriate filters. Categories come from the backend notification
   record (n.category) with a text fallback for older notifications. */
const CATEGORY_DEFS = {
  candidate: [
    ["all", "All"],
    ["applications", "Applications"],
    ["interviews", "Interviews"],
    ["account", "Account"],
  ],
  recruiter: [
    ["all", "All"],
    ["jobs", "Jobs"],
    ["candidates", "Candidates"],
    ["interviews", "Interviews"],
    ["account", "Account"],
  ],
  admin: [
    ["all", "All"],
    ["approvals", "Approvals"],
    ["security", "Security"],
    ["platform", "Platform"],
    ["account", "Account"],
  ],
};
const legacyCategory = (n) => {
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
  if (t.includes("interview")) return "interviews";
  if (t.includes("application") || t.includes("resume") || t.includes("candidate"))
    return "candidates";
  return "account";
};
const categoryOf = (n) => n.category || legacyCategory(n);

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
  const roleKey = auth.role === "admin" ? "admin" : auth.organizationId ? "recruiter" : "candidate";
  const defs = CATEGORY_DEFS[roleKey];
  const items = q.data?.data || [];
  const filtered = category === "all" ? items : items.filter((n) => categoryOf(n) === category);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="page-wrap max-w-4xl">
      <PageHeader
        eyebrow="Updates"
        title="Notifications"
        description="Everything that needs your attention — applications, interviews, approvals and your account."
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
        {defs.map(([key, label]) => {
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
            const Icon = notificationIcon(n);
            const isUnread = !n.readAt;
            const related = notificationTarget(auth, n);
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
                      {defs.find(([key]) => key === categoryOf(n))?.[1] || "Account"}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-ink-600">{n.message}</span>
                  <span className="mt-2 flex items-center gap-3 text-xs text-ink-400">
                    {formatRelativeTime(n.createdAt)}
                    {related && (
                      <Link
                        to={related.to}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isUnread) read.mutate(n._id);
                        }}
                        className="font-semibold text-brand-600 hover:text-brand-700"
                      >
                        {related.label} →
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
                : `No ${defs.find(([key]) => key === category)?.[1].toLowerCase()} notifications`
            }
            description={
              category === "all"
                ? "Application updates, interviews, approvals and account changes will appear here."
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

/* ------------------------------ settings page ------------------------------ */


const SectionCard = ({ title, icon: Icon, description, children, tone }) => (
  <section
    className={cn(
      "panel p-6",
      tone === "danger" && "border-danger-500/20 bg-danger-50",
    )}
  >
    <h2
      className={cn(
        "flex items-center gap-2 font-bold",
        tone === "danger" && "text-danger-700",
      )}
    >
      {Icon && (
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-xl",
            tone === "danger" ? "bg-danger-100 text-danger-600" : "bg-brand-50 text-brand-700",
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
      )}
      {title}
    </h2>
    {description && (
      <p className={cn("mt-2 text-sm", tone === "danger" ? "text-danger-700/80" : "text-ink-500")}>
        {description}
      </p>
    )}
    <div className="mt-5">{children}</div>
  </section>
);

const ToggleRow = ({ label, copy, active, onToggle, busy }) => (
  <div className="flex items-center justify-between gap-4 rounded-xl bg-ink-50 p-4">
    <div className="min-w-0">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-0.5 text-xs text-ink-500">{copy}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        active ? "bg-brand-600" : "bg-ink-200"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          active ? "left-5.5" : "left-0.5"
        }`}
      />
    </button>
  </div>
);

const PREF_CATEGORY_DEFS = [
  ["applications", "Applications", "Confirmations, withdrawals and status updates."],
  ["interviews", "Interviews", "Invitations, confirmations and schedule changes."],
  ["jobs", "Jobs", "Approval, rejection and review updates."],
  ["candidates", "Candidates", "New applications and candidate updates."],
];
const PREFS_BY_ROLE = {
  candidate: ["applications", "interviews", "jobs"],
  recruiter: ["jobs", "candidates", "interviews", "applications"],
  admin: ["jobs", "candidates", "interviews", "applications"],
};

const PrefsSection = ({ auth }) => {
  const toast = useToast(),
    roleKey = auth.role === "admin" ? "admin" : auth.role === "candidate" ? "candidate" : "recruiter",
    categories = PREFS_BY_ROLE[roleKey].map((key) => PREF_CATEGORY_DEFS.find(([k]) => k === key)),
    [prefs, setPrefs] = useState(() => auth.user?.notificationPrefs || {}),
    [busyKey, setBusyKey] = useState(null);
  const setPref = (category, channel) => {
    const value = !prefs[category]?.[channel];
    setPrefs((p) => ({ ...p, [category]: { ...p[category], [channel]: value } }));
    setBusyKey(`${category}:${channel}`);
    userApi
      .updateNotificationPrefs({ [category]: { [channel]: value } })
      .then(() => toast.success("Preference saved"))
      .catch(() => toast.error("Could not save the preference"))
      .finally(() => setBusyKey(null));
  };
  return (
    <SectionCard
      title="Notification preferences"
      icon={Bell}
      description="Choose how you hear about updates. Security and account alerts are always delivered."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-105 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-ink-400">
              <th className="pb-2 pr-4 font-semibold">Category</th>
              <th className="pb-2 pr-4 font-semibold">In-app</th>
              <th className="pb-2 font-semibold">Email</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(([key, label, copy]) => (
              <tr key={key} className="border-t border-ink-100">
                <td className="py-3 pr-4">
                  <p className="font-semibold">{label}</p>
                  <p className="text-xs text-ink-500">{copy}</p>
                </td>
                {["inApp", "email"].map((channel) => (
                  <td key={channel} className="py-3 pr-4">
                    <ToggleRow
                      label={`${label} ${channel === "inApp" ? "in-app" : "email"}`}
                      active={Boolean(prefs[key]?.[channel])}
                      busy={busyKey === `${key}:${channel}`}
                      onToggle={() => setPref(key, channel)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-ink-100">
              <td className="py-3 pr-4">
                <p className="font-semibold">Account &amp; security</p>
                <p className="text-xs text-ink-500">
                  Password changes and security alerts. Always delivered.
                </p>
              </td>
              <td className="py-3 pr-4 text-xs font-bold text-success-600">Always on</td>
              <td className="py-3 text-xs font-bold text-success-600">Always on</td>
            </tr>
            {auth.role === "admin" && (
              <tr className="border-t border-ink-100">
                <td className="py-3 pr-4">
                  <p className="font-semibold">Approvals &amp; platform</p>
                  <p className="text-xs text-ink-500">
                    Job approvals and platform events. Always delivered.
                  </p>
                </td>
                <td className="py-3 pr-4 text-xs font-bold text-success-600">Always on</td>
                <td className="py-3 text-xs font-bold text-success-600">Always on</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
};

const AccountSection = ({ auth }) => {
  const toast = useToast(),
    [info, setInfo] = useState(() => ({
      name: auth.user?.displayName || "",
      phone: auth.user?.phone || "",
    })),
    [newEmail, setNewEmail] = useState(""),
    [emailSent, setEmailSent] = useState(false);
  const saveInfo = useMutation({
    mutationFn: () => userApi.updateProfile({ name: info.name, phone: info.phone }),
    onSuccess: async () => {
      toast.success("Account information saved");
      await auth.refresh();
    },
    onError: (e) => toast.error(e.message || "Could not save"),
  });
  const changeEmail = useMutation({
    mutationFn: () => authApi.changeEmail(newEmail.trim()),
    onSuccess: () => {
      toast.success(`Confirmation email sent to ${newEmail.trim()}`);
      setEmailSent(true);
      setNewEmail("");
      auth.refresh();
    },
    onError: (e) => toast.error(e.message || "Could not request the change"),
  });
  return (
    <div className="space-y-6">
      <SectionCard
        title="Email address"
        icon={UserRound}
        description="Changing your email is confirmed from the new address — your old address stays active until then."
      >
        <p className="text-sm font-semibold">{auth.user?.email}</p>
        {auth.user?.pendingEmail && (
          <p className="mt-2 rounded-xl bg-warning-50 px-4 py-2.5 text-sm font-medium text-warning-700">
            Verification pending for {auth.user.pendingEmail}. Check that inbox to confirm the
            change.
          </p>
        )}
        {emailSent && !auth.user?.pendingEmail && (
          <p className="mt-2 rounded-xl bg-success-50 px-4 py-2.5 text-sm font-medium text-success-600">
            A confirmation email was sent. The address changes once you verify it.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="New email address"
            type="email"
            placeholder="new-address@example.com"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setEmailSent(false);
            }}
            className="sm:max-w-xs"
          />
          <Button
            variant="secondary"
            onClick={() => changeEmail.mutate()}
            isLoading={changeEmail.isPending}
            disabled={!newEmail.includes("@")}
            className="shrink-0"
          >
            Change Email
          </Button>
        </div>
      </SectionCard>
      <SectionCard
        title="Account information"
        icon={UserRound}
        description="The basic details on your account."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Display name"
            value={info.name}
            onChange={(e) => setInfo((i) => ({ ...i, name: e.target.value }))}
          />
          <Input
            label="Phone"
            value={info.phone}
            placeholder="+91 98765 43210"
            onChange={(e) => setInfo((i) => ({ ...i, phone: e.target.value }))}
          />
        </div>
        <div className="mt-4">
          <Button onClick={() => saveInfo.mutate()} isLoading={saveInfo.isPending}>
            Save changes
          </Button>
        </div>
      </SectionCard>
    </div>
  );
};

const SecurityActivity = () => {
  const q = useQuery({ queryKey: ["security-log"], queryFn: authApi.security });
  if (q.isLoading) return <SkeletonList rows={3} />;
  if (q.error)
    return <p className="text-sm text-ink-500">Security activity is unavailable right now.</p>;
  const items = q.data?.data || [];
  if (!items.length)
    return <p className="text-sm text-ink-500">No security activity recorded yet.</p>;
  const label = (type) => type.split(".").pop().replace(/_/g, " ");
  return (
    <div className="space-y-2">
      {items.slice(0, 6).map((e) => (
        <div
          key={e._id}
          className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-4 py-2.5"
        >
          <p className="text-sm font-medium capitalize">{label(e.type)}</p>
          <p className="text-xs text-ink-400">{formatDate(e.createdAt)}</p>
        </div>
      ))}
    </div>
  );
};

const SecuritySection = () => {
  const toast = useToast(),
    [password, setPassword] = useState({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    }),
    sessions = useQuery({ queryKey: ["sessions"], queryFn: authApi.sessions }),
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
      onSuccess: () => {
        toast.success("Session revoked");
        sessions.refetch();
      },
    }),
    revokeOthers = useMutation({
      mutationFn: () => authApi.revokeOtherSessions(),
      onSuccess: (r) => {
        toast.success(
          r?.data?.revoked
            ? `Signed out ${r.data.revoked} other session${r.data.revoked === 1 ? "" : "s"}`
            : "No other active sessions",
        );
        sessions.refetch();
      },
    });
  const canSavePassword =
    password.currentPassword.length > 0 &&
    password.newPassword.length >= 12 &&
    password.newPassword === password.confirmPassword;
  return (
    <div className="space-y-6">
      <SectionCard
        title="Change password"
        icon={KeyRound}
        description="Use at least 12 characters. Changing your password signs out your other sessions."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={password.currentPassword}
            onChange={(e) =>
              setPassword((p) => ({ ...p, currentPassword: e.target.value }))
            }
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
            onChange={(e) =>
              setPassword((p) => ({ ...p, confirmPassword: e.target.value }))
            }
            hint={
              password.confirmPassword.length > 0 &&
              password.confirmPassword !== password.newPassword
                ? "Passwords do not match"
                : "Enter the new password again"
            }
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button
            disabled={!canSavePassword}
            isLoading={change.isPending}
            onClick={() => change.mutate()}
          >
            Update Password
          </Button>
          {change.isSuccess && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-success-600">
              <CheckCircle2 className="h-4 w-4" /> Password updated successfully
            </p>
          )}
        </div>
        {change.error && (
          <div className="mt-3">
            <ErrorCallout error={change.error} />
          </div>
        )}
      </SectionCard>
      <SectionCard
        title="Active sessions"
        icon={ShieldCheck}
        description="Devices currently signed in. Revoke any session you do not recognize."
      >
        <div className="space-y-3">
          {sessions.data?.data?.length ? (
            sessions.data.data.map((s) => (
              <div
                className="flex flex-col gap-3 rounded-xl bg-ink-50 p-4 sm:flex-row sm:items-center"
                key={s.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {s.userAgent || "Unknown device"}{" "}
                    {s.current && <Badge variant="success">current</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
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
        {sessions.data?.data?.length > 1 && (
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => revokeOthers.mutate()}
              isLoading={revokeOthers.isPending}
            >
              Sign out other sessions
            </Button>
          </div>
        )}
        <h3 className="mb-3 mt-6 font-semibold">Security activity</h3>
        <SecurityActivity />
      </SectionCard>
    </div>
  );
};

const CONSENT_DEFS = [
  {
    purpose: "ai_processing",
    label: "AI processing",
    copy: "Let AI analyze your resume and profile to generate matches and suggestions.",
  },
  {
    purpose: "talent_pool",
    label: "Talent pool",
    copy: "Let companies you apply to see your profile in their talent pool.",
  },
  {
    purpose: "marketing",
    label: "Marketing",
    copy: "Receive product updates and news from HireSmart.",
  },
];

const PrivacySection = () => {
  const toast = useToast(),
    consents = useQuery({ queryKey: ["consents"], queryFn: userApi.consents }),
    [busyPurpose, setBusyPurpose] = useState(null);
  const setConsent = (purpose, granted) => {
    setBusyPurpose(purpose);
    userApi
      .consent(purpose, { granted, policyVersion: "2026-08" })
      .then(() => {
        toast.success(granted ? "Permission granted" : "Permission revoked");
        consents.refetch();
      })
      .catch(() => toast.error("Could not update the permission"))
      .finally(() => setBusyPurpose(null));
  };
  const isActive = (purpose) =>
    Boolean(consents.data?.data?.some((c) => c.purpose === purpose && !c.revokedAt));
  return (
    <div className="space-y-6">
      <SectionCard
        title="AI & data permissions"
        icon={Sparkles}
        description="Choose how your information is used. You can change this at any time — revoking a permission never deletes your data."
      >
        <div className="space-y-3">
          {CONSENT_DEFS.map(({ purpose, label, copy }) => (
            <ToggleRow
              key={purpose}
              label={label}
              copy={copy}
              active={isActive(purpose)}
              busy={busyPurpose === purpose}
              onToggle={() => setConsent(purpose, !isActive(purpose))}
            />
          ))}
        </div>
        <h3 className="mb-3 mt-6 font-semibold">Recorded permissions</h3>
        {consents.isLoading ? (
          <SkeletonList rows={2} />
        ) : (consents.data?.data?.length || 0) === 0 ? (
          <p className="text-sm text-ink-500">No permissions recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {consents.data.data
              .slice()
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
              .slice(0, 8)
              .map((c) => (
                <div
                  key={c._id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-4 py-2.5 text-sm"
                >
                  <span className="font-medium capitalize">
                    {c.purpose.replace(/_/g, " ")}
                    <span className="ml-2 text-xs font-normal text-ink-400">
                      policy {c.policyVersion}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      c.revokedAt ? "text-ink-400" : "text-success-600",
                    )}
                  >
                    {c.revokedAt ? "Revoked" : "Granted"} · {formatDate(c.createdAt)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

const DataSection = () => {
  const [busy, setBusy] = useState(false);
  const exportData = async () => {
    setBusy(true);
    try {
      downloadBlob(await userApi.exportData(), "hiresmart-export.json");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard
      title="Export your data"
      icon={Download}
      description="Download a JSON copy of your profile, resumes and applications."
    >
      <Button variant="secondary" onClick={exportData} isLoading={busy} leftIcon={<Download className="h-4 w-4" />}>
        Export My Data
      </Button>
    </SectionCard>
  );
};

export const SettingsPage = () => {
  const auth = useAuth(),
    [section, setSection] = useState("account"),
    [deleteOpen, setDeleteOpen] = useState(false),
    remove = useMutation({
      mutationFn: () => userApi.remove("Requested from account settings"),
      onSuccess: () => auth.logout(),
    });
  const nav = [
    ["account", "Account", "Email & account information", UserRound],
    ["security", "Security", "Password, sessions & activity", ShieldCheck],
    ["notifications", "Notifications", "Preferences by category", Bell],
    ["privacy", "Privacy & AI", "Permissions & data", Sparkles],
    ["data", "Data", "Export your data", Download],
    ["danger", "Danger zone", "Delete account", ShieldAlert],
  ];
  return (
    <div className="page-wrap max-w-6xl">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Security, preferences and data — your profile lives in My Profile."
      />
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:pb-0">
            {nav.map(([key, label, copy, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                aria-current={section === key ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors",
                  section === key
                    ? "bg-ink-950 font-semibold text-white shadow-sm"
                    : "font-medium text-ink-600 hover:bg-ink-100",
                  key === "danger" && section !== key && "text-danger-600 hover:bg-danger-50",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    section === key ? "text-white" : key === "danger" ? "" : "text-ink-400",
                  )}
                />
                <span className="whitespace-nowrap lg:whitespace-normal">
                  {label}
                  <span
                    className={cn(
                      "hidden text-xs font-normal lg:block",
                      section === key ? "text-ink-300" : "text-ink-400",
                    )}
                  >
                    {copy}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </nav>
        <div className="min-w-0">
          {section === "account" && (auth.user ? <AccountSection auth={auth} /> : <SkeletonList rows={3} />)}
          {section === "security" && <SecuritySection />}
          {section === "notifications" && (auth.user ? <PrefsSection auth={auth} /> : <SkeletonList rows={3} />)}
          {section === "privacy" && <PrivacySection />}
          {section === "data" && <DataSection />}
          {section === "danger" && (
            <SectionCard
              title="Delete account"
              icon={ShieldAlert}
              tone="danger"
              description="This signs you out, revokes all sessions and starts the account deletion process. It cannot be undone."
            >
              <Button
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                leftIcon={<ShieldAlert className="h-4 w-4" />}
              >
                Request deletion
              </Button>
            </SectionCard>
          )}
        </div>
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