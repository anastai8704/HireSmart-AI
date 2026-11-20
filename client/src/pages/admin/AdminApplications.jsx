import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Kpi from "../../components/ui/Kpi";
import { LoadingState, ErrorState, EmptyState } from "../../components/ui/States";
import { Candidate360Drawer } from "../../components/admin/Candidate360Drawer";
import { adminApi } from "../../lib/api";
import { formatDate, formatDateTime, formatSalary, initials } from "../../lib/utils";

const STATUS_TONES = {
  Applied: "neutral",
  submitted: "neutral",
  under_review: "warning",
  Shortlisted: "info",
  shortlisted: "info",
  Interview: "brand",
  interview: "brand",
  offer: "success",
  Selected: "success",
  hired: "success",
  Rejected: "danger",
  rejected: "danger",
  withdrawn: "neutral",
};

const STATUS_LABELS = {
  Applied: "Submitted",
  submitted: "Submitted",
  under_review: "Under Review",
  Shortlisted: "Shortlisted",
  shortlisted: "Shortlisted",
  Interview: "Interview",
  interview: "Interview",
  offer: "Offer Issued",
  Selected: "Hired",
  hired: "Hired",
  Rejected: "Rejected",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const AdminApplications = () => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [cursor, setCursor] = useState(null);
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [candidate360Id, setCandidate360Id] = useState(null);

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status !== "all" ? status : undefined,
      sortBy: sortBy || undefined,
      limit: 50,
      after: cursor || undefined,
    }),
    [search, status, sortBy, cursor],
  );

  const q = useQuery({
    queryKey: ["admin-applications", params],
    queryFn: () => adminApi.applications(params),
  });

  const detailQuery = useQuery({
    queryKey: ["admin-application-detail", selectedAppId],
    queryFn: () => adminApi.applicationDetail(selectedAppId),
    enabled: Boolean(selectedAppId),
  });

  const rows = q.data?.data || [];
  const counts = q.data?.meta?.counts || {};
  const detail = detailQuery.data?.data;

  return (
    <div className="page-wrap space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
            Platform Oversight
          </span>
          <h1 className="text-2xl font-black tracking-tight text-ink-950 sm:text-3xl">
            Application Oversight
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Audit applicant pipelines, review hiring milestones, offer status, and requisition lifecycle across all employers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => q.refetch()}
            loading={q.isFetching}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Kpi
          label="Total Apps"
          value={counts.total ?? rows.length}
          tone="neutral"
          icon={FileText}
          caption="All time"
        />
        <Kpi
          label="Under Review"
          value={counts.underReview ?? 0}
          tone="warning"
          icon={Clock}
          caption="Screening stage"
        />
        <Kpi
          label="Shortlisted"
          value={counts.shortlisted ?? 0}
          tone="info"
          icon={Layers}
          caption="Qualified"
        />
        <Kpi
          label="Interviews"
          value={counts.interview ?? 0}
          tone="brand"
          icon={Users}
          caption="In rounds"
        />
        <Kpi
          label="Offers"
          value={counts.offer ?? 0}
          tone="success"
          icon={CheckCircle2}
          caption="Issued/Pending"
        />
        <Kpi
          label="Hired"
          value={counts.hired ?? 0}
          tone="success"
          icon={ShieldCheck}
          caption="Joined"
        />
        <Kpi
          label="Rejected"
          value={counts.rejected ?? 0}
          tone="danger"
          icon={XCircle}
          caption="Declined"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 shadow-xs">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            aria-label="Search applications"
            placeholder="Search candidate, job title, company, or ID…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(null);
            }}
            className="pl-9"
          />
        </div>
        <SearchableSelect
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursor(null);
          }}
          options={[
            { value: "all", label: "All Statuses" },
            { value: "submitted", label: "Submitted" },
            { value: "under_review", label: "Under Review" },
            { value: "shortlisted", label: "Shortlisted" },
            { value: "interview", label: "Interview" },
            { value: "offer", label: "Offer Issued" },
            { value: "hired", label: "Hired" },
            { value: "rejected", label: "Rejected" },
          ]}
          className="w-44"
        />
        <SearchableSelect
          aria-label="Sort applications"
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setCursor(null);
          }}
          options={[
            { value: "newest", label: "Applied: Newest First" },
            { value: "oldest", label: "Applied: Oldest First" },
            { value: "status", label: "Status Stage" },
          ]}
          className="w-48"
        />
      </div>

      {/* Table Content */}
      {q.isLoading ? (
        <LoadingState message="Loading applications oversight…" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No applications match criteria"
          description="Adjust your search query or status filter to see candidate applications."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-xs">
          <table className="w-full text-left text-sm text-ink-800">
            <thead className="border-b border-ink-100 bg-ink-50/70 text-xs font-bold uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-5 py-3.5">Candidate</th>
                <th className="px-5 py-3.5">Requisition & Company</th>
                <th className="px-5 py-3.5">Pipeline Status</th>
                <th className="px-5 py-3.5">Applied Date</th>
                <th className="px-5 py-3.5">Milestone / Offer</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((app) => (
                <tr key={app._id} className="transition-colors hover:bg-ink-50/50">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-900 text-xs font-bold text-white shadow-xs">
                        {initials(app.candidate?.name || "Candidate")}
                      </span>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setCandidate360Id(app.candidate?._id)}
                          className="font-semibold text-ink-950 hover:text-brand-600 text-left block truncate"
                        >
                          {app.candidate?.name || "Unknown Candidate"}
                        </button>
                        <p className="text-xs text-ink-400 truncate">{app.candidate?.email}</p>
                        {app.candidate?.location && (
                          <span className="text-[11px] text-ink-500">📍 {app.candidate.location}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-ink-900">
                      {app.job?.title || app.jobSnapshot?.title || "Requisition"}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                      <span className="font-medium text-ink-700">
                        {app.organization?.name || app.jobSnapshot?.company || "Company"}
                      </span>
                      {app.organization?.verificationStatus === "verified" && (
                        <span className="inline-flex items-center text-[10px] text-success-700 font-semibold">
                          <ShieldCheck className="h-3 w-3 mr-0.5" /> Verified
                        </span>
                      )}
                      {(app.job?.workplaceMode || app.jobSnapshot?.workplaceMode) && (
                        <span className="rounded bg-ink-100 px-1.5 py-0.2 text-[10px] text-ink-600 capitalize">
                          {app.job?.workplaceMode || app.jobSnapshot?.workplaceMode}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={STATUS_TONES[app.status] || "neutral"}>
                      {STATUS_LABELS[app.status] || app.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-ink-500 whitespace-nowrap">
                    {formatDate(app.appliedAt || app.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    {app.offer?.status && app.offer.status !== "none" ? (
                      <div className="text-xs">
                        <span className="font-semibold text-success-800 capitalize">
                          Offer {app.offer.status}
                        </span>
                        {app.offer.ctc && (
                          <p className="text-[11px] text-ink-600 font-medium">
                            {formatSalary(app.offer.ctc, app.offer.currency)}
                          </p>
                        )}
                      </div>
                    ) : app.matchScore ? (
                      <span className="text-xs font-semibold text-brand-700">
                        Match: {app.matchScore}%
                      </span>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedAppId(app._id)}
                    >
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Application Detail Modal */}
      {selectedAppId && (
        <Modal
          isOpen={Boolean(selectedAppId)}
          onClose={() => setSelectedAppId(null)}
          title="Application Oversight & Pipeline History"
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
        >
          {detailQuery.isLoading ? (
            <LoadingState message="Loading application details…" />
          ) : detailQuery.error ? (
            <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
          ) : !detail ? (
            <EmptyState title="Application not found" />
          ) : (
            <div className="space-y-6">
              {/* Header Box */}
              <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-400">
                      Application ID: {detail._id}
                    </span>
                    <h3 className="text-xl font-bold text-ink-950 mt-0.5">
                      {detail.job?.title || detail.jobSnapshot?.title || "Requisition"}
                    </h3>
                    <p className="text-sm font-medium text-ink-700">
                      Employer: {detail.organization?.name || detail.jobSnapshot?.company || "Organization"}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONES[detail.status] || "neutral"}>
                    {STATUS_LABELS[detail.status] || detail.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500 pt-1 border-t border-ink-200/60">
                  <span>Candidate: <strong>{detail.candidate?.name}</strong> ({detail.candidate?.email})</span>
                  <span>Applied: {formatDateTime(detail.appliedAt || detail.createdAt)}</span>
                  {detail.source && <span>Source: {detail.source}</span>}
                </div>

                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setCandidate360Id(detail.candidate?._id)}
                  >
                    Open Candidate 360° Profile
                  </Button>
                </div>
              </div>

              {/* Offer Information Card */}
              {detail.offer?.status && detail.offer.status !== "none" && (
                <div className="rounded-xl border border-success-200 bg-success-50/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-success-800">
                      Offer Milestone & Terms
                    </h4>
                    <Badge tone="success">{detail.offer.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                    <div>
                      <p className="text-ink-500">Designation</p>
                      <p className="font-bold text-ink-900">{detail.offer.designation || "—"}</p>
                    </div>
                    <div>
                      <p className="text-ink-500">Compensation</p>
                      <p className="font-bold text-success-800">
                        {formatSalary(detail.offer.ctc, detail.offer.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-ink-500">Joining Date</p>
                      <p className="font-semibold text-ink-900">
                        {detail.offer.joiningDate ? formatDate(detail.offer.joiningDate) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-ink-500">Offer Expiry</p>
                      <p className="font-semibold text-ink-900">
                        {detail.offer.expiresAt ? formatDate(detail.offer.expiresAt) : "—"}
                      </p>
                    </div>
                  </div>
                  {detail.offer.notes && (
                    <p className="text-xs text-ink-700 bg-white/70 p-2.5 rounded-lg border border-ink-100">
                      <strong>Offer Notes:</strong> {detail.offer.notes}
                    </p>
                  )}
                </div>
              )}

              {/* Status History Timeline */}
              <div className="rounded-xl border border-ink-100 bg-white p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                  Pipeline Status History & Transitions
                </h4>
                {(detail.statusHistory || []).length > 0 ? (
                  <div className="relative border-l-2 border-ink-200 ml-3 pl-4 space-y-4">
                    {detail.statusHistory.map((step, idx) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-brand-600 bg-white" />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-ink-900">
                            {step.fromStatus ? `${STATUS_LABELS[step.fromStatus] || step.fromStatus} → ` : ""}
                            {STATUS_LABELS[step.status] || step.status}
                          </p>
                          <span className="text-[11px] text-ink-400">
                            {formatDateTime(step.changedAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-500">
                          Changed by: {step.changedBy?.name || step.changedBy?.email || "System"} ({step.changedBy?.role || "user"})
                        </p>
                        {step.note && (
                          <p className="mt-1 text-xs text-ink-700 bg-ink-50 p-2 rounded border border-ink-100">
                            {step.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-400">No recorded stage transitions.</p>
                )}
              </div>

              {/* Screening Answers */}
              {(detail.screeningAnswers || []).length > 0 && (
                <div className="rounded-xl border border-ink-100 bg-white p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Screening Question Responses
                  </h4>
                  <div className="divide-y divide-ink-100 text-xs">
                    {detail.screeningAnswers.map((ans, idx) => (
                      <div key={idx} className="py-2 first:pt-0 last:pb-0">
                        <p className="font-semibold text-ink-900">
                          {ans.question || `Question ${idx + 1}`}
                        </p>
                        <p className="mt-0.5 text-ink-700">
                          Answer: {ans.answer !== undefined ? String(ans.answer) : "No answer provided"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recruiter Notes */}
              {detail.recruiterNotes && (
                <div className="rounded-xl border border-ink-100 bg-white p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Employer Internal Notes
                  </h4>
                  <p className="mt-1.5 text-xs text-ink-800 whitespace-pre-line bg-ink-50/60 p-3 rounded-lg border border-ink-100">
                    {detail.recruiterNotes}
                  </p>
                </div>
              )}

              {/* Governance Neutrality Notice */}
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-xs text-brand-900">
                <span className="font-bold">Administrative Oversight Policy:</span> Platform administrators maintain impartial oversight of applicant tracking and audit histories. Direct candidate hiring or placement confirmation is strictly determined by employer offer issuance and candidate agreement.
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Candidate 360 Profile Drawer */}
      {candidate360Id && (
        <Candidate360Drawer
          candidateId={candidate360Id}
          onClose={() => setCandidate360Id(null)}
        />
      )}
    </div>
  );
};
export default AdminApplications;
