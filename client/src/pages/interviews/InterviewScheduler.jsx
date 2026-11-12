import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Download, FileText, Info } from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Select } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import { EmptyState, ErrorState, LoadingState, SkeletonList } from "../../components/ui/States";
import { ErrorCallout, PageHeader, StatusPill } from "../../components/Product";
import { useToast } from "../../components/ui/useToast";
import { useAuth } from "../../context/useAuth";
import { newId } from "../../lib/id";
import {
  downloadBlob,
  integrationsApi,
  interviewApi,
  jobsApi,
  organizationApi,
  recruitmentApi,
} from "../../lib/api";
import {
  DEFAULT_TIMEZONE,
  INTERVIEW_TYPES,
  TIMEZONE_OPTIONS,
  buildScheduleBody,
  roundLabel,
  validateSchedule,
} from "../../lib/interviewWorkflow";
import { formatDate } from "../../lib/utils";

const idOf = (value) => value?.id || value?._id || "";
const OPEN = ["draft", "invited", "confirmed", "reschedule_requested", "rescheduled", "in_progress"];

const useOrg = () => {
  const { organizationId } = useParams();
  const auth = useAuth();
  return organizationId || auth.organizationId;
};

/** Adds minutes to a datetime-local value without a timezone shift (India has no DST; used for duration presets). */
const addMinutesToLocal = (local, minutes) => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(local || "");
  if (!match) return "";
  const date = new Date(`${match[1]}T${match[2]}:00Z`);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString().slice(0, 16);
};

const GoogleNotice = ({ google }) => {
  if (google.isLoading) return null;
  const status = google.data?.data;
  if (google.error || !status) {
    return (
      <p role="status" className="rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs text-ink-700">
        Google Calendar status could not be checked. The interview will still be saved; add a meeting link if you need
        one now.
      </p>
    );
  }
  if (status.connected) {
    return (
      <p role="status" className="rounded-xl border border-success-200 bg-success-50 p-3 text-xs text-success-900">
        Google Calendar is connected. A Google Meet link is created automatically when you schedule.
      </p>
    );
  }
  return (
    <p role="status" className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-900">
      {status.configured
        ? "Google Calendar is not connected, so no Google Meet link will be created. "
        : "Google Calendar is not set up on this server, so no Google Meet link will be created. "}
      <Link to="/app/settings/integrations" className="font-semibold underline">
        Open integration settings
      </Link>{" "}
      or add a meeting link below. A manual link is labelled as manual.
    </p>
  );
};

