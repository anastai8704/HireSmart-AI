import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "../../components/ui/Button";
import Input, { Select, Textarea } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { EmptyState, ErrorState, SkeletonList } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { adminApi } from "../../lib/api";
import { useToast } from "../../components/ui/useToast";
import { formatDateTime, formatRelativeTime, initials } from "../../lib/utils";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

// Job moderation (Phase 3). The company cards and the queues use the same review rules as the
// server, so a count on screen is the set of records the action will apply to. Every decision is
// re-checked on the server; this screen only sends the request and reports what the server did.

const VERIFICATION_STATUS_OPTIONS = [
  { value: "all", label: "All verification states" },
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under review" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
];

const RISK_LEVEL_OPTIONS = [
  { value: "all", label: "All risk levels" },
  { value: "low", label: "Low risk (0-25)" },
  { value: "medium", label: "Medium risk (26-60)" },
  { value: "high", label: "High risk (61+)" },
];

const JOB_STATUS_OPTIONS = [
  { value: "all", label: "All jobs" },
  { value: "pending", label: "Needs review" },
  { value: "approved", label: "Live (approved)" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
  { value: "draft", label: "Drafts" },
  { value: "closed", label: "Closed" },
];

const OUTCOME_TONE = { approved: "success", skipped: "warning", failed: "danger" };
const OUTCOME_LABEL = { approved: "Succeeded", skipped: "Skipped", failed: "Failed" };
const CODE_LABEL = {
  COMPANY_NOT_VERIFIED: "The company is not verified",
  REVIEWER_CONFLICT: "You belong to this company, so you cannot review its jobs",
  JOB_INCOMPLETE: "The job needs a description and skills",
  JOB_CLOSED: "The job is closed",
  JOB_NOT_SUBMITTED: "The job has not been submitted for review",
  DUPLICATE_IN_REQUEST: "Listed more than once in this request",
  ALREADY_DECIDED: "Already decided by someone else",
  INVALID_TRANSITION: "This decision does not apply to the job's current state",
  STATUS_CHANGED: "The job changed while it was being reviewed",
  JOB_NOT_IN_COMPANY: "Belongs to another company",
  NOT_FOUND: "The job no longer exists",
  WRITE_FAILED: "Could not be saved; try again",
};
const MODERATION_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  changes_requested: "brand",
  suspended: "danger",
  none: "ink",
};

const ACTION_COPY = {
  approve: { title: "Approve", verb: "approved", needsReason: false },
  reject: { title: "Reject", verb: "rejected", needsReason: true },
  request_changes: { title: "Request changes", verb: "sent back for changes", needsReason: true },
  suspend: { title: "Suspend", verb: "suspended", needsReason: true },
  reinstate: { title: "Reinstate", verb: "reinstated", needsReason: false },
};
const ACTION_PARAM = { approve: "approve", reject: "reject", request_changes: "request-changes", suspend: "suspend", reinstate: "reinstate" };

const FilterBar = ({ children }) => <div className="mb-6 flex flex-wrap items-center gap-3">{children}</div>;

// Compensation shown as LPA. Falls back to the flat salary field used by older listings.
const lpa = (job) => {
  const value = job.compensation?.min || job.salary || 0;
  return `₹${(value / 100000).toFixed(1)} LPA`;
};

/** The review state a job is in, as the recruiter and the admin should read it. */
const reviewLabel = (job) => {
  if (job.changeReview?.status === "pending") return { text: "Edits pending", tone: "warning" };
  const status = job.moderation?.status || "none";
  if (status === "none" && job.status === "draft") return { text: "Draft", tone: "ink" };
  if (status === "none") return { text: "No review needed", tone: "ink" };
  return { text: status.replace("_", " "), tone: MODERATION_TONE[status] || "ink" };
};

/** Which decisions the admin may take on a job, mirroring the server rules. */
const availableActions = (job) => {
  const status = job.moderation?.status;
  // Company previews only list jobs that need review, so a missing lifecycle status there means published.
  const published = (job.status ?? "published") === "published";
  const listingPending = published && status === "pending";
  const changePending = job.changeReview?.status === "pending" && status === "approved";
  if (listingPending) return ["approve", "reject", "request_changes"];
  if (changePending) return ["approve", "reject"];
  if (published && status === "approved") return ["suspend"];
  if (status === "suspended") return ["reinstate"];
  return [];
};

