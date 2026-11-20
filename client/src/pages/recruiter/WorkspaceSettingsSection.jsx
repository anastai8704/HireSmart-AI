import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Building2,
  CreditCard,
  Lock,
  Save,
  Sparkles,
  UsersRound,
} from "lucide-react";

import Button from "../../components/ui/Button";
import { Input, Select, Textarea } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import { ErrorState, SkeletonList } from "../../components/ui/States";
import { useToast } from "../../components/ui/useToast";
import { organizationApi, subscriptionApi } from "../../lib/api";
import { cn } from "../../lib/utils";

const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST · UTC+05:30)" },
  { value: "UTC", label: "UTC (Coordinated Universal Time · UTC+00:00)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT · UTC-05:00)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT · UTC-06:00)" },
  { value: "America/Denver", label: "America/Denver (MST/MDT · UTC-07:00)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT · UTC-08:00)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST · UTC+00:00)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST · UTC+01:00)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST · UTC+01:00)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST · UTC+04:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT · UTC+08:00)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST · UTC+09:00)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT · UTC+10:00)" },
];

const RETENTION_OPTIONS = [
  { value: "90", label: "90 days (3 months · rapid archival)" },
  { value: "180", label: "180 days (6 months)" },
  { value: "365", label: "365 days (1 year)" },
  { value: "730", label: "730 days (2 years · recommended)" },
  { value: "1095", label: "1095 days (3 years · enterprise)" },
];

const ToggleSwitch = ({ label, description, active, onChange, disabled }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-ink-100 last:border-b-0">
    <div>
      <p className="text-sm font-semibold text-ink-900">{label}</p>
      {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        active ? "bg-brand-600" : "bg-ink-200",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
          active ? "left-5.5" : "left-0.5",
        )}
      />
    </button>
  </div>
);

