import { useRef, useState } from "react";
import { newId } from "../../lib/id";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileSearch,
  FileText,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Upload,
  Video,
  WandSparkles,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Textarea } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import Kpi from "../../components/ui/Kpi";
import SectionCard from "../../components/ui/SectionCard";
import CompletionRing from "../../components/ui/CompletionRing";
import PipelineFunnel from "../../components/ui/PipelineFunnel";
import QuickActions from "../../components/ui/QuickActions";
import { EmptyState, ErrorState, LoadingState, Skeleton, SkeletonList } from "../../components/ui/States";
import {
  AIProvenance,
  ErrorCallout,
  HybridMatch,
  JobTile,
  PageHeader,
  StatusPill,
} from "../../components/Product";
import {
  alertsApi,
  aiApi,
  candidateApi,
  downloadBlob,
  interviewApi,
  jobsApi,
  resumeApi,
} from "../../lib/api";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import {
  cn,
  formatDate,
  formatDateTime,
  formatDuration,
  formatJobSalary,
  formatRelativeTime,
  isValidMeetingUrl,
  downloadInterviewIcs,
} from "../../lib/utils";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

const getVersions = (response) => response?.meta?.versions || [];
const useResumes = () => useQuery({ queryKey: ["resumes"], queryFn: resumeApi.list });

const CANDIDATE_SUGGESTIONS = [
  "How should I tailor my resume for a senior role?",
  "Which skills should I highlight for my target jobs?",
  "What should I prepare before my interview?",
  "Summarize my strongest job matches.",
  "How can I make my project bullet points more quantifiable?",
];

const normalizeAppStatus = (status) => {
  const s = String(status || "").toLowerCase();
  return { applied: "submitted", selected: "hired" }[s] || s;
};

// Canonical hiring stages used for tracking and candidate progress
const HIRING_STAGES = [
  { id: "submitted", label: "Submitted", step: 1, description: "Application received" },
  { id: "under_review", label: "Under Review", step: 2, description: "Reviewing qualifications" },
  { id: "shortlisted", label: "Shortlisted", step: 3, description: "Shortlisted for next steps" },
  { id: "interview", label: "Interview", step: 4, description: "Interview rounds in progress" },
  { id: "offer", label: "Offer", step: 5, description: "Offer stage" },
  { id: "hired", label: "Hired", step: 6, description: "Hired & accepted" },
];

const getStageIndex = (status) => {
  const norm = normalizeAppStatus(status);
  const idx = HIRING_STAGES.findIndex((st) => st.id === norm);
  return idx >= 0 ? idx : 0;
};

/* =========================================================================
   1. CANDIDATE DASHBOARD
   ========================================================================= */
