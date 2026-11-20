import { useSearchParams, useParams } from "react-router-dom";
import { ShieldCheck, Building2, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { PageHeader } from "../../components/Product";
import { CompanyVerificationCard } from "./CompanyVerificationCard";
import { CompanyProfileCard, JobApprovalToggle } from "./RecruiterPages";
import { cn } from "../../lib/utils";

export const CompanyProfileVerificationPage = () => {
  const { organizationId } = useParams();
  const auth = useAuth();
  const orgId = organizationId || auth.organizationId;
  const canManage = ["owner", "admin"].includes(auth.membership?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "verification";

  const handleTabChange = (nextTab) => {
    setSearchParams(nextTab === "verification" ? {} : { tab: nextTab });
  };

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Organization"
        title="Company Profile & Verification"
        description="Manage your verified company details, business registration documents, and public employer brand."
      />

      <div className="border-b border-ink-200">
        <nav className="-mb-px flex space-x-6" aria-label="Organization sections">
          <button
            type="button"
            onClick={() => handleTabChange("verification")}
            className={cn(
              "flex items-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors",
              tab === "verification"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-700",
            )}
            aria-current={tab === "verification" ? "page" : undefined}
          >
            <ShieldCheck className="h-4.5 w-4.5" />
            Verification
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("profile")}
            className={cn(
              "flex items-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors",
              tab === "profile"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-700",
            )}
            aria-current={tab === "profile" ? "page" : undefined}
          >
            <Building2 className="h-4.5 w-4.5" />
            Company Profile
          </button>
        </nav>
      </div>

      <div className="mt-4">
        {tab === "verification" && (
          <div className="space-y-6" data-testid="verification-tab-content">
            {!canManage && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-xs">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-semibold">Verification Access Restricted</p>
                    <p className="mt-0.5 text-ink-600">
                      You are viewing this organization as a{" "}
                      <strong>{auth.membership?.role || "member"}</strong>. Only Organization Owners
                      and Admins have permission to manage company verification documents and status.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <CompanyVerificationCard orgId={orgId} />
          </div>
        )}
        {tab === "profile" && (
          <div className="space-y-6" data-testid="profile-tab-content">
            <JobApprovalToggle />
            <CompanyProfileCard
              orgId={orgId}
              onSwitchToVerification={() => handleTabChange("verification")}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyProfileVerificationPage;