const CandidateProfile = ({ orgId, application, jobTitle }) => {
  const toast = useToast();
  const candidate = application.candidate || {};
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const blob = await recruitmentApi.resume(orgId, idOf(application));
      downloadBlob(blob, `${(candidate.name || "candidate").replace(/\s+/g, "-")}-resume.pdf`);
    } catch (error) {
      toast.error(error.message || "The resume could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <section aria-labelledby="candidate-profile-heading" className="panel space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="candidate-profile-heading" className="text-base font-bold text-ink-950">
            {candidate.name || "Candidate"}
          </h3>
          {candidate.headline && <p className="text-sm text-ink-600">{candidate.headline}</p>}
          {candidate.location && <p className="text-xs text-ink-500">{candidate.location}</p>}
        </div>
        <StatusPill status={application.status} />
      </div>
      <dl className="grid gap-2 text-xs text-ink-600 sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-ink-800">Job</dt>
          <dd>{jobTitle || application.job?.title || "Job"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-800">Applied</dt>
          <dd>{application.appliedAt ? formatDate(application.appliedAt) : "—"}</dd>
        </div>
        {candidate.email && (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-ink-800">Email</dt>
            <dd className="break-all">{candidate.email}</dd>
          </div>
        )}
      </dl>
      {Array.isArray(candidate.skills) && candidate.skills.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-800">Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {candidate.skills.slice(0, 10).map((skill) => (
              <Badge key={skill} variant="outline" className="text-[11px]">
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}
        isLoading={downloading}
        onClick={download}
      >
        Download resume
      </Button>
    </section>
  );
};

const InterviewScheduler = () => {
  const orgId = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const prefilledApplicationId = params.get("applicationId") || "";
  const prefilledJobId = params.get("jobId") || "";

  const [jobId, setJobId] = useState(prefilledJobId);
  const [jobSearch, setJobSearch] = useState("");
  const [applicationId, setApplicationId] = useState(prefilledApplicationId);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [participantIds, setParticipantIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(() => ({
    title: "Technical interview",
    type: "video",
    start: "",
    end: "",
    timezone: DEFAULT_TIMEZONE,
    location: "",
    meetingUrl: "",
  }));

  const jobs = useQuery({
    queryKey: ["jobs-org", orgId, "scheduler"],
    queryFn: () => jobsApi.orgList(orgId, { limit: 100 }),
    enabled: Boolean(orgId),
  });
  // A prefilled application (from an applicant row) tells us its job, so the job step can be skipped.
  const prefilledDetail = useQuery({
    queryKey: ["application-detail", orgId, prefilledApplicationId],
    queryFn: () => recruitmentApi.detail(orgId, prefilledApplicationId),
    enabled: Boolean(orgId && prefilledApplicationId && !prefilledJobId),
  });
  const effectiveJobId = jobId || prefilledDetail.data?.data?.application?.job?._id || prefilledDetail.data?.data?.application?.job || "";
  const selectedJob = (jobs.data?.data || []).find((job) => idOf(job) === effectiveJobId);

  // Only this job's applications are loaded (Requirement 3).
  const applications = useQuery({
    queryKey: ["applications-job", orgId, effectiveJobId, "scheduler"],
    queryFn: () => recruitmentApi.applications(orgId, effectiveJobId, { limit: 100 }),
    enabled: Boolean(orgId && effectiveJobId),
  });
  const existing = useQuery({
    queryKey: ["interviews-application", orgId, applicationId],
    queryFn: () => interviewApi.list(orgId, { applicationId, limit: 100 }),
    enabled: Boolean(orgId && applicationId),
  });
  const members = useQuery({
    queryKey: ["organization-members", orgId],
    queryFn: () => organizationApi.members(orgId, { limit: 100 }),
    enabled: Boolean(orgId),
  });
  const google = useQuery({
    queryKey: ["google-status"],
    queryFn: () => integrationsApi.googleStatus(),
    retry: false,
  });

  const jobList = useMemo(
    () =>
      (jobs.data?.data || []).filter((job) =>
        jobSearch.trim() ? (job.title || "").toLowerCase().includes(jobSearch.trim().toLowerCase()) : true,
      ),
    [jobs.data, jobSearch],
  );
  const applicationList = useMemo(() => {
    const term = candidateSearch.trim().toLowerCase();
    return (applications.data?.data || []).filter((app) =>
      term ? (app.candidate?.name || app.candidate?.email || "").toLowerCase().includes(term) : true,
    );
  }, [applications.data, candidateSearch]);
  const selectedApplication = (applications.data?.data || []).find((app) => idOf(app) === applicationId)
    || (prefilledDetail.data?.data?.application && idOf(prefilledDetail.data.data.application) === applicationId
      ? prefilledDetail.data.data.application
      : null);

  const existingRounds = (existing.data?.data || []).filter((i) => i.status !== "cancelled");
  const openRounds = existingRounds.filter((i) => OPEN.includes(i.status));
  const nextRound = existingRounds.length + 1;

  const create = useMutation({
    mutationFn: ({ body, key }) => interviewApi.create(orgId, body, key),
    onSuccess: () => {
      toast.success("Interview scheduled. The candidate has been invited.");
      qc.invalidateQueries({ queryKey: ["interviews", orgId] });
      navigate(`/app/o/${orgId}/interviews`);
    },
    onError: (error) => toast.error(error.message || "Unable to schedule the interview."),
  });

  const chooseJob = (id) => {
    setJobId(id);
    setApplicationId("");
    setCandidateSearch("");
    setErrors({});
  };
  const chooseApplication = (id) => {
    setApplicationId(id);
    setErrors({});
  };
  const applyDuration = (minutes) => {
    const end = addMinutesToLocal(form.start, minutes);
    if (!end) return;
    setForm((f) => ({ ...f, end }));
  };

  const submit = (event) => {
    event.preventDefault();
    const found = validateSchedule({ ...form, jobId: effectiveJobId, applicationId, participantIds });
    setErrors(found);
    if (Object.keys(found).length) return;
    const body = buildScheduleBody({ ...form, jobId: effectiveJobId, applicationId, participantIds });
    create.mutate({ body, key: newId() });
  };

  const memberOptions = members.data?.data || [];
  const formError = create.error;

  return (
    <div className="page-wrap max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Interviews"
        title="Schedule an interview"
        description="Choose the job first, then the candidate who applied to it. Only that job's applications are shown."
        action={
          <Button as={Link} to={`/app/o/${orgId}/interviews`} variant="secondary" size="sm">
            Back to interviews
          </Button>
        }
      />

      <ol className="flex flex-wrap gap-2 text-xs font-semibold" aria-label="Scheduling steps">
        <li className={effectiveJobId ? "text-success-700" : "text-brand-700"} aria-current={!effectiveJobId ? "step" : undefined}>
          1. Job {effectiveJobId ? "✓" : ""}
        </li>
        <li className="text-ink-300" aria-hidden="true">›</li>
        <li className={applicationId ? "text-success-700" : effectiveJobId ? "text-brand-700" : "text-ink-400"} aria-current={effectiveJobId && !applicationId ? "step" : undefined}>
          2. Candidate {applicationId ? "✓" : ""}
        </li>
        <li className="text-ink-300" aria-hidden="true">›</li>
        <li className={applicationId ? "text-brand-700" : "text-ink-400"} aria-current={applicationId ? "step" : undefined}>
          3. Schedule
        </li>
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <section aria-labelledby="job-step-heading" className="panel space-y-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="job-step-heading" className="font-bold text-ink-950">
                Step 1: Choose a job
              </h2>
              {effectiveJobId && (
                <Button size="sm" variant="ghost" onClick={() => chooseJob("")}>
                  Change job
                </Button>
              )}
            </div>
            {errors.jobId && <p role="alert" className="text-xs font-semibold text-danger-700">{errors.jobId}</p>}
            {jobs.isLoading ? (
              <SkeletonList rows={3} />
            ) : jobs.error ? (
              <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
            ) : (jobs.data?.data || []).length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No jobs yet"
                description="Create and publish a job before scheduling interviews."
                action={
                  <Button as={Link} to={`/app/o/${orgId}/jobs/new`} size="sm" variant="secondary">
                    Create a job
                  </Button>
                }
              />
            ) : effectiveJobId && selectedJob ? (
              <p className="rounded-xl bg-ink-50 p-3 text-sm text-ink-800">
                <span className="font-semibold">{selectedJob.title}</span>
                {selectedJob.location ? ` · ${selectedJob.location}` : ""}
              </p>
            ) : (
              <>
                <Input
                  label="Search jobs"
                  placeholder="Type a job title"
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                />
                <fieldset className="space-y-1">
                  <legend className="sr-only">Job</legend>
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {jobList.map((job) => (
                      <label
                        key={idOf(job)}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink-100 p-3 text-sm hover:bg-ink-50 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink-900">{job.title}</span>
                          <span className="text-xs text-ink-500">{job.location || "Location not set"}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <StatusPill status={job.status} />
                          <input
                            type="radio"
                            name="job"
                            className="h-4 w-4 accent-brand-600"
                            checked={effectiveJobId === idOf(job)}
                            onChange={() => chooseJob(idOf(job))}
                          />
                        </span>
                      </label>
                    ))}
                    {jobList.length === 0 && <p className="text-xs text-ink-500">No jobs match that search.</p>}
                  </div>
                </fieldset>
              </>
            )}
          </section>

          {effectiveJobId && (
            <section aria-labelledby="candidate-step-heading" className="panel space-y-3 p-5">
              <h2 id="candidate-step-heading" className="font-bold text-ink-950">
                Step 2: Choose a candidate for this job
              </h2>
              {errors.applicationId && (
                <p role="alert" className="text-xs font-semibold text-danger-700">{errors.applicationId}</p>
              )}
              {applications.isLoading ? (
                <SkeletonList rows={3} />
              ) : applications.error ? (
                <ErrorState error={applications.error} onRetry={() => applications.refetch()} />
              ) : (applications.data?.data || []).length === 0 ? (
                <EmptyState
                  icon={Info}
                  title="No applications for this job"
                  description="Candidates appear here after they apply to this job."
                />
              ) : (
                <>
                  <Input
                    label="Search candidates for this job"
                    placeholder="Type a name"
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                  />
                  <fieldset className="max-h-72 space-y-1 overflow-y-auto">
                    <legend className="sr-only">Candidate</legend>
                    {applicationList.map((app) => (
                      <label
                        key={idOf(app)}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink-100 p-3 text-sm hover:bg-ink-50 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink-900">
                            {app.candidate?.name || "Candidate"}
                          </span>
                          <span className="block truncate text-xs text-ink-500">
                            {app.candidate?.headline || app.candidate?.email || "No headline"}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[11px] capitalize">
                            {String(app.status || "").replaceAll("_", " ")}
                          </Badge>
                          <input
                            type="radio"
                            name="candidate"
                            className="h-4 w-4 accent-brand-600"
                            checked={applicationId === idOf(app)}
                            onChange={() => chooseApplication(idOf(app))}
                          />
                        </span>
                      </label>
                    ))}
                    {applicationList.length === 0 && (
                      <p className="text-xs text-ink-500">No candidates match that search.</p>
                    )}
                  </fieldset>
                </>
              )}
            </section>
          )}

          {selectedApplication && (
            <CandidateProfile orgId={orgId} application={selectedApplication} jobTitle={selectedJob?.title} />
          )}
        </div>

        <div className="space-y-6">
          {applicationId && selectedApplication ? (
            <form onSubmit={submit} noValidate aria-labelledby="schedule-heading" className="panel space-y-4 p-5">
              <div className="border-b border-ink-100 pb-3">
                <h2 id="schedule-heading" className="font-bold text-ink-950">
                  Step 3: Schedule
                </h2>
                <p className="text-xs text-ink-500">
                  {selectedApplication.candidate?.name || "Candidate"} · {selectedJob?.title || "Job"} ·{" "}
                  {roundLabel(nextRound)}
                </p>
              </div>

              {openRounds.length > 0 && (
                <p role="status" className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-900">
                  This candidate already has {openRounds.length} open interview
                  {openRounds.length > 1 ? "s" : ""} for this job. Scheduling another adds{" "}
                  {roundLabel(nextRound)}.
                </p>
              )}

              <GoogleNotice google={google} />

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Interview title"
                  required
                  value={form.title}
                  error={errors.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
                <Select
                  label="Interview type"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  options={INTERVIEW_TYPES}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Starts"
                  type="datetime-local"
                  required
                  value={form.start}
                  error={errors.start}
                  onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                />
                <Input
                  label="Ends"
                  type="datetime-local"
                  required
                  value={form.end}
                  error={errors.end}
                  onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-ink-500" role="group" aria-label="Quick duration">
                <span className="font-medium">Quick duration:</span>
                {[30, 45, 60, 90].map((mins) => (
                  <Button key={mins} type="button" size="sm" variant="ghost" onClick={() => applyDuration(mins)}>
                    {mins} min
                  </Button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Timezone"
                  value={form.timezone}
                  error={errors.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  options={TIMEZONE_OPTIONS.map((zone) => ({ value: zone, label: zone }))}
                />
                <Input
                  label="Location (optional)"
                  placeholder="e.g. Conference Room B"
                  value={form.location}
                  error={errors.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>

              <Input
                label="Meeting link (optional, manual)"
                hint="Leave empty to create a Google Meet link when Google Calendar is connected."
                placeholder="https://"
                value={form.meetingUrl}
                error={errors.meetingUrl}
                onChange={(e) => setForm((f) => ({ ...f, meetingUrl: e.target.value }))}
              />

              {memberOptions.length > 0 && (
                <fieldset>
                  <legend className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink-500">
                    Interviewers (optional)
                  </legend>
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-ink-100 p-2">
                    {memberOptions.map((m) => {
                      const memberUserId = m.user?._id || m.user?.id || m._id;
                      return (
                        <label key={m._id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg p-2 text-xs hover:bg-ink-50">
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              className="shrink-0 rounded text-brand-600 focus:ring-brand-500"
                              checked={participantIds.includes(memberUserId)}
                              onChange={(e) =>
                                setParticipantIds((ids) =>
                                  e.target.checked ? [...ids, memberUserId] : ids.filter((id) => id !== memberUserId),
                                )
                              }
                            />
                            <span className="truncate font-medium text-ink-900">{m.user?.name || m.user?.email}</span>
                          </span>
                          <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                            {String(m.role || "").replaceAll("_", " ")}
                          </Badge>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {formError && <ErrorCallout error={formError} />}
              <Button
                type="submit"
                fullWidth
                isLoading={create.isPending}
                leftIcon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}
              >
                Schedule and send invitation
              </Button>
              <p className="text-xs text-ink-500">
                The candidate gets an invitation and must confirm. Times are shown in the timezone you choose.
              </p>
            </form>
          ) : (
            <EmptyState
              icon={CalendarPlus}
              title="Choose a candidate to schedule"
              description="After you pick a job and a candidate, the scheduling form and the candidate's details appear here."
            />
          )}
        </div>
      </div>
      {(jobs.isLoading || (effectiveJobId && applications.isLoading)) && <LoadingState message="Loading…" />}
    </div>
  );
};

export default InterviewScheduler;