const needsReview = (job) =>
  job.needsReview ?? (job.status === "published" && (job.moderation?.status === "pending" || job.changeReview?.status === "pending"));

const Summary = ({ counts }) => (
  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
    {[
      ["Total", counts.total],
      ["Pending", counts.pending],
      ["Approved", counts.approved],
      ["Rejected", counts.rejected],
      ["Changes requested", counts.changesRequested],
      ["Suspended", counts.suspended],
      ["Closed", counts.closed],
      ["Drafts", counts.drafts],
    ].map(([label, value]) => (
      <div key={label} className="rounded-lg bg-ink-50 px-3 py-2">
        <span className="block text-base font-bold text-ink-950">{value ?? 0}</span>
        <span className="text-ink-500">{label}</span>
      </div>
    ))}
  </div>
);

const ResultsPanel = ({ result, onClose }) => {
  if (!result) return null;
  const { summary, results, title } = result;
  return (
    <Modal isOpen open onClose={onClose} title={title || "Bulk operation results"} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-ink-800" data-testid="bulk-summary">
          {summary.requested} selected · <strong>{summary.succeeded}</strong> succeeded · <strong>{summary.skipped}</strong> skipped
          · <strong>{summary.failed}</strong> failed
          {summary.duplicatesRemoved ? ` · ${summary.duplicatesRemoved} duplicate(s) ignored` : ""}
        </p>
        {summary.skipped + summary.failed > 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Partial result: some jobs were not changed. Each is listed below with its reason. Nothing was applied to them.
          </p>
        ) : (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Every requested job was processed.</p>
        )}
        <ul className="max-h-[50vh] divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-100">
          {results.map((item, index) => (
            <li key={`${item.jobId}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                <span className="font-semibold text-ink-900">{item.title || item.jobId}</span>
                {item.company ? <span className="ml-2 text-xs text-ink-500">{item.company}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={OUTCOME_TONE[item.outcome] || "ink"}>{OUTCOME_LABEL[item.outcome] || item.outcome}</Badge>
                {item.outcome !== "approved" && item.code ? (
                  <span className="text-xs text-ink-600">{CODE_LABEL[item.code] || item.message}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
};

/** Normalises the two response shapes (bulk returns { data }, approve-all returns the fields directly). */
const toOutcome = (response) => (response?.data?.results ? response.data : response);

export const AdminModeration = () => {
  const toast = useToast();
  const qc = useQueryClient();

  // Company list filters (server side).
  const [search, setSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("all");
  const [riskLevel, setRiskLevel] = useState("all");

  // Company drawer: jobs of one company, with job filters.
  const [companyId, setCompanyId] = useState(null);
  const [jobStatus, setJobStatus] = useState("all");
  const [jobSearch, setJobSearch] = useState("");
  const [recruiterId, setRecruiterId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState([]);

  const [inspectOrgId, setInspectOrgId] = useState(null);
  const [bulkApproveTarget, setBulkApproveTarget] = useState(null); // { orgId, companyName, count }
  const [detailJobId, setDetailJobId] = useState(null);
  const [decision, setDecision] = useState(null); // { action, jobs: [{id,title,company}], bulk: boolean }
  const [reason, setReason] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [result, setResult] = useState(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const debouncedJobSearch = useDebouncedValue(jobSearch, 300);
  const companyParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      verificationStatus: verificationStatus !== "all" ? verificationStatus : undefined,
      riskLevel: riskLevel !== "all" ? riskLevel : undefined,
    }),
    [debouncedSearch, verificationStatus, riskLevel],
  );
  const jobParams = useMemo(
    () => ({
      status: jobStatus !== "all" ? jobStatus : undefined,
      search: debouncedJobSearch || undefined,
      recruiterId: recruiterId || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: 200,
    }),
    [jobStatus, debouncedJobSearch, recruiterId, from, to],
  );

  const companiesQuery = useQuery({
    queryKey: ["admin-moderation-companies", companyParams],
    queryFn: () => adminApi.moderationCompanies(companyParams),
  });
  const companyJobsQuery = useQuery({
    queryKey: ["admin-company-jobs", companyId, jobParams],
    queryFn: () => adminApi.companyModerationJobs(companyId, jobParams),
    enabled: Boolean(companyId),
  });
  const detailQuery = useQuery({
    queryKey: ["admin-moderation-job", detailJobId],
    queryFn: () => adminApi.moderationJobDetail(detailJobId),
    enabled: Boolean(detailJobId),
  });
  const inspectQuery = useQuery({
    queryKey: ["admin-org-verification-details", inspectOrgId],
    queryFn: () => adminApi.orgVerificationDetails(inspectOrgId),
    enabled: Boolean(inspectOrgId),
  });

  const refreshAfterChange = () => {
    qc.invalidateQueries({ queryKey: ["admin-moderation-companies"] });
    qc.invalidateQueries({ queryKey: ["admin-company-jobs"] });
    qc.invalidateQueries({ queryKey: ["admin-moderation-job"] });
    qc.invalidateQueries({ queryKey: ["moderation-jobs"] });
  };

  const singleMutation = useMutation({
    mutationFn: ({ jobId, action, reason }) =>
      adminApi.moderate(jobId, ACTION_PARAM[action], ACTION_COPY[action].needsReason ? reason : undefined),
    onSuccess: (_res, variables) => {
      toast.success(`Job ${ACTION_COPY[variables.action].verb}`);
      setDecision(null);
      setReason("");
      setDecisionError("");
      setSelected((current) => current.filter((id) => id !== variables.jobId));
      refreshAfterChange();
    },
    onError: (err) => setDecisionError(err.message || "The decision could not be applied."),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action, jobIds, reason, organizationId }) =>
      adminApi.bulkModerate({ action, jobIds, reason, organizationId }),
    onSuccess: (response, variables) => {
      const outcome = toOutcome(response);
      setResult({ title: `Bulk ${ACTION_COPY[variables.action].title.toLowerCase()}`, ...outcome });
      setSelected([]);
      setDecision(null);
      setReason("");
      setDecisionError("");
      refreshAfterChange();
    },
    onError: (err) => setDecisionError(err.message || "The bulk action could not be applied."),
  });

  const approveAllMutation = useMutation({
    mutationFn: (orgId) => adminApi.bulkApproveJobs(orgId),
    onSuccess: (response) => {
      const outcome = toOutcome(response);
      setResult({ title: "Approve all eligible jobs", ...outcome, summary: outcome.summary || { requested: outcome.approvedCount || 0, succeeded: outcome.approvedCount || 0, skipped: 0, failed: 0 }, results: outcome.results || [] });
      setBulkApproveTarget(null);
      refreshAfterChange();
    },
    onError: (err) => {
      setBulkApproveTarget(null);
      toast.error(err.message);
    },
  });

  const companies = companiesQuery.data?.data || [];
  const companyJobs = useMemo(() => companyJobsQuery.data?.data?.jobs || [], [companyJobsQuery.data]);
  const companyInfo = companyJobsQuery.data?.data?.organization;
  const companyRecruiters = useMemo(() => {
    const seen = new Map();
    for (const job of companyJobs) if (job.recruiter?.id) seen.set(String(job.recruiter.id), job.recruiter.name || job.recruiter.email);
    return [...seen.entries()];
  }, [companyJobs]);

  const toggleSelected = (id) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const openDecision = (action, jobs, bulk) => {
    setDecisionError("");
    setReason("");
    setDecision({ action, jobs, bulk });
  };

  const submitDecision = () => {
    if (!decision) return;
    const { action, jobs, bulk } = decision;
    const copy = ACTION_COPY[action];
    if (copy.needsReason && reason.trim().length < 3) {
      setDecisionError("Please give a reason of at least 3 characters.");
      return;
    }
    if (bulk) {
      bulkMutation.mutate({
        action,
        jobIds: jobs.map((job) => job.id),
        reason: copy.needsReason ? reason.trim() : undefined,
        organizationId: companyId || undefined,
      });
    } else {
      singleMutation.mutate({ jobId: jobs[0].id, action, reason: reason.trim() });
    }
  };

  const busy = singleMutation.isPending || bulkMutation.isPending;
  const totalPending = companies.reduce((sum, c) => sum + (c.jobCounts?.pending || 0), 0);
  const selectedJobs = companyJobs.filter((job) => selected.includes(job.id));
  const selectedEligible = selectedJobs.filter((job) => job.changeReview?.status === "pending" || job.moderation?.status === "pending");

  return (
    <div className="page-wrap space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader
          eyebrow="Job Moderation"
          title="Job Listing Moderation"
          description="Grouped by employer company. Review, approve, reject, suspend and bulk-process listings. Every decision is checked again on the server and recorded in the job's history."
        />
        <div className="flex items-center gap-2">
          <Badge tone={totalPending > 0 ? "warning" : "success"}>{totalPending} Total Pending Approval</Badge>
        </div>
      </div>

      <FilterBar>
        <Input
          aria-label="Search approvals"
          placeholder="Search by company name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xs"
        />
        <Select
          aria-label="Filter by verification"
          value={verificationStatus}
          onChange={(e) => setVerificationStatus(e.target.value)}
          options={VERIFICATION_STATUS_OPTIONS}
          className="lg:max-w-44"
        />
        <Select
          aria-label="Filter by risk score"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value)}
          options={RISK_LEVEL_OPTIONS}
          className="lg:max-w-44"
        />
      </FilterBar>

      {companiesQuery.isLoading ? (
        <SkeletonList />
      ) : companiesQuery.error ? (
        <ErrorState title="Could not load moderation" error={companiesQuery.error} onRetry={() => companiesQuery.refetch()} />
      ) : companies.length === 0 ? (
        <EmptyState
          title="No job listings to moderate"
          description={
            search || verificationStatus !== "all" || riskLevel !== "all"
              ? "No companies match these filters. Clear a filter to see more."
              : "When companies submit job listings, they appear here grouped by company."
          }
        />
      ) : (
        <div className="grid gap-6">
          {companies.map((c) => {
            const orgId = c.organizationId || c._id;
            const isVerified = c.verificationStatus === "verified";
            const risk = c.riskScore || 0;
            const riskTone = risk <= 25 ? "success" : risk <= 60 ? "warning" : "danger";
            const pendingCount = c.jobCounts?.pending || 0;
            const eligibleCount = c.jobCounts?.eligible ?? (isVerified ? pendingCount : 0);
            const blockedCount = pendingCount - eligibleCount;

            return (
              <div key={orgId} className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition-all hover:border-brand-200">
                <div className="flex flex-col justify-between gap-4 border-b border-ink-100 bg-ink-50/50 p-5 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-950 font-bold text-white shadow-xs">
                      {initials(c.companyName)}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-ink-950">{c.companyName}</h3>
                        <Badge tone={isVerified ? "success" : "warning"}>Company: {c.verificationStatus}</Badge>
                        <Badge tone={riskTone}>Risk: {risk}/100</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {c.jobCounts?.total || 0} listings · {pendingCount} pending
                        {blockedCount > 0 ? ` (${blockedCount} blocked until the company is verified)` : ""} · Latest:{" "}
                        {c.latestSubmission ? formatRelativeTime(c.latestSubmission) : "none"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setInspectOrgId(orgId)}>
                      Inspect Company
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelected([]);
                        setCompanyId(orgId);
                      }}
                    >
                      View All Jobs ({c.jobCounts?.total || 0})
                    </Button>
                    {isVerified && eligibleCount > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setBulkApproveTarget({ orgId, companyName: c.companyName, count: eligibleCount })}
                      >
                        Approve All Eligible ({eligibleCount})
                      </Button>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-ink-100 p-2">
                  {(c.jobs || []).length === 0 ? (
                    <p className="p-4 text-xs text-ink-500">Nothing waiting for review.</p>
                  ) : null}
                  {(c.jobs || []).map((j) => {
                    const label = reviewLabel(j);
                    const actions = availableActions(j);
                    return (
                      <div key={j.id || j._id} className="flex flex-col justify-between gap-3 rounded-xl p-4 hover:bg-ink-50/40 sm:flex-row sm:items-center">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-ink-900">{j.title}</span>
                            <Badge tone={label.tone}>{label.text}</Badge>
                          </div>
                          <p className="text-xs text-ink-500">
                            {j.location} · {j.workplaceMode} · {lpa(j)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetailJobId(j.id || j._id)}>
                            View Details
                          </Button>
                          {actions.includes("approve") && (
                            <Button size="sm" variant="primary" disabled={!isVerified} title={isVerified ? undefined : "Verify the company before approving"} onClick={() => openDecision("approve", [{ id: j.id || j._id, title: j.title }], false)}>
                              Approve
                            </Button>
                          )}
                          {actions.includes("reject") && (
                            <Button size="sm" variant="danger" onClick={() => openDecision("reject", [{ id: j.id || j._id, title: j.title }], false)}>
                              Reject
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Company drawer: all jobs of one company, filters, selection and bulk actions */}
      {companyId && (
        <Modal isOpen open onClose={() => setCompanyId(null)} title={`Job Listings: ${companyInfo?.name || "Company"}`} size="lg">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={companyInfo?.verificationStatus === "verified" ? "success" : "warning"}>
                  Company: {companyInfo?.verificationStatus || "loading"}
                </Badge>
                {companyInfo?.verificationCase ? (
                  <a className="text-xs font-semibold text-brand-700 underline" href={`/app/admin/verification/${companyInfo.verificationCase.id}`}>
                    View verification evidence
                  </a>
                ) : (
                  <span className="text-xs text-ink-500">No verification case yet</span>
                )}
              </div>
            </div>

            {companyJobsQuery.data?.data && <Summary counts={summaryFromJobs(companyJobs)} />}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Input aria-label="Search jobs by title" placeholder="Job title..." value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} />
              <Select aria-label="Filter by job status" value={jobStatus} onChange={(e) => setJobStatus(e.target.value)} options={JOB_STATUS_OPTIONS} />
              <Select
                aria-label="Filter by recruiter"
                value={recruiterId}
                onChange={(e) => setRecruiterId(e.target.value)}
                options={[{ value: "", label: "All recruiters" }, ...companyRecruiters.map(([id, name]) => ({ value: id, label: name || id }))]}
              />
              <Input aria-label="Created from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input aria-label="Created to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm">
                <span>
                  {selected.length} selected · {selectedEligible.length} awaiting review
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" disabled={!selectedEligible.length || companyInfo?.verificationStatus !== "verified"} onClick={() => openDecision("approve", selectedEligible.map((j) => ({ id: j.id, title: j.title })), true)}>
                    Approve selected ({selectedEligible.length})
                  </Button>
                  <Button size="sm" variant="danger" disabled={!selectedEligible.length} onClick={() => openDecision("reject", selectedEligible.map((j) => ({ id: j.id, title: j.title })), true)}>
                    Reject selected ({selectedEligible.length})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelected([])}>Clear</Button>
                </div>
              </div>
            )}

            {companyJobsQuery.isLoading ? (
              <SkeletonList rows={3} />
            ) : companyJobsQuery.error ? (
              <ErrorState title="Could not load jobs" error={companyJobsQuery.error} onRetry={() => companyJobsQuery.refetch()} />
            ) : (
              <div className="max-h-[52vh] space-y-3 overflow-y-auto">
                {companyJobs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-400">No jobs match these filters.</p>
                ) : (
                  companyJobs.map((j) => {
                    const id = j.id || j._id;
                    const label = reviewLabel(j);
                    const actions = availableActions(j);
                    const reviewable = needsReview(j);
                    return (
                      <div key={id} className="flex flex-col justify-between gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:flex-row sm:items-center">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1"
                            aria-label={`Select ${j.title}`}
                            disabled={!reviewable}
                            checked={selected.includes(id)}
                            onChange={() => toggleSelected(id)}
                          />
                          <span className="space-y-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-ink-900">{j.title}</span>
                              <Badge tone={label.tone}>{label.text}</Badge>
                              {j.status !== "published" && j.status ? <Badge tone="ink">{j.status}</Badge> : null}
                            </span>
                            <span className="block text-xs text-ink-500">
                              {j.location} · {j.workplaceMode} · {j.salaryInrLpa} · {j.applicationCount} applicants
                              {j.recruiter?.name ? ` · ${j.recruiter.name}` : ""} · created {formatDateTime(j.createdAt)}
                            </span>
                          </span>
                        </label>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetailJobId(id)}>Details</Button>
                          {actions.includes("approve") && (
                            <Button size="sm" variant="primary" disabled={companyInfo?.verificationStatus !== "verified"} title={companyInfo?.verificationStatus === "verified" ? undefined : "Verify the company before approving"} onClick={() => openDecision("approve", [{ id, title: j.title }], false)}>
                              Approve
                            </Button>
                          )}
                          {actions.includes("reject") && (
                            <Button size="sm" variant="danger" onClick={() => openDecision("reject", [{ id, title: j.title }], false)}>Reject</Button>
                          )}
                          {actions.includes("suspend") && (
                            <Button size="sm" variant="danger" onClick={() => openDecision("suspend", [{ id, title: j.title }], false)}>Suspend</Button>
                          )}
                          {actions.includes("reinstate") && (
                            <Button size="sm" variant="primary" onClick={() => openDecision("reinstate", [{ id, title: j.title }], false)}>Reinstate</Button>
                          )}
                          {j.moderation?.status === "pending" && j.status === "published" && (
                            <Button size="sm" variant="outline" onClick={() => openDecision("request_changes", [{ id, title: j.title }], false)}>Request changes</Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
            {companyJobsQuery.data?.meta?.truncated && (
              <p className="text-xs text-amber-700">Showing {companyJobs.length} of {companyJobsQuery.data.meta.total} jobs. Narrow the filters to see the rest.</p>
            )}
          </div>
        </Modal>
      )}

      {/* Company bulk approval confirmation */}
      {bulkApproveTarget && (
        <Modal isOpen open onClose={() => setBulkApproveTarget(null)} title="Bulk Approve Job Listings">
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              Are you sure you want to approve all <strong>{bulkApproveTarget.count}</strong> eligible pending job postings for{" "}
              <strong>{bulkApproveTarget.companyName}</strong>?
            </p>
            <p className="text-xs text-ink-500">
              Each job is checked again before it is approved. Jobs that changed in the meantime are reported, not approved. Approved jobs become visible to candidates.
            </p>
            {approveAllMutation.error && <p className="text-sm text-danger-700">{approveAllMutation.error.message}</p>}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setBulkApproveTarget(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => approveAllMutation.mutate(bulkApproveTarget.orgId)} loading={approveAllMutation.isPending}>
                Approve All {bulkApproveTarget.count} Jobs
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Single job detail with moderation history */}
      {detailJobId && (
        <Modal isOpen open onClose={() => setDetailJobId(null)} title={detailQuery.data?.data?.title || "Job details"} size="lg">
          {detailQuery.isLoading ? (
            <SkeletonList rows={3} />
          ) : detailQuery.error ? (
            <ErrorState title="Could not load this job" error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
          ) : detailQuery.data?.data ? (
            <JobDetail job={detailQuery.data.data} actions={availableActions(detailQuery.data.data)} onDecide={(action) => openDecision(action, [{ id: detailQuery.data.data.id, title: detailQuery.data.data.title }], false)} />
          ) : null}
        </Modal>
      )}

      {/* Company inspection (verification evidence summary) */}
      {inspectOrgId && inspectQuery.data?.data && (
        <Modal isOpen open onClose={() => setInspectOrgId(null)} title={`Company Inspection: ${inspectQuery.data.data.organization?.name}`} size="lg">
          <div className="space-y-4 text-sm">
            <p className="text-ink-700">Verification status: <strong>{inspectQuery.data.data.organization?.verificationStatus}</strong></p>
            <p className="text-xs text-ink-500">Risk indicators are explanations for review. They are not proof of wrongdoing.</p>
            {(inspectQuery.data.data.organization?.riskFlags || []).map((flag, idx) => (
              <p key={idx} className="text-xs text-ink-700">• {flag.message}</p>
            ))}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setInspectOrgId(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Decision confirmation: one job, or the selected jobs */}
      {decision && (
        <Modal
          isOpen
          open
          onClose={() => setDecision(null)}
          title={decision.bulk ? `${ACTION_COPY[decision.action].title} ${decision.jobs.length} selected job(s)` : `${ACTION_COPY[decision.action].title} "${decision.jobs[0]?.title}"`}
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-600">
              {decision.action === "approve" && "Approving makes the listing visible to candidates once it passes the company check."}
              {decision.action === "reject" && "The recruiter sees this reason and can edit the job and submit it again."}
              {decision.action === "request_changes" && "The job stays hidden. The recruiter edits it and submits it again."}
              {decision.action === "suspend" && "The job is hidden from candidates and cannot be resubmitted by the recruiter until reinstated."}
              {decision.action === "reinstate" && "The job becomes visible to candidates again."}
            </p>
            {decision.bulk && (
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-ink-100 p-3 text-xs text-ink-700">
                {decision.jobs.map((job) => (
                  <li key={job.id}>{job.title}</li>
                ))}
              </ul>
            )}
            {ACTION_COPY[decision.action].needsReason && (
              <Textarea
                label="Reason (shown to the recruiter)"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain what needs to change or why this is being rejected."
              />
            )}
            {decisionError && <p role="alert" className="text-sm text-danger-700">{decisionError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
              <Button
                variant={decision.action === "approve" || decision.action === "reinstate" ? "primary" : "danger"}
                loading={busy}
                onClick={submitDecision}
              >
                Confirm {ACTION_COPY[decision.action].title.toLowerCase()}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ResultsPanel result={result} onClose={() => setResult(null)} />
    </div>
  );
};

/** Counts for the drawer header, computed from the jobs on screen (the same rules as the server). */
const summaryFromJobs = (jobs) => ({
  total: jobs.length,
  pending: jobs.filter(needsReview).length,
  approved: jobs.filter((j) => j.status === "published" && j.moderation?.status === "approved").length,
  rejected: jobs.filter((j) => j.moderation?.status === "rejected").length,
  changesRequested: jobs.filter((j) => j.moderation?.status === "changes_requested").length,
  suspended: jobs.filter((j) => j.moderation?.status === "suspended").length,
  closed: jobs.filter((j) => j.status === "closed").length,
  drafts: jobs.filter((j) => j.status === "draft").length,
});

const JobDetail = ({ job, actions, onDecide }) => {
  const label = reviewLabel(job);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={label.tone}>{label.text}</Badge>
        <Badge tone="ink">{job.workplaceMode}</Badge>
        {job.experience ? <Badge tone="brand">{job.experience}</Badge> : null}
        <span className="text-xs text-ink-500">{job.organization?.name} · {job.recruiter?.name || "Recruiter"}</span>
      </div>
      <div className="rounded-xl bg-ink-50 p-4 text-xs text-ink-700">
        <p className="font-semibold text-ink-900">Compensation</p>
        <p className="mt-1">{lpa(job)} · {job.location}</p>
      </div>
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Required skills</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(job.requiredSkills || []).map((skill) => (
            <Badge key={skill} tone="brand">{skill}</Badge>
          ))}
        </div>
      </div>
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Description</h4>
        <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-ink-100 p-4 text-xs leading-relaxed text-ink-700">
          {job.description}
        </div>
      </div>
      {job.changeReview?.status === "pending" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-semibold">Proposed changes (live version stays visible until approved)</p>
          <ul className="mt-2 list-disc pl-5">
            {Object.keys(job.changeReview.fields || {}).map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Moderation history</h4>
        {job.history?.length ? (
          <ol className="mt-2 space-y-2 text-xs">
            {job.history.map((event) => (
              <li key={event.id} className="rounded-lg border border-ink-100 p-2.5">
                <span className="font-semibold text-ink-900">{event.fromStatus || "new"} → {event.toStatus}</span>
                <span className="ml-2 text-ink-500">{event.actor?.name || "System"} · {formatDateTime(event.createdAt)}</span>
                {event.reason ? <p className="mt-1 text-ink-700">Reason: {event.reason}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-ink-500">No decisions recorded yet.</p>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
        {actions.map((action) => (
          <Button key={action} variant={action === "approve" || action === "reinstate" ? "primary" : "danger"} onClick={() => onDecide(action)}>
            {ACTION_COPY[action].title}
          </Button>
        ))}
        {actions.length === 0 && <p className="text-xs text-ink-500">No decision is available for this job in its current state.</p>}
      </div>
    </div>
  );
};

export default AdminModeration;
