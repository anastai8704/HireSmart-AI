import { useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Mail,
  Phone,
  FileCheck2,
  AlertCircle,
  X,
  Check,
  UserCheck,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Textarea } from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import { PlanBadge } from "../../components/billing/PlanBadge";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import { organizationApi } from "../../lib/api";
import { cn, initials } from "../../lib/utils";

const COMPANY_SIZE_OPTIONS = [
  { value: "1-10", label: "1-10 employees" },
  { value: "11-50", label: "11-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-500", label: "201-500 employees" },
  { value: "501-1000", label: "501-1000 employees" },
  { value: "1000+", label: "1000+ employees" },
  { value: "unknown", label: "Not specified" },
];

const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST - UTC+05:30)" },
  { value: "UTC", label: "UTC (Universal Coordinated Time)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT - UTC-05:00)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT - UTC-06:00)" },
  { value: "America/Denver", label: "America/Denver (MST/MDT - UTC-07:00)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT - UTC-08:00)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST - UTC+00:00)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST - UTC+01:00)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST - UTC+04:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT - UTC+08:00)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST - UTC+09:00)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT - UTC+10:00)" },
];

const VERIFICATION_STATUS_BADGES = {
  verified: { variant: "success", label: "Verified Entity" },
  under_review: { variant: "brand", label: "Under Review" },
  rejected: { variant: "danger", label: "Rejected" },
  suspended: { variant: "danger", label: "Suspended" },
  pending: { variant: "default", label: "Pending Verification" },
};

const initialFormData = (org = {}) => ({
  name: org.name || "",
  industry: org.industry || "",
  size: org.size || "unknown",
  website: org.website || "",
  logo: org.logo || "",
  about: org.about || "",
  timezone: org.timezone || "Asia/Kolkata",
});

