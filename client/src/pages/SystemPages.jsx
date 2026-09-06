import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  FileText,
  ImagePlus,
  KeyRound,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRound,
  Video,
} from "lucide-react";
import Button from "../components/ui/Button";
import Input, { Textarea } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { EmptyState, ErrorState, SkeletonList } from "../components/ui/States";
import { ErrorCallout, PageHeader } from "../components/Product";
import { authApi, downloadBlob, notificationApi, userApi } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useToast } from "../components/ui/useToast";
import { formatDate, formatRelativeTime, initials, notificationTarget } from "../lib/utils";

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

const SectionLabel = ({ children }) => (
  <p className="mb-3 mt-8 text-[11px] font-bold uppercase tracking-widest text-ink-400 first:mt-0">
    {children}
  </p>
);

/* ------------------------------ profile form ------------------------------ */

const PREF_CATEGORIES = [
  ["applications", "Applications", "Application confirmations and status updates."],
  ["interviews", "Interviews", "Interview invitations, confirmations and schedule changes."],
  ["jobs", "Jobs", "Job approval, rejection and review updates."],
  ["candidates", "Candidates", "New applications and candidate updates."],
];

const formFrom = (u) =>
  u
    ? {
        name: u.displayName || "",
        phone: u.phone || "",
        headline: u.headline || "",
        location: u.location || "",
        bio: u.bio || "",
        skills: (u.skills || []).join(", "),
        companyName: u.companyName || "",
        companyWebsite: u.companyWebsite || "",
        linkedin: u.socialLinks?.linkedin || "",
        github: u.socialLinks?.github || "",
        portfolio: u.socialLinks?.portfolio || "",
      }
    : null;

const ProfileSection = ({ auth, onSaved }) => {
  const toast = useToast(),
    [form, setForm] = useState(() => formFrom(auth.user)),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(null),
    [photo, setPhoto] = useState(null),
    [photoBusy, setPhotoBusy] = useState(false),
    [emailBusy, setEmailBusy] = useState(false),
    [emailSent, setEmailSent] = useState(false),
    [newEmail, setNewEmail] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await userApi.updateProfile({
        name: form.name,
        phone: form.phone,
        headline: form.headline,
        location: form.location,
        bio: form.bio,
        skills: form.skills
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        companyName: form.companyName,
        companyWebsite: form.companyWebsite,
        socialLinks: {
          linkedin: form.linkedin,
          github: form.github,
          portfolio: form.portfolio,
        },
      });
      toast.success("Profile saved");
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };
  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    try {
      await userApi.uploadAvatar(file);
      toast.success("Photo updated");
      setPhoto(Date.now());
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = async () => {
    setPhotoBusy(true);
    setError(null);
    try {
      await userApi.removeAvatar();
      toast.success("Photo removed");
      setPhoto(Date.now());
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setPhotoBusy(false);
    }
  };
  const changeEmail = async () => {
    setEmailBusy(true);
    setError(null);
    try {
      await authApi.changeEmail(newEmail.trim());
      toast.success(`Confirmation email sent to ${newEmail.trim()}`);
      setEmailSent(true);
      setNewEmail("");
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setEmailBusy(false);
    }
  };
  return (
    <section className="panel p-6">
      <h2 className="font-bold">Profile</h2>
      <p className="mt-1 text-sm text-ink-500">
        How you appear to hiring teams and on your applications.
      </p>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {auth.user?.profileImage ? (
              <img
                key={photo || "current"}
                src={auth.user.profileImage}
                alt=""
                className="h-24 w-24 rounded-full object-cover ring-2 ring-ink-100"
              />
            ) : (
              <span className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-2xl font-bold text-white">
                {initials(auth.user?.displayName)}
              </span>
            )}
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={uploadPhoto}
              disabled={photoBusy}
            />
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 ${
                photoBusy ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <ImagePlus className="h-4 w-4" />
              {photoBusy ? "Working…" : "Upload photo"}
            </span>
          </label>
          {auth.user?.profileImage && (
            <button
              type="button"
              onClick={removePhoto}
              disabled={photoBusy}
              className="text-xs font-semibold text-danger-600 hover:underline disabled:opacity-50"
            >
              Remove photo
            </button>
          )}
          <p className="max-w-32 text-center text-[11px] text-ink-400">
            JPG, PNG or WebP · up to 2 MB
          </p>
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <Input label="Full name" value={form.name} onChange={set("name")} />
          <Input
            label="Phone"
            value={form.phone}
            onChange={set("phone")}
            placeholder="+91 98765 43210"
          />
          <Input
            label="Professional headline"
            value={form.headline}
            onChange={set("headline")}
            placeholder="e.g. Frontend developer, 4 years"
          />
          <Input
            label="Location"
            value={form.location}
            onChange={set("location")}
            placeholder="City"
          />
          <Input
            label="Skills"
            value={form.skills}
            onChange={set("skills")}
            placeholder="React, TypeScript, Node.js"
            hint="Separate with commas"
          />
          <Input
            label={auth.role === "candidate" ? "Current company" : "Company"}
            value={form.companyName}
            onChange={set("companyName")}
          />
          <Input
            label="LinkedIn"
            value={form.linkedin}
            onChange={set("linkedin")}
            placeholder="https://linkedin.com/in/you"
          />
          <Input
            label="GitHub"
            value={form.github}
            onChange={set("github")}
            placeholder="https://github.com/you"
          />
          <div className="sm:col-span-2">
            <Input
              label="Portfolio / website"
              value={form.portfolio}
              onChange={set("portfolio")}
              placeholder="https://your-portfolio.com"
            />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              label="About you"
              value={form.bio}
              onChange={set("bio")}
              rows={3}
              placeholder="A short introduction for hiring teams"
            />
          </div>
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorCallout error={error} />
        </div>
      )}
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} isLoading={saving}>
          Save Changes
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setForm(formFrom(auth.user));
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      <div className="mt-6 rounded-xl bg-ink-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-brand-600" />
          Email address
        </p>
        <p className="mt-1 text-sm text-ink-500">{auth.user?.email}</p>
        {auth.user?.pendingEmail && (
          <p className="mt-2 text-sm font-medium text-warning-700">
            Verification pending for {auth.user.pendingEmail}. Check that inbox to confirm the
            change.
          </p>
        )}
        {emailSent && !auth.user?.pendingEmail && (
          <p className="mt-2 text-sm font-medium text-success-600">
            A confirmation email was sent. The address changes once you verify it.
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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
            onClick={changeEmail}
            isLoading={emailBusy}
            disabled={!newEmail.includes("@")}
            className="shrink-0"
          >
            Change Email
          </Button>
        </div>
      </div>
    </section>
  );
};

