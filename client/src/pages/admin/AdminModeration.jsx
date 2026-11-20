import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileEdit,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Textarea } from "../../components/ui/Input";
import DatePicker from "../../components/ui/DatePicker";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Kpi from "../../components/ui/Kpi";
import { EmptyState, ErrorState, SkeletonList } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { adminApi } from "../../lib/api";
import { useToast } from "../../components/ui/useToast";
import { formatDateTime, formatRelativeTime, initials } from "../../lib/utils";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

// Job moderation (Phase 4C). Executive company-grouped job governance with in-card bulk operations.
// All decisions enforce backend authorization and eligibility rules.

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

const MODERATION_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All moderation states" },
  { value: "pending", label: "Pending approval" },
  { value: "approved", label: "Approved / Active" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended / Closed" },
];

const SORT_OPTIONS = [
  { value: "pending_desc", label: "Most pending jobs" },
  { value: "newest", label: "Newest submission" },
  { value: "oldest", label: "Oldest submission" },
  { value: "risk_high", label: "Highest risk score" },
  { value: "name_asc", label: "Company name (A-Z)" },
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

const ACTION_PARAM = {
  approve: "approve",
  reject: "reject",
  request_changes: "request-changes",
  suspend: "suspend",
  reinstate: "reinstate",
};

const FilterBar = ({ children }) => <div className="mb-6 flex flex-wrap items-center gap-3">{children}</div>;

// Compensation shown as LPA. Falls back to flat salary field.
const lpa = (job) => {
  const value = job.compensation?.min || job.salary || 0;
  return `₹${(value / 100000).toFixed(1)} LPA`;
};

/** The review state a job is in, as the recruiter and admin should read it. */
const reviewLabel = (job) => {
  if (job.changeReview?.status === "pending") return { text: "Edits pending", tone: "warning" };
  const status = job.moderation?.status || "none";
  if (status === "none" && job.status === "draft") return { text: "Draft", tone: "ink" };
  if (status === "none") return { text: "No review needed", tone: "ink" };
  return { text: status.replace("_", " "), tone: MODERATION_TONE[status] || "ink" };
};

/** Which decisions the admin may take on a job, mirroring backend policy. */
const availableActions = (job) => {
  const status = job.moderation?.status;
  const isLive = ["published", "active"].includes(job.status ?? "published");
  const listingPending = isLive && status === "pending";
  const changePending = job.changeReview?.status === "pending" && status === "approved";
  if (listingPending) return ["approve", "reject", "request_changes"];
  if (changePending) return ["approve", "reject"];
  if (isLive && (status === "approved" || status === "none" || !status)) return ["suspend"];
  if (status === "suspended") return ["reinstate"];
  return [];
};

const needsReview = (job) =>
  job.needsReview ?? (["published", "active"].includes(job.status ?? "published") && (job.moderation?.status === "pending" || job.changeReview?.status === "pending"));

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

const toOutcome = (response) => (response?.data?.results ? response.data : response);

export const AdminModeration = () => {
  const toast = useToast();
  const qc = useQueryClient();

  // Company list filters & search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verificationStatus, setVerificationStatus] = useState("all");
  const [riskLevel, setRiskLevel] = useState("all");
  const [sortBy, setSortBy] = useState("pending_desc");

  // In-card expand/collapse state: tracks collapsed organizations (default: expanded)
  const [collapsedOrgs, setCollapsedOrgs] = useState(() => new Set());

  // Company drawer: jobs of one company, with job filters
  const [companyId, setCompanyId] = useState(null);
  const [jobStatus, setJobStatus] = useState("all");
  const [jobSearch, setJobSearch] = useState("");
  const [recruiterId, setRecruiterId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState([]);

  const [inspectOrgId, setInspectOrgId] = useState(null);
  const [bulkApproveTarget, setBulkApproveTarget] = useState(null);
  const [detailJobId, setDetailJobId] = useState(null);
  const [decision, setDecision] = useState(null);
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
      status: statusFilter !== "all" ? statusFilter : undefined,
      sort: sortBy !== "pending_desc" ? sortBy : undefined,
    }),
    [debouncedSearch, verificationStatus, riskLevel, statusFilter, sortBy],
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
      setResult({
        title: "Approve all eligible jobs",
        ...outcome,
        summary: outcome.summary || {
          requested: outcome.approvedCount || 0,
          succeeded: outcome.approvedCount || 0,
          skipped: 0,
          failed: 0,
        },
        results: outcome.results || [],
      });
      setBulkApproveTarget(null);
      refreshAfterChange();
    },
    onError: (err) => {
      setBulkApproveTarget(null);
      toast.error(err.message);
    },
  });

  const companies = useMemo(() => companiesQuery.data?.data || [], [companiesQuery.data?.data]);
  const metaCounts = companiesQuery.data?.meta?.counts;

  // Real KPI statistics across all platform jobs
  const counts = useMemo(() => {
    if (metaCounts) return metaCounts;
    return companies.reduce(
      (acc, c) => ({
        total: acc.total + (c.jobCounts?.total || 0),
        pending: acc.pending + (c.jobCounts?.pending || 0),
        approved: acc.approved + (c.jobCounts?.approved || 0),
        rejected: acc.rejected + (c.jobCounts?.rejected || 0),
        changesRequested: acc.changesRequested + (c.jobCounts?.changesRequested || 0),
        suspended: acc.suspended + (c.jobCounts?.suspended || 0) + (c.jobCounts?.closed || 0),
      }),
      { total: 0, pending: 0, approved: 0, rejected: 0, changesRequested: 0, suspended: 0 },
    );
  }, [metaCounts, companies]);

  const companyJobs = useMemo(() => companyJobsQuery.data?.data?.jobs || [], [companyJobsQuery.data]);
  const companyInfo = companyJobsQuery.data?.data?.organization;
  const companyRecruiters = useMemo(() => {
    const seen = new Map();
    for (const job of companyJobs) {
      if (job.recruiter?.id) seen.set(String(job.recruiter.id), job.recruiter.name || job.recruiter.email);
    }
    return [...seen.entries()];
  }, [companyJobs]);

  const toggleExpand = (orgId) => {
    setCollapsedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

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
  const selectedJobs = companyJobs.filter((job) => selected.includes(job.id));
  const selectedEligible = selectedJobs.filter(
    (job) => job.changeReview?.status === "pending" || job.moderation?.status === "pending",
  );

  return (
    <div className="page-wrap space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader
          eyebrow="Job Moderation"
          title="Job Listing Moderation"
          description="Company-grouped moderation workspace. Review, approve, reject, request changes, and bulk-process job listings with enforced verification governance."
        />
        <div className="flex items-center gap-2">
          <Badge tone={counts.pending > 0 ? "warning" : "success"}>
            {counts.pending} Total Pending Approval
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => companiesQuery.refetch()}
            disabled={companiesQuery.isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${companiesQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* 6 Top KPI Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Total Jobs"
          value={counts.total}
          detail="All platform listings"
          tone="ink"
          icon={Briefcase}
        />
        <Kpi
          label="Pending Approval"
          value={counts.pending}
          detail="Awaiting review"
          tone="warning"
          icon={Clock3}
        />
        <Kpi
          label="Approved / Active"
          value={counts.approved}
          detail="Live to candidates"
          tone="success"
          icon={CheckCircle2}
        />
        <Kpi
          label="Rejected"
          value={counts.rejected}
          detail="Declined listings"
          tone="danger"
          icon={XCircle}
        />
        <Kpi
          label="Changes Requested"
          value={counts.changesRequested}
          detail="Returned to recruiter"
          tone="brand"
          icon={FileEdit}
        />
        <Kpi
          label="Suspended / Closed"
          value={counts.suspended}
          detail="Hidden or expired"
          tone="danger"
          icon={ShieldAlert}
        />
      </div>

      {/* Filter and Search Bar */}
      <FilterBar>
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
          <Input
            aria-label="Search approvals"
            placeholder="Search by company, job title, location, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <SearchableSelect
          aria-label="Filter by moderation status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={MODERATION_STATUS_FILTER_OPTIONS}
          className="lg:max-w-48"
        />
        <SearchableSelect
          aria-label="Filter by verification"
          value={verificationStatus}
          onChange={(e) => setVerificationStatus(e.target.value)}
          options={VERIFICATION_STATUS_OPTIONS}
          className="lg:max-w-44"
        />
        <SearchableSelect
          aria-label="Filter by risk score"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value)}
          options={RISK_LEVEL_OPTIONS}
          className="lg:max-w-44"
        />
        <SearchableSelect
          aria-label="Sort by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          options={SORT_OPTIONS}
          className="lg:max-w-44"
        />
      </FilterBar>

      {/* Main Companies Grouped List */}
      {companiesQuery.isLoading ? (
        <SkeletonList />
      ) : companiesQuery.error ? (
        <ErrorState
          title="Could not load moderation"
          error={companiesQuery.error}
          onRetry={() => companiesQuery.refetch()}
        />
      ) : companies.length === 0 ? (
        <EmptyState
          title="No job listings to moderate"
          description={
            search || verificationStatus !== "all" || riskLevel !== "all" || statusFilter !== "all"
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
            const isExpanded = !collapsedOrgs.has(orgId);
            const pendingJobs = c.jobs || [];

            // Jobs of this company currently selected in state
            const companySelectedJobIds = pendingJobs
              .map((j) => j.id || j._id)
              .filter((id) => selected.includes(id));
            const companyEligibleJobIds = pendingJobs
              .filter((j) => j.changeReview?.status === "pending" || j.moderation?.status === "pending")
              .map((j) => j.id || j._id);

            const selectAllEligibleForCompany = () => {
              setSelected((prev) => {
                const nonCompany = prev.filter((id) => !pendingJobs.some((j) => (j.id || j._id) === id));
                return [...nonCompany, ...companyEligibleJobIds];
              });
            };

            const deselectAllForCompany = () => {
              setSelected((prev) => prev.filter((id) => !pendingJobs.some((j) => (j.id || j._id) === id)));
            };

            return (
              <div
                key={orgId}
                className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition-all hover:border-brand-200"
              >
                {/* Company Header */}
                <div className="flex flex-col justify-between gap-4 border-b border-ink-100 bg-ink-50/50 p-5 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-950 font-bold text-white shadow-xs">
                      {initials(c.companyName)}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-ink-950">{c.companyName}</h3>
                        <Badge
                          tone={
                            isVerified
                              ? "success"
                              : c.verificationStatus === "rejected" || c.verificationStatus === "suspended"
                                ? "danger"
                                : "warning"
                          }
                        >
                          Company: {c.verificationStatus}
                        </Badge>
                        <Badge tone={riskTone}>Risk: {risk}/100</Badge>
                        {!isVerified && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning-700 bg-warning-50 px-2 py-0.5 rounded-md border border-warning-200">
                            <AlertTriangle className="h-3 w-3" /> Unverified company: approvals blocked
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {c.jobCounts?.total || 0} listings · {pendingCount} pending
                        {c.jobCounts?.approved ? ` · ${c.jobCounts.approved} live approved` : ""}
                        {blockedCount > 0 ? ` (${blockedCount} blocked until verified)` : ""} · Latest:{" "}
                        {c.latestSubmission ? formatRelativeTime(c.latestSubmission) : "none"}
                      </p>
                    </div>
                  </div>

                  {/* Header Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleExpand(orgId)}
                      aria-label={isExpanded ? `Collapse jobs for ${c.companyName}` : `Expand jobs for ${c.companyName}`}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" /> Collapse ({pendingJobs.length})
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" /> Expand ({pendingJobs.length} pending)
                        </>
                      )}
                    </Button>
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
                        onClick={() =>
                          setBulkApproveTarget({ orgId, companyName: c.companyName, count: eligibleCount })
                        }
                      >
                        Approve All Eligible ({eligibleCount})
                      </Button>
                    )}
                  </div>
                </div>

                {/* In-Card Pending Jobs List (Expandable) */}
                {isExpanded && (
                  <div className="p-3">
                    {/* Company In-Card Batch Actions Toolbar */}
                    {pendingJobs.length > 0 && (
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50/70 p-3 text-xs border border-ink-100">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 cursor-pointer font-medium text-ink-700">
                            <input
                              type="checkbox"
                              checked={
                                companyEligibleJobIds.length > 0 &&
                                companyEligibleJobIds.every((id) => selected.includes(id))
                              }
                              onChange={(e) =>
                                e.target.checked ? selectAllEligibleForCompany() : deselectAllForCompany()
                              }
                            />
                            <span>Select all eligible ({companyEligibleJobIds.length})</span>
                          </label>
                          {companySelectedJobIds.length > 0 && (
                            <span className="font-semibold text-brand-700">
                              · {companySelectedJobIds.length} selected
                            </span>
                          )}
                        </div>

                        {companySelectedJobIds.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={!isVerified}
                              title={isVerified ? undefined : "Verify company before approving"}
                              onClick={() => {
                                const selectedJobsForModal = pendingJobs
                                  .filter((j) => companySelectedJobIds.includes(j.id || j._id))
                                  .map((j) => ({ id: j.id || j._id, title: j.title }));
                                openDecision("approve", selectedJobsForModal, true);
                              }}
                            >
                              Approve selected jobs ({companySelectedJobIds.length})
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                const selectedJobsForModal = pendingJobs
                                  .filter((j) => companySelectedJobIds.includes(j.id || j._id))
                                  .map((j) => ({ id: j.id || j._id, title: j.title }));
                                openDecision("reject", selectedJobsForModal, true);
                              }}
                            >
                              Reject selected jobs ({companySelectedJobIds.length})
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const selectedJobsForModal = pendingJobs
                                  .filter((j) => companySelectedJobIds.includes(j.id || j._id))
                                  .map((j) => ({ id: j.id || j._id, title: j.title }));
                                openDecision("request_changes", selectedJobsForModal, true);
                              }}
                            >
                              Request changes ({companySelectedJobIds.length})
                            </Button>
                            <Button size="sm" variant="ghost" onClick={deselectAllForCompany}>
                              Clear
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pending Jobs Rows */}
                    <div className="divide-y divide-ink-100">
                      {pendingJobs.length === 0 ? (
                        <p className="p-4 text-xs text-ink-500">Nothing waiting for review.</p>
                      ) : null}
                      {pendingJobs.map((j) => {
                        const id = j.id || j._id;
                        const label = reviewLabel(j);
                        const actions = availableActions(j);
                        const isSelected = selected.includes(id);

                        return (
                          <div
                            key={id}
                            className={`flex flex-col justify-between gap-3 rounded-xl p-4 transition-colors sm:flex-row sm:items-center ${
                              isSelected ? "bg-brand-50/50" : "hover:bg-ink-50/40"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1"
                                aria-label={`Select pending ${j.title}`}
                                checked={isSelected}
                                onChange={() => toggleSelected(id)}
                              />
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-ink-900">{j.title}</span>
                                  <Badge tone={label.tone}>{label.text}</Badge>
                                  {j.department && (
                                    <Badge tone="ink" variant="outline">
                                      {j.department}
                                    </Badge>
                                  )}
                                  {j.employmentType && (
                                    <Badge tone="brand" variant="outline">
                                      {j.employmentType.replace("_", " ")}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-ink-500">
                                  {j.location} · {j.workplaceMode} · {lpa(j)}
                                  {j.createdAt ? ` · Submitted ${formatDateTime(j.createdAt)}` : ""}
                                </p>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:pl-0">
                              <Button size="sm" variant="outline" onClick={() => setDetailJobId(id)}>
                                View Details
                              </Button>
                              {actions.includes("approve") && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={!isVerified}
                                  title={isVerified ? undefined : "Verify the company before approving"}
                                  onClick={() => openDecision("approve", [{ id, title: j.title }], false)}
                                >
                                  Approve
                                </Button>
                              )}
                              {actions.includes("reject") && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => openDecision("reject", [{ id, title: j.title }], false)}
                                >
                                  Reject
                                </Button>
                              )}
                              {actions.includes("request_changes") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openDecision("request_changes", [{ id, title: j.title }], false)}
                                >
                                  Request changes
                                </Button>
                              )}
                              {actions.includes("suspend") && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => openDecision("suspend", [{ id, title: j.title }], false)}
                                >
                                  Suspend
                                </Button>
                              )}
                              {actions.includes("reinstate") && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => openDecision("reinstate", [{ id, title: j.title }], false)}
                                >
                                  Reinstate
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Company Drawer: all jobs of one company, filters, selection and bulk actions */}
      {companyId && (
        <Modal
          isOpen
          open
          onClose={() => setCompanyId(null)}
          title={`Job Listings: ${companyInfo?.name || "Company"}`}
          description="Spacious company job listing workspace for administrative review, suspension, and governance."
          size="3xl"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={companyInfo?.verificationStatus === "verified" ? "success" : "warning"}>
                  Company: {companyInfo?.verificationStatus || "loading"}
                </Badge>
                {companyInfo?.verificationCase ? (
                  <Link
                    className="text-xs font-semibold text-brand-700 underline"
                    to={`/app/admin/verification/${companyInfo.verificationCase.id}`}
                  >
                    View verification evidence
                  </Link>
                ) : (
                  <span className="text-xs text-ink-500">No verification case yet</span>
                )}
              </div>
            </div>

            {companyInfo?.verificationStatus !== "verified" && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-200 bg-warning-50/70 p-3.5 text-xs text-warning-900 shadow-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning-700" />
                  <span>
                    <strong>Unverified Organization:</strong> Platform security governance prevents approving jobs until the organization's business verification is completed.
                  </span>
                </div>
                <Link
                  to="/app/admin/verification"
                  className="shrink-0 rounded-lg bg-warning-600 px-3 py-1 font-semibold text-white hover:bg-warning-700 transition"
                >
                  Go to Verification
                </Link>
              </div>
            )}

            {companyJobsQuery.data?.data && <Summary counts={summaryFromJobs(companyJobs)} />}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Input
                aria-label="Search jobs by title"
                placeholder="Job title…"
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
              />
              <SearchableSelect
                aria-label="Filter by job status"
                value={jobStatus}
                onChange={(e) => setJobStatus(e.target.value)}
                options={JOB_STATUS_OPTIONS}
              />
              <SearchableSelect
                aria-label="Filter by recruiter"
                value={recruiterId}
                onChange={(e) => setRecruiterId(e.target.value)}
                options={[
                  { value: "", label: "All recruiters" },
                  ...companyRecruiters.map(([id, name]) => ({ value: id, label: name || id })),
                ]}
              />
              <DatePicker
                aria-label="Created from"
                placeholder="Created from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <DatePicker
                aria-label="Created to"
                placeholder="Created to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm">
                <span>
                  {selected.length} selected · {selectedEligible.length} awaiting review
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!selectedEligible.length || companyInfo?.verificationStatus !== "verified"}
                    onClick={() =>
                      openDecision(
                        "approve",
                        selectedEligible.map((j) => ({ id: j.id, title: j.title })),
                        true,
                      )
                    }
                  >
                    Approve selected ({selectedEligible.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!selectedEligible.length}
                    onClick={() =>
                      openDecision(
                        "reject",
                        selectedEligible.map((j) => ({ id: j.id, title: j.title })),
                        true,
                      )
                    }
                  >
                    Reject selected ({selectedEligible.length})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelected([])}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {companyJobsQuery.isLoading ? (
              <SkeletonList rows={3} />
            ) : companyJobsQuery.error ? (
              <ErrorState
                title="Could not load jobs"
                error={companyJobsQuery.error}
                onRetry={() => companyJobsQuery.refetch()}
              />
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
                      <div
                        key={id}
                        className="flex flex-col justify-between gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:flex-row sm:items-center"
                      >
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
                              {j.status !== "published" && j.status ? (
                                <Badge tone="ink">{j.status}</Badge>
                              ) : null}
                            </span>
                            <span className="block text-xs text-ink-500">
                              {j.location} · {j.workplaceMode} · {j.salaryInrLpa} · {j.applicationCount} applicants
                              {j.recruiter?.name ? ` · ${j.recruiter.name}` : ""} · created{" "}
                              {formatDateTime(j.createdAt)}
                            </span>
                          </span>
                        </label>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetailJobId(id)}>
                            Details
                          </Button>
                          {actions.includes("approve") && (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={companyInfo?.verificationStatus !== "verified"}
                              title={
                                companyInfo?.verificationStatus === "verified"
                                  ? undefined
                                  : "Verify the company before approving"
                              }
                              onClick={() => openDecision("approve", [{ id, title: j.title }], false)}
                            >
                              Approve
                            </Button>
                          )}
                          {actions.includes("reject") && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => openDecision("reject", [{ id, title: j.title }], false)}
                            >
                              Reject
                            </Button>
                          )}
                          {actions.includes("suspend") && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => openDecision("suspend", [{ id, title: j.title }], false)}
                            >
                              Suspend
                            </Button>
                          )}
                          {actions.includes("reinstate") && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => openDecision("reinstate", [{ id, title: j.title }], false)}
                            >
                              Reinstate
                            </Button>
                          )}
                          {actions.includes("request_changes") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDecision("request_changes", [{ id, title: j.title }], false)}
                            >
                              Request changes
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
            {companyJobsQuery.data?.meta?.truncated && (
              <p className="text-xs text-amber-700">
                Showing {companyJobs.length} of {companyJobsQuery.data.meta.total} jobs. Narrow the filters to see the rest.
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* Company Bulk Approval Confirmation */}
      {bulkApproveTarget && (
        <Modal
          isOpen
          open
          onClose={() => setBulkApproveTarget(null)}
          title="Bulk Approve Job Listings"
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              Are you sure you want to approve all <strong>{bulkApproveTarget.count}</strong> eligible pending job postings for{" "}
              <strong>{bulkApproveTarget.companyName}</strong>?
            </p>
            <p className="text-xs text-ink-500">
              Each job is checked again before it is approved. Jobs that changed in the meantime are reported, not approved. Approved jobs become visible to candidates.
            </p>
            {approveAllMutation.error && (
              <p className="text-sm text-danger-700">{approveAllMutation.error.message}</p>
            )}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setBulkApproveTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => approveAllMutation.mutate(bulkApproveTarget.orgId)}
                loading={approveAllMutation.isPending}
              >
                Approve All {bulkApproveTarget.count} Jobs
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Single Job Detail with Full Context and Moderation History */}
      {detailJobId && (
        <Modal
          isOpen
          open
          onClose={() => setDetailJobId(null)}
          title={detailQuery.data?.data?.title || "Job details"}
          size="lg"
        >
          {detailQuery.isLoading ? (
            <SkeletonList rows={3} />
          ) : detailQuery.error ? (
            <ErrorState
              title="Could not load this job"
              error={detailQuery.error}
              onRetry={() => detailQuery.refetch()}
            />
          ) : detailQuery.data?.data ? (
            <JobDetail
              job={detailQuery.data.data}
              actions={availableActions(detailQuery.data.data)}
              onDecide={(action) =>
                openDecision(
                  action,
                  [{ id: detailQuery.data.data.id, title: detailQuery.data.data.title }],
                  false,
                )
              }
            />
          ) : null}
        </Modal>
      )}

      {/* Company Inspection (Verification Evidence Summary) */}
      {inspectOrgId && inspectQuery.data?.data && (
        <Modal
          isOpen
          open
          onClose={() => setInspectOrgId(null)}
          title={`Company Inspection: ${inspectQuery.data.data.organization?.name}`}
          size="lg"
        >
          <div className="space-y-4 text-sm">
            <p className="text-ink-700">
              Verification status: <strong>{inspectQuery.data.data.organization?.verificationStatus}</strong>
            </p>
            <p className="text-xs text-ink-500">
              Risk indicators are explanations for review. They are not proof of wrongdoing.
            </p>
            {(inspectQuery.data.data.organization?.riskFlags || []).map((flag, idx) => (
              <p key={idx} className="text-xs text-ink-700">
                • {flag.message}
              </p>
            ))}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setInspectOrgId(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Decision Confirmation Modal: Single or Selected Jobs */}
      {decision && (
        <Modal
          isOpen
          open
          onClose={() => setDecision(null)}
          title={
            decision.bulk
              ? `${ACTION_COPY[decision.action].title} ${decision.jobs.length} selected job(s)`
              : `${ACTION_COPY[decision.action].title} "${decision.jobs[0]?.title}"`
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-600">
              {decision.action === "approve" &&
                "Approving makes the listing visible to candidates once it passes the company check."}
              {decision.action === "reject" &&
                "The recruiter sees this reason and can edit the job and submit it again. Mandatory reason is required."}
              {decision.action === "request_changes" &&
                "The job stays hidden. The recruiter sees the required changes, edits it, and resubmits. Actionable message is required."}
              {decision.action === "suspend" &&
                "The job is hidden from candidates and cannot be resubmitted by the recruiter until reinstated. Mandatory reason is required."}
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
                placeholder="Explain what needs to change or why this is being rejected or suspended (minimum 3 characters)..."
              />
            )}
            {decisionError && (
              <p role="alert" className="text-sm text-danger-700">
                {decisionError}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setDecision(null)}>
                Cancel
              </Button>
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

/** Counts for drawer header computed from jobs */
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

/** Individual Job Review component with full details and moderation audit history */
const JobDetail = ({ job, actions, onDecide }) => {
  const label = reviewLabel(job);
  const isVerified = job.organization?.verificationStatus === "verified";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={label.tone}>{label.text}</Badge>
        <Badge tone="ink">{job.workplaceMode}</Badge>
        {job.jobType && (
          <Badge tone="brand" variant="outline">
            {job.jobType.replace("_", " ")}
          </Badge>
        )}
        {job.department && <Badge tone="ink">{job.department}</Badge>}
        {job.experience ? <Badge tone="brand">{job.experience}</Badge> : null}
        <span className="text-xs text-ink-500">
          {job.organization?.name} · {job.recruiter?.name || "Recruiter"}
        </span>
      </div>

      {/* Company Verification Banner */}
      <div
        className={`flex items-center justify-between rounded-xl p-3 text-xs border ${
          isVerified
            ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
            : "bg-amber-50/70 border-amber-200 text-amber-900"
        }`}
      >
        <div>
          <span className="font-semibold">Company Status: </span>
          <span>{job.organization?.verificationStatus?.replace("_", " ") || "Unknown"}</span>
          {job.organization?.riskScore !== undefined && (
            <span className="ml-2 font-mono">(Risk: {job.organization.riskScore}/100)</span>
          )}
        </div>
        {!isVerified && (
          <span className="font-bold text-amber-800">Approvals blocked until verified</span>
        )}
      </div>

      {/* Compensation & Location */}
      <div className="rounded-xl bg-ink-50 p-4 text-xs text-ink-700">
        <p className="font-semibold text-ink-900">Compensation & Location</p>
        <p className="mt-1">
          {lpa(job)} · {job.location} ({job.workplaceMode})
        </p>
      </div>

      {/* Skills */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Required skills</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(job.requiredSkills?.length ? job.requiredSkills : job.skills || []).map((skill) => (
            <Badge key={skill} tone="brand">
              {skill}
            </Badge>
          ))}
        </div>
      </div>

      {job.preferredSkills?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Preferred skills</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.preferredSkills.map((skill) => (
              <Badge key={skill} tone="ink" variant="outline">
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Description & Responsibilities */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Job Description</h4>
        <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl border border-ink-100 p-4 text-xs leading-relaxed text-ink-700">
          {job.description}
        </div>
      </div>

      {/* Proposed Changes Review */}
      {job.changeReview?.status === "pending" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-semibold">Proposed Changes (live listing remains active until approved)</p>
          <ul className="mt-2 list-disc pl-5">
            {Object.keys(job.changeReview.fields || {}).map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Application Questions */}
      {job.applicationQuestions?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Screening Questions</h4>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-700">
            {job.applicationQuestions.map((q, idx) => (
              <li key={idx} className="rounded-lg bg-ink-50 p-2.5">
                {idx + 1}. {q.question || q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Moderation History Audit Trail */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Moderation History</h4>
        {job.history?.length ? (
          <ol className="mt-2 space-y-2 text-xs">
            {job.history.map((event) => (
              <li key={event.id} className="rounded-lg border border-ink-100 p-2.5">
                <span className="font-semibold text-ink-900">
                  {event.fromStatus || "new"} → {event.toStatus}
                </span>
                <span className="ml-2 text-ink-500">
                  {event.actor?.name || "System"} · {formatDateTime(event.createdAt)}
                </span>
                {event.reason ? <p className="mt-1 text-ink-700 italic">“{event.reason}”</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-ink-500">No decisions recorded yet.</p>
        )}
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
        {actions.map((action) => (
          <Button
            key={action}
            variant={action === "approve" || action === "reinstate" ? "primary" : "danger"}
            disabled={action === "approve" && !isVerified}
            title={action === "approve" && !isVerified ? "Company must be verified before approving" : undefined}
            onClick={() => onDecide(action)}
          >
            {ACTION_COPY[action].title}
          </Button>
        ))}
        {actions.length === 0 && (
          <p className="text-xs text-ink-500">No decision is available for this job in its current state.</p>
        )}
      </div>
    </div>
  );
};

export default AdminModeration;