export const CompanyProfileCard = ({ orgId: propOrgId, onSwitchToVerification }) => {
  const { organizationId: routeOrgId } = useParams();
  const auth = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const orgId = propOrgId || routeOrgId || auth.organizationId;
  const canManage = ["owner", "admin"].includes(auth.membership?.role);

  const orgQuery = useQuery({
    queryKey: ["org", orgId],
    queryFn: () => organizationApi.get(orgId),
    enabled: Boolean(orgId),
  });

  const orgData = orgQuery.data?.data;

  const [form, setForm] = useState(null);
  const [failedLogoUrl, setFailedLogoUrl] = useState(null);

  const activeForm = form ?? initialFormData(orgData || {});
  const logoPreviewFailed = failedLogoUrl === activeForm.logo.trim();

  // Dirty state tracking
  const isDirty = useMemo(() => {
    if (!orgData || !form) return false;
    const initial = initialFormData(orgData);
    return (
      form.name !== initial.name ||
      form.industry !== initial.industry ||
      form.size !== initial.size ||
      form.website !== initial.website ||
      form.logo !== initial.logo ||
      form.about !== initial.about ||
      form.timezone !== initial.timezone
    );
  }, [orgData, form]);

  // Field validation
  const errors = useMemo(() => {
    const errs = {};
    if (!activeForm.name.trim()) {
      errs.name = "Company name is required";
    } else if (activeForm.name.trim().length < 2) {
      errs.name = "Company name must be at least 2 characters";
    } else if (activeForm.name.trim().length > 150) {
      errs.name = "Company name must not exceed 150 characters";
    }

    if (activeForm.website.trim()) {
      try {
        const parsed = new URL(activeForm.website.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errs.website = "Website must start with http:// or https://";
        }
      } catch {
        errs.website = "Please enter a valid website URL (e.g. https://example.com)";
      }
    }

    if (activeForm.logo.trim()) {
      try {
        const parsed = new URL(activeForm.logo.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errs.logo = "Logo URL must start with http:// or https://";
        }
      } catch {
        errs.logo = "Please enter a valid image URL";
      }
    }

    if (activeForm.about.length > 2000) {
      errs.about = "About description must not exceed 2000 characters";
    }

    return errs;
  }, [activeForm]);

  const isValid = Object.keys(errors).length === 0;

  const saveMutation = useMutation({
    mutationFn: (body) => organizationApi.update(orgId, body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["org", orgId] });
      qc.invalidateQueries({ queryKey: ["verification", orgId] });
      setForm(initialFormData(res.data?.data || activeForm));
      toast.success("Company profile saved successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save company profile");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    saveMutation.mutate({
      name: activeForm.name.trim(),
      industry: activeForm.industry.trim(),
      size: activeForm.size,
      website: activeForm.website.trim(),
      logo: activeForm.logo.trim(),
      about: activeForm.about.trim(),
      timezone: activeForm.timezone,
    });
  };

  const handleReset = () => {
    if (orgData) {
      setForm(initialFormData(orgData));
      setFailedLogoUrl(null);
    }
  };

  const setField = (key) => (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...(prev ?? initialFormData(orgData || {})), [key]: val }));
  };

  if (orgQuery.isLoading) {
    return (
      <div className="panel space-y-4 p-6" data-testid="company-profile-loading">
        <div className="h-6 w-48 animate-pulse rounded bg-ink-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-ink-100" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-10 animate-pulse rounded bg-ink-100" />
          <div className="h-10 animate-pulse rounded bg-ink-100" />
        </div>
      </div>
    );
  }

  if (!orgData) return null;

  const vStatus = orgData.verificationStatus || "pending";
  const vBadge = VERIFICATION_STATUS_BADGES[vStatus] || VERIFICATION_STATUS_BADGES.pending;

  return (
    <div className="space-y-6" data-testid="company-profile-card">
      {/* Role permission alert if not admin/owner */}
      {!canManage && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">View-Only Mode</p>
              <p className="mt-0.5 text-ink-600">
                You are viewing this company as a <strong>{auth.membership?.role || "member"}</strong>.
                Only Organization Owners and Admins have permission to modify public brand details or
                legal verification settings.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Public Profile Card */}
      <section className="panel p-6 shadow-xs" aria-labelledby="company-profile-heading">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Building2 className="h-5 w-5 text-brand-600" />
              <h2 id="company-profile-heading" className="text-lg font-bold text-ink-900">
                Company Profile
              </h2>
            </div>
            <p className="text-sm text-ink-500">
              Manage your company&apos;s public brand, identity, and candidate-facing profile.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PlanBadge compact billingHref={`/app/o/${orgId}/billing`} />
            {orgData.slug && (
              <Link
                to={`/companies/${orgData.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-2xs transition-colors hover:border-brand-500 hover:text-brand-600"
              >
                <span>View Public Page</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Public profile URL banner */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3.5 py-2.5 text-xs text-ink-600">
          <span className="font-medium text-ink-700">Public candidate link:</span>
          <span className="font-mono text-brand-700">
            {window.location.origin}/companies/{orgData.slug || "slug"}
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Company Logo Section */}
          <div className="rounded-xl border border-ink-200 bg-surface-50 p-4.5">
            <label className="block text-sm font-semibold text-ink-900">Company Logo</label>
            <p className="mt-0.5 text-xs text-ink-500">
              Direct HTTPS image URL (PNG, SVG, or JPEG). Displayed on job postings, search cards, and
              candidate offers.
            </p>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* Logo Preview Box */}
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-200 bg-white shadow-2xs"
                data-testid="logo-preview-box"
              >
                {activeForm.logo.trim() && !logoPreviewFailed ? (
                  <img
                    src={activeForm.logo.trim()}
                    alt={`${activeForm.name} logo`}
                    className="h-full w-full object-contain p-2"
                    onError={() => setFailedLogoUrl(activeForm.logo.trim())}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center">
                    {activeForm.name.trim() ? (
                      <span className="text-xl font-bold text-ink-400">
                        {initials(activeForm.name)}
                      </span>
                    ) : (
                      <Building2 className="h-8 w-8 text-ink-300" />
                    )}
                  </div>
                )}
              </div>

              {/* Logo URL Input & Actions */}
              <div className="flex-1 space-y-2">
                <div className="relative">
                  <Input
                    label=""
                    placeholder="https://example.com/logo.png"
                    value={activeForm.logo}
                    onChange={setField("logo")}
                    disabled={!canManage || saveMutation.isPending}
                    error={errors.logo}
                    hint={
                      logoPreviewFailed
                        ? "Image could not be loaded from this URL. Please verify the link is accessible."
                        : activeForm.logo.trim() && !errors.logo
                          ? "Logo loaded successfully"
                          : undefined
                    }
                  />
                  {activeForm.logo && canManage && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...(prev ?? activeForm), logo: "" }))}
                      className="absolute right-2.5 top-2.5 text-ink-400 hover:text-ink-600"
                      title="Clear logo URL"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Core Info Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Company Name"
              required
              value={activeForm.name}
              onChange={setField("name")}
              disabled={!canManage || saveMutation.isPending}
              error={errors.name}
              hint="Legal entity or trading name visible to candidates"
            />

            <div className="relative">
              <Input
                label="Company Website"
                placeholder="https://example.com"
                value={activeForm.website}
                onChange={setField("website")}
                disabled={!canManage || saveMutation.isPending}
                error={errors.website}
              />
              {activeForm.website.trim() && !errors.website && (
                <a
                  href={activeForm.website.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2.5 top-8 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>

            <Input
              label="Industry"
              placeholder="e.g. Technology, Financial Services, HealthTech"
              value={activeForm.industry}
              onChange={setField("industry")}
              disabled={!canManage || saveMutation.isPending}
            />

            <SearchableSelect
              label="Company Size"
              value={activeForm.size}
              onChange={setField("size")}
              options={COMPANY_SIZE_OPTIONS}
              disabled={!canManage || saveMutation.isPending}
            />

            <SearchableSelect
              label="Primary Timezone"
              value={activeForm.timezone}
              onChange={setField("timezone")}
              options={TIMEZONE_OPTIONS}
              disabled={!canManage || saveMutation.isPending}
            />

            <div className="flex flex-col justify-end">
              <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-600">
                <span className="font-semibold text-ink-700">Interview Scheduling:</span> Jobs and
                interviews will default to this timezone for wall-clock alignment.
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-ink-700">About the Company</label>
                <span
                  className={cn(
                    "text-xs",
                    activeForm.about.length > 2000 ? "font-bold text-danger-600" : "text-ink-400",
                  )}
                >
                  {activeForm.about.length} / 2000 characters
                </span>
              </div>
              <Textarea
                className="mt-1"
                rows={4}
                placeholder="Provide a compelling overview of your organization's mission, values, culture, and products..."
                value={activeForm.about}
                onChange={setField("about")}
                disabled={!canManage || saveMutation.isPending}
                error={errors.about}
              />
            </div>
          </div>

          {/* Dirty changes action bar */}
          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
              <div className="flex items-center gap-2">
                {isDirty ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    Unsaved changes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-400">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    All changes saved
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isDirty && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleReset}
                    disabled={saveMutation.isPending}
                  >
                    Discard Changes
                  </Button>
                )}
                <Button
                  type="submit"
                  isLoading={saveMutation.isPending}
                  disabled={!isDirty || !isValid}
                >
                  Save Company Profile
                </Button>
              </div>
            </div>
          )}
        </form>
      </section>

      {/* Registered Legal Details & Verification Overview Card */}
      <section className="panel p-6 shadow-xs" aria-labelledby="registered-details-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h3 id="registered-details-heading" className="text-base font-bold text-ink-900">
                Registered Legal Identity & Compliance
              </h3>
            </div>
            <p className="text-xs text-ink-500">
              Official registration identifiers submitted for compliance and platform verification.
            </p>
          </div>
          <Badge variant={vBadge.variant}>{vBadge.label}</Badge>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-ink-200 bg-surface-50 p-3">
            <p className="text-xs font-medium text-ink-500">Official Business Email</p>
            <div className="mt-1 flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-ink-400" />
              <span className="text-sm font-semibold text-ink-900">
                {orgData.businessEmail || "Not provided"}
              </span>
            </div>
            {orgData.businessEmail && (
              <span className="mt-1 inline-block text-2xs font-medium text-emerald-700">
                {orgData.businessEmailVerifiedAt ? "Confirmed Domain" : "Pending Confirmation"}
              </span>
            )}
          </div>

          <div className="rounded-lg border border-ink-200 bg-surface-50 p-3">
            <p className="text-xs font-medium text-ink-500">Contact Phone</p>
            <div className="mt-1 flex items-center gap-1.5">
              <Phone className="h-4 w-4 text-ink-400" />
              <span className="text-sm font-semibold text-ink-900">
                {orgData.phone || "Not specified"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-ink-200 bg-surface-50 p-3">
            <p className="text-xs font-medium text-ink-500">Legal Business Type</p>
            <div className="mt-1 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-ink-400" />
              <span className="text-sm font-semibold capitalize text-ink-900">
                {orgData.businessType && orgData.businessType !== "unspecified"
                  ? orgData.businessType.replaceAll("_", " ")
                  : "Not specified"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-ink-200 bg-surface-50 p-3">
            <p className="text-xs font-medium text-ink-500">Registration No. (CIN / LLPIN)</p>
            <div className="mt-1 flex items-center gap-1.5">
              <FileCheck2 className="h-4 w-4 text-ink-400" />
              <span className="font-mono text-sm font-semibold text-ink-900">
                {orgData.registrationNumber || "Not provided"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-ink-200 bg-surface-50 p-3">
            <p className="text-xs font-medium text-ink-500">GSTIN</p>
            <div className="mt-1 flex items-center gap-1.5">
              <FileCheck2 className="h-4 w-4 text-ink-400" />
              <span className="font-mono text-sm font-semibold text-ink-900">
                {orgData.gstin || "Not provided"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-ink-200 bg-surface-50 p-3">
            <p className="text-xs font-medium text-ink-500">Authorized Representative</p>
            <div className="mt-1 flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-ink-400" />
              <span className="text-sm font-semibold text-ink-900">
                {orgData.authorizedRepresentative?.name || "Not designated"}
              </span>
            </div>
            {orgData.authorizedRepresentative?.designation && (
              <p className="text-2xs text-ink-500">
                {orgData.authorizedRepresentative.designation}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-ink-200 bg-surface-50 p-3 sm:col-span-2 lg:col-span-3">
            <p className="text-xs font-medium text-ink-500">Headquarters / Registered Address</p>
            <div className="mt-1 flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <span className="text-sm text-ink-800">
                {[
                  orgData.address?.street,
                  orgData.address?.city,
                  orgData.address?.state,
                  orgData.address?.pincode,
                  orgData.address?.country,
                ]
                  .filter(Boolean)
                  .join(", ") || "No address on file"}
              </span>
            </div>
          </div>
        </div>

        {/* Action shortcut to Verification Center */}
        {onSwitchToVerification && (
          <div className="mt-4 flex justify-end border-t border-ink-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onSwitchToVerification}
              className="gap-1.5"
            >
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              <span>Manage Verification in Verification Center</span>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
};

export default CompanyProfileCard;
