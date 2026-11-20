import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, ChevronRight, Download, FileText, Info } from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Textarea } from "../../components/ui/Input";
import DatePicker from "../../components/ui/DatePicker";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
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
import { cn, formatDate } from "../../lib/utils";

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
    instructions: "",
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

      {/* Modern Clickable Stepper Bar */}
      <nav aria-label="Scheduling steps" className="rounded-2xl border border-ink-200 bg-white p-3 shadow-sm">
        <ol className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs font-semibold">
          <li
            className={cn(
              "flex flex-1 items-center gap-3 rounded-xl p-2.5 transition-all cursor-pointer",
              effectiveJobId
                ? "bg-success-50 text-success-900 border border-success-200"
                : "bg-brand-50 text-brand-900 border border-brand-300"
            )}
            onClick={() => chooseJob("")}
            aria-current={!effectiveJobId ? "step" : undefined}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                effectiveJobId ? "bg-success-600 text-white" : "bg-brand-600 text-white"
              )}
            >
              {effectiveJobId ? "✓" : "1"}
            </span>
            <div className="min-w-0">
              <span className="block font-bold">1. Select Job</span>
              <span className="block truncate text-[11px] font-normal opacity-80">
                {selectedJob ? selectedJob.title : "Choose role to interview for"}
              </span>
            </div>
          </li>

          <ChevronRight className="hidden sm:block h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />

          <li
            className={cn(
              "flex flex-1 items-center gap-3 rounded-xl p-2.5 transition-all",
              !effectiveJobId
                ? "cursor-not-allowed bg-ink-50 text-ink-400 border border-ink-100 opacity-60"
                : applicationId
                ? "cursor-pointer bg-success-50 text-success-900 border border-success-200"
                : "bg-brand-50 text-brand-900 border border-brand-300"
            )}
            onClick={() => {
              if (effectiveJobId) setApplicationId("");
            }}
            aria-current={effectiveJobId && !applicationId ? "step" : undefined}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                applicationId
                  ? "bg-success-600 text-white"
                  : effectiveJobId
                  ? "bg-brand-600 text-white"
                  : "bg-ink-300 text-ink-600"
              )}
            >
              {applicationId ? "✓" : "2"}
            </span>
            <div className="min-w-0">
              <span className="block font-bold">2. Select Candidate</span>
              <span className="block truncate text-[11px] font-normal opacity-80">
                {selectedApplication?.candidate?.name || "Applicant from this job"}
              </span>
            </div>
          </li>

          <ChevronRight className="hidden sm:block h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />

          <li
            className={cn(
              "flex flex-1 items-center gap-3 rounded-xl p-2.5 transition-all",
              !applicationId
                ? "cursor-not-allowed bg-ink-50 text-ink-400 border border-ink-100 opacity-60"
                : "bg-brand-50 text-brand-900 border border-brand-300"
            )}
            aria-current={applicationId ? "step" : undefined}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                applicationId ? "bg-brand-600 text-white" : "bg-ink-300 text-ink-600"
              )}
            >
              3
            </span>
            <div className="min-w-0">
              <span className="block font-bold">3. Schedule Details</span>
              <span className="block truncate text-[11px] font-normal opacity-80">
                {roundLabel(nextRound)}
              </span>
            </div>
          </li>
        </ol>
      </nav>

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
                  {applicationId && (
                    <div className="flex items-center justify-between border-t border-ink-100 pt-3">
                      <Button size="sm" variant="ghost" onClick={() => chooseJob("")}>
                        Change Job
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          const el = document.getElementById("schedule-heading");
                          el?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        Continue to Schedule →
                      </Button>
                    </div>
                  )}
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
                <SearchableSelect
                  label="Interview type"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  options={INTERVIEW_TYPES}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DatePicker
                  label="Starts"
                  placeholder="Select start date & time"
                  showTime
                  required
                  value={form.start}
                  error={errors.start}
                  onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                />
                <DatePicker
                  label="Ends"
                  placeholder="Select end date & time"
                  showTime
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
                <SearchableSelect
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
                label="Meeting link (Google Meet, Zoom, MS Teams, etc.)"
                hint="If Google Calendar is connected, Google Meet will be created automatically. If not connected, add a meeting link here so you can start the interview and the candidate can join."
                placeholder="https://"
                value={form.meetingUrl}
                error={errors.meetingUrl}
                onChange={(e) => setForm((f) => ({ ...f, meetingUrl: e.target.value }))}
              />

              <Textarea
                label="Interview instructions & agenda (optional)"
                placeholder="Guidelines, agenda, topics, or technical requirements for the candidate..."
                rows={3}
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
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

              {/* Confirmation & Summary Preview */}
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-brand-900">
                    Review & Confirmation
                  </h4>
                  <span className="text-[11px] font-semibold text-brand-700 bg-brand-100 rounded-full px-2 py-0.5">
                    Ready to schedule
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-ink-700">
                  <div>
                    <span className="text-ink-500">Candidate: </span>
                    <strong className="text-ink-900">{selectedApplication.candidate?.name || "Candidate"}</strong>
                  </div>
                  <div>
                    <span className="text-ink-500">Job: </span>
                    <strong className="text-ink-900">{selectedJob?.title || "Job"}</strong>
                  </div>
                  <div>
                    <span className="text-ink-500">Round: </span>
                    <span>{roundLabel(nextRound)} ({form.type})</span>
                  </div>
                  <div>
                    <span className="text-ink-500">Start Time: </span>
                    <span>{form.start ? `${form.start.replace("T", " ")} (${form.timezone})` : "Not set"}</span>
                  </div>
                  {participantIds.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-ink-500">Interviewers: </span>
                      <span>{participantIds.length} assigned member(s)</span>
                    </div>
                  )}
                  {form.instructions && (
                    <div className="col-span-2 border-t border-brand-200/60 pt-1.5 text-[11px]">
                      <span className="text-ink-500 font-semibold">Instructions: </span>
                      <span className="text-ink-800">{form.instructions}</span>
                    </div>
                  )}
                </div>
              </div>

              {formError && <ErrorCallout error={formError} />}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApplicationId("")}
                  leftIcon={<ArrowLeft className="h-4 w-4" />}
                >
                  Back to candidates
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1 w-full"
                  isLoading={create.isPending}
                  leftIcon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}
                >
                  Schedule and send invitation
                </Button>
              </div>
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
