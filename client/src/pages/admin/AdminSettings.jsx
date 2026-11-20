// Admin Platform Settings & Policies Dashboard (Phase 4H)
// Strictly role-protected platform configuration, policies, feature flags, and append-only governance trail.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  UserCheck,
  Briefcase,
  CreditCard,
  Bell,
  Lock,
  ToggleLeft,
  ToggleRight,
  Save,
  AlertTriangle,
  History,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "../../components/Product";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { SkeletonList } from "../../components/ui/States";
import { adminApi } from "../../lib/api";
import { formatDateTime } from "../../lib/utils";
import * as toastModule from "../../components/ui/useToast";

const getSafeToast = () => {
  try {
    const fn = toastModule.useToast || toastModule.default;
    if (typeof fn === "function") return fn() || { success: () => {}, error: () => {} };
  } catch {
    // fallback
  }
  return { success: () => {}, error: () => {} };
};

const SECTIONS = [
  { id: "general", label: "General & Branding", icon: Settings, desc: "Platform name, support email, maintenance mode" },
  { id: "registration", label: "Registration Policies", icon: UserCheck, desc: "Account signup controls and email verification" },
  { id: "moderation", label: "Job Moderation", icon: Briefcase, desc: "Posting thresholds, auto-approval, keyword filters" },
  { id: "subscriptions", label: "Subscriptions & Plans", icon: CreditCard, desc: "Currencies, trial days, enforcement modes" },
  { id: "notifications", label: "Notifications", icon: Bell, desc: "System sender email and admin risk alerts" },
  { id: "security", label: "Security & Sessions", icon: Lock, desc: "Session timeouts, lockout rules, password policies" },
  { id: "features", label: "Feature Flags", icon: Sparkles, desc: "AI analyzers, fraud engine, external integrations" },
  { id: "audit", label: "Settings Audit Trail", icon: History, desc: "Historical record of administrator policy changes" },
];

