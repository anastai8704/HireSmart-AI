// Admin placements and employment (Requirement 9): Company → Jobs → Placements → Candidate → Employment history.
// Reported facts (candidate or company) and verified facts (platform administrator) are shown side by side.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Clock,
  ExternalLink,
  ShieldCheck,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Kpi from "../../components/ui/Kpi";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { adminApi } from "../../lib/api";
import { formatSalary } from "../../lib/utils";
import {
  EMPLOYMENT_EVENT_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  fmtCount,
  fmtIst,
  PLACEMENT_STATUS_LABELS,
  SOURCE_LABELS,
} from "../../lib/revenueFormat";
import { SearchableSelect } from "../../components/ui/SearchableSelect";

// Pipeline filter (the placement lifecycle). Employment status is shown on each row and in the detail view.
const STATUS_FILTER = ["", "hired", "joining_confirmed", "placement_verified"];

const VerifiedBadge = ({ verified }) => (
  <Badge variant={verified ? "success" : "warning"}>{verified ? "Platform verified" : "Not verified"}</Badge>
);

export const AdminPlacements = () => {
  const [companyId, setCompanyId] = useState("");
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");
  const [verified, setVerified] = useState("");

  const companies = useQuery({
    queryKey: ["admin-placement-companies"],
    queryFn: adminApi.placementCompanies,
  });
  const jobs = useQuery({
    queryKey: ["admin-placement-jobs", companyId],
    queryFn: () => adminApi.placementCompanyJobs(companyId),
    enabled: Boolean(companyId),
  });
  const placements = useQuery({
    queryKey: ["admin-placements", companyId, jobId, status, verified],
    queryFn: async () => {
      const res = await adminApi.placements({
        ...(companyId ? { organizationId: companyId } : {}),
        ...(jobId ? { jobId } : {}),
        ...(status ? { status } : {}),
        ...(verified ? { verified } : {}),
        limit: 50,
      });
      return res || { data: [] };
    },
    enabled: true,
  });

  const companyList = companies.data?.data || [];
  const jobList = jobs.data?.data || [];
  const rows = placements.data?.data || [];

  const totalPlacements = companyList.reduce((sum, c) => sum + (c.counts?.total || 0), 0);
  const verifiedPlacements = companyList.reduce((sum, c) => sum + (c.counts?.verified || 0), 0);
  const pendingVerification = companyList.reduce(
    (sum, c) =>
      sum +
      (c.counts?.reportedNotVerified !== undefined
        ? c.counts.reportedNotVerified
        : Math.max(0, (c.counts?.total || 0) - (c.counts?.verified || 0))),
    0,
  );
  const currentlyWorking = companyList.reduce((sum, c) => sum + (c.counts?.currentlyWorking || 0), 0);
  const employmentEnded = companyList.reduce((sum, c) => sum + (c.counts?.employmentEnded || 0), 0);

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Placements"
        title="Placements & employment"
        description="Choose a company, then a job, to see the hired candidates for that job. Each placement keeps its full employment history."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi
          label="Total Placements"
          value={totalPlacements}
          tone="neutral"
          icon={BadgeCheck}
          caption="Recorded hires"
        />
        <Kpi
          label="Pending Verification"
          value={pendingVerification}
          tone="warning"
          icon={Clock}
          caption="Awaiting admin check"
        />
        <Kpi
          label="Platform Verified"
          value={verifiedPlacements}
          tone="success"
          icon={ShieldCheck}
          caption="Independently confirmed"
        />
        <Kpi
          label="Currently Working"
          value={currentlyWorking}
          tone="brand"
          icon={BriefcaseBusiness}
          caption="Active in role"
        />
        <Kpi
          label="Employment Ended"
          value={employmentEnded}
          tone="danger"
          icon={XCircle}
          caption="Completed or exited"
        />
      </div>

      {companies.isLoading && <LoadingState message="Loading companies…" />}
      {companies.error && <ErrorState error={companies.error} onRetry={companies.refetch} />}
      {companies.data && companyList.length === 0 && (
        <EmptyState title="No placements yet" description="Placements appear here once a recruiter marks an application as hired." />
      )}

      {companyList.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section aria-label="Companies" className="rounded-xl border border-ink-100 bg-white">
            <h2 className="border-b border-ink-100 px-4 py-3 text-sm font-bold text-ink-900">Companies</h2>
            <ul className="max-h-[480px] divide-y divide-ink-100 overflow-y-auto">
              <li>
                <button
                  type="button"
                  aria-pressed={companyId === ""}
                  onClick={() => {
                    setCompanyId("");
                    setJobId("");
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-ink-50 ${companyId === "" ? "bg-brand-50" : ""}`}
                >
                  <div className="font-semibold text-ink-900">All Platform Placements</div>
                  <div className="text-xs text-ink-500">
                    {fmtCount(totalPlacements)} total · {fmtCount(verifiedPlacements)} verified
                  </div>
                </button>
              </li>
              {companyList.map((c) => (
                <li key={c.organization.id}>
                  <button
                    type="button"
                    aria-pressed={companyId === c.organization.id}
                    onClick={() => {
                      setCompanyId(c.organization.id);
                      setJobId("");
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-ink-50 ${companyId === c.organization.id ? "bg-brand-50" : ""}`}
                  >
                    <div className="font-medium text-ink-900">{c.organization.name || "Company"}</div>
                    <div className="text-xs text-ink-500">
                      {fmtCount(c.counts.total)} placements · {fmtCount(c.counts.verified)} verified ·{" "}
                      {fmtCount(c.counts.currentlyWorking)} working
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-4">
            {companyId && (
              <section aria-label="Jobs" className="rounded-xl border border-ink-100 bg-white p-4">
                <h2 className="text-sm font-bold text-ink-900">Jobs with placements</h2>
                {jobs.isLoading && <LoadingState message="Loading jobs…" />}
                {jobs.error && <ErrorState error={jobs.error} onRetry={jobs.refetch} />}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={jobId === ""}
                    onClick={() => setJobId("")}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${jobId === "" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600"}`}
                  >
                    All jobs
                  </button>
                  {jobList.map((j) => (
                    <button
                      key={j.job.id}
                      type="button"
                      aria-pressed={jobId === j.job.id}
                      onClick={() => setJobId(j.job.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${jobId === j.job.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600"}`}
                    >
                      {j.job.title} ({fmtCount(j.counts.total)})
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col text-xs font-semibold text-ink-600">
                Employment or placement status
                <SearchableSelect aria-label="Placement status" className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_FILTER.map((s) => (
                    <option key={s || "all"} value={s}>
                      {s ? PLACEMENT_STATUS_LABELS[s] : "All statuses"}
                    </option>
                  ))}
                </SearchableSelect>
              </label>
              <label className="flex flex-col text-xs font-semibold text-ink-600">
                Verification
                <SearchableSelect aria-label="Verification" className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm" value={verified} onChange={(e) => setVerified(e.target.value)}>
                  <option value="">All</option>
                  <option value="true">Platform verified</option>
                  <option value="false">Not verified</option>
                </SearchableSelect>
              </label>
            </div>

            {placements.isLoading && <LoadingState message="Loading placements…" />}
            {placements.error && <ErrorState error={placements.error} onRetry={placements.refetch} />}
            {placements.data && rows.length === 0 && (
              <EmptyState title="No placements match" description="Change the job or the filters." />
            )}
            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
                <table className="w-full min-w-[720px] text-left text-sm" aria-label="Hired candidates">
                  <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th scope="col" className="px-3 py-2">Candidate</th>
                      <th scope="col" className="px-3 py-2">Hired for (job)</th>
                      <th scope="col" className="px-3 py-2">Reported status</th>
                      <th scope="col" className="px-3 py-2">Verification</th>
                      <th scope="col" className="px-3 py-2">Last change (IST)</th>
                      <th scope="col" className="px-3 py-2"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((p) => (
                      <tr key={p._id || p.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-ink-900">{p.candidate?.name || "Candidate"}</div>
                          <div className="text-xs text-ink-500">{p.candidate?.email || ""}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-ink-900">{p.job?.title || "Job removed"}</div>
                          {p.organization?.name && (
                            <div className="text-xs text-ink-500">{p.organization.name}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {EMPLOYMENT_STATUS_LABELS[p.employment?.status] || "Not recorded yet"}
                          <div className="text-xs text-ink-500">Pipeline: {PLACEMENT_STATUS_LABELS[p.status] || p.status}</div>
                          <div className="text-xs text-ink-500">{SOURCE_LABELS[p.employmentStatusSource] || ""}</div>
                        </td>
                        <td className="px-3 py-2"><VerifiedBadge verified={Boolean(p.verification?.isVerified)} /></td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtIst(p.updatedAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            to={`/app/admin/placements/${p._id || p.id}`}
                            className="font-semibold text-brand-700 hover:underline"
                            aria-label={`Open placement for ${p.candidate?.name || "candidate"}`}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const EventList = ({ events }) => {
  if (!events.length) return <p className="text-sm text-ink-500">No events recorded.</p>;
  return (
    <ol className="space-y-3" aria-label="Employment history">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="border-l-2 border-ink-200 pl-4">
          <div className="text-sm font-semibold text-ink-900">{EMPLOYMENT_EVENT_LABELS[e.event] || e.event}</div>
          <div className="text-xs text-ink-600">
            {fmtIst(e.at)} · {SOURCE_LABELS[e.source] || e.source || "—"}
            {e.actor ? ` · ${e.actor}` : ""}
          </div>
          {(e.fromStatus || e.toStatus) && (
            <div className="text-xs text-ink-500">
              {PLACEMENT_STATUS_LABELS[e.fromStatus] || e.fromStatus || "—"} → {PLACEMENT_STATUS_LABELS[e.toStatus] || e.toStatus || "—"}
            </div>
          )}
          {e.note && <div className="mt-1 text-xs text-ink-700">{e.note}</div>}
        </li>
      ))}
    </ol>
  );
};

const CandidateProfilePanel = ({ placementId }) => {
  const [requested, setRequested] = useState(false);
  const profile = useQuery({
    queryKey: ["admin-candidate-profile", placementId],
    queryFn: () => adminApi.placementCandidateProfile(placementId),
    enabled: requested,
    retry: false,
  });

  if (!requested) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ink-600">
          Education, skills, experience and application history. Opening this profile is recorded in the audit log.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setRequested(true)}>
          View candidate profile
        </Button>
      </div>
    );
  }
  if (profile.isLoading) return <LoadingState message="Loading profile…" />;
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.refetch} />;

  const d = profile.data?.data || {};
  const p = d.profile || {};
  return (
    <div className="space-y-4 text-sm">
      <section aria-label="Skills">
        <h3 className="font-semibold text-ink-900">Skills</h3>
        <p className="text-ink-700">{(d.skills || []).join(", ") || "No skills on file"}</p>
      </section>
      <section aria-label="Education">
        <h3 className="font-semibold text-ink-900">Education</h3>
        <ul className="list-disc pl-5 text-ink-700">
          {(p.education || []).map((e, i) => (
            <li key={i}>{[e.degree, e.fieldOfStudy, e.institution].filter(Boolean).join(", ")}</li>
          ))}
          {!(p.education || []).length && <li className="list-none text-ink-500">None on file</li>}
        </ul>
      </section>
      <section aria-label="Experience">
        <h3 className="font-semibold text-ink-900">Experience</h3>
        <ul className="list-disc pl-5 text-ink-700">
          {(p.experience || []).map((e, i) => (
            <li key={i}>{[e.position, e.company].filter(Boolean).join(" at ")}</li>
          ))}
          {!(p.experience || []).length && <li className="list-none text-ink-500">None on file</li>}
        </ul>
      </section>
      <section aria-label="Application history">
        <h3 className="font-semibold text-ink-900">Application history</h3>
        <ul className="divide-y divide-ink-100 text-ink-700">
          {(d.applicationHistory || []).map((a) => (
            <li key={a.id} className="py-1.5">
              {a.jobTitle || "Job"} · {a.organizationName || "Company"} · {a.status} · {fmtIst(a.appliedAt)}
            </li>
          ))}
          {!(d.applicationHistory || []).length && <li className="py-1.5 text-ink-500">No applications</li>}
        </ul>
      </section>
    </div>
  );
};

export const AdminPlacementDetail = () => {
  const { placementId } = useParams();

  const detail = useQuery({
    queryKey: ["admin-placement-detail", placementId],
    queryFn: () => adminApi.placementDetail(placementId),
    retry: false,
  });

  if (detail.isLoading) return <LoadingState message="Loading placement…" />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.refetch} />;

  const { placement: p = {}, application: app } = detail.data?.data || {};
  const isVerified = Boolean(p.verification?.isVerified);

  return (
    <div className="page-wrap space-y-6">
      <div>
        <Link
          to="/app/admin/placements"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-950 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Placements</span>
        </Link>
      </div>

      <PageHeader
        eyebrow="Employment Oversight"
        title={p.candidate?.name || "Placement Record"}
        description={`${p.job?.title || "Job"} at ${p.organization?.name || "company"}`}
        action={
          <Link
            to="/app/admin/placements"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>All Placements</span>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Placement facts" className="space-y-4 rounded-xl border border-ink-100 bg-white p-5">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <h2 className="text-sm font-bold text-ink-900">Placement &amp; Offer Details</h2>
            <VerifiedBadge verified={isVerified} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-ink-500">Company</dt>
            <dd className="font-semibold text-ink-900">{p.organization?.name || "—"}</dd>
            <dt className="text-ink-500">Hired for (Job)</dt>
            <dd className="font-semibold text-ink-900">{p.job?.title || "Job removed"}</dd>
            <dt className="text-ink-500">Designation</dt>
            <dd>{p.offerDetails?.designation || p.job?.title || "—"}</dd>
            <dt className="text-ink-500">Compensation (CTC)</dt>
            <dd className="font-semibold text-success-800">
              {p.offerDetails?.ctc ? formatSalary(p.offerDetails.ctc, p.offerDetails.currency) : "—"}
            </dd>
            <dt className="text-ink-500">Joining Date</dt>
            <dd>
              {p.joiningConfirmation?.actualJoiningDate
                ? fmtIst(p.joiningConfirmation.actualJoiningDate)
                : p.offerDetails?.offeredJoiningDate
                  ? fmtIst(p.offerDetails.offeredJoiningDate)
                  : "—"}
            </dd>
            <dt className="text-ink-500">Candidate email</dt>
            <dd className="break-all">{p.candidate?.email || "—"}</dd>
            <dt className="text-ink-500">Offer Acceptance</dt>
            <dd>
              {p.offerDetails?.acceptedAt ? fmtIst(p.offerDetails.acceptedAt) : "Accepted"}
              {p.joiningConfirmation?.confirmedByCandidate && (
                <span className="block text-xs text-success-700 font-medium">✓ Joining confirmed by candidate</span>
              )}
            </dd>
            <dt className="text-ink-500">Employment status</dt>
            <dd>
              {EMPLOYMENT_STATUS_LABELS[p.employment?.status] || "Not recorded yet"}
              <div className="text-xs text-ink-500">
                Last verified: {EMPLOYMENT_STATUS_LABELS[p.employment?.lastVerifiedStatus] || "none yet"}
              </div>
              <div className="text-xs text-ink-500">{SOURCE_LABELS[p.employmentFacts?.reported?.source] || "No change reported yet"}</div>
            </dd>
            <dt className="text-ink-500">Pipeline status</dt>
            <dd>{PLACEMENT_STATUS_LABELS[p.status] || p.status}</dd>
            <dt className="text-ink-500">Verification</dt>
            <dd>
              <VerifiedBadge verified={isVerified} />
              {isVerified && (
                <div className="text-xs text-ink-500">
                  {fmtIst(p.verification?.verifiedAt)}
                  {p.verification?.verifiedBy?.name ? ` · ${p.verification.verifiedBy.name}` : ""}
                </div>
              )}
            </dd>
            <dt className="text-ink-500">Employment period</dt>
            <dd>
              {p.employmentPeriod?.startDate ? fmtIst(p.employmentPeriod.startDate) : "—"}
              {p.employmentPeriod?.endDate ? ` → ${fmtIst(p.employmentPeriod.endDate)}` : ""}
            </dd>
            {p.verification?.proofDocumentUrl && (
              <>
                <dt className="text-ink-500">Supporting Evidence</dt>
                <dd>
                  <a
                    href={p.verification.proofDocumentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                  >
                    View Evidence Document <ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </>
            )}
          </dl>

          {app && (
            <div className="border-t border-ink-100 pt-4 text-sm">
              <h3 className="font-semibold text-ink-900">Originating application</h3>
              <p className="text-ink-700">
                {app.jobTitle || "Job"} · applied {fmtIst(app.appliedAt)} · now <strong>{app.status}</strong>
              </p>
            </div>
          )}

          <div className="border-t border-ink-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Candidate profile</h3>
            <CandidateProfilePanel placementId={placementId} />
          </div>
        </section>

        <div className="space-y-6">
          <section aria-label="Employment overview" className="space-y-3 rounded-xl border border-ink-100 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">Employment Status &amp; Record</h2>
            <p className="text-xs text-ink-600">
              Read-only verified placement record. Placement records originate through recruiter offer acceptances and candidate onboarding.
            </p>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-500">Current Employment Status:</span>
                <span className="font-bold text-ink-900">{EMPLOYMENT_STATUS_LABELS[p.employment?.status] || p.status || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Joining Confirmation:</span>
                <span className="text-ink-800 font-medium">{p.joiningConfirmation?.confirmedByCandidate ? "Confirmed by Candidate" : "Offer Accepted"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Platform Status:</span>
                <span className="text-ink-800">{isVerified ? "Platform Verified" : "Standard Placement"}</span>
              </div>
            </div>
          </section>

          <section aria-label="Employment history" className="rounded-xl border border-ink-100 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold text-ink-900">Employment History</h2>
            <EventList events={p.employmentHistory || []} />
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminPlacements;
