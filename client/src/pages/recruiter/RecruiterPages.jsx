import { useState } from "react";
import { newId } from "../../lib/id";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Download,
  Plus,
  RefreshCw,
  Star,
  Video,
  WandSparkles,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Select, Textarea } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, SkeletonList } from "../../components/ui/States";
import {
  AIProvenance,
  ErrorCallout,
  HybridMatch,
  Metric,
  PageHeader,
  StatusPill,
} from "../../components/Product";
import {
  aiApi,
  analyticsApi,
  downloadBlob,
  interviewApi,
  jobsApi,
  organizationApi,
  recruitmentApi,
} from "../../lib/api";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import { formatDate, formatRelativeTime, initials } from "../../lib/utils";
import { useDebouncedValue } from "../../hooks/useApi";
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};
const STAGES = ["submitted", "under_review", "shortlisted", "interview", "hired"];
const COPILOT_SUGGESTIONS = [
  "Which candidates are strongest for my open roles?",
  "Where is my hiring process slowing down?",
  "What skills am I hiring for most?",
  "Summarize my open positions.",
];
const useOrg = () => {
  const { organizationId } = useParams(),
    auth = useAuth();
  return organizationId || auth.organizationId;
};
export const RecruiterDashboard = () => {
  const orgId = useOrg(),
    auth = useAuth(),
    jobs = useQuery({
      queryKey: ["jobs-org", orgId, {}],
      queryFn: () => jobsApi.orgList(orgId, { limit: 20 }),
    }),
    analytics = useQuery({
      queryKey: ["analytics-recruitment", orgId],
      queryFn: () => analyticsApi.recruitment(orgId),
    }),
    interviews = useQuery({
      queryKey: ["interviews", orgId, {}],
      queryFn: () => interviewApi.list(orgId, { limit: 10 }),
    }),
    applicationQueries = useQueries({
      queries: (jobs.data?.data || []).slice(0, 4).map((job) => ({
        queryKey: ["applications-job", orgId, job.id, "recent"],
        queryFn: () => recruitmentApi.applications(orgId, job.id, { limit: 5 }),
      })),
    });
  if (jobs.isLoading || analytics.isLoading) return <LoadingState />;
  const data = analytics.data?.data || {},
    jobRows = jobs.data?.data || [],
    upcoming = (interviews.data?.data || []).filter((i) =>
      ["invited", "confirmed"].includes(i.status),
    ),
    recent = applicationQueries
      .flatMap((query) => query.data?.data || [])
      .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))
      .slice(0, 6);
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Hiring workspace"
        title={`${greeting()}, ${auth.user?.displayName?.split(" ")[0] || "there"}`}
        description="Here's what needs your attention today."
        action={
          <Button as={Link} to={`/app/o/${orgId}/jobs/new`} leftIcon={<Plus className="h-4 w-4" />}>
            Create Job
          </Button>
        }
      />
      {!jobRows.length && (
        <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <p className="font-bold">Welcome! Set up your hiring presence</p>
          <p className="mt-1 text-sm text-ink-600">
            Create your first job, complete your company profile so candidates can find you, and
            invite your hiring team.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" as={Link} to={`/app/o/${orgId}/jobs/new`}>
              Create first job
            </Button>
            <Button size="sm" variant="secondary" as={Link} to={`/app/o/${orgId}/team`}>
              Team &amp; company
            </Button>
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="panel p-6">
          <h2 className="text-lg font-bold">Jobs needing attention</h2>
          <div className="mt-4 space-y-3">
            {jobRows.slice(0, 6).map((j) => (
              <Link
                key={j.id}
                to={`/app/o/${orgId}/jobs/${j.id}/applications`}
                className="group flex items-center gap-4 rounded-xl border border-ink-100 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm"
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${j.status === "published" ? "bg-success-500" : "bg-warning-500"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold transition-colors group-hover:text-brand-700">
                    {j.title}
                  </p>
                  <p className="truncate text-xs text-ink-500">
                    {j.location} · {j.status.replace("_", " ")} · updated{" "}
                    {formatRelativeTime(j.updatedAt)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-ink-400" />
              </Link>
            ))}
            {!jobRows.length && <EmptyState title="No jobs yet" />}
          </div>
        </section>
        <div className="space-y-6">
          <section className="panel p-6">
            <h2 className="font-bold">Hiring Overview</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Metric
                label="Applications"
                value={data.applications || 0}
                icon={BriefcaseBusiness}
              />
              <Metric
                label="Shortlisted"
                value={data.funnel?.shortlisted || 0}
                tone="brand"
                icon={CheckCircle2}
              />
              <Metric label="Interviews" value={data.funnel?.interview || 0} icon={Video} />
              <Metric label="Hired" value={data.funnel?.hired || 0} tone="success" icon={Star} />
            </div>
            <Link
              className="mt-5 inline-block text-sm font-semibold text-brand-600"
              to={`/app/o/${orgId}/analytics`}
            >
              Explore analytics →
            </Link>
          </section>
          <section className="rounded-2xl bg-ink-950 p-6 text-white">
            <h2 className="font-bold">Upcoming interviews</h2>
            <div className="mt-3 space-y-3">
              {upcoming.slice(0, 4).map((i) => (
                <Link
                  key={i._id}
                  to={`/app/o/${orgId}/interviews/${i._id}`}
                  className="block rounded-xl bg-white/6 p-3"
                >
                  <p className="text-sm font-semibold">{i.title}</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {i.scheduledStart ? formatDate(i.scheduledStart) : "Awaiting schedule"}
                  </p>
                </Link>
              ))}
              {!upcoming.length && <p className="text-sm text-ink-400">No upcoming interviews.</p>}
            </div>
          </section>
        </div>
      </div>
      <CompanyProfileCard />
      <section className="mt-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow">Recent Applications</p>
            <h2 className="mt-1 text-xl font-bold">Candidates to Review</h2>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {recent.map((a) => (
            <Link
              key={a._id}
              to={`/app/o/${orgId}/applications/${a._id}`}
              className="panel group flex items-center gap-4 p-4 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                {initials(a.candidate?.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold transition-colors group-hover:text-brand-700">
                  {a.candidate?.name || "Candidate"}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {a.candidate?.headline || "New applicant"} · {formatRelativeTime(a.appliedAt)}
                </p>
              </div>
              <StatusPill status={a.status} />
            </Link>
          ))}
          {!recent.length && <p className="text-sm text-ink-500">No recent applications.</p>}
        </div>
      </section>
    </div>
  );
};
export const JobsPage = ({ assigned = false }) => {
  const orgId = useOrg(),
    q = useQuery({
      queryKey: [assigned ? "assigned-jobs" : "jobs-org", orgId],
      queryFn: () => (assigned ? jobsApi.assigned(orgId) : jobsApi.orgList(orgId, { limit: 100 })),
    }),
    [jobSearch, setJobSearch] = useState(""),
    [jobStatus, setJobStatus] = useState("");
  const allJobs = q.data?.data || [];
  const jobs = allJobs.filter(
    (j) =>
      (!jobSearch ||
        j.title?.toLowerCase().includes(jobSearch.toLowerCase()) ||
        j.location?.toLowerCase().includes(jobSearch.toLowerCase())) &&
      (!jobStatus || j.status === jobStatus),
  );
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={assigned ? "Hiring manager" : "Jobs"}
        title={assigned ? "Your assigned jobs" : "Your Jobs"}
        description={
          assigned
            ? "Review candidates and evidence for jobs where you are on the hiring team."
            : "Create and manage the roles you're hiring for."
        }
        action={
          !assigned && (
            <Button
              as={Link}
              to={`/app/o/${orgId}/jobs/new`}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Create Job
            </Button>
          )
        }
      />
      {!assigned && (
        <div className="panel mb-5 flex flex-col gap-3 p-4 sm:flex-row">
          <Input
            aria-label="Search jobs"
            placeholder="Search by title or location"
            value={jobSearch}
            onChange={(e) => setJobSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select
            aria-label="Filter by status"
            placeholder="All statuses"
            value={jobStatus}
            onChange={(e) => setJobStatus(e.target.value)}
            className="sm:max-w-44"
            options={[
              { value: "draft", label: "Draft" },
              { value: "published", label: "Published" },
              { value: "closed", label: "Closed" },
            ]}
          />
        </div>
      )}
      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : jobs.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {jobs.map((job) => (
            <article
              className="panel p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]"
              key={job.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={job.status} />
                    {job.moderation?.status === "pending" && (
                      <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700">
                        Awaiting approval
                      </span>
                    )}
                    {job.moderation?.status === "rejected" && (
                      <span className="rounded-full bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-700">
                        Not approved{job.moderation.reason ? ` — ${job.moderation.reason}` : ""}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-lg font-bold">{job.title}</h2>
                  <p className="mt-1 text-sm text-ink-500">
                    {job.location} · {job.workplaceMode}
                  </p>
                </div>
                <BriefcaseBusiness className="h-5 w-5 shrink-0 text-brand-600" />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {job.requiredSkills?.slice(0, 5).map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-2 border-t border-ink-100 pt-4">
                {!assigned && (
                  <Button
                    as={Link}
                    size="sm"
                    variant="secondary"
                    to={`/app/o/${orgId}/jobs/${job.id}/edit`}
                  >
                    Edit
                  </Button>
                )}
                <Button as={Link} size="sm" to={`/app/o/${orgId}/jobs/${job.id}/applications`}>
                  View Candidates
                </Button>
                <span className="ml-auto whitespace-nowrap text-xs text-ink-400">
                  {job.createdAt ? `Posted ${formatDate(job.createdAt)}` : ""}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : allJobs.length ? (
        <EmptyState
          title="No jobs match your filters"
          description="Try a different search or status."
        />
      ) : (
        <EmptyState
          title={assigned ? "No assigned jobs" : "No jobs yet"}
          description={
            assigned
              ? "An organization owner can add you to a hiring team."
              : "Create your first job to start hiring."
          }
        />
      )}
    </div>
  );
};
const defaultJob = {
  title: "",
  company: "",
  location: "",
  salary: "",
  experience: "",
  jobType: "Full-Time",
  workplaceMode: "hybrid",
  description: "",
  requiredSkills: "",
  preferredSkills: "",
};
export const JobEditor = () => {
  const orgId = useOrg(),
    auth = useAuth(),
    { jobId } = useParams(),
    navigate = useNavigate(),
    toast = useToast(),
    qc = useQueryClient(),
    [aiResult, setAiResult] = useState(null),
    [brief, setBrief] = useState(""),
    [generated, setGenerated] = useState(null),
    [saveError, setSaveError] = useState(null);
  const existing = useQuery({
    queryKey: ["job", "org", orgId, jobId],
    queryFn: () =>
      jobsApi
        .orgList(orgId, { limit: 100 })
        .then((r) => ({ data: r.data.find((j) => j.id === jobId) })),
    enabled: Boolean(jobId),
  });
  const members = useQuery({
    queryKey: ["organization-members", orgId],
    queryFn: () => organizationApi.members(orgId, { limit: 100 }),
    enabled: Boolean(jobId) && ["owner", "admin"].includes(auth.membership?.role),
  });
  const [teamIds, setTeamIds] = useState([]);
  const saveTeam = useMutation({
    mutationFn: () => jobsApi.setHiringTeam(orgId, jobId, teamIds),
    onSuccess: () => toast.success("Hiring team updated"),
  });
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { isSubmitting, errors },
  } = useForm({
    values: existing.data?.data
      ? {
          ...existing.data.data,
          requiredSkills: (existing.data.data.requiredSkills || []).join(", "),
          preferredSkills: (existing.data.data.preferredSkills || []).join(", "),
        }
      : defaultJob,
  });
  const save = async (v) => {
    setSaveError(null);
    try {
      const body = {
        ...v,
        salary: Number(v.salary || 0),
        requiredSkills: v.requiredSkills
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        preferredSkills: v.preferredSkills
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      };
      const r = jobId
        ? await jobsApi.update(orgId, jobId, body)
        : await jobsApi.create(orgId, body);
      toast.success("Draft saved");
      qc.invalidateQueries({ queryKey: ["jobs-org", orgId] });
      navigate(`/app/o/${orgId}/jobs/${r.data.id}/edit`, { replace: true });
    } catch (error) {
      setSaveError(error);
    }
  };
  const generate = useMutation({
    mutationFn: () =>
      aiApi.runOrg(orgId, "jd_generation", {
        text: brief,
        title: getValues("title"),
        skills: getValues("requiredSkills")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      }),
    onSuccess: (r) => setGenerated(r.data),
  });
  const improve = useMutation({
    mutationFn: () =>
      aiApi.runOrg(orgId, "jd_improvement", {
        text: getValues("description"),
        title: getValues("title"),
        requiredSkills: getValues("requiredSkills"),
      }),
    onSuccess: (r) => setAiResult(r.data),
  });
  const publish = useMutation({
    mutationFn: () => jobsApi.publish(orgId, jobId),
    onSuccess: () => {
      toast.success("Job published");
      qc.invalidateQueries({ queryKey: ["jobs-org", orgId] });
    },
  });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Job Details"
        title={jobId ? "Edit Job" : "Create a Job"}
        description="Fill in the role requirements. AI can draft the description for you — you decide what gets published."
      />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <form onSubmit={handleSubmit(save)} className="panel space-y-5 p-6" noValidate>
          {saveError && <ErrorCallout error={saveError} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Job title"
              required
              {...register("title", { required: "Title is required" })}
              error={errors.title?.message}
            />
            <Input label="Company" required {...register("company", { required: true })} />
            <Input label="Location" required {...register("location", { required: true })} />
            <Input label="Annual salary" type="number" min="0" {...register("salary")} />
            <Input
              label="Experience requirement"
              placeholder="3+ years"
              required
              {...register("experience", { required: true })}
            />
            <Select
              label="Workplace"
              {...register("workplaceMode")}
              options={[
                { value: "onsite", label: "On-site" },
                { value: "hybrid", label: "Hybrid" },
                { value: "remote", label: "Remote" },
                { value: "unspecified", label: "Unspecified" },
              ]}
            />
          </div>
          <Textarea
            label="Job description"
            rows={12}
            required
            {...register("description", { required: true, minLength: 20 })}
          />
          <Input
            label="Required skills"
            hint="Comma-separated"
            required
            {...register("requiredSkills", { required: true })}
          />
          <Input label="Preferred skills" hint="Comma-separated" {...register("preferredSkills")} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="submit" variant="secondary" isLoading={isSubmitting}>
              Save Draft
            </Button>
            {jobId && (
              <Button type="button" onClick={() => publish.mutate()} isLoading={publish.isPending}>
                Publish
              </Button>
            )}
          </div>
          {jobId && members.data?.data?.length > 0 && (
            <div className="border-t pt-5">
              <h2 className="font-bold">Hiring team</h2>
              <p className="mt-1 text-xs text-ink-500">
                Assign hiring managers and interviewers to this job.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {members.data.data.map((m) => (
                  <label key={m._id} className="flex gap-2 rounded-lg bg-ink-50 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={teamIds.includes(m._id)}
                      onChange={(e) =>
                        setTeamIds((ids) =>
                          e.target.checked ? [...ids, m._id] : ids.filter((id) => id !== m._id),
                        )
                      }
                    />
                    {m.user?.name} · {m.role.replace("_", " ")}
                  </label>
                ))}
              </div>
              <Button
                type="button"
                className="mt-3"
                size="sm"
                variant="secondary"
                onClick={() => saveTeam.mutate()}
                isLoading={saveTeam.isPending}
              >
                Save hiring team
              </Button>
            </div>
          )}
        </form>
        <aside className="ai-panel h-fit p-6">
          <p className="eyebrow !text-cyan-300">AI Description Assist</p>
          <h2 className="mt-2 text-xl font-bold">Draft the description for you.</h2>
          <p className="mt-2 text-sm leading-6 text-ink-300">
            AI suggestions are decision support only — review every draft before applying it.
          </p>
          <Textarea
            className="mt-5 !border-white/10 !bg-white/6 !text-white"
            label="Describe the role"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Team context, outcomes, responsibilities and must-have evidence…"
          />
          <Button
            className="mt-3"
            variant="secondary"
            disabled={brief.length < 10}
            isLoading={generate.isPending}
            onClick={() => generate.mutate()}
          >
            Generate with AI
          </Button>
          {generated && (
            <div className="mt-4 rounded-xl bg-white/6 p-4">
              <p className="text-xs font-semibold text-cyan-300">
                AI Assistant draft — review before applying
              </p>
              <p className="mt-2 font-semibold">{generated.title}</p>
              <p className="mt-2 max-h-40 overflow-y-auto text-sm text-ink-300">
                {generated.description}
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setValue("title", generated.title);
                  setValue("description", generated.description);
                  setValue("requiredSkills", generated.requiredSkills.join(", "));
                  setValue("preferredSkills", generated.preferredSkills.join(", "));
                }}
              >
                Use This Draft
              </Button>
            </div>
          )}
          <Button
            className="mt-5"
            variant="secondary"
            onClick={() => improve.mutate()}
            isLoading={improve.isPending}
            leftIcon={<WandSparkles className="h-4 w-4" />}
          >
            Improve Description
          </Button>
          {improve.error && (
            <div className="mt-4">
              <ErrorCallout error={improve.error} />
            </div>
          )}
          {aiResult && (
            <div className="mt-6">
              <AIProvenance
                metadata={aiResult.metadata}
                confidence={aiResult.confidence}
                limitations={aiResult.uncertainties}
              />
              <div className="mt-5 max-h-[28rem] overflow-y-auto rounded-xl bg-white/6 p-4 text-sm leading-6 text-ink-200">
                {aiResult.improvedDescription}
              </div>
              {aiResult.biasWarnings?.length > 0 && (
                <ul className="mt-4 text-sm text-warning-500">
                  {aiResult.biasWarnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setValue("description", aiResult.improvedDescription, { shouldDirty: true })
                  }
                >
                  Use this draft
                </Button>
                <Button variant="ghost" onClick={() => setAiResult(null)}>
                  Reject
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
export const ApplicantsPage = () => {
  const orgId = useOrg(),
    { jobId } = useParams(),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState("newest"),
    [selected, setSelected] = useState([]),
    toast = useToast();
  const q = useInfiniteQuery({
    queryKey: ["applications-job", orgId, jobId, status, tag],
    queryFn: ({ pageParam }) =>
      recruitmentApi.applications(orgId, jobId, { status, tag, limit: 40, after: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.meta?.nextCursor || undefined,
  });
  const apps = q.data?.pages?.flatMap((page) => page.data) || [];
  const matchQueries = useQueries({
    queries: apps.map((a) => ({
      queryKey: ["match", orgId, a._id],
      queryFn: () => recruitmentApi.match(orgId, a._id),
      enabled: false,
      staleTime: 300000,
    })),
  });
  const matchMap = new Map(matchQueries.map((m, i) => [apps[i]?._id, m.data?.data]));
  const visible = apps
    .filter(
      (a) =>
        !search ||
        a.candidate?.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.candidate?.skills?.some((s) => s.toLowerCase().includes(search.toLowerCase())),
    )
    .sort((a, b) =>
      sort === "fit"
        ? (matchMap.get(b._id)?.overallScore || -1) - (matchMap.get(a._id)?.overallScore || -1)
        : new Date(b.appliedAt) - new Date(a.appliedAt),
    );
  const computeAll = async () => {
    for (let i = 0; i < matchQueries.length; i += 4)
      await Promise.all(matchQueries.slice(i, i + 4).map((x) => x.refetch()));
    toast.success("Available candidate matches refreshed");
  };
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Applications"
        title="Review candidates for this job"
        description="Check each match, then update their progress. AI scores are decision support, not decisions."
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={computeAll}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh Candidates
            </Button>
            {selected.length >= 2 && (
              <Button as={Link} to={`/app/o/${orgId}/compare?applicationIds=${selected.join(",")}`}>
                Compare {selected.length}
              </Button>
            )}
          </div>
        }
      />
      <div className="panel mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          aria-label="Search applicants"
          placeholder="Search by name or skill"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Filter by stage"
          placeholder="All stages"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            "submitted",
            "under_review",
            "shortlisted",
            "interview",
            "offer",
            "hired",
            "rejected",
          ].map((x) => ({ value: x, label: x.replaceAll("_", " ") }))}
        />
        <Input
          aria-label="Filter by tag"
          placeholder="Tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <Select
          aria-label="Sort applicants"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          options={[
            { value: "newest", label: "Newest" },
            { value: "fit", label: "Highest fit" },
          ]}
        />
      </div>
      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : apps.length ? (
        <div className="space-y-3">
          {visible.map((a) => {
            const index = apps.findIndex((item) => item._id === a._id),
              match = matchMap.get(a._id),
              candidate = a.candidate || {};
            return (
              <article
                key={a._id}
                className="panel group flex flex-col gap-4 p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)] lg:flex-row lg:items-center"
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${candidate.name}`}
                  checked={selected.includes(a._id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked ? [...s, a._id] : s.filter((x) => x !== a._id),
                    )
                  }
                />
                <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 lg:grid">
                  {initials(candidate.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold transition-colors group-hover:text-brand-700">
                      {candidate.name}
                    </h2>
                    <StatusPill status={a.status} />
                    {a.tags?.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-ink-500">
                    {candidate.headline || "Candidate"} ·{" "}
                    {candidate.location || "Location not specified"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {candidate.skills?.slice(0, 6).map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {match ? (
                    <div className="text-right">
                      <p className="text-2xl font-bold text-brand-700">{match.overallScore}</p>
                      <p className="text-[10px] uppercase tracking-wide text-ink-400">
                        {Math.round(match.confidence * 100)}% confidence
                      </p>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => matchQueries[index].refetch()}
                      isLoading={matchQueries[index].isFetching}
                    >
                      Get Match
                    </Button>
                  )}
                  <Button as={Link} size="sm" to={`/app/o/${orgId}/applications/${a._id}`}>
                    View Candidate
                  </Button>
                </div>
              </article>
            );
          })}
          {q.hasNextPage && (
            <div className="pt-3 text-center">
              <Button
                variant="secondary"
                isLoading={q.isFetchingNextPage}
                onClick={() => q.fetchNextPage()}
              >
                Load more candidates
              </Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState title="No applicants in this view" />
      )}
    </div>
  );
};
export const CandidateDetail = () => {
  const orgId = useOrg(),
    { applicationId } = useParams(),
    qc = useQueryClient(),
    toast = useToast(),
    [note, setNote] = useState(""),
    [tags, setTags] = useState(""),
    [transition, setTransition] = useState("shortlisted"),
    [message, setMessage] = useState({ subject: "", message: "" }),
    [previewUrl, setPreviewUrl] = useState(null);
  const detail = useQuery({
      queryKey: ["application", orgId, applicationId],
      queryFn: () => recruitmentApi.detail(orgId, applicationId),
    }),
    notes = useQuery({
      queryKey: ["notes", orgId, applicationId],
      queryFn: () => recruitmentApi.notes(orgId, applicationId),
    });
  const match = useQuery({
    queryKey: ["match", orgId, applicationId],
    queryFn: () => recruitmentApi.match(orgId, applicationId),
  });
  const useAction = (fn, msg) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(msg);
        qc.invalidateQueries({ queryKey: ["application", orgId, applicationId] });
        qc.invalidateQueries({ queryKey: ["notes", orgId, applicationId] });
      },
      onError: (error) => toast.error(error.message),
    });
  const move = useAction(
      () =>
        recruitmentApi.transition(orgId, applicationId, {
          toStatus: transition,
          note: "Reviewed in candidate workspace",
        }),
      "Stage updated",
    ),
    shortlist = useAction(
      () =>
        recruitmentApi.transition(orgId, applicationId, {
          toStatus: "shortlisted",
          note: "Shortlisted from candidate review",
        }),
      "Moved to shortlist",
    ),
    addNote = useAction(
      () =>
        recruitmentApi.addNote(orgId, applicationId, {
          body: note,
          visibility: "hiring_team",
          tags: [],
        }),
      "Note added",
    ),
    saveTags = useAction(
      () =>
        recruitmentApi.tags(
          orgId,
          applicationId,
          (tags || detail.data?.data?.application?.tags?.join(",") || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      "Tags saved",
    ),
    send = useAction(
      () => recruitmentApi.message(orgId, applicationId, message, newId()),
      "Message queued",
    );
  if (detail.isLoading) return <LoadingState />;
  if (detail.error)
    return (
      <div className="page-wrap">
        <ErrorState error={detail.error} />
      </div>
    );
  const { application: a } = detail.data.data,
    c = a.candidate || {};
  const historyStatuses = new Set((a.statusHistory || []).map((h) => h.status));
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Candidate review"
        title={c.name || "Candidate"}
        description={`${c.headline || "Applicant"} · ${c.location || "Location not specified"}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const blob = await recruitmentApi.resume(orgId, applicationId);
                setPreviewUrl(URL.createObjectURL(blob));
              }}
            >
              Preview Resume
            </Button>
            <Button
              variant="secondary"
              onClick={async () =>
                downloadBlob(
                  await recruitmentApi.resume(orgId, applicationId),
                  `${c.name || "candidate"}-resume`,
                )
              }
              leftIcon={<Download className="h-4 w-4" />}
            >
              Download Resume
            </Button>
            {![
              "shortlisted",
              "interview",
              "offer",
              "hired",
              "rejected",
              "withdrawn",
              "closed",
            ].includes(a.status) && (
              <Button
                onClick={() => shortlist.mutate()}
                isLoading={shortlist.isPending}
                leftIcon={<Star className="h-4 w-4" />}
              >
                Shortlist
              </Button>
            )}
            <StatusPill status={a.status} />
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <main className="space-y-6">
          <section className="panel p-6">
            <h2 className="text-lg font-bold">Why this candidate matches</h2>
            {match.isLoading ? (
              <LoadingState />
            ) : match.error ? (
              <ErrorCallout error={match.error} />
            ) : (
              <div className="mt-5">
                <HybridMatch match={match.data.data} />
              </div>
            )}
          </section>
          <section className="panel p-6">
            <h2 className="font-bold">Application History</h2>
            <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {STAGES.map((stage, i) => {
                const reached = historyStatuses.has(stage) || i === 0;
                const current = a.status === stage;
                return (
                  <li key={stage} className="relative">
                    {i > 0 && (
                      <span
                        aria-hidden="true"
                        className={`absolute -left-3.5 top-3 hidden h-0.5 w-6 sm:block ${
                          reached ? "bg-brand-300" : "bg-ink-200"
                        }`}
                      />
                    )}
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${
                        current
                          ? "bg-brand-600 text-white ring-4 ring-brand-100"
                          : reached
                            ? "bg-brand-50 text-brand-700"
                            : "bg-ink-100 text-ink-400"
                      }`}
                    >
                      {reached ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <p
                      className={`mt-1.5 text-xs font-semibold capitalize ${
                        current ? "text-brand-700" : "text-ink-600"
                      }`}
                    >
                      {stage.replaceAll("_", " ")}
                    </p>
                  </li>
                );
              })}
            </ol>
            {["rejected", "withdrawn", "closed"].includes(a.status) && (
              <p className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-700">
                This application is {a.status.replaceAll("_", " ")} and no longer in progress.
              </p>
            )}
            {(a.statusHistory || []).length > 0 && (
              <div className="mt-5 space-y-3 border-t border-ink-100 pt-4">
                {[...a.statusHistory].reverse().map((h, i) => (
                  <div key={`${h.status}-${i}`} className="flex gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                    <div>
                      <p className="text-sm font-semibold capitalize">
                        {h.status.replaceAll("_", " ")}
                        {h.note ? (
                          <span className="font-normal text-ink-500"> — {h.note}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink-400">{formatDate(h.changedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="panel p-6">
            <h2 className="font-bold">Recruiter Notes</h2>
            <div className="mt-4 space-y-3">
              {notes.data?.data?.map((n) => (
                <div key={n._id} className="rounded-xl bg-ink-50 p-4">
                  <p className="text-sm">{n.body}</p>
                  <p className="mt-2 text-xs text-ink-400">
                    {n.author?.name} · {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
            <Textarea
              className="mt-4"
              label="Add evidence or context"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              className="mt-2"
              size="sm"
              disabled={!note.trim()}
              isLoading={addNote.isPending}
              onClick={() => {
                addNote.mutate();
                setNote("");
              }}
            >
              Add note
            </Button>
          </section>
        </main>
        <aside className="space-y-4">
          <section className="panel p-5">
            <h2 className="font-bold">Update Application</h2>
            <Select
              className="mt-3"
              value={transition}
              onChange={(e) => setTransition(e.target.value)}
              options={[
                "under_review",
                "shortlisted",
                "interview",
                "offer",
                "hired",
                "rejected",
              ].map((x) => ({ value: x, label: x.replaceAll("_", " ") }))}
            />
            <Button
              fullWidth
              className="mt-3"
              onClick={() => move.mutate()}
              isLoading={move.isPending}
            >
              Update stage
            </Button>
          </section>
          <section className="panel p-5">
            <h2 className="font-bold">Tags</h2>
            <Input
              className="mt-3"
              placeholder="backend, priority"
              value={tags || (a.tags || []).join(", ")}
              onChange={(e) => setTags(e.target.value)}
            />
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              onClick={() => saveTags.mutate()}
            >
              Save tags
            </Button>
          </section>
          <section className="panel p-5">
            <h2 className="font-bold">Contact Candidate</h2>
            <Input
              className="mt-3"
              placeholder="Subject"
              value={message.subject}
              onChange={(e) => setMessage((m) => ({ ...m, subject: e.target.value }))}
            />
            <Textarea
              className="mt-2"
              placeholder="Message"
              value={message.message}
              onChange={(e) => setMessage((m) => ({ ...m, message: e.target.value }))}
            />
            <Button
              className="mt-2"
              size="sm"
              disabled={!message.subject || !message.message}
              isLoading={send.isPending}
              onClick={() => send.mutate()}
            >
              Send Message
            </Button>
          </section>
          <Button
            as={Link}
            fullWidth
            to={`/app/o/${orgId}/interviews?applicationId=${applicationId}`}
            leftIcon={<Video className="h-4 w-4" />}
          >
            Schedule Interview
          </Button>
        </aside>
      </div>
      <Modal
        isOpen={Boolean(previewUrl)}
        onClose={() => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }}
        title={`${c.name || "Candidate"} · submitted resume`}
        size="xl"
      >
        {previewUrl && (
          <iframe
            title="Submitted resume preview"
            src={previewUrl}
            className="h-[70vh] w-full rounded-lg border"
          />
        )}
      </Modal>
    </div>
  );
};
export const ComparePage = () => {
  const orgId = useOrg(),
    [params] = useSearchParams(),
    ids = (params.get("applicationIds") || "").split(",").filter(Boolean),
    q = useQuery({
      queryKey: ["compare", orgId, ids],
      queryFn: () => recruitmentApi.compare(orgId, ids),
      enabled: ids.length >= 2,
    });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Candidate comparison"
        title="Compare evidence side by side"
        description="Scores do not select a winner. Review missing evidence and human feedback together."
      />
      {ids.length < 2 ? (
        <EmptyState title="Select at least two candidates" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data.data.map((x) => (
            <article className="panel p-6" key={x.applicationId}>
              <h2 className="text-xl font-bold">{x.candidate?.name}</h2>
              <p className="text-sm text-ink-500">{x.candidate?.headline}</p>
              {x.match ? (
                <div className="mt-5">
                  <HybridMatch match={x.match} />
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-warning-50 p-4 text-sm text-warning-700">
                  No match score yet. Open the candidate and generate their match.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
export const CandidateSearch = () => {
  const orgId = useOrg(),
    [filters, set] = useState({ skill: "", location: "", minExperience: "" }),
    debouncedSkill = useDebouncedValue(filters.skill, 350),
    debouncedLocation = useDebouncedValue(filters.location, 350),
    q = useQuery({
      queryKey: [
        "candidate-search",
        orgId,
        debouncedSkill,
        debouncedLocation,
        filters.minExperience,
      ],
      queryFn: ({ signal }) =>
        recruitmentApi.search(
          orgId,
          {
            skill: debouncedSkill,
            location: debouncedLocation,
            minExperience: filters.minExperience,
            limit: 50,
          },
          { signal },
        ),
    });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Find Candidates"
        title="Find the right candidates"
        description="Search and review candidates who match your open roles."
      />
      <div className="panel mb-6 grid gap-3 p-4 sm:grid-cols-3">
        <Input
          placeholder="Search by name or skill"
          value={filters.skill}
          onChange={(e) => set((f) => ({ ...f, skill: e.target.value }))}
        />
        <Input
          placeholder="Location"
          value={filters.location}
          onChange={(e) => set((f) => ({ ...f, location: e.target.value }))}
        />
        <Input
          type="number"
          placeholder="Minimum experience"
          value={filters.minExperience}
          onChange={(e) => set((f) => ({ ...f, minExperience: e.target.value }))}
        />
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="grid gap-3">
          {q.data?.data?.map((x) => (
            <div
              className="panel flex flex-col gap-4 p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center"
              key={x.candidate._id}
            >
              <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 sm:grid">
                {initials(x.candidate.name)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold">{x.candidate.name}</h2>
                <p className="truncate text-sm text-ink-500">
                  {x.candidate.headline} · {x.candidate.location}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {x.candidate.skills?.slice(0, 6).map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </div>
              </div>
              <Metric label="Experience" value={x.experienceYears ?? "?"} />
              {x.applicationIds?.[0] && (
                <Button
                  as={Link}
                  size="sm"
                  to={`/app/o/${orgId}/applications/${x.applicationIds[0]}`}
                >
                  View Candidate
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export const InterviewsPage = () => {
  const orgId = useOrg(),
    [params] = useSearchParams(),
    applicationId = params.get("applicationId"),
    qc = useQueryClient(),
    [requestKey, setRequestKey] = useState(() => newId()),
    [form, setForm] = useState({
      applicationId: applicationId || "",
      title: "Technical interview",
      type: "technical",
      scheduledStart: "",
      scheduledEnd: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    q = useQuery({
      queryKey: ["interviews", orgId, {}],
      queryFn: () => interviewApi.list(orgId, { limit: 100 }),
    }),
    create = useMutation({
      mutationFn: () =>
        interviewApi.create(
          orgId,
          {
            ...form,
            scheduledStart: new Date(form.scheduledStart),
            scheduledEnd: new Date(form.scheduledEnd),
          },
          requestKey,
        ),
      onSuccess: () => {
        setRequestKey(newId());
        qc.invalidateQueries({ queryKey: ["interviews", orgId] });
      },
    });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Interviews"
        title="Schedule and manage interviews"
        description="Plan interviews, send invitations and keep evaluation organized."
      />
      <div className="grid gap-6 lg:grid-cols-[.72fr_1.28fr]">
        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="font-bold">Schedule Interview</h2>
          <Input
            label="Candidate application ID"
            hint="Found on the candidate review page."
            required
            value={form.applicationId}
            onChange={(e) => setForm((f) => ({ ...f, applicationId: e.target.value }))}
          />
          <Input
            label="Interview title"
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Starts"
              type="datetime-local"
              required
              value={form.scheduledStart}
              onChange={(e) => setForm((f) => ({ ...f, scheduledStart: e.target.value }))}
            />
            <Input
              label="Ends"
              type="datetime-local"
              required
              value={form.scheduledEnd}
              onChange={(e) => setForm((f) => ({ ...f, scheduledEnd: e.target.value }))}
            />
          </div>
          <Button type="submit" fullWidth isLoading={create.isPending}>
            Send invitation
          </Button>
          {create.error && <ErrorCallout error={create.error} />}
        </form>
        <div>
          {q.isLoading ? (
            <LoadingState />
          ) : (
            <div className="space-y-3">
              {q.data?.data?.map((i) => (
                <Link
                  key={i._id}
                  to={`/app/o/${orgId}/interviews/${i._id}`}
                  className="panel group flex items-center gap-4 p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Video className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-bold transition-colors group-hover:text-brand-700">
                      {i.title}
                    </h2>
                    <p className="truncate text-sm text-ink-500">
                      {i.application?.job?.title || i.candidate?.name || "Candidate"} ·{" "}
                      {i.scheduledStart
                        ? `${formatDate(i.scheduledStart)} · ${new Date(
                            i.scheduledStart,
                          ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "Unscheduled"}
                    </p>
                  </div>
                  <StatusPill status={i.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export const InterviewDetail = () => {
  const orgId = useOrg(),
    { interviewId } = useParams(),
    [questions, setQuestions] = useState(null),
    [ratings, setRatings] = useState([{ criterion: "Role expertise", score: 3, evidence: "" }]),
    [summary, setSummary] = useState(""),
    [recommendation, setRecommendation] = useState("yes"),
    q = useQuery({
      queryKey: ["interviews", orgId, {}],
      queryFn: () => interviewApi.list(orgId, { limit: 100 }),
    }),
    generate = useMutation({
      mutationFn: () => interviewApi.questions(orgId, interviewId),
      onSuccess: (r) => setQuestions(r.data),
    }),
    feedback = useMutation({
      mutationFn: () =>
        interviewApi.feedback(orgId, interviewId, { ratings, recommendation, summary }),
    });
  const interview = q.data?.data?.find((i) => i._id === interviewId);
  return (
    <div className="page-wrap max-w-5xl">
      <PageHeader
        eyebrow="Interview workspace"
        title={interview?.title || "Interview"}
        description="Generate a grounded question kit, then submit your evaluation."
        action={interview && <StatusPill status={interview.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="ai-panel p-6">
          <h2 className="text-xl font-bold">Interview kit</h2>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => generate.mutate()}
            isLoading={generate.isPending}
          >
            Generate questions
          </Button>
          {questions && (
            <div className="mt-5 space-y-3">
              <AIProvenance
                metadata={questions.metadata}
                confidence={questions.confidence}
                limitations={questions.limitations}
              />
              {questions.questions?.map((q) => (
                <article className="rounded-xl bg-white/6 p-4" key={q.question}>
                  <p className="text-xs font-bold uppercase text-cyan-300">{q.competency}</p>
                  <p className="mt-2 text-sm">{q.question}</p>
                  <ul className="mt-2 text-xs text-ink-400">
                    {q.rubric?.map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
        <form
          className="panel p-6"
          onSubmit={(e) => {
            e.preventDefault();
            feedback.mutate();
          }}
        >
          <h2 className="text-xl font-bold">Interview Feedback</h2>
          <p className="mt-1 text-sm text-ink-500">
            Use observable evidence. Do not include protected attributes.
          </p>
          <Input
            className="mt-5"
            label="Criterion"
            value={ratings[0].criterion}
            onChange={(e) => setRatings([{ ...ratings[0], criterion: e.target.value }])}
          />
          <Input
            className="mt-3"
            label="Score (1–5)"
            type="number"
            min="1"
            max="5"
            value={ratings[0].score}
            onChange={(e) => setRatings([{ ...ratings[0], score: Number(e.target.value) }])}
          />
          <Textarea
            className="mt-3"
            label="Evidence"
            value={ratings[0].evidence}
            onChange={(e) => setRatings([{ ...ratings[0], evidence: e.target.value }])}
          />
          <Select
            className="mt-3"
            label="Recommendation"
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            options={["strong_yes", "yes", "mixed", "no", "strong_no"].map((x) => ({
              value: x,
              label: x.replace("_", " "),
            }))}
          />
          <Textarea
            className="mt-3"
            label="Summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <Button className="mt-4" type="submit" isLoading={feedback.isPending}>
            Submit feedback
          </Button>
          {feedback.error && (
            <div className="mt-3">
              <ErrorCallout error={feedback.error} />
            </div>
          )}
          {feedback.isSuccess && (
            <p className="mt-3 text-sm text-success-700">Feedback submitted and locked.</p>
          )}
        </form>
      </div>
    </div>
  );
};
export const AnalyticsPage = () => {
  const orgId = useOrg(),
    q = useQuery({
      queryKey: ["analytics-recruitment", orgId],
      queryFn: () => analyticsApi.recruitment(orgId),
    }),
    ai = useQuery({ queryKey: ["analytics-ai", orgId], queryFn: () => analyticsApi.ai(orgId) });
  if (q.isLoading) return <LoadingState />;
  if (q.error)
    return (
      <div className="page-wrap">
        <ErrorState error={q.error} />
      </div>
    );
  const d = q.data.data,
    stages = Object.entries(d.funnel || {}),
    max = Math.max(1, ...stages.map(([, n]) => n));
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Hiring Insights"
        title="Understand your hiring activity"
        description="See where candidates are moving through the hiring process. AI recommendations are shown separately from final hiring decisions."
      />
      <div className="panel grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Applications" value={d.applications || 0} icon={BriefcaseBusiness} />
        <Metric
          label="Shortlisted"
          value={d.funnel?.shortlisted || 0}
          tone="brand"
          icon={CheckCircle2}
        />
        <Metric label="Interviews" value={d.funnel?.interview || 0} icon={Video} />
        <Metric label="Hired" value={d.funnel?.hired || 0} tone="success" icon={Star} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="font-bold">Hiring Progress</h2>
          <div className="mt-5 space-y-4">
            {stages.map(([stage, count]) => (
              <div key={stage}>
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{stage.replaceAll("_", " ")}</span>
                  <strong>{count}</strong>
                </div>
                <div className="mt-1.5 h-3 rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="font-bold">Application Sources</h2>
          <div className="mt-4 space-y-3">
            {d.sourcePerformance?.map((s) => (
              <div className="flex justify-between rounded-xl bg-ink-50 p-4" key={s._id}>
                <span>{s._id}</span>
                <span className="font-semibold">
                  {s.applications} applications · {s.hires} hires
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="ai-panel mt-6 p-6">
        <h2 className="font-bold">AI Activity</h2>
        <p className="mt-1 text-sm text-ink-400">
          How often the AI Assistant used each feature. These runs are decision support, never
          hiring outcomes.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ai.data?.data?.map((x) => (
            <div key={JSON.stringify(x._id)} className="rounded-xl bg-white/6 p-4">
              <p className="font-semibold">{x._id.feature}</p>
              <p className="mt-1 text-xs text-ink-400">
                {x._id.provider} · {x.runs} runs · {x.fallbacks} fallbacks
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
export const RecruiterCopilot = () => {
  const orgId = useOrg(),
    [question, setQuestion] = useState(""),
    [result, setResult] = useState(null),
    run = useMutation({
      mutationFn: () => aiApi.runOrg(orgId, "recruiter_copilot", { text: question }),
      onSuccess: (r) => setResult(r.data),
    });
  return (
    <div className="page-wrap max-w-5xl">
      <PageHeader
        eyebrow="AI Assistant"
        title="Ask your AI hiring assistant"
        description="Get quick insights from your jobs and candidates. AI suggestions never perform hiring actions on their own."
      />
      <div className="ai-panel p-7">
        <Textarea
          label="Question"
          className="!border-white/10 !bg-white/6 !text-white"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your jobs, candidates or hiring progress..."
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={question.length < 10}
            isLoading={run.isPending}
            onClick={() => run.mutate()}
          >
            Ask Assistant
          </Button>
          {COPILOT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuestion(s)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:border-brand-400 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
        {run.error && (
          <div className="mt-4">
            <ErrorCallout error={run.error} />
          </div>
        )}
        {result && (
          <div className="mt-6">
            <AIProvenance
              metadata={result.metadata}
              confidence={result.confidence}
              limitations={result.limitations}
            />
            <p className="mt-5 whitespace-pre-wrap leading-7">{result.answer}</p>
            {result.proposedActions?.map((a) => (
              <div key={a.description} className="mt-3 rounded-xl border border-white/10 p-4">
                <p className="text-sm">{a.description}</p>
                <p className="mt-3 text-xs text-warning-500">
                  Suggestion only — HireSmart never performs hiring actions automatically.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export const TeamPage = () => {
  const orgId = useOrg(),
    auth = useAuth(),
    canManage = ["owner", "admin"].includes(auth.membership?.role),
    q = useQuery({
      queryKey: ["organization-members", orgId],
      queryFn: () => organizationApi.members(orgId, { limit: 100 }),
      enabled: canManage,
    }),
    inv = useQuery({
      queryKey: ["organization-invitations", orgId],
      queryFn: () => organizationApi.invitations(orgId),
      enabled: canManage,
    }),
    [form, setForm] = useState({ email: "", role: "recruiter" }),
    [inviteOpen, setInviteOpen] = useState(false),
    [confirmId, setConfirmId] = useState(null),
    [lastLink, setLastLink] = useState(""),
    toast = useToast(),
    qc = useQueryClient(),
    invite = useMutation({
      mutationFn: () => organizationApi.invite(orgId, form),
      onSuccess: (r) => {
        setForm({ email: "", role: "recruiter" });
        setInviteOpen(false);
        setLastLink(`${window.location.origin}/accept-invite?token=${r.data.invitation.token}`);
        qc.invalidateQueries({ queryKey: ["organization-invitations", orgId] });
        toast.success(`Invitation sent to ${form.email}`);
      },
    }),
    revoke = useMutation({
      mutationFn: (invitationId) => organizationApi.revokeInvitation(orgId, invitationId),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["organization-invitations", orgId] });
        toast.success("Invitation revoked");
      },
      onError: (error) => toast.error(error.message),
    }),
    remove = useMutation({
      mutationFn: ({ membershipId }) =>
        organizationApi.updateMember(orgId, membershipId, { status: "revoked" }),
      onSuccess: (_, vars) => {
        setConfirmId(null);
        toast.success(`${vars.name || "Member"} removed from the team`);
        qc.invalidateQueries({ queryKey: ["organization-members", orgId] });
      },
      onError: (error) => {
        setConfirmId(null);
        toast.error(error.message);
      },
    }),
    copy = async (text, msg) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(msg);
      } catch {
        toast.error("Copy failed - select the link manually");
      }
    };
  if (!canManage)
    return (
      <div className="page-wrap">
        <EmptyState
          title="Team management is restricted"
          description="Organization owners and admins manage members."
        />
      </div>
    );
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Team"
        title="Manage your team"
        description="Invite teammates and control their roles. They open the link, create or sign in to their account, and join the company."
        action={
          <Button onClick={() => setInviteOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            Invite Member
          </Button>
        }
      />
      <JobApprovalToggle />
      <Modal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a teammate"
        description="They'll get a secure link to join the company with the role you choose."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" isLoading={invite.isPending}>
              Send Invite
            </Button>
          </>
        }
      >
        <form
          id="invite-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <Input
            aria-label="Teammate email"
            label="Email"
            type="email"
            placeholder="Teammate email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Select
            aria-label="Role"
            label="Role"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            options={["recruiter", "hiring_manager", "interviewer", "viewer", "admin"].map((x) => ({
              value: x,
              label: x.replace("_", " "),
            }))}
          />
          {invite.error && <ErrorCallout error={invite.error} />}
        </form>
      </Modal>
      {lastLink && (
        <div className="panel mb-4 flex flex-wrap items-center gap-3 p-4">
          <p className="flex-1 text-sm">
            Invitation link (the email is delivered when SMTP is configured):
          </p>
          <code className="max-w-full truncate rounded bg-ink-50 px-2 py-1 text-xs">
            {lastLink}
          </code>
          <Button size="sm" variant="secondary" onClick={() => copy(lastLink, "Link copied")}>
            Copy link
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLastLink("")}>
            Dismiss
          </Button>
        </div>
      )}
      {inv.data?.data?.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
            Pending invitations
          </h2>
          <div className="space-y-2">
            {inv.data.data.map((i) => (
              <div className="panel flex flex-wrap items-center gap-4 p-4" key={i._id}>
                <div className="flex-1">
                  <p className="font-semibold">{i.email}</p>
                  <p className="text-xs text-ink-500">
                    Invited by {i.invitedBy?.name || "—"} · expires {formatDate(i.expiresAt)}
                  </p>
                </div>
                <Badge>{i.role.replace("_", " ")}</Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    copy(
                      `${window.location.origin}/accept-invite?token=${i.token}`,
                      "Invitation link copied",
                    )
                  }
                >
                  Copy link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  isLoading={revoke.isPending && revoke.variables === i._id}
                  onClick={() => revoke.mutate(i._id)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="space-y-3">
        {q.data?.data?.map((m) => {
          const removable = m.role !== "owner" && m.status !== "revoked";
          return (
            <div
              className="panel flex flex-wrap items-center gap-4 p-5 transition-colors hover:border-brand-200"
              key={m._id}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                {initials(m.user?.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.user?.name}</p>
                <p className="truncate text-sm text-ink-500">{m.user?.email}</p>
              </div>
              <Badge>{m.role.replace("_", " ")}</Badge>
              <StatusPill status={m.status} />
              {removable && confirmId === m._id ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    isLoading={remove.isPending}
                    onClick={() => remove.mutate({ membershipId: m._id, name: m.user?.name })}
                  >
                    Confirm remove
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : removable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => setConfirmId(m._id)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
const CompanyProfileCard = () => {
  const orgId = useOrg(),
    auth = useAuth(),
    toast = useToast(),
    qc = useQueryClient(),
    canManage = ["owner", "admin"].includes(auth.membership?.role),
    org = useQuery({ queryKey: ["org", orgId], queryFn: () => organizationApi.get(orgId) }),
    [localForm, setLocalForm] = useState(null);
  const save = useMutation({
    mutationFn: (body) => organizationApi.update(orgId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org", orgId] });
      toast.success("Company profile saved");
    },
    onError: (error) => toast.error(error.message),
  });
  if (!canManage || !org.data?.data) return null;
  const d = org.data.data;
  const form = localForm ?? {
    name: d.name || "",
    industry: d.industry || "",
    size: d.size || "unknown",
    website: d.website || "",
    logo: d.logo || "",
    about: d.about || "",
  };
  const set = (key) => (e) => setLocalForm({ ...form, [key]: e.target.value });
  return (
    <section className="panel mt-8 p-6">
      <h2 className="font-bold">Company profile</h2>
      <p className="mt-1 text-sm text-ink-500">
        Shown on your public company page —{" "}
        <Link to={`/companies/${org.data?.data?.slug}`} className="text-brand-600 hover:underline">
          companies/{org.data?.data?.slug}
        </Link>
      </p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <Input label="Company name" value={form.name} onChange={set("name")} />
        <Input
          label="Website"
          placeholder="https://"
          value={form.website}
          onChange={set("website")}
        />
        <Input label="Industry" value={form.industry} onChange={set("industry")} />
        <Select
          label="Company size"
          value={form.size}
          onChange={set("size")}
          options={["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+", "unknown"].map(
            (x) => ({ value: x, label: x === "unknown" ? "Not specified" : `${x} people` }),
          )}
        />
        <Input label="Logo URL (optional)" value={form.logo} onChange={set("logo")} />
        <Input label="Timezone" value={org.data?.data?.timezone || "UTC"} disabled />
        <Textarea
          label="About the company"
          className="sm:col-span-2"
          value={form.about}
          onChange={set("about")}
        />
        <div className="sm:col-span-2">
          <Button type="submit" isLoading={save.isPending}>
            Save company profile
          </Button>
        </div>
      </form>
    </section>
  );
};
const JobApprovalToggle = () => {
  const orgId = useOrg(),
    toast = useToast(),
    qc = useQueryClient(),
    org = useQuery({
      queryKey: ["org-settings", orgId],
      queryFn: () => organizationApi.get(orgId),
    }),
    toggle = useMutation({
      mutationFn: (value) => organizationApi.settings(orgId, { requireJobApproval: value }),
      onSuccess: (_, value) => {
        qc.invalidateQueries({ queryKey: ["org-settings", orgId] });
        toast.success(
          value ? "Approval is now required before jobs go public" : "Approval requirement removed",
        );
      },
      onError: (error) => toast.error(error.message),
    });
  const on = Boolean(org.data?.data?.settings?.requireJobApproval);
  return (
    <section className="panel mb-4 flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-56 flex-1">
        <p className="font-bold">Job Approval</p>
        <p className="mt-0.5 text-sm text-ink-500">
          New jobs need platform approval before they appear in public search and on company pages.
          Already approved jobs stay live.
        </p>
      </div>
      <Button
        size="sm"
        variant={on ? "secondary" : "primary"}
        isLoading={toggle.isPending}
        onClick={() => toggle.mutate(!on)}
      >
        {on ? "Approval required" : "Approval not required"}
      </Button>
    </section>
  );
};