export const AdminSettings = () => {
  const toast = getSafeToast();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState("general");
  const [formData, setFormData] = useState(null);

  // High-impact confirmation modal state
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [confirmReason, setConfirmReason] = useState("");

  // 1. Query Platform Settings
  const settingsQuery = useQuery({
    queryKey: ["admin-platform-settings"],
    queryFn: async () => {
      const res = await adminApi.platformSettings();
      const data = res?.data || {};
      setFormData(JSON.parse(JSON.stringify(data)));
      return data;
    },
  });

  // 2. Query Audit Log for Platform Settings changes
  const auditQuery = useQuery({
    queryKey: ["admin-platform-settings-audit"],
    queryFn: () => adminApi.audit({ search: "platform_settings", limit: 50 }),
    enabled: activeSection === "audit",
  });

  // Mutation to update settings
  const updateMutation = useMutation({
    mutationFn: (body) => adminApi.updatePlatformSettings(body),
    onSuccess: (res) => {
      toast.success(res.message || "Platform settings saved successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-platform-settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-platform-settings-audit"] });
      setPendingUpdate(null);
      setConfirmReason("");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update platform settings");
    },
  });

  const handleFieldChange = (section, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveSection = (sectionName) => {
    if (!formData || !formData[sectionName]) return;
    const sectionPayload = { [sectionName]: formData[sectionName] };

    // Check if high-impact setting is being changed
    const isMaintenanceToggled =
      sectionName === "general" &&
      formData.general?.maintenanceMode !== settingsQuery.data?.general?.maintenanceMode;
    const isSignupDisabled =
      sectionName === "registration" &&
      (!formData.registration?.allowCandidateSignup || !formData.registration?.allowRecruiterSignup);
    const isStrictLockout =
      sectionName === "subscriptions" &&
      formData.subscriptions?.enforcementMode === "strict_lockout";

    if (isMaintenanceToggled || isSignupDisabled || isStrictLockout) {
      setPendingUpdate({
        section: sectionName,
        payload: sectionPayload,
        isHighImpact: true,
        title: isMaintenanceToggled
          ? "Confirm Maintenance Mode Toggle"
          : isSignupDisabled
          ? "Confirm Registration Restriction"
          : "Confirm Strict Quota Lockout",
        description: isMaintenanceToggled
          ? "Changing maintenance mode alters access for all non-admin candidates and recruiters."
          : isSignupDisabled
          ? "Disabling signups will block new registrations on the platform."
          : "Strict lockout will immediately block features for tenants who exceed quotas.",
      });
      return;
    }

    // Normal update
    updateMutation.mutate(sectionPayload);
  };

  const handleConfirmHighImpact = (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!pendingUpdate) return;
    if (!confirmReason || confirmReason.trim().length < 4) {
      toast.error("Please enter a justification of at least 4 characters for this governance change");
      return;
    }
    updateMutation.mutate({
      ...pendingUpdate.payload,
      reason: confirmReason.trim(),
    });
  };

  const currentGeneral = formData?.general || {};
  const currentReg = formData?.registration || {};
  const currentMod = formData?.moderation || {};
  const currentSubs = formData?.subscriptions || {};
  const currentNotif = formData?.notifications || {};
  const currentSec = formData?.security || {};
  const currentFeat = formData?.features || {};

  return (
    <div className="page-wrap space-y-8">
      <PageHeader
        eyebrow="Platform Governance"
        title="Platform Settings & Governance"
        description="Configure platform policies, moderation thresholds, quota enforcement, security rules, and feature flags."
        action={
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={() => settingsQuery.refetch()}
              loading={settingsQuery.isFetching}
            >
              Reload Settings
            </Button>
          </div>
        }
      />

      {/* Main Settings Navigation & Body Layout */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Left Side: Navigation Links */}
        <div className="space-y-1 rounded-2xl border border-ink-100 bg-white p-3 shadow-xs">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                  isActive
                    ? "bg-ink-950 text-white shadow-xs"
                    : "text-ink-600 hover:bg-ink-50 hover:text-ink-950"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-ink-400"}`} />
                <span className="truncate">{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Side: Section Editor */}
        <div className="lg:col-span-3 space-y-6">
          {settingsQuery.isLoading || !formData ? (
            <SkeletonList />
          ) : (
            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-xs space-y-6">
              {/* SECTION 1: General & Branding */}
              {activeSection === "general" && (
                <div className="space-y-5">
                  <div className="border-b border-ink-100 pb-3">
                    <h2 className="text-base font-bold text-ink-900">General & Platform Branding</h2>
                    <p className="text-xs text-ink-500">Global identity, support routing, and maintenance status.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Platform Brand Name</label>
                      <input
                        type="text"
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentGeneral.platformName || ""}
                        onChange={(e) => handleFieldChange("general", "platformName", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Support Email</label>
                      <input
                        type="email"
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentGeneral.supportEmail || ""}
                        onChange={(e) => handleFieldChange("general", "supportEmail", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Platform Timezone</label>
                      <input
                        type="text"
                        disabled
                        className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-600"
                        value={currentGeneral.systemTimezone || "Asia/Kolkata"}
                      />
                      <p className="mt-1 text-[11px] text-ink-400">Fixed to IST (Asia/Kolkata) across platform analytics</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-ink-900">Maintenance Mode</h4>
                        <p className="text-xs text-ink-500">Temporarily restrict access while platform updates are deployed.</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Toggle maintenance mode"
                        onClick={() => handleFieldChange("general", "maintenanceMode", !currentGeneral.maintenanceMode)}
                        className={`text-xl font-semibold transition ${
                          currentGeneral.maintenanceMode ? "text-danger-600" : "text-ink-400 hover:text-ink-600"
                        }`}
                      >
                        {currentGeneral.maintenanceMode ? <ToggleRight className="h-7 w-7 text-danger-600" /> : <ToggleLeft className="h-7 w-7 text-ink-400" />}
                      </button>
                    </div>

                    {currentGeneral.maintenanceMode && (
                      <div>
                        <label className="block text-xs font-semibold text-ink-700">Maintenance Notice Message</label>
                        <textarea
                          rows={2}
                          className="mt-1 w-full rounded-lg border border-ink-200 p-2 text-xs focus:border-brand-500 focus:outline-none"
                          value={currentGeneral.maintenanceMessage || ""}
                          onChange={(e) => handleFieldChange("general", "maintenanceMessage", e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={Save}
                      onClick={() => handleSaveSection("general")}
                      loading={updateMutation.isPending}
                    >
                      Save General Settings
                    </Button>
                  </div>
                </div>
              )}

              {/* SECTION 2: Registration Policies */}
              {activeSection === "registration" && (
                <div className="space-y-5">
                  <div className="border-b border-ink-100 pb-3">
                    <h2 className="text-base font-bold text-ink-900">Registration & Account Policies</h2>
                    <p className="text-xs text-ink-500">Sign-up permissions, onboarding requirements, and verification rules.</p>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">Allow Candidate Signups</span>
                        <p className="text-xs text-ink-500">Permit job seekers to create candidate accounts.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentReg.allowCandidateSignup ?? true}
                        onChange={(e) => handleFieldChange("registration", "allowCandidateSignup", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">Allow Recruiter Signups</span>
                        <p className="text-xs text-ink-500">Permit employers to register new hiring accounts.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentReg.allowRecruiterSignup ?? true}
                        onChange={(e) => handleFieldChange("registration", "allowRecruiterSignup", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">Require Email Verification</span>
                        <p className="text-xs text-ink-500">Require OTP or confirmation link before account activation.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentReg.requireEmailVerification ?? true}
                        onChange={(e) => handleFieldChange("registration", "requireEmailVerification", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Default Account Status</label>
                      <select
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentReg.defaultUserStatus || "active"}
                        onChange={(e) => handleFieldChange("registration", "defaultUserStatus", e.target.value)}
                      >
                        <option value="active">Active immediately</option>
                        <option value="pending_review">Pending Admin Review</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={Save}
                      onClick={() => handleSaveSection("registration")}
                      loading={updateMutation.isPending}
                    >
                      Save Registration Policies
                    </Button>
                  </div>
                </div>
              )}

              {/* SECTION 3: Job Moderation */}
              {activeSection === "moderation" && (
                <div className="space-y-5">
                  <div className="border-b border-ink-100 pb-3">
                    <h2 className="text-base font-bold text-ink-900">Job Moderation Governance</h2>
                    <p className="text-xs text-ink-500">Automated moderation bypasses, keyword filters, and rate limits.</p>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">Auto-Approve Verified Organizations</span>
                        <p className="text-xs text-ink-500">Allow government/GST-verified companies to publish jobs without manual review.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentMod.autoApproveVerifiedOrgs ?? true}
                        onChange={(e) => handleFieldChange("moderation", "autoApproveVerifiedOrgs", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">Require Review for New Organizations</span>
                        <p className="text-xs text-ink-500">Route all requisitions from unverified or new companies through admin moderation.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentMod.requireManualApprovalNewOrgs ?? true}
                        onChange={(e) => handleFieldChange("moderation", "requireManualApprovalNewOrgs", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Max Jobs Per Day Per Organization</label>
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentMod.maxJobsPerDayPerOrg ?? 50}
                        onChange={(e) => handleFieldChange("moderation", "maxJobsPerDayPerOrg", Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={Save}
                      onClick={() => handleSaveSection("moderation")}
                      loading={updateMutation.isPending}
                    >
                      Save Moderation Policies
                    </Button>
                  </div>
                </div>
              )}

              {/* SECTION 4: Subscriptions & Plans */}
              {activeSection === "subscriptions" && (
                <div className="space-y-5">
                  <div className="border-b border-ink-100 pb-3">
                    <h2 className="text-base font-bold text-ink-900">Subscriptions & Plan Quota Policies</h2>
                    <p className="text-xs text-ink-500">Billing currency, trial limits, and quota enforcement behavior.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Platform Currency</label>
                      <input
                        type="text"
                        disabled
                        className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-600 font-mono"
                        value={currentSubs.currency || "INR"}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Default Trial Duration (Days)</label>
                      <input
                        type="number"
                        min={0}
                        max={90}
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentSubs.trialDays ?? 14}
                        onChange={(e) => handleFieldChange("subscriptions", "trialDays", Number(e.target.value))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-ink-700">Quota Enforcement Mode</label>
                      <select
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentSubs.enforcementMode || "soft_cap"}
                        onChange={(e) => handleFieldChange("subscriptions", "enforcementMode", e.target.value)}
                      >
                        <option value="soft_cap">Soft Cap — Warn recruiter when quota exceeded but allow ongoing review</option>
                        <option value="strict_lockout">Strict Lockout — Immediately block posting/messaging beyond plan limits</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={Save}
                      onClick={() => handleSaveSection("subscriptions")}
                      loading={updateMutation.isPending}
                    >
                      Save Subscription Policies
                    </Button>
                  </div>
                </div>
              )}

              {/* SECTION 5: Notifications */}
              {activeSection === "notifications" && (
                <div className="space-y-5">
                  <div className="border-b border-ink-100 pb-3">
                    <h2 className="text-base font-bold text-ink-900">Platform Notifications & System Alerts</h2>
                    <p className="text-xs text-ink-500">Sender headers and administrative escalation channels.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-700">System Sender Email Address</label>
                    <input
                      type="email"
                      className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                      value={currentNotif.systemSenderEmail || "noreply@hiresmart.ai"}
                      onChange={(e) => handleFieldChange("notifications", "systemSenderEmail", e.target.value)}
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">Alert Platform Admins on Critical Risk</span>
                        <p className="text-xs text-ink-500">Dispatch immediate notifications when high-severity security incidents trigger.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentNotif.alertPlatformAdminsOnCriticalRisk ?? true}
                        onChange={(e) => handleFieldChange("notifications", "alertPlatformAdminsOnCriticalRisk", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={Save}
                      onClick={() => handleSaveSection("notifications")}
                      loading={updateMutation.isPending}
                    >
                      Save Notification Settings
                    </Button>
                  </div>
                </div>
              )}

              {/* SECTION 6: Security & Sessions */}
              {activeSection === "security" && (
                <div className="space-y-5">
                  <div className="border-b border-ink-100 pb-3">
                    <h2 className="text-base font-bold text-ink-900">Security & Session Policies</h2>
                    <p className="text-xs text-ink-500">Session expirations, brute force protection, and password complexity.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Session Timeout (Minutes)</label>
                      <input
                        type="number"
                        min={15}
                        max={1440}
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentSec.sessionTimeoutMinutes ?? 120}
                        onChange={(e) => handleFieldChange("security", "sessionTimeoutMinutes", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Max Failed Logins Before Lockout</label>
                      <input
                        type="number"
                        min={3}
                        max={20}
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentSec.maxFailedLoginsBeforeLockout ?? 5}
                        onChange={(e) => handleFieldChange("security", "maxFailedLoginsBeforeLockout", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Lockout Duration (Minutes)</label>
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentSec.lockoutDurationMinutes ?? 30}
                        onChange={(e) => handleFieldChange("security", "lockoutDurationMinutes", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-700">Minimum Password Length</label>
                      <input
                        type="number"
                        min={8}
                        max={32}
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                        value={currentSec.minPasswordLength ?? 8}
                        onChange={(e) => handleFieldChange("security", "minPasswordLength", Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={Save}
                      onClick={() => handleSaveSection("security")}
                      loading={updateMutation.isPending}
                    >
                      Save Security Policies
                    </Button>
                  </div>
                </div>
              )}

              {/* SECTION 7: Feature Flags */}
              {activeSection === "features" && (
                <div className="space-y-5">
                  <div className="border-b border-ink-100 pb-3">
                    <h2 className="text-base font-bold text-ink-900">Platform Feature Flags</h2>
                    <p className="text-xs text-ink-500">Safely toggle backend capabilities and intelligence services.</p>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">AI Resume Analyzer Service</span>
                        <p className="text-xs text-ink-500">Enable automated resume scoring, skill extraction, and candidate matching.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentFeat.aiResumeParsing ?? true}
                        onChange={(e) => handleFieldChange("features", "aiResumeParsing", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">AI Interview Transcripts</span>
                        <p className="text-xs text-ink-500">Process live interview meeting transcripts with Gemini AI.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentFeat.aiInterviewTranscripts ?? true}
                        onChange={(e) => handleFieldChange("features", "aiInterviewTranscripts", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">Fraud & Anomaly Detection Engine</span>
                        <p className="text-xs text-ink-500">Real-time detection of rapid posting velocity and credential misuse.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentFeat.fraudRiskDetection ?? true}
                        onChange={(e) => handleFieldChange("features", "fraudRiskDetection", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-ink-900">Google Calendar & Meet Sync</span>
                        <p className="text-xs text-ink-500">Allow calendar scheduling and Google Meet room creation.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentFeat.googleCalendarSync ?? true}
                        onChange={(e) => handleFieldChange("features", "googleCalendarSync", e.target.checked)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={Save}
                      onClick={() => handleSaveSection("features")}
                      loading={updateMutation.isPending}
                    >
                      Save Feature Flags
                    </Button>
                  </div>
                </div>
              )}

              {/* SECTION 8: Settings Audit Trail */}
              {activeSection === "audit" && (
                <div className="space-y-4">
                  <div className="border-b border-ink-100 pb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-ink-900">Settings Governance Audit Trail</h2>
                      <p className="text-xs text-ink-500">Append-only log of changes made to platform configuration.</p>
                    </div>
                    <Badge tone="brand">Immutable Log</Badge>
                  </div>

                  {auditQuery.isLoading ? (
                    <SkeletonList />
                  ) : (auditQuery.data?.data || []).length === 0 ? (
                    <div className="p-8 text-center text-xs text-ink-400">
                      No settings modification events recorded yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-ink-50 border-t border-ink-100">
                      {(auditQuery.data?.data || []).map((entry) => (
                        <div key={entry._id} className="py-3 text-xs flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-ink-900">
                              {entry.action}
                              <span className="ml-2 font-normal text-ink-500">
                                by {entry.actor?.name || entry.actor?.email || "Platform Admin"}
                              </span>
                            </div>
                            {entry.reason && <p className="text-ink-600 mt-0.5">Reason: {entry.reason}</p>}
                          </div>
                          <div className="text-ink-400 font-mono text-[11px]">
                            {formatDateTime(entry.createdAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for High-Impact Settings Changes */}
      {pendingUpdate && (
        <Modal
          open={Boolean(pendingUpdate)}
          onClose={() => setPendingUpdate(null)}
          title={pendingUpdate.title || "Confirm Platform Setting Change"}
          size="md"
        >
          <form onSubmit={handleConfirmHighImpact} className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-3.5 text-xs text-warning-900">
              <AlertTriangle className="h-5 w-5 text-warning-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">High-Impact Platform Change</p>
                <p className="mt-0.5 text-warning-800">{pendingUpdate.description}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-700">
                Mandatory Change Justification <span className="text-danger-600">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="Provide justification for this platform policy change (recorded in audit trail)…"
                className="mt-1 w-full rounded-lg border border-ink-300 p-2.5 text-xs focus:border-brand-500 focus:outline-none"
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" type="button" onClick={() => setPendingUpdate(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                type="button"
                onClick={handleConfirmHighImpact}
                loading={updateMutation.isPending}
              >
                Confirm & Apply Change
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminSettings;