const PrefsSection = ({ auth, onSaved }) => {
  const toast = useToast(),
    [prefs, setPrefs] = useState(() => auth.user?.notificationPrefs || {});
  const setPref = (category, channel) => {
    const value = !prefs[category]?.[channel];
    setPrefs((p) => ({ ...p, [category]: { ...p[category], [channel]: value } }));
    userApi
      .updateNotificationPrefs({ [category]: { [channel]: value } })
      .then(() => {
        onSaved();
        toast.success("Preference saved");
      })
      .catch(() => toast.error("Could not save the preference"));
  };
  return (
    <section className="panel p-6">
      <h2 className="font-bold">Notification Preferences</h2>
      <p className="mt-1 text-sm text-ink-500">
        Choose how you hear about updates. Security and account alerts are always on.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-105 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-ink-400">
              <th className="pb-2 pr-4 font-semibold">Category</th>
              <th className="pb-2 pr-4 font-semibold">In-app</th>
              <th className="pb-2 font-semibold">Email</th>
            </tr>
          </thead>
          <tbody>
            {PREF_CATEGORIES.map(([key, label, copy]) => (
              <tr key={key} className="border-t border-ink-100">
                <td className="py-3 pr-4">
                  <p className="font-semibold">{label}</p>
                  <p className="text-xs text-ink-500">{copy}</p>
                </td>
                {["inApp", "email"].map((channel) => (
                  <td key={channel} className="py-3 pr-4">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(prefs[key]?.[channel])}
                      onClick={() => setPref(key, channel)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        prefs[key]?.[channel] ? "bg-brand-600" : "bg-ink-200"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                          prefs[key]?.[channel] ? "left-5.5" : "left-0.5"
                        }`}
                      />
                      <span className="sr-only">
                        {channel === "inApp" ? "In-app" : "Email"} notifications for {label}
                      </span>
                    </button>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-ink-100">
              <td className="py-3 pr-4">
                <p className="font-semibold">Account & security</p>
                <p className="text-xs text-ink-500">
                  Password changes and security alerts. Always delivered.
                </p>
              </td>
              <td className="py-3 pr-4 text-xs font-bold text-success-600">Always on</td>
              <td className="py-3 text-xs font-bold text-success-600">Always on</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
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
    <div className="mt-4 space-y-2">
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

/* ------------------------------ settings page ------------------------------ */

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
        description="Manage your profile, security, notification preferences and data."
      />
      <SectionLabel>Account</SectionLabel>
      {auth.user ? (
        <ProfileSection auth={auth} onSaved={auth.refresh} />
      ) : (
        <SkeletonList rows={3} />
      )}
      <SectionLabel>Security</SectionLabel>
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
        <section className="panel p-6">
          <h2 className="flex items-center gap-2 font-bold">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            Active Sessions
          </h2>
          <p className="mt-2 text-sm text-ink-500">
            Devices currently signed in. Revoke any session you do not recognize.
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
          <h3 className="mt-6 font-semibold">Security activity</h3>
          <SecurityActivity />
        </section>
      </div>
      <SectionLabel>Preferences</SectionLabel>
      {auth.user ? <PrefsSection auth={auth} onSaved={auth.refresh} /> : <SkeletonList rows={3} />}
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