export const CandidateDashboard = () => {
  const profile = useQuery({ queryKey: ["candidate-profile"], queryFn: candidateApi.profile }),
    resumes = useResumes(),
    apps = useQuery({
      queryKey: ["applications-candidate", {}],
      queryFn: () => candidateApi.applications({ limit: 50 }),
    }),
    interviews = useQuery({ queryKey: ["candidate-interviews"], queryFn: candidateApi.interviews }),
    recs = useQuery({
      queryKey: ["recommendations", 5],
      queryFn: () => candidateApi.recommendations(5),
      enabled: getVersions(resumes.data).some((v) => v.processingStatus === "ready"),
    }),
    saved = useQuery({ queryKey: ["saved-jobs"], queryFn: jobsApi.saved }),
    latestReadyId = getVersions(resumes.data).find((v) => v.processingStatus === "ready")?.id,
    resumeDetail = useQuery({
      queryKey: ["resume-version", latestReadyId],
      queryFn: () => resumeApi.detail(latestReadyId),
      enabled: Boolean(latestReadyId),
    }),
    navigate = useNavigate(),
    qc = useQueryClient(),
    toast = useToast(),
    [searchQuery, setSearchQuery] = useState("");

  const saveMutation = useMutation({
    mutationFn: async (id) => {
      const exists = (saved.data?.data || []).some((j) => (j.id || j._id) === id);
      return exists ? jobsApi.unsave(id) : jobsApi.save(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });
      toast.success("Saved jobs updated");
    },
    onError: (error) => toast.error(error.message),
  });

  if (profile.isLoading || resumes.isLoading) return <LoadingState message="Loading your candidate workspace…" />;

  const user = profile.data?.data?.user || {},
    candidateProfile = profile.data?.data?.profile || {},
    versions = getVersions(resumes.data),
    ready = versions.find((v) => v.processingStatus === "ready"),
    readyCount = versions.filter((v) => v.processingStatus === "ready").length,
    applications = apps.data?.data || [],
    statusCount = (key) => applications.filter((a) => normalizeAppStatus(a.status) === key).length;

  // Profile completion — computed strictly from real fields saved on the profile
  const checklist = [
    ["Professional headline", Boolean(user.headline)],
    ["Location", Boolean(user.location)],
    ["Summary", Boolean(user.bio)],
    ["Skills", (user.skills || []).length > 0],
    ["Onboarding", Boolean(user.onboardingCompleted)],
    ["Education", (candidateProfile.education || []).length > 0],
    ["Experience", (candidateProfile.experience || []).length > 0],
  ],
    doneCount = checklist.filter(([, value]) => value).length,
    completion = Math.round((doneCount / checklist.length) * 100),
    missing = checklist.filter(([, value]) => !value).map(([label]) => label);

  const pipelineStages = [
    { label: "Submitted", value: statusCount("submitted"), tone: "ink" },
    { label: "Under review", value: statusCount("under_review"), tone: "ink" },
    { label: "Shortlisted", value: statusCount("shortlisted"), tone: "warning" },
    { label: "Interview", value: statusCount("interview"), tone: "brand" },
    { label: "Offer", value: statusCount("offer"), tone: "success" },
  ];

  const upcomingInterviews = (interviews.data?.data || [])
    .filter((i) => ["invited", "confirmed"].includes(i.status))
    .sort((a, b) => new Date(a.scheduledStart || 0) - new Date(b.scheduledStart || 0))
    .slice(0, 3);

  const next = !ready
    ? {
        title: "Upload your first resume",
        copy: "We’ll validate, parse and analyze it privately.",
        to: "/app/candidate/resumes",
        icon: Upload,
      }
    : !user.onboardingCompleted
      ? {
          title: "Complete your profile",
          copy: "Add the context employers need to evaluate your experience.",
          to: "/app/candidate/onboarding",
          icon: FileSearch,
        }
      : applications.some((a) => normalizeAppStatus(a.status) === "interview")
        ? {
            title: "Prepare for your interview",
            copy: "Practice against the role’s actual requirements.",
            to: "/app/candidate/interviews",
            icon: Video,
          }
        : {
            title: "Review your best job fits",
            copy: "Start with roles backed by evidence from your latest resume.",
            to: "/app/candidate/recommendations",
            icon: Sparkles,
          };
  const NextIcon = next.icon;

  const handleHeroSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/app/candidate/jobs?query=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate("/app/candidate/jobs");
    }
  };

  return (
    <div className="page-wrap space-y-7">
      <PageHeader
        eyebrow="Candidate workspace"
        title={`Good to see you, ${user.displayName?.split(" ")[0] || "there"}.`}
        description="Your search at a glance — recommended roles, application progress and what to do next."
        action={
          <form onSubmit={handleHeroSearch} className="flex w-full max-w-md items-center gap-2">
            <Input
              aria-label="Search open roles"
              placeholder="Search roles, skills, companies…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 text-sm"
            />
            <Button type="submit" size="sm" leftIcon={<Search className="h-4 w-4" />}>
              Search
            </Button>
          </form>
        }
      />

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          label="Applications"
          value={applications.length}
          icon={BriefcaseBusiness}
          detail={`${statusCount("submitted")} submitted`}
        />
        <Kpi
          label="In active review"
          value={statusCount("under_review") + statusCount("shortlisted")}
          tone="brand"
          icon={Eye}
          detail="Under review or shortlisted"
        />
        <Kpi
          label="Interviews"
          value={statusCount("interview")}
          tone="warning"
          icon={Video}
          detail={`${upcomingInterviews.length} upcoming`}
        />
        <Kpi
          label="Resume versions"
          value={versions.length}
          tone={readyCount ? "success" : "ink"}
          icon={FileText}
          detail={`${readyCount} ready`}
        />
      </div>

      {/* Quick Actions Navigation */}
      <QuickActions
        actions={[
          { icon: Search, label: "Discover jobs", to: "/app/candidate/jobs", hint: "Search open roles" },
          { icon: Upload, label: "Upload resume", to: "/app/candidate/resumes", hint: "Add a new version" },
          { icon: BriefcaseBusiness, label: "My applications", to: "/app/candidate/applications", hint: "Track hiring status" },
          { icon: Sparkles, label: "Career assistant", to: "/app/candidate/copilot", hint: "Ask AI advisor" },
        ]}
      />

      {/* Two Column Layout */}
      <section className="grid gap-6 lg:grid-cols-[1.35fr_.75fr]">
        <div className="min-w-0 space-y-6">
          {/* Next Best Action Hero */}
          <div className="ai-panel relative overflow-hidden p-7 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <Sparkles className="h-3.5 w-3.5" /> Next best action
              </span>
              <span className="text-xs text-ink-400">Contextual recommendation</span>
            </div>
            <div className="mt-6 flex items-start gap-5">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20">
                <NextIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold text-white">{next.title}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink-300">{next.copy}</p>
                <Button as={Link} to={next.to} className="mt-5" variant="secondary">
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Recommended Opportunities */}
          <section>
            <div className="flex items-end justify-between">
              <div>
                <p className="eyebrow">Recommended for you</p>
                <h2 className="mt-1 text-xl font-bold text-ink-950">Opportunities matched to you</h2>
              </div>
              <Link
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
                to="/app/candidate/recommendations"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {recs.isLoading ? (
                <SkeletonList count={2} />
              ) : (
                (recs.data?.data || [])
                  .slice(0, 4)
                  .map((x) => {
                    const jobId = x.job.id || x.job._id;
                    const isSaved = (saved.data?.data || []).some((j) => (j.id || j._id) === jobId);
                    return (
                      <JobTile
                        key={jobId}
                        job={x.job}
                        match={x.match}
                        saved={isSaved}
                        onSave={(id) => saveMutation.mutate(id)}
                      />
                    );
                  })
              )}
              {!recs.isLoading && !(recs.data?.data || []).length && (
                <div className="lg:col-span-2">
                  <EmptyState
                    icon={Sparkles}
                    title={ready ? "No strong matches yet" : "No matches ready yet"}
                    description={
                      ready
                        ? "New roles are scored against your latest resume as they are published. Keep searching — your best fits will land here."
                        : "Upload and process a resume version first, then your best-fit roles appear here."
                    }
                    action={
                      <Button
                        as={Link}
                        to={ready ? "/app/candidate/jobs" : "/app/candidate/resumes"}
                        variant="secondary"
                        size="sm"
                      >
                        {ready ? "Browse all jobs" : "Upload resume"}
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
          </section>

          {/* Resume Readiness & Priority Skill Gaps */}
          {ready && (
            <SectionCard
              title="Resume readiness"
              description={`Latest processed version · ${
                resumeDetail.data?.data?.parsedResume?.analysis?.atsScore ?? "—"
              }/100 ATS structure score`}
              action={
                <Link
                  to={`/app/candidate/resumes/${latestReadyId}`}
                  className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  View analysis & details
                </Link>
              }
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50/60 p-3.5 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-semibold text-ink-900">{ready.originalName}</p>
                      <p className="text-xs text-ink-500">
                        Version {ready.version} · Processed {formatDate(ready.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success">Ready for matching</Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Priority skill gaps
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(recs.data?.data?.[0]?.match?.missingRequiredSkills || [])
                      .slice(0, 6)
                      .map((skill) => (
                        <Badge key={skill} variant="warning">
                          {skill}
                        </Badge>
                      ))}
                    {!(recs.data?.data?.[0]?.match?.missingRequiredSkills || []).length && (
                      <span className="text-sm text-ink-500">
                        No critical gaps detected against your top match.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Recent Applications Snapshot */}
          {applications.length > 0 && (
            <SectionCard
              title="Recent applications"
              description="Your latest submitted applications and current status"
              action={
                <Link
                  to="/app/candidate/applications"
                  className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  View all ({applications.length})
                </Link>
              }
            >
              <div className="space-y-3">
                {applications.slice(0, 3).map((a) => (
                  <Link
                    key={a._id}
                    to={`/app/candidate/applications/${a._id}`}
                    className="group flex flex-col gap-2 rounded-xl border border-ink-100 p-3.5 transition-all hover:border-brand-200 hover:bg-brand-50/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
                        {a.job?.title || a.jobSnapshot?.title}
                      </p>
                      <p className="text-xs text-ink-500">
                        {a.job?.company || a.jobSnapshot?.company} · Applied {formatRelativeTime(a.appliedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusPill status={a.status} />
                      <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right Column / Contextual Sidebar */}
        <div className="space-y-6">
          {/* Profile Completion */}
          <SectionCard
            title="Profile completion"
            action={
              <Link
                to="/app/candidate/onboarding"
                className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                {doneCount === checklist.length ? "Review" : "Complete now"}
              </Link>
            }
          >
            <CompletionRing
              value={completion}
              label={`${doneCount} of ${checklist.length} sections`}
              tone={completion === 100 ? "success" : completion >= 60 ? "brand" : "warning"}
              sublabel={
                doneCount === checklist.length
                  ? "Your profile is complete — recruiters see the full picture."
                  : `Add: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` +${missing.length - 3} more` : ""}`
              }
            />
          </SectionCard>

          {/* Application Progress Funnel */}
          <SectionCard
            title="Application progress"
            description="Where your applications stand"
            action={
              <Link
                to="/app/candidate/applications"
                className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                View all
              </Link>
            }
          >
            {applications.length ? (
              <PipelineFunnel stages={pipelineStages} />
            ) : (
              <EmptyState
                icon={BriefcaseBusiness}
                title="No applications yet"
                description="Apply to a role and track every stage here."
                action={
                  <Button as={Link} to="/app/candidate/jobs" size="sm">
                    Find jobs
                  </Button>
                }
              />
            )}
          </SectionCard>

          {/* Upcoming Interviews */}
          <SectionCard
            title="Upcoming interviews"
            action={
              <Link
                to="/app/candidate/interviews"
                className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                View all
              </Link>
            }
          >
            {interviews.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingInterviews.map((i) => (
                  <Link
                    key={i._id}
                    to={`/app/candidate/interviews/${i._id}`}
                    className="group block rounded-xl border border-ink-100 p-3.5 transition-all hover:border-brand-200 hover:bg-brand-50/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
                        {i.title}
                      </p>
                      <StatusPill status={i.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {i.application?.job?.title || "Job"} ·{" "}
                      {i.scheduledStart ? formatDate(i.scheduledStart) : "Schedule pending"}
                    </p>
                  </Link>
                ))}
                {!upcomingInterviews.length && (
                  <p className="text-sm text-ink-500">
                    Nothing scheduled. Interviews appear here once a recruiter invites you.
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          {/* AI Career Insights Card */}
          <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5">
            <div className="flex items-center gap-2 text-brand-800">
              <Sparkles className="h-4.5 w-4.5" />
              <h3 className="text-sm font-bold">Career Assistant</h3>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-ink-600">
              Get advice grounded in your real profile, resume evidence, and target jobs.
            </p>
            <div className="mt-3.5 space-y-2">
              {[
                "How should I tailor my resume for a senior role?",
                "What should I prepare before my interview?",
              ].map((prompt) => (
                <Link
                  key={prompt}
                  to={`/app/candidate/copilot?prompt=${encodeURIComponent(prompt)}`}
                  className="block rounded-lg bg-white p-2.5 text-xs font-medium text-ink-700 shadow-sm transition hover:bg-brand-50 hover:text-brand-800"
                >
                  "{prompt}"
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

/* =========================================================================
   2. CANDIDATE PROFILE ONBOARDING / EDIT
   ========================================================================= */
export const OnboardingPage = () => {
  const auth = useAuth(),
    navigate = useNavigate(),
    q = useQuery({ queryKey: ["candidate-profile"], queryFn: candidateApi.profile }),
    toast = useToast(),
    [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({
    values: q.data
      ? {
          name: q.data.data.user.displayName || "",
          headline: q.data.data.user.headline || "",
          location: q.data.data.user.location || "",
          bio: q.data.data.user.bio || "",
          skills: (q.data.data.user.skills || []).join(", "),
        }
      : undefined,
  });

  if (q.isLoading) return <LoadingState message="Loading your profile…" />;

  return (
    <div className="page-wrap max-w-3xl">
      <PageHeader
        eyebrow="Profile"
        title="Tell your professional story"
        description="This context improves job recommendations and candidate matching. Sensitive attributes are not used for ranking."
      />
      <form
        className="panel space-y-5 p-6 sm:p-8"
        onSubmit={handleSubmit(async (v) => {
          setServerError(null);
          try {
            await candidateApi.updateProfile({
              ...v,
              skills: v.skills
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              onboardingCompleted: true,
            });
            toast.success("Profile saved successfully");
            await auth.refresh();
            navigate("/app/candidate");
          } catch (error) {
            setServerError(error);
          }
        })}
      >
        {serverError && <ErrorCallout error={serverError} />}
        <Input label="Full name" required {...register("name")} />
        <Input
          label="Professional headline"
          placeholder="e.g. Senior Backend Engineer specializing in Distributed Systems & Node.js"
          hint="Summarize your role and key technical domain."
          {...register("headline")}
        />
        <Input
          label="Location"
          placeholder="e.g. Bengaluru, India or Remote"
          hint="City or region where you are based or looking to work."
          {...register("location")}
        />
        <Textarea
          label="Professional summary"
          rows={5}
          placeholder="Describe your background, notable career achievements, and the types of challenges you enjoy solving."
          {...register("bio")}
        />
        <Input
          label="Skills"
          placeholder="React, TypeScript, Node.js, AWS, PostgreSQL"
          hint="Comma-separated list of verifiable skills."
          {...register("skills")}
        />
        <div className="flex items-center justify-between border-t border-ink-100 pt-5">
          <Link
            to="/app/profile"
            className="text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
          >
            Edit full profile & experience details →
          </Link>
          <Button type="submit" isLoading={isSubmitting}>
            Save profile
          </Button>
        </div>
      </form>
    </div>
  );
};

/* =========================================================================
   3. RESUME MANAGER
   ========================================================================= */
export const ResumeManager = () => {
  const q = useResumes(),
    qc = useQueryClient(),
    toast = useToast(),
    input = useRef(),
    [drag, setDrag] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(null);

  const upload = useMutation({
    mutationFn: (file) =>
      resumeApi.upload(file, (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100))),
    onSuccess: (r) => {
      toast.success(r.data.duplicate ? "Existing resume version recognized" : "Resume uploaded and queued for processing");
      qc.invalidateQueries({ queryKey: ["resumes"] });
      setProgress(0);
    },
    onError: (e) => {
      setError(e);
      setProgress(0);
    },
  });

  const handle = (file) => {
    setError(null);
    if (!file) return;
    if (
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError(new Error("Please select a valid PDF or DOCX file no larger than 10 MB."));
      return;
    }
    upload.mutate(file);
  };

  if (q.isLoading) return <LoadingState message="Loading your resume versions…" />;
  const versions = getVersions(q.data);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Resume"
        title="Your resumes"
        description="Every application permanently references the exact version you submitted. Manage and analyze multiple versions here."
        action={
          <Button onClick={() => input.current?.click()} leftIcon={<Upload className="h-4 w-4" />}>
            Upload version
          </Button>
        }
      />
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => handle(e.target.files[0])}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={`mb-7 w-full rounded-2xl border-2 border-dashed p-8 text-center transition ${
          drag ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-white hover:border-brand-300"
        }`}
      >
        <Upload className="mx-auto h-7 w-7 text-brand-600" />
        <p className="mt-3 font-semibold text-ink-900">Drop a PDF or DOCX, or browse files</p>
        <p className="mt-1 text-sm text-ink-500">
          Private upload · Deterministic parser & AI extraction · 10 MB maximum
        </p>
        {upload.isPending && (
          <div className="mx-auto mt-4 max-w-md">
            <div className="h-2 rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-600">Uploading {progress}%</p>
          </div>
        )}
      </button>

      {error && <div className="mb-6"><ErrorCallout error={error} /></div>}

      <div className="grid gap-3">
        {versions.length ? (
          versions.map((v) => (
            <Link
              to={`/app/candidate/resumes/${v.id}`}
              key={v.id}
              className="panel flex flex-col gap-4 p-5 transition hover:border-brand-300 hover:shadow-sm sm:flex-row sm:items-center"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-bold text-ink-900">{v.originalName}</p>
                  <span className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600">
                    Version {v.version}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  Uploaded {formatDate(v.createdAt)} · {v.size ? `${Math.round(v.size / 1024)} KB` : "Document"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={v.processingStatus} />
                <ArrowRight className="h-4 w-4 text-ink-400" />
              </div>
            </Link>
          ))
        ) : (
          <EmptyState
            icon={FileText}
            title="No resume versions yet"
            description="Upload a PDF or DOCX above to begin — we’ll validate, parse and analyze it privately."
          />
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   4. RESUME DETAIL, PARSE & AI ANALYSIS
   ========================================================================= */
export const ResumeDetail = () => {
  const { versionId } = useParams(),
    qc = useQueryClient(),
    toast = useToast(),
    navigate = useNavigate(),
    [analysis, setAnalysis] = useState(null),
    [jobId, setJobId] = useState(""),
    [tailoring, setTailoring] = useState(null),
    [rewriteText, setRewriteText] = useState(""),
    [rewrite, setRewrite] = useState(null),
    [deleteOpen, setDeleteOpen] = useState(false),
    [dismissed, setDismissed] = useState([]);

  const q = useQuery({
    queryKey: ["resume-version", versionId],
    queryFn: () => resumeApi.detail(versionId),
    refetchInterval: (data) =>
      ["queued", "processing"].includes(data?.state?.data?.data?.resumeVersion?.processingStatus)
        ? 2000
        : false,
  });

  const analyse = useMutation({
      mutationFn: () => resumeApi.analysis(versionId),
      onSuccess: (r) => setAnalysis(r.data),
    }),
    retry = useMutation({
      mutationFn: () => resumeApi.retry(versionId),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["resume-version", versionId] }),
    }),
    tailor = useMutation({
      mutationFn: () => resumeApi.tailor(versionId, jobId),
      onSuccess: (r) => setTailoring(r.data),
    }),
    removeVersion = useMutation({
      mutationFn: () => resumeApi.remove(versionId),
      onSuccess: () => {
        toast.success("Resume version deleted");
        qc.invalidateQueries({ queryKey: ["resumes"] });
        navigate("/app/candidate/resumes");
      },
    }),
    rewriteMutation = useMutation({
      mutationFn: () =>
        aiApi.run(
          "resume_rewrite",
          { text: rewriteText, mode: "evidence_preserving" },
          { subjectType: "resume_version", subjectId: versionId },
        ),
      onSuccess: (r) => setRewrite(r.data),
    });

  if (q.isLoading) return <LoadingState message="Loading resume version…" />;
  if (q.error)
    return (
      <div className="page-wrap">
        <ErrorState error={q.error} />
      </div>
    );

  const { resumeVersion: v, parsedResume: p } = q.data.data;

  return (
    <div className="page-wrap space-y-6">
      <Link to="/app/candidate/resumes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
        ← Back to resumes
      </Link>
      <PageHeader
        eyebrow={`Resume version ${v.version}`}
        title={v.originalName}
        description="Review parsing, deterministic ATS readiness, and AI guidance before using this version in job applications."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={v.processingStatus} />
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={async () =>
                downloadBlob(await resumeApi.download(versionId), v.originalName)
              }
            >
              Download
            </Button>
            <Button
              size="sm"
              variant="danger"
              isLoading={removeVersion.isPending}
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
          </div>
        }
      />

      {["queued", "processing"].includes(v.processingStatus) && (
        <div className="panel p-6">
          <p className="font-semibold text-ink-900">Processing and analyzing your resume</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-brand-500" />
          </div>
          <p className="mt-2 text-sm text-ink-500">
            {v.processingStage || "Extracting text and structure"} · this page refreshes automatically.
          </p>
        </div>
      )}

      {["failed", "rejected"].includes(v.processingStatus) && (
        <div className="space-y-4">
          <ErrorCallout error={new Error(v.failure?.message || "Resume processing encountered an error")} />
          <Button
            onClick={() => retry.mutate()}
            isLoading={retry.isPending}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Retry processing
          </Button>
        </div>
      )}

      {v.processingStatus === "ready" && (
        <>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
            {/* Extracted Details Section */}
            <section className="panel p-6">
              <h2 className="text-lg font-bold text-ink-950">Extracted resume evidence</h2>
              <p className="mt-1 text-sm text-ink-500">
                Extracted with {Math.round((p?.confidence || 0) * 100)}% structural confidence.
              </p>
              <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Extracted Skills</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p?.skills?.map((s) => (
                    <Badge key={s.normalized || s.name}>
                      {s.name} · {Math.round(s.confidence * 100)}%
                    </Badge>
                  ))}
                  {!p?.skills?.length && (
                    <p className="text-sm text-ink-500">No explicit skills parsed from text.</p>
                  )}
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Kpi
                  label="Experience"
                  value={p?.experienceYears ?? "Uncertain"}
                  detail={p?.experienceYears != null ? "years detected" : "Review manually"}
                />
                <Kpi
                  label="Readiness"
                  value={p?.analysis?.atsScore ?? "—"}
                  detail={p?.analysis?.grade ? `Structure Grade: ${p.analysis.grade}` : "ATS readiness score"}
                />
              </div>
              {p?.warnings?.length > 0 && (
                <div className="mt-5 rounded-xl bg-warning-50 p-3.5 text-xs text-warning-800">
                  <p className="font-bold">Parsing notes:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {p.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* AI Resume Analysis Panel */}
            <section className="ai-panel p-6">
              <p className="eyebrow !text-cyan-300">AI resume analysis</p>
              <h2 className="mt-2 text-xl font-bold text-white">Turn evidence into clearer impact.</h2>
              <p className="mt-2 text-sm leading-6 text-ink-300">
                Generate validated, evidence-preserving improvement suggestions for this resume version.
              </p>
              <Button
                className="mt-5"
                variant="secondary"
                onClick={() => analyse.mutate()}
                isLoading={analyse.isPending}
                leftIcon={<WandSparkles className="h-4 w-4" />}
              >
                Analyze version
              </Button>
              {analyse.error && (
                <div className="mt-4">
                  <ErrorCallout error={analyse.error} />
                </div>
              )}
            </section>
          </div>

          {/* Analysis Results */}
          {analysis && (
            <section className="ai-panel p-6">
              <AIProvenance
                metadata={analysis.metadata}
                confidence={analysis.confidence}
                limitations={analysis.uncertainties}
              />
              <h3 className="mt-6 text-lg font-bold text-white">Prioritized improvements</h3>
              <div className="mt-3 space-y-3">
                {analysis.suggestions
                  ?.filter((_, index) => !dismissed.includes(index))
                  .map((s, i) => (
                    <article key={`${s.title}-${i}`} className="rounded-xl bg-white/6 p-4">
                      <div className="flex justify-between gap-3">
                        <p className="font-semibold text-white">{s.title}</p>
                        <Badge
                          variant={
                            s.severity === "critical"
                              ? "danger"
                              : s.severity === "high"
                                ? "warning"
                                : "outline"
                          }
                        >
                          {s.severity}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink-300">{s.detail}</p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            toast.info(
                              "Suggestion noted for your review. Your uploaded resume file was not modified.",
                            )
                          }
                        >
                          Approve as note
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDismissed((items) => [...items, i])}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          )}

          {/* Rewrite Lab */}
          <section className="panel p-6">
            <h2 className="text-lg font-bold text-ink-950">Evidence-preserving rewrite lab</h2>
            <p className="mt-1 text-sm text-ink-500">
              Paste a bullet point or professional summary. The AI strengthens your wording without inventing unverified credentials.
            </p>
            <Textarea
              className="mt-4"
              label="Text to improve"
              placeholder="e.g. Led migration of backend services to Kubernetes cluster, improving uptime and response times."
              value={rewriteText}
              onChange={(e) => setRewriteText(e.target.value)}
            />
            <Button
              className="mt-3"
              disabled={rewriteText.trim().length < 10}
              isLoading={rewriteMutation.isPending}
              onClick={() => rewriteMutation.mutate()}
            >
              Generate rewrite
            </Button>
            {rewriteMutation.error && (
              <div className="mt-3">
                <ErrorCallout error={rewriteMutation.error} />
              </div>
            )}
            {rewrite && (
              <div className="mt-5">
                <p className="mb-3 text-xs text-ink-500">
                  AI Assistant suggestion · {Math.round((rewrite.confidence || 0) * 100)}% confidence
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-ink-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Original</p>
                    <p className="mt-2 text-sm leading-6 text-ink-800">{rewrite.before}</p>
                  </div>
                  <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Proposed Rewrite</p>
                    <p className="mt-2 text-sm leading-6 text-ink-900">{rewrite.after}</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          navigator.clipboard?.writeText(rewrite.after);
                          toast.success("Rewrite copied to clipboard.");
                        }}
                      >
                        Copy rewrite
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRewrite(null)}>
                        Reset
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Tailor to Job */}
          <section className="panel p-6">
            <h2 className="text-lg font-bold text-ink-950">Tailor against a target job</h2>
            <p className="mt-1 text-sm text-ink-500">
              Enter a 24-character Job ID to check fit and get specific alignment suggestions based strictly on real evidence.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                aria-label="Target Job ID"
                placeholder="Paste Job ID (24 hex characters)"
                value={jobId}
                onChange={(e) => setJobId(e.target.value.trim())}
              />
              <Button
                disabled={jobId.length !== 24}
                isLoading={tailor.isPending}
                onClick={() => tailor.mutate()}
              >
                Generate tailoring plan
              </Button>
            </div>
            {tailor.error && (
              <div className="mt-4">
                <ErrorCallout error={tailor.error} />
              </div>
            )}
            {tailoring && (
              <div className="mt-6 space-y-5">
                <HybridMatch match={tailoring.fit} />
                <div className="space-y-3">
                  <h3 className="font-bold text-ink-900">Tailoring Suggestions</h3>
                  {tailoring.improvement?.suggestions?.map((s) => (
                    <div key={s.title} className="rounded-xl bg-ink-50 p-4">
                      <p className="font-semibold text-ink-900">{s.title}</p>
                      <p className="mt-1 text-sm text-ink-600">{s.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => removeVersion.mutate()}
        title="Delete this resume version?"
        description="This removes the version from your active resume manager. Applications that already reference it retain an immutable copy for compliance."
        confirmLabel="Delete version"
        tone="danger"
        isLoading={removeVersion.isPending}
      />
    </div>
  );
};

/* =========================================================================
   5. FIND JOBS & RECOMMENDATIONS
   ========================================================================= */
export const CandidateJobs = ({ recommendations = false }) => {
  const saved = useQuery({ queryKey: ["saved-jobs"], queryFn: jobsApi.saved }),
    apps = useQuery({ queryKey: ["applications-candidate", {}], queryFn: () => candidateApi.applications({ limit: 100 }) }),
    [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(params.get("query") || ""),
    [location, setLocation] = useState(params.get("location") || ""),
    [workplaceMode, setWorkplaceMode] = useState(params.get("workplaceMode") || ""),
    [jobType, setJobType] = useState(params.get("jobType") || ""),
    [minSalary, setMinSalary] = useState(params.get("minSalary") || ""),
    [experience, setExperience] = useState(params.get("maxExp") || ""),
    [postedWithin, setPostedWithin] = useState(params.get("postedWithin") || ""),
    [sort, setSort] = useState(params.get("sort") || "date"),
    [aiSearchPrompt, setAiSearchPrompt] = useState(""),
    [aiSearchActive, setAiSearchActive] = useState(false),
    [aiSearchExplanation, setAiSearchExplanation] = useState(null),
    qc = useQueryClient(),
    toast = useToast();

  const debouncedSearch = useDebouncedValue(search, 350);

  // Filter params object
  const filterParams = {
    query: debouncedSearch,
    location: location || undefined,
    workplaceMode: workplaceMode || undefined,
    jobType: jobType || undefined,
    minSalary: minSalary ? Number(minSalary) : undefined,
    maxExp: experience ? Number(experience) : undefined,
    postedWithin: postedWithin || undefined,
    sort: sort !== "date" ? sort : undefined,
    limit: 40,
  };

  const q = useQuery({
    queryKey: [
      recommendations ? "recommendations" : "jobs-public",
      filterParams,
    ],
    queryFn: ({ signal }) =>
      recommendations
        ? candidateApi.recommendations(30)
        : jobsApi.list(filterParams, { signal }),
  });

  const save = useMutation({
    mutationFn: async (id) => {
      const exists = (saved.data?.data || []).some((j) => (j.id || j._id) === id);
      return exists ? jobsApi.unsave(id) : jobsApi.save(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });
      toast.success("Saved jobs updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const nlSearchMutation = useMutation({
    mutationFn: (text) => aiApi.nlSearch(text),
    onSuccess: (res) => {
      const extracted = res.data?.filters || {};
      setAiSearchExplanation(res.data?.explanation || "Natural language filters applied.");
      if (extracted.query !== undefined) setSearch(extracted.query);
      if (extracted.location) setLocation(extracted.location);
      if (extracted.workplaceMode) setWorkplaceMode(extracted.workplaceMode);
      if (extracted.jobType) setJobType(extracted.jobType);
      if (extracted.minSalary) setMinSalary(String(extracted.minSalary));
      if (extracted.maxExp) setExperience(String(extracted.maxExp));
      toast.success("AI search filters applied");
    },
    onError: (err) => toast.error(err.message || "Could not parse query with AI"),
  });

  const clearFilters = () => {
    setSearch("");
    setLocation("");
    setWorkplaceMode("");
    setJobType("");
    setMinSalary("");
    setExperience("");
    setPostedWithin("");
    setSort("date");
    setAiSearchExplanation(null);
    setParams({});
  };

  const hasActiveFilters = Boolean(
    search || location || workplaceMode || jobType || minSalary || experience || postedWithin || sort !== "date"
  );

  const rows = q.data?.data || [];
  const appliedJobsMap = new Map(
    (apps.data?.data || []).map((a) => [String(a.job?._id || a.job?.id || a.job), a])
  );

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow={recommendations ? "AI recommendations" : "Job Discovery"}
        title={recommendations ? "Roles ranked for you" : "Explore open opportunities"}
        description={
          recommendations
            ? "Recommendations are scored against your latest ready resume with transparent match breakdowns."
            : "Search published jobs across top companies with real server-side filters and optional AI search parsing."
        }
      />

      {/* Discovery Filters Bar */}
      {!recommendations && (
        <div className="panel space-y-4 p-5 shadow-sm">
          {/* Top Search Inputs */}
          <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-400" />
              <Input
                aria-label="Search jobs"
                placeholder="Job title, skills, keywords…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-400" />
              <Input
                aria-label="Location"
                placeholder="Location (city or remote)…"
                className="pl-9"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={aiSearchActive ? "primary" : "secondary"}
                onClick={() => setAiSearchActive((v) => !v)}
                leftIcon={<Sparkles className="h-4 w-4" />}
              >
                AI Search
              </Button>
            </div>
          </div>

          {/* AI Search Box */}
          {aiSearchActive && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-800">
                Natural Language Job Search
              </p>
              <p className="mt-1 text-xs text-ink-600">
                Type naturally (e.g. "Remote Senior Frontend developer in Bengaluru with React 15 LPA")
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="Describe your ideal role in natural language…"
                  value={aiSearchPrompt}
                  onChange={(e) => setAiSearchPrompt(e.target.value)}
                  className="bg-white"
                />
                <Button
                  size="sm"
                  isLoading={nlSearchMutation.isPending}
                  disabled={!aiSearchPrompt.trim()}
                  onClick={() => nlSearchMutation.mutate(aiSearchPrompt)}
                >
                  Apply AI
                </Button>
              </div>
            </div>
          )}

          {aiSearchExplanation && (
            <div className="flex items-center justify-between rounded-xl bg-cyan-50 px-3.5 py-2 text-xs text-cyan-900">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-cyan-600" />
                {aiSearchExplanation}
              </span>
              <button
                type="button"
                onClick={() => setAiSearchExplanation(null)}
                className="text-cyan-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Detailed Filters Row */}
          <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-ink-700">
              <Filter className="h-3.5 w-3.5 text-ink-400" />
              <span>Filters:</span>
            </div>

            {/* Workplace Mode */}
            <select
              aria-label="Workplace mode"
              value={workplaceMode}
              onChange={(e) => setWorkplaceMode(e.target.value)}
              className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700"
            >
              <option value="">Workplace (All)</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>

            {/* Job Type */}
            <select
              aria-label="Employment type"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700"
            >
              <option value="">Job Type (All)</option>
              <option value="Full-Time">Full-Time</option>
              <option value="Part-Time">Part-Time</option>
              <option value="Internship">Internship</option>
              <option value="Contract">Contract</option>
              <option value="Remote">Remote</option>
            </select>

            {/* Minimum Salary */}
            <select
              aria-label="Minimum salary"
              value={minSalary}
              onChange={(e) => setMinSalary(e.target.value)}
              className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700"
            >
              <option value="">Min Salary (Any)</option>
              <option value="500000">₹5,00,000+</option>
              <option value="1000000">₹10,00,000+</option>
              <option value="1500000">₹15,00,000+</option>
              <option value="2000000">₹20,00,000+</option>
              <option value="3000000">₹30,00,000+</option>
            </select>

            {/* Experience */}
            <select
              aria-label="Max experience required"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700"
            >
              <option value="">Max Experience (Any)</option>
              <option value="1">Up to 1 year</option>
              <option value="3">Up to 3 years</option>
              <option value="5">Up to 5 years</option>
              <option value="8">Up to 8 years</option>
            </select>

            {/* Date Posted */}
            <select
              aria-label="Date posted"
              value={postedWithin}
              onChange={(e) => setPostedWithin(e.target.value)}
              className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700"
            >
              <option value="">Date Posted (Anytime)</option>
              <option value="d">Past 24 hours</option>
              <option value="w">Past week</option>
              <option value="m">Past month</option>
            </select>

            {/* Sort by */}
            <select
              aria-label="Sort order"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700"
            >
              <option value="date">Sort: Newest</option>
              <option value="salary">Sort: Highest Salary</option>
              <option value="relevance">Sort: Relevance</option>
            </select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto text-xs text-ink-500">
                Clear all filters
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Jobs Results List */}
      {q.isLoading ? (
        <SkeletonList count={6} />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : rows.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((item) => {
            const job = item.job || item,
              match = item.match;
            const jobId = job.id || job._id;
            const isSaved = (saved.data?.data || []).some((j) => (j.id || j._id) === jobId);
            const application = appliedJobsMap.get(String(jobId));

            return (
              <div key={jobId} className="relative">
                <JobTile
                  job={job}
                  match={match}
                  saved={isSaved}
                  onSave={(id) => save.mutate(id)}
                />
                {application && (
                  <div className="absolute right-5 top-5">
                    <Badge variant="brand" size="sm">
                      Applied · {application.status?.replace("_", " ")}
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={recommendations ? Sparkles : Search}
          title={recommendations ? "No recommended roles yet" : "No jobs found"}
          description={
            recommendations
              ? "Once a resume version is processed, AI-ranked roles appear here."
              : hasActiveFilters
                ? `No jobs match your search filters. Try clearing some criteria.`
                : "No published jobs match right now. Check back soon or create a job alert."
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
};

/* =========================================================================
   6. JOB DETAIL & APPLICATION MODAL
   ========================================================================= */
export const CandidateJobDetail = () => {
  const { jobId } = useParams(),
    resumes = useResumes(),
    apps = useQuery({ queryKey: ["applications-candidate", {}], queryFn: () => candidateApi.applications({ limit: 100 }) }),
    saved = useQuery({ queryKey: ["saved-jobs"], queryFn: jobsApi.saved }),
    toast = useToast(),
    navigate = useNavigate(),
    qc = useQueryClient(),
    [versionId, setVersionId] = useState(""),
    [fit, setFit] = useState(null),
    [applyOpen, setApplyOpen] = useState(false),
    [tailorPlan, setTailorPlan] = useState(null),
    [applicationKey] = useState(() => newId()),
    readyVersions = getVersions(resumes.data).filter((v) => v.processingStatus === "ready"),
    selectedVersionId =
      versionId || readyVersions[0]?.id || "";

  const q = useQuery({ queryKey: ["job", "public", jobId], queryFn: () => jobsApi.get(jobId) });

  const existingApplication = (apps.data?.data || []).find(
    (a) => String(a.job?._id || a.job?.id || a.job) === String(jobId)
  );

  const isSaved = (saved.data?.data || []).some((j) => (j.id || j._id) === jobId);

  const saveMutation = useMutation({
    mutationFn: () => (isSaved ? jobsApi.unsave(jobId) : jobsApi.save(jobId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });
      toast.success(isSaved ? "Job removed from saved" : "Job saved successfully");
    },
  });

  const fitMutation = useMutation({
      mutationFn: () => jobsApi.fit(jobId, selectedVersionId),
      onSuccess: (r) => setFit(r.data),
    }),
    tailorMutation = useMutation({
      mutationFn: () => resumeApi.tailor(selectedVersionId, jobId),
      onSuccess: (r) => setTailorPlan(r.data),
    }),
    apply = useMutation({
      mutationFn: () =>
        jobsApi.apply(
          jobId,
          { resumeVersionId: selectedVersionId, source: "direct" },
          applicationKey,
        ),
      onSuccess: (r) => {
        toast.success("Application submitted successfully");
        qc.invalidateQueries({ queryKey: ["applications-candidate"] });
        navigate(`/app/candidate/applications/${r.data.id || r.data._id}`);
      },
    });

  if (q.isLoading) return <LoadingState message="Loading job specifications…" />;
  if (q.error)
    return (
      <div className="page-wrap">
        <ErrorState error={q.error} />
      </div>
    );

  const job = q.data.data,
    salary = formatJobSalary(job);

  return (
    <div className="page-wrap space-y-6">
      <Link to="/app/candidate/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
        ← Back to all jobs
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Left Column: Job Description & Details */}
        <article className="panel p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="brand">{job.workplaceMode || "On-site"}</Badge>
              <Badge variant="outline">{job.jobType || "Full-Time"}</Badge>
              {job.experience && <Badge variant="outline">{job.experience} experience</Badge>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => saveMutation.mutate()}
              leftIcon={<Bookmark className={cn("h-4 w-4", isSaved && "fill-brand-600 text-brand-600")} />}
            >
              {isSaved ? "Saved" : "Save Job"}
            </Button>
          </div>

          <h1 className="mt-4 text-3xl font-extrabold text-ink-950">{job.title}</h1>
          <p className="mt-2 text-base text-ink-600">
            {job.company} · {job.location}
          </p>

          {salary && (
            <div className="mt-4 rounded-xl bg-ink-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Compensation</p>
              <p className="mt-1 text-2xl font-black text-ink-950">
                {salary}
                <span className="ml-1.5 text-xs font-medium text-ink-500">per year</span>
              </p>
            </div>
          )}

          {/* Required & Preferred Skills */}
          <div className="mt-6 space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Required Skills</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(job.requiredSkills?.length ? job.requiredSkills : job.skills || []).map((s) => (
                  <Badge key={s} variant="brand">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
            {job.preferredSkills?.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Preferred Skills</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {job.preferredSkills.map((s) => (
                    <Badge key={s} variant="outline">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Job Description Text */}
          <div className="mt-8 border-t border-ink-100 pt-6">
            <h2 className="text-lg font-bold text-ink-950">Role Description & Responsibilities</h2>
            <div className="mt-4 whitespace-pre-wrap leading-7 text-ink-700">{job.description}</div>
          </div>

          {/* Benefits */}
          {job.benefits?.length > 0 && (
            <div className="mt-8 border-t border-ink-100 pt-6">
              <h2 className="text-lg font-bold text-ink-950">Benefits & Perks</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {job.benefits.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-ink-700">
                    <Check className="h-4 w-4 text-success-600 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>

        {/* Right Column: Actions & Fit Matching */}
        <aside className="space-y-4">
          {existingApplication ? (
            <div className="panel space-y-4 p-5">
              <div className="flex items-center gap-2 text-success-700">
                <CheckCircle2 className="h-5 w-5" />
                <h2 className="font-bold">Application Submitted</h2>
              </div>
              <p className="text-sm text-ink-600">
                You applied for this position on {formatDate(existingApplication.appliedAt)}.
              </p>
              <div className="flex items-center justify-between rounded-xl bg-ink-50 p-3 text-xs">
                <span className="font-medium text-ink-600">Current Stage:</span>
                <StatusPill status={existingApplication.status} />
              </div>
              <Button
                fullWidth
                as={Link}
                to={`/app/candidate/applications/${existingApplication._id}`}
              >
                Track Application
              </Button>
            </div>
          ) : (
            <div className="panel space-y-4 p-5 shadow-sm">
              <h2 className="font-bold text-ink-950">Apply for this role</h2>

              {readyVersions.length > 0 ? (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-500" htmlFor="resume-version">
                      Select resume version
                    </label>
                    <select
                      id="resume-version"
                      className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900"
                      value={selectedVersionId}
                      onChange={(e) => setVersionId(e.target.value)}
                    >
                      {readyVersions.map((v) => (
                        <option value={v.id} key={v.id}>
                          Version {v.version} · {v.originalName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button fullWidth onClick={() => setApplyOpen(true)}>
                    Apply for this Job
                  </Button>

                  <div className="border-t border-ink-100 pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">AI Match Analysis</p>
                    <Button
                      fullWidth
                      variant="secondary"
                      className="mt-2"
                      onClick={() => fitMutation.mutate()}
                      isLoading={fitMutation.isPending}
                      leftIcon={<Sparkles className="h-4 w-4" />}
                    >
                      Check My Match Score
                    </Button>
                  </div>

                  <Button
                    fullWidth
                    variant="ghost"
                    isLoading={tailorMutation.isPending}
                    onClick={() => tailorMutation.mutate()}
                    leftIcon={<WandSparkles className="h-4 w-4" />}
                  >
                    Get Tailoring Suggestions
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-ink-600">
                    A processed resume version is required to apply and calculate your match score.
                  </p>
                  <Button as={Link} to="/app/candidate/resumes" fullWidth variant="secondary">
                    Upload Resume
                  </Button>
                </div>
              )}

              {fitMutation.error && (
                <div className="mt-3">
                  <ErrorCallout error={fitMutation.error} />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* AI Match Fit Section */}
      {fit && (
        <section className="panel p-6 shadow-sm">
          <HybridMatch match={fit} />
        </section>
      )}

      {/* AI Tailoring Plan */}
      {tailorPlan && (
        <section className="ai-panel p-6">
          <AIProvenance
            metadata={tailorPlan.improvement?.metadata}
            confidence={tailorPlan.improvement?.confidence}
            limitations={tailorPlan.improvement?.uncertainties}
          />
          <h2 className="mt-5 text-lg font-bold text-white">Tailoring suggestions for this role</h2>
          <div className="mt-3 space-y-3">
            {tailorPlan.improvement?.suggestions?.map((s) => (
              <div className="rounded-xl bg-white/6 p-4" key={s.title}>
                <p className="font-semibold text-white">{s.title}</p>
                <p className="mt-1 text-sm leading-6 text-ink-300">{s.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Application Confirmation Modal */}
      <Modal
        isOpen={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Submit your application"
        description="HireSmart records and preserves the exact selected resume version and job requirements."
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => apply.mutate()} isLoading={apply.isPending}>
              Confirm &amp; Apply
            </Button>
          </>
        }
      >
        {apply.error && <div className="mb-4"><ErrorCallout error={apply.error} /></div>}
        <div className="space-y-3 text-sm text-ink-700">
          <div className="rounded-xl bg-ink-50 p-4">
            <p className="font-bold text-ink-900">{job.title}</p>
            <p className="text-xs text-ink-500">{job.company} · {job.location}</p>
            <p className="mt-2 text-xs text-ink-600">
              Applying with: <strong>{readyVersions.find((v) => v.id === selectedVersionId)?.originalName} (Version {readyVersions.find((v) => v.id === selectedVersionId)?.version})</strong>
            </p>
          </div>
          <p className="text-xs text-ink-500">
            By submitting, your contact information, resume evidence, and application details will be securely shared with {job.company}'s hiring team.
          </p>
        </div>
      </Modal>
    </div>
  );
};

/* =========================================================================
   7. APPLICATIONS TRACKING (LIST & DETAIL)
   ========================================================================= */
export const ApplicationsPage = () => {
  const [status, setStatus] = useState(""),
    q = useQuery({
      queryKey: ["applications-candidate", status],
      queryFn: () => candidateApi.applications({ status, limit: 50 }),
    }),
    saved = useQuery({ queryKey: ["saved-jobs"], queryFn: jobsApi.saved }),
    qc = useQueryClient(),
    toast = useToast(),
    unsave = useMutation({
      mutationFn: (id) => jobsApi.unsave(id),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["saved-jobs"] });
        toast.success("Removed from saved jobs");
      },
      onError: (error) => toast.error(error.message),
    });

  const statuses = [
    { key: "", label: "All" },
    { key: "submitted", label: "Submitted" },
    { key: "under_review", label: "Under Review" },
    { key: "shortlisted", label: "Shortlisted" },
    { key: "interview", label: "Interview" },
    { key: "offer", label: "Offer" },
    { key: "hired", label: "Hired" },
    { key: "rejected", label: "Not Selected" },
    { key: "withdrawn", label: "Withdrawn" },
  ];

  return (
    <div className="page-wrap space-y-7">
      <PageHeader
        eyebrow="My Applications"
        title="Track your applications"
        description="Follow your progress at every hiring stage — each application is tied to the exact resume version and job requirements you submitted."
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s.key || "all"}
            onClick={() => setStatus(s.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              status === s.key ? "bg-ink-950 text-white shadow-sm" : "bg-white text-ink-600 hover:bg-ink-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Applications List */}
      {q.isLoading ? (
        <SkeletonList count={4} />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : q.data?.data?.length ? (
        <div className="space-y-4">
          {q.data.data.map((a) => {
            const currentStageIndex = getStageIndex(a.status);
            const isRejected = normalizeAppStatus(a.status) === "rejected";
            const isWithdrawn = normalizeAppStatus(a.status) === "withdrawn";

            return (
              <Link
                key={a._id}
                to={`/app/candidate/applications/${a._id}`}
                className="panel group block p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold text-ink-950 transition-colors group-hover:text-brand-700">
                      {a.job?.title || a.jobSnapshot?.title}
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-ink-500">
                      {a.job?.company || a.jobSnapshot?.company} · Applied {formatRelativeTime(a.appliedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusPill status={a.status} />
                    <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* Progress Stepper Bar */}
                <div className="mt-5 border-t border-ink-100 pt-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-500">
                    <span>
                      {isRejected ? "Status: Not selected" : isWithdrawn ? "Status: Withdrawn" : `Stage: ${HIRING_STAGES[currentStageIndex]?.label || "Submitted"}`}
                    </span>
                    <span>Applied {formatDate(a.appliedAt)}</span>
                  </div>

                  {!isRejected && !isWithdrawn && (
                    <div className="mt-2.5 flex items-center gap-1.5">
                      {HIRING_STAGES.slice(0, 5).map((stage, idx) => {
                        const isDone = currentStageIndex > idx;
                        const isCurrent = currentStageIndex === idx;
                        return (
                          <div key={stage.id} className="flex flex-1 items-center gap-1.5">
                            <div
                              className={`h-2 w-full rounded-full transition-all ${
                                isDone
                                  ? "bg-success-500"
                                  : isCurrent
                                    ? "bg-brand-500 ring-2 ring-brand-200"
                                    : "bg-ink-100"
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={BriefcaseBusiness}
          title={status ? "No applications in this category" : "No applications yet"}
          description={
            status
              ? `No applications currently have the status "${status.replaceAll("_", " ")}".`
              : "When you apply for a job, you will be able to track every stage of the process right here."
          }
          action={
            <Button as={Link} to="/app/candidate/jobs" size="sm">
              Browse jobs
            </Button>
          }
        />
      )}

      {/* Saved Jobs Section */}
      <section className="mt-10 border-t border-ink-200 pt-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink-950">Saved jobs</h2>
            <p className="mt-1 text-sm text-ink-500">Jobs you bookmarked for later</p>
          </div>
          <Link to="/app/candidate/jobs" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            Browse more roles →
          </Link>
        </div>

        {saved.data?.data?.length ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {saved.data.data.map((j) => (
              <JobTile key={j.id || j._id} job={j} saved onSave={(id) => unsave.mutate(id)} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 p-6 text-center">
            <Bookmark className="mx-auto h-6 w-6 text-ink-300" />
            <p className="mt-2 text-sm text-ink-500">
              No saved jobs yet. Use the bookmark icon on any job card to save roles for quick access.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

/* Application Detail / Hiring Progress Journey */
export const ApplicationDetail = () => {
  const { applicationId } = useParams(),
    qc = useQueryClient(),
    toast = useToast(),
    [reason, setReason] = useState(""),
    [withdrawOpen, setWithdrawOpen] = useState(false);

  const q = useQuery({
      queryKey: ["application", "candidate", applicationId],
      queryFn: () => candidateApi.application(applicationId),
    }),
    interviews = useQuery({
      queryKey: ["candidate-interviews"],
      queryFn: candidateApi.interviews,
    }),
    withdraw = useMutation({
      mutationFn: () => candidateApi.withdraw(applicationId, reason),
      onSuccess: () => {
        toast.success("Application withdrawn successfully");
        qc.invalidateQueries({ queryKey: ["application", "candidate", applicationId] });
        qc.invalidateQueries({ queryKey: ["applications-candidate"] });
        setWithdrawOpen(false);
      },
    });

  if (q.isLoading) return <LoadingState message="Loading application progress…" />;
  if (q.error)
    return (
      <div className="page-wrap">
        <ErrorState error={q.error} />
      </div>
    );

  const a = q.data.data;
  const currentStageIndex = getStageIndex(a.status);
  const isRejected = normalizeAppStatus(a.status) === "rejected";
  const isWithdrawn = normalizeAppStatus(a.status) === "withdrawn";

  const appInterviews = (interviews.data?.data || []).filter(
    (i) => String(i.application?._id || i.application?.id || i.application) === String(applicationId)
  );

  return (
    <div className="page-wrap max-w-4xl space-y-6">
      <Link to="/app/candidate/applications" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
        ← Back to all applications
      </Link>

      <PageHeader
        eyebrow="Application Tracking"
        title={a.job?.title || a.jobSnapshot?.title || "Application Progress"}
        description={`${a.job?.company || a.jobSnapshot?.company || ""} · Submitted on ${formatDate(a.appliedAt)}`}
        action={<StatusPill status={a.status} />}
      />

      {/* Visual Hiring Progress Stepper */}
      <section className="panel p-6 shadow-sm">
        <h2 className="text-lg font-bold text-ink-950">Hiring Progress</h2>
        <p className="mt-1 text-sm text-ink-500">
          Transparent stage-by-stage hiring status.
        </p>

        {isRejected ? (
          <div className="mt-5 rounded-xl border border-danger-200 bg-danger-50 p-4 text-danger-900">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="h-5 w-5 text-danger-600" />
              <span>Application Status: Not selected</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-danger-800">
              Thank you for your interest and time. The hiring team has decided to proceed with other candidates for this specific position. Your profile remains saved for future opportunities.
            </p>
          </div>
        ) : isWithdrawn ? (
          <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-4 text-ink-700">
            <p className="font-bold">Application Status: Withdrawn</p>
            <p className="mt-1 text-sm">You withdrew this application on {formatDate(a.withdrawnAt || a.updatedAt)}.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-6">
              {HIRING_STAGES.map((stage, idx) => {
                const isCompleted = currentStageIndex > idx;
                const isCurrent = currentStageIndex === idx;

                return (
                  <div
                    key={stage.id}
                    className={`flex flex-col items-center rounded-xl p-3 text-center transition-all ${
                      isCurrent
                        ? "border-2 border-brand-500 bg-brand-50/50 shadow-sm"
                        : isCompleted
                          ? "border border-success-200 bg-success-50/30"
                          : "border border-ink-100 bg-ink-50/40 opacity-70"
                    }`}
                  >
                    <div
                      className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                        isCompleted
                          ? "bg-success-500 text-white"
                          : isCurrent
                            ? "bg-brand-600 text-white ring-4 ring-brand-100"
                            : "bg-ink-200 text-ink-600"
                      }`}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : idx + 1}
                    </div>
                    <p className={`mt-2 text-xs font-bold ${isCurrent ? "text-brand-900" : isCompleted ? "text-success-900" : "text-ink-600"}`}>
                      {stage.label}
                    </p>
                    <span className="mt-0.5 text-[10px] text-ink-400">
                      {isCompleted ? "Completed" : isCurrent ? "Current stage" : "Upcoming"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Associated Scheduled Interviews */}
      {appInterviews.length > 0 && (
        <section className="panel p-6 shadow-sm">
          <h2 className="text-lg font-bold text-ink-950">Scheduled Interviews</h2>
          <div className="mt-4 space-y-3">
            {appInterviews.map((interview) => (
              <div key={interview._id} className="flex flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-ink-900">{interview.title}</p>
                  <p className="mt-1 text-xs text-ink-600">
                    {interview.scheduledStart ? formatDate(interview.scheduledStart) : "Time pending"} · {interview.type || "Video interview"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={interview.status} />
                  {interview.meetingUrl && (
                    <Button
                      size="sm"
                      as="a"
                      href={interview.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      leftIcon={<Video className="h-4 w-4" />}
                    >
                      Join Interview
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    as={Link}
                    to={`/app/candidate/interviews/${interview._id}`}
                  >
                    Prepare
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Job Snapshot & Submitted Resume Details */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel p-6">
          <h2 className="font-bold text-ink-950">Job Snapshot at Application</h2>
          <div className="mt-3 space-y-2 text-sm text-ink-600">
            <p><strong>Role:</strong> {a.jobSnapshot?.title || a.job?.title}</p>
            <p><strong>Company:</strong> {a.jobSnapshot?.company || a.job?.company}</p>
            <p><strong>Location:</strong> {a.jobSnapshot?.location || a.job?.location}</p>
            <p><strong>Workplace:</strong> {a.jobSnapshot?.workplaceMode || "On-site"}</p>
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="font-bold text-ink-950">Application Details</h2>
          <div className="mt-3 space-y-2 text-sm text-ink-600">
            <p><strong>Application ID:</strong> <span className="font-mono text-xs">{a._id}</span></p>
            <p><strong>Submission date:</strong> {formatDate(a.appliedAt)}</p>
            <p><strong>Source:</strong> {a.source || "Direct"}</p>
          </div>
        </section>
      </div>

      {/* Status History Timeline */}
      <section className="panel p-6">
        <h2 className="font-bold text-ink-950">Status History</h2>
        <ol className="mt-6 space-y-0">
          {(a.statusHistory || []).map((h, i) => (
            <li key={`${h.status}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
              <span className="relative z-10 mt-1 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-brand-50" />
              {i < a.statusHistory.length - 1 && (
                <span className="absolute left-[5px] top-4 h-full w-px bg-ink-200" />
              )}
              <div>
                <p className="font-semibold capitalize text-ink-900">{h.status.replaceAll("_", " ")}</p>
                <p className="text-xs text-ink-500">{formatDate(h.changedAt)}</p>
                {h.note && <p className="mt-1 text-xs text-ink-600">{h.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Withdraw Action */}
      {!["hired", "rejected", "withdrawn", "closed"].includes(normalizeAppStatus(a.status)) && (
        <section className="panel p-6">
          <h2 className="font-bold text-danger-900">Withdraw application</h2>
          <p className="mt-1 text-sm text-ink-500">
            You may withdraw your application if you are no longer considering this role. This retains an audit record but removes you from active candidate consideration.
          </p>
          <Textarea
            className="mt-4"
            label="Reason for withdrawal (optional)"
            placeholder="e.g. Accepted another offer / No longer available"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            className="mt-4"
            variant="danger"
            onClick={() => setWithdrawOpen(true)}
          >
            Withdraw application
          </Button>
          {withdraw.error && (
            <div className="mt-3">
              <ErrorCallout error={withdraw.error} />
            </div>
          )}
        </section>
      )}

      <ConfirmModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onConfirm={() => withdraw.mutate()}
        title="Withdraw this application?"
        description="This action withdraws your profile from the hiring process for this role. You will not be able to reactivate this specific application."
        confirmLabel="Withdraw application"
        tone="danger"
        isLoading={withdraw.isPending}
      />
    </div>
  );
};

/* =========================================================================
   8. SAVED JOBS PAGE
   ========================================================================= */
export const SavedJobsPage = () => {
  const saved = useQuery({ queryKey: ["saved-jobs"], queryFn: jobsApi.saved }),
    qc = useQueryClient(),
    toast = useToast(),
    unsave = useMutation({
      mutationFn: (id) => jobsApi.unsave(id),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["saved-jobs"] });
        toast.success("Job removed from saved");
      },
      onError: (error) => toast.error(error.message),
    });

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Saved jobs"
        title="Your bookmarked opportunities"
        description="Review saved roles and apply whenever you are ready."
      />

      {saved.isLoading ? (
        <SkeletonList count={4} />
      ) : saved.error ? (
        <ErrorState error={saved.error} />
      ) : saved.data?.data?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {saved.data.data.map((j) => (
            <JobTile key={j.id || j._id} job={j} saved onSave={(id) => unsave.mutate(id)} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Bookmark}
          title="No saved jobs yet"
          description="Click the bookmark button on any job card to save opportunities here for easy access."
          action={
            <Button as={Link} to="/app/candidate/jobs" size="sm">
              Discover jobs
            </Button>
          }
        />
      )}
    </div>
  );
};

/* =========================================================================
   9. INTERVIEWS & AI INTERVIEW PREP
   ========================================================================= */
export const CandidateInterviews = () => {
  const [tab, setTab] = useState("upcoming"),
    [searchQuery, setSearchQuery] = useState(""),
    q = useQuery({ queryKey: ["candidate-interviews"], queryFn: candidateApi.interviews }),
    qc = useQueryClient(),
    toast = useToast();

  const confirmMutation = useMutation({
    mutationFn: (id) => interviewApi.confirm(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-interviews"] });
      toast.success("Interview attendance confirmed");
    },
    onError: (err) => toast.error(err.message),
  });

  const allInterviews = q.data?.data || [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endOfThisWeek = new Date(now.getTime() + 7 * 86400000);

  const filterByTab = (i) => {
    const sDate = i.scheduledStart ? new Date(i.scheduledStart) : null;
    if (tab === "today") {
      return sDate && sDate >= startOfToday && sDate < endOfToday && i.status !== "cancelled";
    }
    if (tab === "this_week") {
      return sDate && sDate >= now && sDate <= endOfThisWeek && i.status !== "cancelled";
    }
    if (tab === "upcoming") {
      return ["invited", "confirmed", "reschedule_requested"].includes(i.status);
    }
    if (tab === "past") {
      return ["completed"].includes(i.status) || (sDate && sDate < now && i.status !== "cancelled");
    }
    if (tab === "cancelled") {
      return i.status === "cancelled";
    }
    return true;
  };

  const searched = allInterviews.filter((i) => {
    if (!filterByTab(i)) return false;
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase();
    const title = (i.title || "").toLowerCase();
    const job = (i.application?.job?.title || "").toLowerCase();
    const company = (i.application?.job?.company || "").toLowerCase();
    return title.includes(term) || job.includes(term) || company.includes(term);
  });

  const tabCounts = {
    upcoming: allInterviews.filter((i) => ["invited", "confirmed", "reschedule_requested"].includes(i.status)).length,
    today: allInterviews.filter((i) => {
      const d = i.scheduledStart ? new Date(i.scheduledStart) : null;
      return d && d >= startOfToday && d < endOfToday && i.status !== "cancelled";
    }).length,
    this_week: allInterviews.filter((i) => {
      const d = i.scheduledStart ? new Date(i.scheduledStart) : null;
      return d && d >= now && d <= endOfThisWeek && i.status !== "cancelled";
    }).length,
    past: allInterviews.filter((i) => ["completed"].includes(i.status) || (i.scheduledStart && new Date(i.scheduledStart) < now && i.status !== "cancelled")).length,
    cancelled: allInterviews.filter((i) => i.status === "cancelled").length,
    all: allInterviews.length,
  };

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Interviews"
        title="Your interview schedule"
        description="Track upcoming interview rounds, join video calls, and generate tailored AI preparation plans."
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-ink-100 bg-ink-50/50 p-1">
          {[
            { id: "upcoming", label: `Upcoming (${tabCounts.upcoming})` },
            { id: "today", label: `Today (${tabCounts.today})` },
            { id: "this_week", label: `This Week (${tabCounts.this_week})` },
            { id: "past", label: `Past & Completed (${tabCounts.past})` },
            { id: "cancelled", label: `Cancelled (${tabCounts.cancelled})` },
            { id: "all", label: `All (${tabCounts.all})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === t.id ? "bg-ink-950 text-white shadow-sm" : "text-ink-600 hover:bg-white/80"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <Input
            aria-label="Filter interviews"
            placeholder="Search by job or company"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {q.isLoading ? (
        <SkeletonList count={3} />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : searched.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {searched.map((i) => {
            const startDate = i.scheduledStart ? new Date(i.scheduledStart) : null;
            const duration = formatDuration(i.scheduledStart, i.scheduledEnd);
            const hasValidLink = isValidMeetingUrl(i.meetingUrl);

            return (
              <div
                key={i._id}
                className="panel flex flex-col justify-between p-5 transition-all hover:border-brand-200 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {startDate ? (
                        <div className="flex min-w-[56px] flex-col items-center justify-center rounded-xl border border-brand-200 bg-brand-50/70 px-2.5 py-1.5 text-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
                            {startDate.toLocaleDateString("en-US", { month: "short" })}
                          </span>
                          <span className="text-lg font-black leading-tight text-ink-950">
                            {startDate.getDate()}
                          </span>
                        </div>
                      ) : (
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-100 text-ink-600">
                          <Clock className="h-5 w-5" />
                        </span>
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h2 className="text-base font-bold text-ink-950">{i.title}</h2>
                          {i.type && (
                            <Badge variant="outline" className="text-[11px] capitalize">
                              {i.type.replaceAll("_", " ")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs font-medium text-ink-600">
                          {i.application?.job?.title} · {i.application?.job?.company || "Company"}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={i.status} />
                  </div>

                  <div className="mt-4 space-y-1.5 rounded-lg bg-ink-50/60 p-3 text-xs text-ink-600">
                    <p className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-brand-600" />
                      <span>
                        {startDate
                          ? `${formatDateTime(startDate, i.timezone)}${duration ? ` (${duration})` : ""}`
                          : "Schedule pending"}
                      </span>
                    </p>
                    {i.timezone && (
                      <p className="flex items-center gap-2 text-ink-500">
                        <Clock className="h-3.5 w-3.5 text-ink-400" />
                        <span>Timezone: {i.timezone}</span>
                      </p>
                    )}
                    {i.location ? (
                      <p className="flex items-center gap-2 text-ink-600">
                        <MapPin className="h-3.5 w-3.5 text-ink-400" />
                        <span>Location: {i.location}</span>
                      </p>
                    ) : !hasValidLink ? (
                      <p className="flex items-center gap-2 text-ink-400">
                        <Video className="h-3.5 w-3.5 text-ink-400" />
                        <span>Meeting details will be provided by host</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
                  {hasValidLink && (
                    <Button
                      size="sm"
                      as="a"
                      href={i.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      leftIcon={<Video className="h-4 w-4" />}
                    >
                      Join interview
                    </Button>
                  )}

                  {startDate && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadInterviewIcs(i)}
                      leftIcon={<Download className="h-3.5 w-3.5" />}
                    >
                      Add to calendar
                    </Button>
                  )}

                  {i.status === "invited" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      isLoading={confirmMutation.isPending && confirmMutation.variables === i._id}
                      onClick={() => confirmMutation.mutate(i._id)}
                    >
                      Confirm Attendance
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    as={Link}
                    to={`/app/candidate/interviews/${i._id}`}
                    leftIcon={<Sparkles className="h-3.5 w-3.5 text-brand-600" />}
                  >
                    Prep &amp; Details
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Video}
          title={searchQuery ? "No matching interviews" : tab === "upcoming" ? "No upcoming interviews" : "No interviews in this tab"}
          description={
            searchQuery
              ? `No interviews matched "${searchQuery}". Try a different keyword.`
              : tab === "upcoming"
              ? "Interviews appear here once a recruiter schedules one with you."
              : "Completed or past interviews will appear in this tab."
          }
          action={
            <Button as={Link} to="/app/candidate/applications" variant="secondary" size="sm">
              View applications
            </Button>
          }
        />
      )}
    </div>
  );
};

export const InterviewPrep = () => {
  const { interviewId } = useParams(),
    [result, setResult] = useState(null),
    [rescheduleOpen, setRescheduleOpen] = useState(false),
    [rescheduleReason, setRescheduleReason] = useState(""),
    qc = useQueryClient(),
    toast = useToast(),
    interviewQuery = useQuery({
      queryKey: ["candidate-interview", interviewId],
      queryFn: async () => {
        try {
          const res = await interviewApi.candidateGet(interviewId);
          if (res?.data) return res;
        } catch {
          /* fallback */
        }
        try {
          const res = await candidateApi.interviews();
          const found = res?.data?.find((i) => i._id === interviewId);
          return { data: found };
        } catch {
          return { data: null };
        }
      },
    }),
    prep = useMutation({
      mutationFn: () => interviewApi.prep(interviewId),
      onSuccess: (r) => {
        setResult(r.data);
        toast.success("AI interview prep plan generated");
      },
      onError: (err) => toast.error(err.message),
    }),
    confirm = useMutation({
      mutationFn: () => interviewApi.confirm(interviewId),
      onSuccess: () => {
        toast.success("Interview attendance confirmed");
        qc.invalidateQueries({ queryKey: ["candidate-interview", interviewId] });
        qc.invalidateQueries({ queryKey: ["candidate-interviews"] });
      },
      onError: (err) => toast.error(err.message),
    }),
    reschedule = useMutation({
      mutationFn: () => interviewApi.reschedule(interviewId, rescheduleReason),
      onSuccess: () => {
        toast.success("Reschedule request sent to recruiter");
        setRescheduleOpen(false);
        setRescheduleReason("");
        qc.invalidateQueries({ queryKey: ["candidate-interview", interviewId] });
        qc.invalidateQueries({ queryKey: ["candidate-interviews"] });
      },
      onError: (err) => toast.error(err.message),
    });

  const interview = interviewQuery.data?.data;
  const startDate = interview?.scheduledStart ? new Date(interview.scheduledStart) : null;
  const duration = interview ? formatDuration(interview.scheduledStart, interview.scheduledEnd) : null;
  const hasValidLink = isValidMeetingUrl(interview?.meetingUrl);

  return (
    <div className="page-wrap max-w-4xl space-y-6">
      <Link to="/app/candidate/interviews" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
        ← Back to interviews
      </Link>

      <PageHeader
        eyebrow="Interview preparation"
        title="Prepare for your interview"
        description="Practice with competencies and structured questions grounded strictly in the real job requirements. Preparation aids only — never an autonomous prediction."
      />

      {interview && (
        <div className="panel p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-ink-950">{interview.title}</h2>
                <StatusPill status={interview.status} />
                {interview.type && (
                  <Badge variant="outline" className="capitalize">
                    {interview.type.replaceAll("_", " ")}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm font-semibold text-ink-700">
                {interview.application?.job?.title} · {interview.application?.job?.company || "Company"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasValidLink && (
                <Button
                  size="sm"
                  as="a"
                  href={interview.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  leftIcon={<Video className="h-4 w-4" />}
                >
                  Join interview
                </Button>
              )}
              {startDate && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadInterviewIcs(interview)}
                  leftIcon={<Download className="h-4 w-4" />}
                >
                  Add to Calendar
                </Button>
              )}
            </div>
          </div>

          {/* Attendance confirmation banner */}
          {interview.status === "invited" && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-warning-200 bg-warning-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-warning-900">Attendance Confirmation Requested</p>
                <p className="text-xs text-warning-700">Please confirm your attendance or request a reschedule if you need another time.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" onClick={() => confirm.mutate()} isLoading={confirm.isPending}>
                  Confirm Attendance
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setRescheduleOpen(true)}>
                  Request Reschedule
                </Button>
              </div>
            </div>
          )}

          {interview.status === "confirmed" && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-success-200 bg-success-50 p-3 text-xs text-success-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success-600" />
                <span>Attendance Confirmed: You are scheduled for this interview.</span>
              </div>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setRescheduleOpen(true)}>
                Need to reschedule?
              </Button>
            </div>
          )}

          {interview.status === "reschedule_requested" && (
            <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800">
              <p className="font-bold">Reschedule Requested</p>
              <p className="mt-0.5">The hiring team has been notified. {interview.cancelledReason ? `Reason: "${interview.cancelledReason}"` : ""}</p>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3 border-t border-ink-100 pt-3 text-xs text-ink-600">
            <div>
              <span className="font-semibold text-ink-900">Date &amp; Time:</span>
              <p className="mt-0.5 text-ink-600">{startDate ? formatDateTime(startDate, interview.timezone) : "Pending"}</p>
              {duration && <p className="text-[11px] text-ink-400">Duration: {duration}</p>}
            </div>
            <div>
              <span className="font-semibold text-ink-900">Timezone:</span>
              <p className="mt-0.5 text-ink-600">{interview.timezone || "UTC"}</p>
            </div>
            <div>
              <span className="font-semibold text-ink-900">Location:</span>
              <p className="mt-0.5 text-ink-600">{interview.location || (hasValidLink ? "Online video meeting" : "Details pending")}</p>
            </div>
          </div>
        </div>
      )}

      {/* AI Prep Panel */}
      <div className="ai-panel p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white">Generate Interview Preparation Plan</h2>
        <p className="mt-2 text-sm leading-6 text-ink-300">
          HireSmart analyzes the actual job requirements from your application to create focus areas, behavioral practice questions, and skill gap guidance.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => prep.mutate()} isLoading={prep.isPending} leftIcon={<WandSparkles className="h-4 w-4" />}>
            Generate Prep Plan
          </Button>
          <Button variant="ghost" onClick={() => confirm.mutate()} isLoading={confirm.isPending}>
            Confirm Interview
          </Button>
          <Button variant="ghost" className="text-warning-300 hover:bg-white/10" onClick={() => setRescheduleOpen(true)}>
            Request Reschedule
          </Button>
        </div>

        {prep.error && (
          <div className="mt-4">
            <ErrorCallout error={prep.error} />
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-6">
          <AIProvenance
            tone="light"
            metadata={result.metadata}
            confidence={result.confidence}
            limitations={result.limitations}
          />

          <section className="panel p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-ink-950">Core Competencies &amp; Focus Areas</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.focusAreas?.map((x) => (
                  <Badge key={x} variant="brand">
                    {x}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold text-ink-950">Targeted Practice Questions</h2>
              <p className="mt-1 text-xs text-ink-500">
                Use the STAR method (Situation, Task, Action, Result) to structure your answers with measurable impact.
              </p>
              <ol className="mt-3 space-y-3">
                {result.practiceQuestions?.map((x, i) => (
                  <li key={x} className="rounded-xl border border-ink-100 bg-ink-50/50 p-4 text-sm text-ink-900">
                    <span className="mr-2 font-bold text-brand-600">{i + 1}.</span>
                    {x}
                  </li>
                ))}
              </ol>
            </div>

            {result.skillGaps?.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-warning-800">Potential Skill Gap Considerations</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.skillGaps.map((gap) => (
                    <Badge key={gap} variant="warning">
                      {gap}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <Modal
        isOpen={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Request interview reschedule"
        description="Let the hiring team know why you need to reschedule and what times work best for you."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => reschedule.mutate()}
              isLoading={reschedule.isPending}
              disabled={!rescheduleReason.trim()}
            >
              Send Request
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason and preferred availability"
          placeholder="e.g. Due to an unavoidable conflict, I would like to request rescheduling to next Tuesday afternoon."
          value={rescheduleReason}
          onChange={(e) => setRescheduleReason(e.target.value)}
          rows={4}
        />
      </Modal>
    </div>
  );
};

/* =========================================================================
   10. CAREER COPILOT / AI ASSISTANT
   ========================================================================= */
export const CareerCopilot = () => {
  const [params] = useSearchParams(),
    initialPrompt = params.get("prompt") || params.get("q") || "",
    [question, setQuestion] = useState(initialPrompt),
    [history, setHistory] = useState([]),
    run = useMutation({
      mutationFn: (text) => aiApi.run("career_copilot", { text }),
      onSuccess: (r, text) => {
        setHistory((prev) => [
          ...prev,
          { question: text, result: r.data, timestamp: new Date() },
        ]);
        setQuestion("");
      },
    });

  return (
    <div className="page-wrap max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Career Assistant"
        title="Ask your career assistant"
        description="Get tailored career guidance grounded in your real profile, skills evidence, and job matches. AI advice is decision support, never an autonomous promise."
      />

      {/* Interactive Chat Panel */}
      <div className="ai-panel p-6 sm:p-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim().length >= 5) run.mutate(question.trim());
          }}
        >
          <Textarea
            label="What would you like assistance with?"
            className="!border-white/15 !bg-white/8 !text-white placeholder:text-ink-400"
            placeholder="e.g. How can I make my backend experience more quantifiable for senior roles?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="secondary"
              disabled={question.trim().length < 5}
              isLoading={run.isPending}
              leftIcon={<Send className="h-4 w-4" />}
            >
              Ask Assistant
            </Button>
            <div className="flex flex-wrap items-center gap-1.5">
              {CANDIDATE_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuestion(s)}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-ink-300 transition-colors hover:border-brand-400 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </form>

        {run.error && (
          <div className="mt-4">
            <ErrorCallout error={run.error} />
          </div>
        )}
      </div>

      {/* Response History Stream */}
      {history.length > 0 && (
        <div className="space-y-6">
          {history.map((item, idx) => (
            <div key={idx} className="panel space-y-4 p-6 shadow-sm">
              {/* Question */}
              <div className="flex items-start gap-3 border-b border-ink-100 pb-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-950 text-xs font-bold text-white">
                  You
                </span>
                <div>
                  <p className="font-bold text-ink-950">{item.question}</p>
                  <p className="text-[11px] text-ink-400">{formatRelativeTime(item.timestamp)}</p>
                </div>
              </div>

              {/* AI Answer */}
              <div>
                <AIProvenance
                  tone="light"
                  metadata={item.result?.metadata}
                  confidence={item.result?.confidence}
                  limitations={item.result?.limitations}
                />
                <p className="mt-4 whitespace-pre-wrap leading-7 text-ink-900">{item.result?.answer}</p>
                {item.result?.recommendations?.length > 0 && (
                  <div className="mt-4 rounded-xl bg-ink-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Actionable Steps</p>
                    <ul className="mt-2 space-y-2 text-sm text-ink-800">
                      {item.result.recommendations.map((x) => (
                        <li key={x} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 text-success-600 shrink-0" />
                          <span>{x}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   11. ALERTS PAGE
   ========================================================================= */
export const AlertsPage = () => {
  const toast = useToast(),
    qc = useQueryClient(),
    [alertToDelete, setAlertToDelete] = useState(null),
    q = useQuery({ queryKey: ["alerts"], queryFn: alertsApi.list }),
    remove = useMutation({
      mutationFn: (id) => alertsApi.remove(id),
      onSuccess: () => {
        setAlertToDelete(null);
        qc.invalidateQueries({ queryKey: ["alerts"] });
        toast.success("Alert deleted");
      },
      onError: (error) => toast.error(error.message),
    }),
    toggle = useMutation({
      mutationFn: ({ id, active }) => alertsApi.update(id, { active }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
      onError: (error) => toast.error(error.message),
    });

  return (
    <div className="page-wrap max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Job alerts"
        title="Your saved job searches"
        description="We notify you when newly published and approved jobs match your preferences. Weekly by default — switch to daily for fast-moving roles."
      />

      {q.isLoading ? (
        <LoadingState message="Loading your job alerts…" />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="space-y-3">
          {q.data.data.map((a) => (
            <div key={a.id} className="panel flex flex-wrap items-center gap-4 p-5 shadow-sm">
              <div className="min-w-52 flex-1">
                <p className="font-bold text-ink-950">{a.name || "Custom Search Alert"}</p>
                <p className="mt-1 text-xs text-ink-600">
                  {[
                    a.query,
                    a.location,
                    a.workplaceMode,
                    a.jobType,
                    a.skills?.length && a.skills.join(", "),
                    a.minSalary && `₹${a.minSalary.toLocaleString("en-IN")}+`,
                    a.industry,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Matches all open jobs"}{" "}
                  · <span className="font-semibold capitalize">{a.cadence}</span>
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {a.lastRunAt
                    ? `Last checked ${formatRelativeTime(a.lastRunAt)}`
                    : "Not checked yet"}
                </p>
              </div>
              <Button
                size="sm"
                variant={a.active ? "secondary" : "ghost"}
                isLoading={toggle.isPending && toggle.variables?.id === a.id}
                onClick={() => toggle.mutate({ id: a.id, active: !a.active })}
              >
                {a.active ? "Active" : "Paused"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger-700 hover:bg-danger-50"
                onClick={() => setAlertToDelete(a)}
              >
                Delete
              </Button>
            </div>
          ))}
          {!q.data.data.length && (
            <EmptyState
              icon={Bell}
              title="No alerts configured"
              description='Open Find Jobs, refine your search criteria, and save an alert to get notified of new matches.'
              action={
                <Button as={Link} to="/app/candidate/jobs" size="sm">
                  Search jobs
                </Button>
              }
            />
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(alertToDelete)}
        onClose={() => setAlertToDelete(null)}
        onConfirm={() => alertToDelete && remove.mutate(alertToDelete.id)}
        title="Delete this job alert?"
        description={`“${alertToDelete?.name || "This alert"}” will stop matching new jobs and will not send further notifications.`}
        confirmLabel="Delete alert"
        tone="danger"
        isLoading={remove.isPending}
      />
    </div>
  );
};