const WorkspaceSettingsForm = ({ org, organizationId, canManage, auth, currentPlan }) => {
  const toast = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState(() => ({
    name: org?.name || "",
    website: org?.website || "",
    about: org?.about || "",
    timezone: org?.timezone || "Asia/Kolkata",
    requireJobApproval: Boolean(org?.settings?.requireJobApproval),
    aiEnabled: org?.settings?.aiEnabled !== false,
    retentionDays: String(org?.settings?.retentionDays || 730),
  }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) {
        throw new Error("Company name is required");
      }
      // Update display fields (name, website, about, timezone)
      await organizationApi.update(organizationId, {
        name: form.name.trim(),
        website: form.website.trim(),
        about: form.about.trim(),
        timezone: form.timezone,
      });
      // Update workflow settings (requireJobApproval, aiEnabled, retentionDays)
      await organizationApi.settings(organizationId, {
        requireJobApproval: form.requireJobApproval,
        aiEnabled: form.aiEnabled,
        retentionDays: Number(form.retentionDays),
      });
    },
    onSuccess: async () => {
      toast.success("Workspace settings updated successfully");
      qc.invalidateQueries({ queryKey: ["organization-settings", organizationId] });
      qc.invalidateQueries({ queryKey: ["organization", organizationId] });
      if (typeof auth?.refresh === "function") {
        await auth.refresh();
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save workspace settings");
    },
  });

  return (
    <div className="space-y-6">
      {/* Role permission alert */}
      {!canManage && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-xs"
        >
          <Lock className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p>
            <span className="font-semibold">View-only workspace access:</span> You have view-only access to this
            organization's configuration. Only workspace owners and administrators can change organization
            profile details, hiring workflows, or retention policies.
          </p>
        </div>
      )}

      {/* Workspace Quick Hub Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Plan & Limits</span>
              <CreditCard className="h-4 w-4 text-brand-600" />
            </div>
            <p className="mt-2 text-lg font-bold text-ink-950 capitalize">{currentPlan.replace(/^(candidate|recruiter)_/, "")}</p>
            <p className="mt-1 text-xs text-ink-500">Manage plan tier, quotas, renewal and billing history.</p>
          </div>
          <div className="mt-4 pt-3 border-t border-ink-100">
            <Button
              as={Link}
              to={`/app/o/${organizationId}/billing`}
              variant="outline"
              size="sm"
              className="w-full text-xs"
            >
              Billing & Subscription →
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Team Members</span>
              <UsersRound className="h-4 w-4 text-brand-600" />
            </div>
            <p className="mt-2 text-lg font-bold text-ink-950">Hiring Team</p>
            <p className="mt-1 text-xs text-ink-500">Invite colleagues, assign recruiter roles and manage seats.</p>
          </div>
          <div className="mt-4 pt-3 border-t border-ink-100">
            <Button
              as={Link}
              to={`/app/o/${organizationId}/team`}
              variant="outline"
              size="sm"
              className="w-full text-xs"
            >
              Team Management →
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Verification</span>
              <BadgeCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-lg font-bold text-ink-950">Status</p>
              <Badge variant={org?.verificationStatus === "verified" ? "success" : "warning"}>
                {org?.verificationStatus || "Pending"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-ink-500">Company registration, GSTIN, and compliance documents.</p>
          </div>
          <div className="mt-4 pt-3 border-t border-ink-100">
            <Button
              as={Link}
              to={`/app/o/${organizationId}/verification`}
              variant="outline"
              size="sm"
              className="w-full text-xs"
            >
              Verification Details →
            </Button>
          </div>
        </div>
      </div>

      {/* Organization Profile & Regional Preferences */}
      <section aria-labelledby="workspace-profile-heading" className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
        <div className="border-b border-ink-100 pb-4">
          <h2 id="workspace-profile-heading" className="text-base font-bold text-ink-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand-600" />
            Workspace Profile & Regional Preferences
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Basic company details, website, and operating timezone for scheduling interviews and job expiry.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Company Name"
              required
              disabled={!canManage}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Apex Innovations Ltd."
            />
            <Input
              label="Website"
              disabled={!canManage}
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Workspace Timezone"
              disabled={!canManage}
              value={form.timezone}
              options={TIMEZONE_OPTIONS}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            />
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-700">Company Slug</label>
              <input
                type="text"
                disabled
                value={org?.slug || ""}
                className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2 text-sm text-ink-500 cursor-not-allowed"
              />
              <p className="mt-1 text-[11px] text-ink-400">Unique identifier for your organization workspace.</p>
            </div>
          </div>

          <Textarea
            label="About Company"
            disabled={!canManage}
            value={form.about}
            maxLength={2000}
            rows={3}
            onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
            placeholder="Brief overview of company mission, hiring culture and tech stack..."
          />
        </div>
      </section>

      {/* Hiring Workflow & Data Retention Governance */}
      <section aria-labelledby="workflow-settings-heading" className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
        <div className="border-b border-ink-100 pb-4">
          <h2 id="workflow-settings-heading" className="text-base font-bold text-ink-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-600" />
            Hiring Workflow & Data Governance
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Configure moderation rules, candidate AI insights, and compliance data retention policies.
          </p>
        </div>

        <div className="mt-4 divide-y divide-ink-100">
          <ToggleSwitch
            label="Require Job Approval before publishing"
            description="When enabled, any new requisition created by recruiters or hiring team members must be reviewed and approved by an administrator before it is published to candidates."
            active={form.requireJobApproval}
            disabled={!canManage}
            onChange={(val) => setForm((f) => ({ ...f, requireJobApproval: val }))}
          />

          <ToggleSwitch
            label="AI Insights & Candidate Matching"
            description="Enable semantic resume scoring, AI candidate comparison, and interactive interview copilot questions for your team."
            active={form.aiEnabled}
            disabled={!canManage}
            onChange={(val) => setForm((f) => ({ ...f, aiEnabled: val }))}
          />

          <div className="py-4">
            <div className="max-w-md">
              <Select
                label="Candidate Data Retention Policy"
                disabled={!canManage}
                value={form.retentionDays}
                options={RETENTION_OPTIONS}
                onChange={(e) => setForm((f) => ({ ...f, retentionDays: e.target.value }))}
              />
              <p className="mt-1 text-xs text-ink-500">
                Candidate applications, resume archives, and evaluator notes older than this threshold will be flagged for archival.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Save Action Bar */}
      {canManage && (
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            Save Workspace Settings
          </Button>
        </div>
      )}
    </div>
  );
};

export const WorkspaceSettingsSection = ({ auth }) => {
  const organizationId = auth?.organizationId;

  const canManage =
    !auth?.workspaceRole ||
    ["owner", "admin", "platform_admin"].includes(auth.workspaceRole);

  const orgQuery = useQuery({
    queryKey: ["organization-settings", organizationId],
    queryFn: () => organizationApi.get(organizationId),
    enabled: Boolean(organizationId),
  });

  const subQuery = useQuery({
    queryKey: ["workspace-sub-summary", organizationId],
    queryFn: () => subscriptionApi.current(organizationId),
    enabled: Boolean(organizationId),
  });

  if (!organizationId) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-ink-600">No active workspace selected.</p>
      </div>
    );
  }

  if (orgQuery.isLoading) {
    return <SkeletonList rows={4} />;
  }

  if (orgQuery.isError) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
        <ErrorState error={orgQuery.error} onRetry={orgQuery.refetch} />
      </div>
    );
  }

  const org = orgQuery.data?.data || {};
  const currentPlan =
    subQuery.data?.data?.subscription?.planName ||
    subQuery.data?.data?.entitlement?.tier ||
    "Free";

  return (
    <WorkspaceSettingsForm
      key={org._id || "workspace-form"}
      org={org}
      organizationId={organizationId}
      canManage={canManage}
      auth={auth}
      currentPlan={currentPlan}
    />
  );
};

export default WorkspaceSettingsSection;
