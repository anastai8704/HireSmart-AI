import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Button from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Kpi from "../../components/ui/Kpi";
import { PageHeader } from "../../components/Product";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/useToast";
import { adminApi, downloadBlob, verificationApi } from "../../lib/api";
import { formatDateTime, initials } from "../../lib/utils";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

// Admin review of company verification cases (Phase 2 & Phase 4B).
// The server enforces every rule; this screen presents evidence, risk indicators, and handles decisions.
// Risk indicators are presented as review signals, never as automatic proof.

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending Review" },
  { value: "under_review", label: "Under Review" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
  { value: "verified", label: "Verified" },
];

const CHECK_TYPE_LABELS = {
  business_registration: "Business registration",
  business_identity: "Business identity",
  recruiter_identity: "Recruiter identity",
  business_email: "Business email",
  website_consistency: "Website consistency",
  address_consistency: "Address consistency",
  duplicate_review: "Duplicate review",
  job_policy_review: "Job policy review",
  enforcement_history: "Enforcement history",
  document_review: "Document review",
};

const RESULT_VARIANT = {
  match: "success",
  mismatch: "danger",
  concern: "warning",
  unavailable: "outline",
  not_checked: "default",
};

export const AdminVerificationQueue = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("under_review");
  const [elevated, setElevated] = useState(false);
  const [duplicates, setDuplicates] = useState(false);
  const [missing, setMissing] = useState(false);
  const [search, setSearch] = useState("");

  const debouncedSearch = useDebouncedValue(search, 300);

  // Fetch cases queue
  const queue = useQuery({
    queryKey: ["verification-queue", status, elevated, duplicates, missing],
    queryFn: () =>
      verificationApi.adminQueue({
        status: status !== "all" ? status : undefined,
        risk: elevated ? "elevated" : undefined,
        duplicateReview: duplicates ? "true" : undefined,
        missingEvidence: missing ? "true" : undefined,
        limit: 50,
      }),
  });

  // Fetch live counts across all verification statuses for the KPI summary cards
  const countsQuery = useQuery({
    queryKey: ["admin-verification-status-counts"],
    queryFn: () =>
      adminApi?.overviewAnalytics
        ? adminApi.overviewAnalytics({ range: "30d" })
        : Promise.resolve({ data: null }),
  });

  const rawCases = useMemo(() => queue.data?.data || [], [queue.data?.data]);
  const overview = countsQuery.data?.data?.companies || null;

  // Filter cases client-side if a search term is active
  const filteredCases = useMemo(() => {
    if (!debouncedSearch.trim()) return rawCases;
    const term = debouncedSearch.trim().toLowerCase();
    return rawCases.filter((item) => {
      const name = item.organization?.name?.toLowerCase() || "";
      const email = item.organization?.businessEmail?.toLowerCase() || "";
      const id = item.id?.toLowerCase() || "";
      return name.includes(term) || email.includes(term) || id.includes(term);
    });
  }, [rawCases, debouncedSearch]);

  const totalOrgs = overview?.total ?? rawCases.length;
  const pendingCount = overview?.pending ?? 0;
  const underReviewCount = overview?.underReview ?? 0;
  const verifiedCount = overview?.verified ?? 0;
  const rejectedCount = overview?.rejected ?? 0;
  const suspendedCount = overview?.suspended ?? 0;

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Platform Governance"
        title="Company Verification"
        description="Verify legitimate employer businesses, inspect incorporation documents, review risk signals, and manage authorized status."
      />

      {/* 6 Verification Status Summary KPI Cards */}
      <section aria-labelledby="verification-kpis-heading">
        <h2 id="verification-kpis-heading" className="sr-only">
          Verification Status Summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="cursor-pointer transition hover:opacity-90" onClick={() => setStatus("all")}>
            <Kpi
              label="Total Organizations"
              value={totalOrgs}
              detail="Registered businesses"
              tone={status === "all" ? "brand" : "ink"}
              icon={Building2}
            />
          </div>
          <div className="cursor-pointer transition hover:opacity-90" onClick={() => setStatus("pending")}>
            <Kpi
              label="Pending Review"
              value={pendingCount}
              detail="Awaiting review"
              tone={status === "pending" ? "warning" : "ink"}
              icon={Clock3}
            />
          </div>
          <div className="cursor-pointer transition hover:opacity-90" onClick={() => setStatus("under_review")}>
            <Kpi
              label="Under Review"
              value={underReviewCount}
              detail="Active investigation"
              tone={status === "under_review" ? "brand" : "ink"}
              icon={FileText}
            />
          </div>
          <div className="cursor-pointer transition hover:opacity-90" onClick={() => setStatus("verified")}>
            <Kpi
              label="Verified Employers"
              value={verifiedCount}
              detail="Authorized to post"
              tone={status === "verified" ? "success" : "ink"}
              icon={ShieldCheck}
            />
          </div>
          <div className="cursor-pointer transition hover:opacity-90" onClick={() => setStatus("rejected")}>
            <Kpi
              label="Rejected"
              value={rejectedCount}
              detail="Requirements unmet"
              tone={status === "rejected" ? "danger" : "ink"}
              icon={XCircle}
            />
          </div>
          <div className="cursor-pointer transition hover:opacity-90" onClick={() => setStatus("suspended")}>
            <Kpi
              label="Suspended"
              value={suspendedCount}
              detail="Authorization revoked"
              tone={status === "suspended" ? "danger" : "ink"}
              icon={ShieldAlert}
            />
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input
                type="text"
                placeholder="Search by company name, email, or case ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="w-48">
            <SearchableSelect
              aria-label="Filter status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={STATUS_FILTERS}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => queue.refetch()}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-ink-700 pt-2 border-t border-ink-100">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={elevated}
              onChange={(e) => setElevated(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <span>Elevated risk only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={duplicates}
              onChange={(e) => setDuplicates(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <span>Possible duplicates</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={missing}
              onChange={(e) => setMissing(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <span>Missing evidence</span>
          </label>
        </div>
      </section>

      {/* Queue Listing State */}
      {queue.isLoading ? (
        <LoadingState message="Loading verification cases…" />
      ) : queue.error ? (
        <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-xs">
          <div className="divide-y divide-ink-100">
            {filteredCases.map((item) => {
              const riskLevel = item.risk?.level || "low";
              const riskTone =
                riskLevel === "high" ? "danger" : riskLevel === "medium" ? "warning" : "default";

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-ink-50/60 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-xs font-bold text-white">
                        {initials(item.organization?.name || "Company")}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-ink-900">
                            {item.organization?.name || "Company"}
                          </p>
                          {item.organization?.businessType && (
                            <span className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
                              {item.organization.businessType.replaceAll("_", " ")}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-ink-500">
                          Case #{item.id?.slice(-8) || "—"} · submitted{" "}
                          {formatDateTime(item.submittedAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={riskTone}>Risk: {riskLevel}</Badge>
                    {item.missing?.length ? (
                      <Badge variant="outline">{item.missing.length} check(s) missing</Badge>
                    ) : null}
                    {Boolean(item.duplicateCount) && (
                      <Badge variant="warning">Possible duplicate</Badge>
                    )}
                    {item.changeRequestActive && (
                      <Badge variant="brand">Changes requested</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(`/app/admin/verification/${item.id}`)}
                    >
                      Review Case
                    </Button>
                  </div>
                </div>
              );
            })}

            {filteredCases.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-ink-400">
                No cases match these filters.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const CaseDetail = ({ caseId }) => {
  const toast = useToast();
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["verification-case", caseId],
    queryFn: () => verificationApi.adminCase(caseId),
  });

  const [note, setNote] = useState("");
  const [checkType, setCheckType] = useState("business_registration");
  const [checkResult, setCheckResult] = useState("match");
  const [modalAction, setModalAction] = useState(null);
  const [modalInput, setModalInput] = useState("");

  const act = useMutation({
    mutationFn: ({ run }) => run(),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["verification-case", caseId] });
      qc.invalidateQueries({ queryKey: ["verification-queue"] });
      qc.invalidateQueries({ queryKey: ["admin-verification-status-counts"] });
      toast.success(variables.message);
      setModalAction(null);
      setModalInput("");
    },
    onError: (error) => toast.error(error.message),
  });

  const run = (runFn, message) => act.mutate({ run: runFn, message });

  const download = async (doc) => {
    try {
      const blob = await verificationApi.adminDownloadDocument(doc.id || doc._id);
      downloadBlob(blob, doc.fileName || `document-${doc.id}`);
    } catch (error) {
      toast.error(error.message || "Failed to download document");
    }
  };

  if (detail.isLoading) return <LoadingState message="Loading verification case detail…" />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;

  const data = detail.data?.data;
  if (!data) return null;

  const c = data.case;
  const org = data.organization || {};
  const owner = data.owner || {};
  const isOpen = ["pending", "under_review"].includes(c.status);

  return (
    <div className="page-wrap space-y-6">
      {/* Breadcrumb Navigation & Top Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to="/app/admin/verification"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            <span>← All cases</span>
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-ink-950">{org.name}</h1>
            <Badge
              tone={
                c.status === "verified"
                  ? "success"
                  : c.status === "rejected" || c.status === "suspended"
                    ? "danger"
                    : "warning"
              }
            >
              {c.status.replaceAll("_", " ")}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            Case ID: {c.id || caseId} · Assessment: {c.assessment?.replaceAll("_", " ") || "In progress"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={c.risk?.requiresManualReview ? "warning" : "default"}>
            Risk: {c.risk?.level || "low"}
          </Badge>
        </div>
      </div>

      {/* Recommended Next Step Callout */}
      <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-600 mt-0.5" />
          <div className="min-w-0 flex-1 text-sm text-ink-900">
            <p className="font-bold">Recommended next step</p>
            <p className="mt-1">{c.recommendedNextAction || "Review submitted documents and verify registry details."}</p>
            <p className="mt-2 text-xs text-ink-500">{c.riskDisclaimer}</p>
          </div>
        </div>
      </div>

      {/* Company Profile & Legal Registration Details */}
      <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-ink-900">Company & Registration Profile</h3>
        <p className="text-xs text-ink-500">Verified identity and registered office credentials</p>

        <div className="mt-4 grid gap-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Business Type</p>
            <p className="mt-1 font-semibold text-ink-900">{org.businessType?.replaceAll("_", " ") || "Unspecified"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Registration (CIN / Reg No)</p>
            <p className="mt-1 font-mono font-bold text-ink-900">{org.registrationNumber || "Not provided"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">GSTIN Identification</p>
            <p className="mt-1 font-mono font-bold text-ink-900">{org.gstin || "Not provided"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Business Email</p>
            <p className="mt-1 font-medium text-ink-900 flex items-center gap-1.5">
              <span>{org.businessEmail || "—"}</span>
              {org.businessEmailVerifiedAt && (
                <span className="inline-flex items-center text-[11px] font-semibold text-success-700">✓ Confirmed</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Official Phone</p>
            <p className="mt-1 text-ink-900">{org.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Website</p>
            <p className="mt-1 text-ink-900 truncate">
              {org.website ? (
                <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                  {org.website}
                </a>
              ) : (
                "—"
              )}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Registered Office Address</p>
            <p className="mt-1 text-ink-800">
              {[org.address?.street, org.address?.city, org.address?.state, org.address?.pincode, org.address?.country]
                .filter(Boolean)
                .join(", ") || "No address submitted"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Authorized Representative</p>
            <p className="mt-1 text-ink-900">
              {org.authorizedRepresentative?.name
                ? `${org.authorizedRepresentative.name} (${org.authorizedRepresentative.designation || "Signatory"})`
                : "None specified"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Primary Recruiter Contact</p>
            <p className="mt-1 text-ink-900 font-semibold">{owner.name || "Owner User"}</p>
            <p className="text-xs text-ink-500">{owner.email || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Submission Date</p>
            <p className="mt-1 text-ink-900">{formatDateTime(c.submittedAt || org.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Last Reviewed / Updated</p>
            <p className="mt-1 text-ink-900">{formatDateTime(c.updatedAt || org.updatedAt)}</p>
          </div>
        </div>
      </section>

      {/* Submitted Verification Documents */}
      <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-ink-900">Submitted Verification Documents</h3>
        <p className="text-xs text-ink-500">Encrypted business incorporation records and legal proofs</p>

        {data.documents?.length ? (
          <div className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100">
            {data.documents.map((doc) => (
              <div key={doc.id || doc._id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-brand-600" />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900 truncate">{doc.fileName || "Document"}</p>
                    <p className="text-xs text-ink-500">
                      Type: {doc.type?.replaceAll("_", " ")} · Size: {Math.round((doc.size || 0) / 1024)} KB · uploaded {formatDateTime(doc.uploadedAt)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => download(doc)}
                  className="flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-center py-6 text-sm text-ink-400">No documents have been uploaded for this company.</p>
        )}
      </section>

      {/* Risk Signals & Duplicate Candidates */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Risk Indicators */}
        <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-ink-900">Risk Signals</h3>
            <Badge variant={c.risk?.level === "high" ? "danger" : c.risk?.level === "medium" ? "warning" : "default"}>
              Score: {c.risk?.score ?? org.riskScore ?? 0}/100
            </Badge>
          </div>
          <p className="mt-1 text-xs text-ink-500">Indicators explain observations; they are review signals, not proof.</p>

          {c.riskIndicators?.length ? (
            <div className="mt-4 space-y-2">
              {c.riskIndicators.map((item) => (
                <div key={item.code} className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-ink-900">{item.code}</span>
                    <Badge variant={item.severity === "high" ? "danger" : "warning"}>{item.severity}</Badge>
                  </div>
                  <p className="mt-1.5 text-ink-700">{item.explanation}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-emerald-700">✓ No elevated risk indicators identified.</p>
          )}
        </section>

        {/* Possible Duplicates */}
        <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-ink-900">Possible Duplicates</h3>
          <p className="mt-1 text-xs text-ink-500">Companies sharing matching registration numbers, GSTIN, or domain.</p>

          {c.duplicateCandidates?.length ? (
            <div className="mt-4 space-y-2">
              {c.duplicateCandidates.map((item) => (
                <div key={item.organization?.id} className="rounded-xl border border-warning-200 bg-warning-50/50 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink-900">{item.organization?.name || "Matching Company"}</span>
                    <Badge tone="warning">{item.organization?.verificationStatus || "unknown"}</Badge>
                  </div>
                  <p className="mt-1 text-ink-600">
                    Match reason: <strong>{item.reasons?.join(", ")}</strong>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-emerald-700">✓ No duplicate registrations detected on platform.</p>
          )}
        </section>
      </div>

      {/* Evidence & Verification Checks */}
      <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-ink-900">Evidence & Checklist</h3>
            <p className="text-xs text-ink-500">Mandatory verification checks and registry lookups</p>
          </div>
          {isOpen && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(() => verificationApi.adminRegistryCheck(caseId), "Registry check finished")}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Run registry check</span>
            </Button>
          )}
        </div>

        {c.evidence?.length ? (
          <div className="mt-4 space-y-2">
            {c.evidence.map((item) => (
              <div
                key={item._id || `${item.type}-${item.recordedAt}`}
                className="flex flex-col gap-1.5 rounded-xl border border-ink-100 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink-900">
                      {CHECK_TYPE_LABELS[item.type] || item.type}
                    </span>
                    <Badge variant={RESULT_VARIANT[item.result] || "default"}>
                      {item.result?.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  {item.note && <p className="mt-1 text-ink-600">{item.note}</p>}
                </div>
                <span className="text-ink-400 text-[11px] shrink-0">
                  {item.method?.replaceAll("_", " ")} · {formatDateTime(item.recordedAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-ink-400">No checks recorded yet.</p>
        )}

        {/* Manual Check Form for Open Cases */}
        {isOpen && (
          <div className="mt-6 rounded-xl border border-ink-100 bg-ink-50/50 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-700">Record Manual Check</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchableSelect
                label="Check Type"
                value={checkType}
                onChange={(e) => setCheckType(e.target.value)}
                options={Object.entries(CHECK_TYPE_LABELS)
                  .filter(([v]) => v !== "business_email")
                  .map(([value, label]) => ({ value, label }))}
              />
              <SearchableSelect
                label="Result"
                value={checkResult}
                onChange={(e) => setCheckResult(e.target.value)}
                options={["match", "mismatch", "concern", "unavailable"].map((v) => ({ value: v, label: v }))}
              />
              <div className="sm:col-span-2">
                <Textarea
                  label="What you checked (minimum 10 characters required)"
                  placeholder="Detail the registry or documentary source examined..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={note.trim().length < 10}
              onClick={() =>
                run(
                  () =>
                    verificationApi.adminRecordCheck(caseId, {
                      type: checkType,
                      result: checkResult,
                      note: note.trim(),
                    }),
                  "Manual check recorded successfully",
                )
              }
            >
              Record manual check
            </Button>
          </div>
        )}
      </section>

      {/* Review Actions Bar */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-ink-900">Admin Review Actions</h3>
        <p className="text-xs text-ink-500">Execute authorized governance transitions with recorded audit reasoning</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isOpen && (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  setModalAction("approve");
                  setModalInput("");
                }}
              >
                Approve company
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setModalAction("request_changes");
                  setModalInput("");
                }}
              >
                Request changes
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setModalAction("reject");
                  setModalInput("");
                }}
              >
                Reject company
              </Button>
            </>
          )}

          {c.status === "verified" && (
            <Button
              variant="danger"
              onClick={() => {
                setModalAction("suspend");
                setModalInput("");
              }}
            >
              Suspend company
            </Button>
          )}

          {(c.status === "suspended" || c.status === "rejected") && (
            <Button
              variant="primary"
              onClick={() => {
                setModalAction("restore");
                setModalInput("");
              }}
            >
              Restore company
            </Button>
          )}
        </div>
      </section>

      {/* Verification History Log */}
      <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-ink-900">Verification History</h3>
        <p className="text-xs text-ink-500">Complete audit log of state changes and governance decisions</p>

        {c.statusHistory?.length ? (
          <ol className="mt-4 divide-y divide-ink-100 text-xs">
            {c.statusHistory.map((entry, index) => (
              <li key={index} className="py-2.5 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-semibold text-ink-900">
                    {entry.from} → {entry.to}
                  </span>{" "}
                  <span className="text-ink-500">({entry.action})</span>
                  {entry.reason && <p className="mt-0.5 text-ink-700 italic">“{entry.reason}”</p>}
                </div>
                <span className="text-ink-400 font-mono">{formatDateTime(entry.at)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-xs text-ink-400">No transition history recorded.</p>
        )}
      </section>

      {/* Confirmation Action Modal */}
      {modalAction && (
        <Modal
          isOpen={Boolean(modalAction)}
          open={Boolean(modalAction)}
          onClose={() => setModalAction(null)}
          title={
            modalAction === "approve"
              ? `Approve Company Verification: ${org.name}`
              : modalAction === "reject"
                ? `Reject Company Verification: ${org.name}`
                : modalAction === "request_changes"
                  ? `Request Verification Changes from ${org.name}`
                  : modalAction === "suspend"
                    ? `Suspend Company Authorization: ${org.name}`
                    : `Restore / Reactivate Company: ${org.name}`
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-600">
              {modalAction === "approve"
                ? "Approving verification authorizes the company to publish job listings and access applications. All mandatory checks must pass."
                : modalAction === "reject"
                  ? "Rejecting will unpublish active listings and notify the recruiter owner with the reason. Mandatory reason is required."
                  : modalAction === "request_changes"
                    ? "Enter required changes (one per line). The company status will update to allow resubmission."
                    : modalAction === "suspend"
                      ? "Suspending closes all live job listings immediately and halts candidate workflows. Mandatory reason is required."
                      : "Restoring company authorization will re-validate requirements and reinstate the employer account."}
            </p>

            {modalAction === "request_changes" ? (
              <Textarea
                label="Required Changes (one item per line)"
                placeholder="e.g. Upload clear copy of Certificate of Incorporation&#10;Verify official business email domain"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                rows={3}
                required
              />
            ) : modalAction === "reject" || modalAction === "suspend" ? (
              <Textarea
                label="Reason (Required — minimum 3 characters)"
                placeholder="Specify detailed reason for this enforcement decision..."
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                rows={3}
                required
              />
            ) : (
              <Textarea
                label="Review Notes (Optional)"
                placeholder="Add internal notes explaining this decision..."
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                rows={2}
              />
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setModalAction(null)}>
                Cancel
              </Button>
              <Button
                variant={modalAction === "reject" || modalAction === "suspend" ? "danger" : "primary"}
                disabled={
                  (modalAction === "reject" || modalAction === "suspend") && modalInput.trim().length < 3
                    ? true
                    : modalAction === "request_changes" && !modalInput.trim()
                      ? true
                      : act.isPending
                }
                onClick={() => {
                  if (modalAction === "approve") {
                    run(() => verificationApi.adminApprove(caseId, modalInput.trim()), "Company verified");
                  } else if (modalAction === "reject") {
                    if (modalInput.trim().length < 3) return toast.error("Reason must be at least 3 characters");
                    run(() => verificationApi.adminReject(caseId, modalInput.trim()), "Company rejected");
                  } else if (modalAction === "request_changes") {
                    const items = modalInput.split("\n").map((s) => s.trim()).filter(Boolean);
                    if (!items.length) return toast.error("At least one required change is needed");
                    run(() => verificationApi.adminRequestChanges(caseId, items), "Changes requested");
                  } else if (modalAction === "suspend") {
                    if (modalInput.trim().length < 3) return toast.error("Reason must be at least 3 characters");
                    run(() => verificationApi.adminSuspend(caseId, modalInput.trim()), "Company suspended");
                  } else if (modalAction === "restore") {
                    run(() => verificationApi.adminRestore(caseId, modalInput.trim()), "Company restored");
                  }
                }}
                loading={act.isPending}
              >
                Confirm
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export const AdminVerificationReview = () => {
  const { caseId } = useParams();
  return caseId ? <CaseDetail caseId={caseId} /> : <AdminVerificationQueue />;
};

export default AdminVerificationReview;
