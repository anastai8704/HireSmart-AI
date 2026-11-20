import { useEffect, useRef, useState } from "react";
import { newId } from "../../lib/id";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Bell,
  BellRing,
  Bookmark,
  Bot,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileSearch,
  FileText,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  User,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import Button from "../../components/ui/Button";
import { CandidateOfferPanel } from "../../components/hiring/OfferPanels";
import CandidateJoinButton from "../../components/interviews/CandidateJoinButton";
import Input, { Textarea } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { ChatMessageContent } from "../../components/ai/ChatMessageContent";
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
  downloadInterviewIcs,
  istDayBounds,
} from "../../lib/utils";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { PlanBadge } from "../../components/billing/PlanBadge";

const getVersions = (response) => response?.meta?.versions || [];
const useResumes = () => useQuery({ queryKey: ["resumes"], queryFn: resumeApi.list });

const CANDIDATE_COPILOT_CATEGORIES = [
  {
    id: "career_guidance",
    label: "Career guidance",
    prompts: [
      "What career paths best align with my skills and experience?",
      "How can I position myself for senior engineering roles?",
      "What career growth areas should I focus on next?",
      "How do my qualifications compare to industry standards for lead positions?",
    ],
  },
  {
    id: "resume_improvement",
    label: "Resume improvement",
    prompts: [
      "How should I tailor my resume for a senior role?",
      "How can I make my project bullet points more quantifiable?",
      "Which sections of my resume need the most improvement for ATS?",
      "Are there redundant phrases or weak action verbs in my experience?",
    ],
  },
  {
    id: "skill_gap_analysis",
    label: "Skill gap analysis",
    prompts: [
      "Which in-demand skills are missing from my declared profile?",
      "What frameworks or tools should I learn next to improve job fit?",
      "Analyze skill gaps between my profile and high-paying backend roles.",
      "How can I bridge the gap from intermediate to senior engineer?",
    ],
  },
  {
    id: "job_recommendations",
    label: "Job recommendations",
    prompts: [
      "Summarize my strongest job matches.",
      "Which open requisitions best fit my tech stack?",
      "Are there remote or hybrid roles suited for my profile?",
      "Which company openings match my salary and location preferences?",
    ],
  },
  {
    id: "interview_preparation",
    label: "Interview preparation",
    prompts: [
      "What should I prepare before my interview?",
      "What technical topics should I review before my interview?",
      "Generate 5 behavioral questions tailored to my experience.",
      "How should I structure my answer to 'Tell me about yourself'?",
    ],
  },
  {
    id: "application_guidance",
    label: "Application guidance",
    prompts: [
      "What should I verify before submitting an application?",
      "How can I explain an employment gap professionally?",
      "What follow-up etiquette should I follow after an interview?",
      "How should I evaluate and negotiate compensation packages?",
    ],
  },
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
    ["Full name", Boolean(user.displayName)],
    ["Professional headline", Boolean(user.headline)],
    ["Location", Boolean(user.location)],
    ["Summary", Boolean(user.bio)],
    ["Skills", (user.skills || []).length > 0],
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

  const UPCOMING_INTERVIEW_STATUSES = [
    "scheduled",
    "invited",
    "confirmed",
    "reschedule_requested",
    "rescheduled",
    "in_progress",
  ];

  const upcomingInterviews = (interviews.data?.data || [])
    .filter((i) => UPCOMING_INTERVIEW_STATUSES.includes(i.status))
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
      {/* Welcome Header */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1 max-w-2xl xl:max-w-none pr-4">
          <p className="eyebrow">Candidate workspace</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl xl:text-[34px] break-normal">
            Good to see you, {user.displayName?.split(" ")[0] || "there"}.
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-500 sm:text-[15px] xl:max-w-3xl">
            Your search at a glance — recommended roles, application progress, and interview schedule.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link
            to="/app/candidate/onboarding"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-200/90 bg-brand-50/70 px-3.5 py-2.5 text-xs font-semibold text-brand-800 shadow-2xs transition hover:border-brand-300 hover:bg-brand-100/70 shrink-0"
          >
            <FileCheck2 className="h-4 w-4 text-brand-600" />
            <span>Profile {completion}% complete</span>
            <span className="text-brand-300">·</span>
            <span className="underline decoration-brand-300 underline-offset-2">
              {doneCount === checklist.length ? "View profile" : "Complete profile"}
            </span>
          </Link>
          <form onSubmit={handleHeroSearch} className="relative flex items-center shrink-0">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-ink-400" />
            <input
              type="text"
              aria-label="Search open roles"
              placeholder="Search roles, skills, companies…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-64 rounded-xl border border-ink-200 bg-white pl-9 pr-20 text-xs text-ink-900 shadow-2xs placeholder:text-ink-400 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 sm:w-72 lg:w-80"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              className="absolute right-1 h-8 rounded-lg px-2.5 text-xs font-semibold"
            >
              Search
            </Button>
          </form>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          detail={`${statusCount("under_review")} under review · ${statusCount("shortlisted")} shortlisted`}
        />
        <Kpi
          label="Interviews"
          value={statusCount("interview")}
          tone="warning"
          icon={Video}
          detail={`${upcomingInterviews.length} upcoming scheduled`}
        />
        <Kpi
          label="Resume versions"
          value={versions.length}
          tone={readyCount ? "success" : "ink"}
          icon={FileText}
          detail={`${readyCount} ready for matching`}
        />
      </div>

      {/* Application Status Overview Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
          <BriefcaseBusiness className="h-4 w-4 text-brand-600" />
          <span>Application Status Overview</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-100 bg-ink-50/70 px-2.5 py-1 text-xs font-medium text-ink-700">
            <span className="h-2 w-2 rounded-full bg-ink-400" />
            Submitted: <strong className="font-semibold text-ink-900">{statusCount("submitted")}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1 text-xs font-medium text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Under review: <strong className="font-semibold text-blue-900">{statusCount("under_review")}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-1 text-xs font-medium text-amber-700">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Shortlisted & Interviewing:{" "}
            <strong className="font-semibold text-amber-900">
              {statusCount("shortlisted") + statusCount("interview")}
            </strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 text-xs font-medium text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Offers received: <strong className="font-semibold text-emerald-950">{statusCount("offer")}</strong>
          </span>
        </div>
      </div>

      {/* Offer Action Banner (when offers exist) */}
      {statusCount("offer") > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-950 sm:flex-row sm:items-center sm:justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-2xs">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-emerald-950">
                You have {statusCount("offer")} job offer{statusCount("offer") > 1 ? "s" : ""} waiting for review!
              </p>
              <p className="text-xs text-emerald-800">
                Review compensation, offer letter details, and submit your decision.
              </p>
            </div>
          </div>
          <Button as={Link} to="/app/candidate/applications" size="sm" variant="success">
            Review offers <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Quick Actions Navigation */}
      <QuickActions
        columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        actions={[
          { icon: Search, label: "Discover jobs", to: "/app/candidate/jobs", hint: "Search open roles" },
          { icon: FileText, label: "Manage resume", to: "/app/candidate/resumes", hint: "Versions & ATS score" },
          { icon: BriefcaseBusiness, label: "View applications", to: "/app/candidate/applications", hint: "Track hiring status" },
          { icon: Video, label: "View interviews", to: "/app/candidate/interviews", hint: "Schedules & links" },
          { icon: Sparkles, label: "Career assistant", to: "/app/candidate/copilot", hint: "AI career coach" },
        ]}
      />

      {/* Two Column Layout */}
      <section className="grid gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          {/* Next Best Action Card */}
          <div className="relative overflow-hidden rounded-2xl border border-brand-200/90 bg-gradient-to-br from-brand-50/70 via-white to-brand-50/30 p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700">
                <Sparkles className="h-3.5 w-3.5" /> Next best action
              </span>
              <span className="text-xs font-medium text-ink-500">Tailored recommendation</span>
            </div>
            <div className="mt-5 flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm">
                <NextIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-ink-950">{next.title}</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-ink-600">{next.copy}</p>
                <Button as={Link} to={next.to} className="mt-4" size="sm">
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Recommended Opportunities */}
          <section className="space-y-4">
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
            <div className="grid gap-4 sm:grid-cols-2">
              {recs.isLoading ? (
                <SkeletonList count={2} />
              ) : (
                (recs.data?.data || [])
                  .slice(0, 4)
                  .map((x) => {
                    const jobId = x.job?.id || x.job?._id;
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
                <div className="sm:col-span-2">
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
          <SectionCard
            title="Recent applications"
            description="Your latest application updates and status"
            action={
              applications.length > 0 ? (
                <Link
                  to="/app/candidate/applications"
                  className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  View all ({applications.length})
                </Link>
              ) : null
            }
          >
            {applications.length > 0 ? (
              <div className="space-y-3">
                {applications.slice(0, 4).map((a) => (
                  <Link
                    key={a._id}
                    to={`/app/candidate/applications/${a._id}`}
                    className="group flex flex-col gap-2 rounded-xl border border-ink-100 bg-white p-3.5 shadow-2xs transition-all hover:border-brand-200 hover:bg-brand-50/20 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
                        {a.job?.title || a.jobSnapshot?.title || "Application"}
                      </p>
                      <p className="text-xs text-ink-500">
                        {a.job?.company || a.jobSnapshot?.company || "Company"} · Applied{" "}
                        {formatRelativeTime(a.appliedAt || a.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusPill status={a.status} />
                      <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BriefcaseBusiness}
                title="No applications submitted yet"
                description="Search for open roles and apply to start tracking your applications here."
                action={
                  <Button as={Link} to="/app/candidate/jobs" size="sm" variant="secondary">
                    Search jobs
                  </Button>
                }
              />
            )}
          </SectionCard>
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
                {doneCount === checklist.length ? "Review profile" : "Complete now"}
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
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : upcomingInterviews.length > 0 ? (
              <div className="space-y-3">
                {upcomingInterviews.map((i) => (
                  <div
                    key={i._id}
                    className="group rounded-xl border border-ink-100 bg-white p-3.5 shadow-2xs transition-all hover:border-brand-200 hover:shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/app/candidate/interviews/${i._id}`}
                          className="truncate text-sm font-semibold text-ink-900 transition-colors hover:text-brand-700 block"
                        >
                          {i.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {i.application?.job?.company || "Company"} · {i.application?.job?.title || "Role"}
                        </p>
                      </div>
                      <StatusPill status={i.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-50 pt-2.5 text-xs text-ink-600">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Calendar className="h-3.5 w-3.5 text-ink-400" />
                        {i.scheduledStart ? formatDate(i.scheduledStart) : "Schedule pending"}
                      </span>
                      <Link
                        to={`/app/candidate/interviews/${i._id}`}
                        className="font-semibold text-brand-600 hover:text-brand-700"
                      >
                        View details
                      </Link>
                    </div>
                    {!["cancelled", "completed", "no_show"].includes(i.status) && (
                      <div className="mt-3 border-t border-ink-50 pt-2.5">
                        <CandidateJoinButton interview={i} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Video}
                title="No upcoming interviews"
                description="Nothing scheduled right now. Interviews will appear here once scheduled by recruiters."
                action={
                  <Button as={Link} to="/app/candidate/jobs" size="sm" variant="secondary">
                    Find jobs
                  </Button>
                }
              />
            )}
          </SectionCard>

          {/* AI Career Insights Card */}
          <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5 shadow-2xs">
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
                  className="block rounded-lg bg-white p-2.5 text-xs font-medium text-ink-700 shadow-2xs transition hover:bg-brand-50 hover:text-brand-800"
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
        action={<PlanBadge billingHref="/app/candidate/plans" />}
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
    [error, setError] = useState(null),
    [deleteTarget, setDeleteTarget] = useState(null);

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

  const retryMutation = useMutation({
    mutationFn: (versionId) => resumeApi.retry(versionId),
    onSuccess: () => {
      toast.success("Resume processing retry queued");
      qc.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: (err) => toast.error(err.message || "Failed to retry processing"),
  });

  const deleteMutation = useMutation({
    mutationFn: (versionId) => resumeApi.remove(versionId),
    onSuccess: () => {
      toast.success("Resume version deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: (err) => toast.error(err.message || "Failed to delete resume version"),
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
  const primaryResume = q.data?.data?.find((r) => r.isPrimary);
  const primaryVersionId = primaryResume?.currentVersionId;

  const readyCount = versions.filter((v) => v.processingStatus === "ready").length;
  const processingCount = versions.filter((v) =>
    ["queued", "processing", "uploaded"].includes(v.processingStatus),
  ).length;
  const failedCount = versions.filter((v) =>
    ["failed", "rejected"].includes(v.processingStatus),
  ).length;

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Resume"
        title="Your resumes"
        description="Every application permanently references the exact version you submitted. Manage versions, review deterministic ATS scores, and get AI guidance."
        action={
          <Button onClick={() => input.current?.click()} leftIcon={<Upload className="h-4 w-4" />}>
            Upload version
          </Button>
        }
      />

      {/* A. Resume Dashboard Overview KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Total Resume Versions"
          value={versions.length}
          icon={FileText}
          detail="Stored in version library"
        />
        <Kpi
          label="Ready Resumes"
          value={readyCount}
          tone="success"
          icon={CheckCircle2}
          detail="Parsed & ready for matching"
        />
        <Kpi
          label="Processing"
          value={processingCount}
          tone={processingCount > 0 ? "brand" : "ink"}
          icon={Clock}
          detail="Extracting skills & structure"
        />
        <Kpi
          label="Failed Processing"
          value={failedCount}
          tone={failedCount > 0 ? "danger" : "ink"}
          icon={AlertCircle}
          detail="Can be retried or re-uploaded"
        />
      </div>

      {/* C. Resume Upload Drop Zone */}
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
        className={`w-full rounded-2xl border-2 border-dashed p-8 text-center transition ${
          drag ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-white hover:border-brand-300"
        }`}
      >
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Upload className="h-6 w-6" />
        </span>
        <p className="mt-3 font-semibold text-ink-900">Drop a PDF or DOCX, or browse files</p>
        <p className="mt-1 text-sm text-ink-500">
          Private upload · Deterministic parser &amp; AI extraction · 10 MB maximum
        </p>
        {upload.isPending && (
          <div className="mx-auto mt-4 max-w-md">
            <div className="h-2 rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-ink-600">Uploading {progress}%</p>
          </div>
        )}
      </button>

      {error && (
        <div>
          <ErrorCallout error={error} />
        </div>
      )}

      {/* B. Resume Library List / Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-950">Resume Version Library</h2>
          <span className="text-xs text-ink-500">
            {versions.length} version{versions.length === 1 ? "" : "s"} uploaded
          </span>
        </div>

        {versions.length ? (
          <div className="grid gap-3">
            {versions.map((v) => {
              const isPrimary = String(v.id) === String(primaryVersionId);
              const isPdf = v.mimeType === "application/pdf" || v.originalName?.toLowerCase().endsWith(".pdf");
              const isDocx =
                v.mimeType?.includes("wordprocessingml") || v.originalName?.toLowerCase().endsWith(".docx");
              const isFailed = ["failed", "rejected"].includes(v.processingStatus);

              return (
                <div
                  key={v.id}
                  className="panel flex flex-col justify-between gap-4 p-5 transition hover:border-brand-200 hover:shadow-2xs sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/app/candidate/resumes/${v.id}`}
                          className="truncate font-bold text-ink-950 hover:text-brand-700 hover:underline"
                        >
                          {v.originalName}
                        </Link>
                        <Badge variant="outline" className="text-xs font-semibold">
                          Version {v.version}
                        </Badge>
                        {isPrimary && (
                          <Badge variant="brand" className="text-xs">
                            Primary
                          </Badge>
                        )}
                        <Badge variant="neutral" className="text-xs uppercase">
                          {isPdf ? "PDF" : isDocx ? "DOCX" : "DOC"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        Uploaded {formatDate(v.createdAt)} · {v.size ? `${Math.round(v.size / 1024)} KB` : "Document"}
                        {v.summary?.atsScore != null && (
                          <span className="ml-2 font-medium text-ink-700">
                            · ATS Score: <strong>{v.summary.atsScore}</strong>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <StatusPill status={v.processingStatus} />

                    <Button
                      size="sm"
                      variant="ghost"
                      as={Link}
                      to={`/app/candidate/resumes/${v.id}`}
                      leftIcon={<Eye className="h-4 w-4" />}
                    >
                      View
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const res = await resumeApi.download(v.id);
                          downloadBlob(res.data, v.originalName);
                          toast.success("Download started");
                        } catch (err) {
                          toast.error(err.message || "Failed to download resume");
                        }
                      }}
                      leftIcon={<Download className="h-4 w-4" />}
                    >
                      Download
                    </Button>

                    {isFailed && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => retryMutation.mutate(v.id)}
                        isLoading={retryMutation.isPending && retryMutation.variables === v.id}
                        leftIcon={<RefreshCw className="h-4 w-4" />}
                      >
                        Retry
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger-600 hover:bg-danger-50 hover:text-danger-700"
                      onClick={() => setDeleteTarget(v)}
                      leftIcon={<Trash2 className="h-4 w-4" />}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No resume versions yet"
            description="Upload a PDF or DOCX above to begin — we’ll validate, parse and analyze it privately."
          />
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        title="Delete resume version?"
        description={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.originalName} (Version ${deleteTarget.version})? Applications that already reference this version will retain an immutable compliance record.`
            : "Are you sure you want to delete this resume version?"
        }
        confirmLabel="Delete version"
        tone="danger"
        isLoading={deleteMutation.isPending}
      />
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
    [skills, setSkills] = useState(params.get("skills") || ""),
    [workplaceMode, setWorkplaceMode] = useState(params.get("workplaceMode") || ""),
    [jobType, setJobType] = useState(params.get("jobType") || ""),
    [minSalary, setMinSalary] = useState(params.get("minSalary") || ""),
    [experience, setExperience] = useState(params.get("maxExp") || ""),
    [postedWithin, setPostedWithin] = useState(params.get("postedWithin") || ""),
    [sort, setSort] = useState(params.get("sort") || "date"),
    [showAdvancedFilters, setShowAdvancedFilters] = useState(false),
    [aiSearchPrompt, setAiSearchPrompt] = useState(""),
    [aiSearchActive, setAiSearchActive] = useState(false),
    [aiSearchExplanation, setAiSearchExplanation] = useState(null),
    [selectedJobId, setSelectedJobId] = useState(null),
    qc = useQueryClient(),
    toast = useToast();

  const debouncedSearch = useDebouncedValue(search, 350);

  // Filter params object
  const filterParams = {
    query: debouncedSearch,
    location: location || undefined,
    skills: skills || undefined,
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
      if (extracted.skills) setSkills(Array.isArray(extracted.skills) ? extracted.skills.join(", ") : extracted.skills);
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
    setSkills("");
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
    search || location || skills || workplaceMode || jobType || minSalary || experience || postedWithin || sort !== "date"
  );

  const activeAdvancedCount = [
    skills,
    workplaceMode,
    jobType,
    minSalary,
    experience,
    postedWithin,
    sort !== "date" ? sort : "",
  ].filter(Boolean).length;

  const rows = q.data?.data || [];
  const appliedJobsMap = new Map(
    (apps.data?.data || []).map((a) => [String(a.job?._id || a.job?.id || a.job), a])
  );

  const activeJobItem =
    rows.find((item) => {
      const j = item.job || item;
      return String(j.id || j._id) === String(selectedJobId);
    }) || rows[0] || null;

  const activeJob = activeJobItem ? (activeJobItem.job || activeJobItem) : null;
  const activeMatch = activeJobItem?.match || null;
  const activeJobId = activeJob ? (activeJob.id || activeJob._id) : null;
  const isActiveSaved = activeJobId && (saved.data?.data || []).some((j) => (j.id || j._id) === activeJobId);
  const activeApplication = activeJobId && appliedJobsMap.get(String(activeJobId));
  const activeSalary = activeJob ? formatJobSalary(activeJob) : null;

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

      {/* Segmented Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 pb-3">
        <Link
          to="/app/candidate/jobs"
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
            !recommendations
              ? "bg-brand-600 text-white shadow-2xs"
              : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
          )}
        >
          <BriefcaseBusiness className="h-4 w-4" />
          <span>All Jobs</span>
          {rows.length > 0 && !recommendations && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
              {rows.length}
            </span>
          )}
        </Link>
        <Link
          to="/app/candidate/recommendations"
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
            recommendations
              ? "bg-brand-600 text-white shadow-2xs"
              : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
          )}
        >
          <Sparkles className="h-4 w-4" />
          <span>Recommended For You</span>
          {recommendations && rows.length > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
              {rows.length}
            </span>
          )}
        </Link>
        <Link
          to="/app/candidate/saved"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink-600 transition-all hover:bg-ink-50 hover:text-ink-900"
        >
          <Bookmark className="h-4 w-4" />
          <span>Saved Jobs</span>
          {(saved.data?.data?.length || 0) > 0 && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-700">
              {saved.data.data.length}
            </span>
          )}
        </Link>
      </div>

      {/* Discovery Filters Bar */}
      {!recommendations && (
        <div className="panel space-y-4 p-5 shadow-2xs">
          {/* Top Search & Filter Bar */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-400" />
              <Input
                aria-label="Search jobs"
                placeholder="Job title, skills, keywords…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="relative md:w-64">
              <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-400" />
              <Input
                aria-label="Location"
                placeholder="Location (city or remote)…"
                className="pl-9"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showAdvancedFilters || activeAdvancedCount > 0 ? "secondary" : "outline"}
                onClick={() => setShowAdvancedFilters((v) => !v)}
                leftIcon={<SlidersHorizontal className="h-4 w-4" />}
                className="relative"
              >
                Filters
                {activeAdvancedCount > 0 && (
                  <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                    {activeAdvancedCount}
                  </span>
                )}
                {showAdvancedFilters ? (
                  <ChevronUp className="ml-1 h-3.5 w-3.5 text-ink-500" />
                ) : (
                  <ChevronDown className="ml-1 h-3.5 w-3.5 text-ink-500" />
                )}
              </Button>
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

          {/* Detailed Filters Grid (Collapsible or Active) */}
          {(showAdvancedFilters || activeAdvancedCount > 0) && (
            <div className="border-t border-ink-100 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2.5">
                {/* Specific Skills */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    Skills
                  </label>
                  <Input
                    aria-label="Relevant skills"
                    placeholder="e.g. React, Node"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Workplace Mode */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    Workplace
                  </label>
                  <SearchableSelect
                    aria-label="Workplace mode"
                    value={workplaceMode}
                    onChange={(e) => setWorkplaceMode(e.target.value)}
                    placeholder="All Workplace Modes"
                    searchable={false}
                    className="h-9 text-xs"
                  >
                    <option value="">All Workplace Modes</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">On-site</option>
                  </SearchableSelect>
                </div>

                {/* Job Type */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    Employment
                  </label>
                  <SearchableSelect
                    aria-label="Employment type"
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    placeholder="All Employment Types"
                    searchable={false}
                    className="h-9 text-xs"
                  >
                    <option value="">All Employment Types</option>
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Internship">Internship</option>
                    <option value="Contract">Contract</option>
                    <option value="Remote">Remote</option>
                  </SearchableSelect>
                </div>

                {/* Minimum Salary */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    Min Salary
                  </label>
                  <SearchableSelect
                    aria-label="Minimum salary"
                    value={minSalary}
                    onChange={(e) => setMinSalary(e.target.value)}
                    placeholder="Any Salary"
                    searchable={false}
                    className="h-9 text-xs"
                  >
                    <option value="">Any Salary</option>
                    <option value="500000">₹5,00,000+</option>
                    <option value="1000000">₹10,00,000+</option>
                    <option value="1500000">₹15,00,000+</option>
                    <option value="2000000">₹20,00,000+</option>
                    <option value="3000000">₹30,00,000+</option>
                  </SearchableSelect>
                </div>

                {/* Experience */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    Experience
                  </label>
                  <SearchableSelect
                    aria-label="Max experience required"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="Any Experience"
                    searchable={false}
                    className="h-9 text-xs"
                  >
                    <option value="">Any Experience</option>
                    <option value="1">Up to 1 year</option>
                    <option value="3">Up to 3 years</option>
                    <option value="5">Up to 5 years</option>
                    <option value="8">Up to 8 years</option>
                  </SearchableSelect>
                </div>

                {/* Date Posted */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    Posted Within
                  </label>
                  <SearchableSelect
                    aria-label="Date posted"
                    value={postedWithin}
                    onChange={(e) => setPostedWithin(e.target.value)}
                    placeholder="Date Posted (Anytime)"
                    searchable={false}
                    className="h-9 text-xs"
                  >
                    <option value="">Date Posted (Anytime)</option>
                    <option value="d">Past 24 hours</option>
                    <option value="w">Past week</option>
                    <option value="m">Past month</option>
                  </SearchableSelect>
                </div>

                {/* Sort by */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    Sort By
                  </label>
                  <SearchableSelect
                    aria-label="Sort order"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    placeholder="Sort: Newest"
                    searchable={false}
                    className="h-9 text-xs"
                  >
                    <option value="date">Sort: Newest</option>
                    <option value="salary">Sort: Highest Salary</option>
                    <option value="relevance">Sort: Relevance</option>
                  </SearchableSelect>
                </div>
              </div>
            </div>
          )}

          {/* Active Filter Chips Bar */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3 text-xs">
              <span className="font-semibold text-ink-500 mr-1">Active filters:</span>
              {search && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-200">
                  Keyword: <span className="font-semibold">{search}</span>
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Remove search filter"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {location && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-200">
                  Location: <span className="font-semibold">{location}</span>
                  <button
                    type="button"
                    onClick={() => setLocation("")}
                    aria-label="Remove location filter"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {skills && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-200">
                  Skill: <span className="font-semibold">{skills}</span>
                  <button
                    type="button"
                    onClick={() => setSkills("")}
                    aria-label="Remove skills filter"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {workplaceMode && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-200">
                  Workplace: <span className="font-semibold capitalize">{workplaceMode}</span>
                  <button
                    type="button"
                    onClick={() => setWorkplaceMode("")}
                    aria-label="Remove workplace filter"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {jobType && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-200">
                  Type: <span className="font-semibold">{jobType}</span>
                  <button
                    type="button"
                    onClick={() => setJobType("")}
                    aria-label="Remove job type filter"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {minSalary && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-200">
                  Salary: <span className="font-semibold">₹{(Number(minSalary) / 100000).toFixed(0)}L+</span>
                  <button
                    type="button"
                    onClick={() => setMinSalary("")}
                    aria-label="Remove salary filter"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {experience && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-200">
                  Exp: <span className="font-semibold">≤ {experience} yr{Number(experience) > 1 ? "s" : ""}</span>
                  <button
                    type="button"
                    onClick={() => setExperience("")}
                    aria-label="Remove experience filter"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {postedWithin && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-200">
                  Posted: <span className="font-semibold">{postedWithin === "d" ? "Past 24h" : postedWithin === "w" ? "Past week" : "Past month"}</span>
                  <button
                    type="button"
                    onClick={() => setPostedWithin("")}
                    aria-label="Remove posted filter"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {sort !== "date" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-200">
                  Sort: <span className="font-semibold">{sort === "salary" ? "Highest Salary" : "Relevance"}</span>
                  <button
                    type="button"
                    onClick={() => setSort("date")}
                    aria-label="Reset sort"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 hover:text-brand-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="ml-auto text-xs font-medium text-ink-600 hover:text-danger-600"
              >
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Jobs Results List & Split View */}
      {q.isLoading ? (
        <SkeletonList count={6} />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : rows.length ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.1fr] xl:grid-cols-[1fr_1.15fr]">
          {/* Left Column: Job Cards List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-ink-500 font-medium px-1">
              <span>Showing {rows.length} {rows.length === 1 ? "opportunity" : "opportunities"}</span>
              <span className="hidden lg:inline text-brand-600">Click a card for instant preview</span>
            </div>

            <div className="space-y-4">
              {rows.map((item) => {
                const job = item.job || item,
                  match = item.match;
                const jobId = job.id || job._id;
                const isSaved = (saved.data?.data || []).some((j) => (j.id || j._id) === jobId);
                const application = appliedJobsMap.get(String(jobId));
                const isSelected = String(jobId) === String(activeJobId);

                return (
                  <div
                    key={jobId}
                    onClick={() => setSelectedJobId(jobId)}
                    className={cn(
                      "relative rounded-2xl transition-all duration-200",
                      isSelected
                        ? "ring-2 ring-brand-600 shadow-md bg-brand-50/20"
                        : "hover:shadow-xs"
                    )}
                  >
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
          </div>

          {/* Right Column: Desktop Selected Job Preview (Hidden on Mobile) */}
          {activeJob && (
            <div className="hidden lg:block">
              <div className="sticky top-6 rounded-2xl border border-ink-100 bg-white p-6 shadow-sm space-y-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
                {/* Header */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="brand">{activeJob.workplaceMode || "On-site"}</Badge>
                      <Badge variant="outline">{activeJob.jobType || "Full-Time"}</Badge>
                      {activeJob.experience && <Badge variant="outline">{activeJob.experience}</Badge>}
                      {activeJob.organization?.verificationStatus === "verified" && (
                        <Badge variant="success">Verified</Badge>
                      )}
                    </div>
                    {activeMatch && (
                      <Badge variant="brand" size="sm">
                        {activeMatch.overallScore}% Match
                      </Badge>
                    )}
                  </div>

                  <h3 className="text-2xl font-extrabold text-ink-950">
                    <Link
                      to={`/app/candidate/jobs/${activeJobId}`}
                      className="hover:text-brand-600 transition-colors"
                    >
                      Overview: {activeJob.title}
                    </Link>
                  </h3>

                  <p className="text-sm text-ink-600 font-medium">
                    <span className="text-ink-900">{activeJob.company || "Company Undisclosed"}</span>
                    <span className="mx-1.5 text-ink-300">/</span>
                    <span>{activeJob.location || "Location Flexible"}</span>
                    {activeJob.createdAt && (
                      <span className="ml-2 text-ink-400">· Posted {formatRelativeTime(activeJob.createdAt)}</span>
                    )}
                  </p>
                </div>

                {/* Salary Callout */}
                {activeSalary && (
                  <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Compensation</p>
                    <p className="text-lg font-black text-ink-950">
                      {activeSalary}
                      <span className="ml-1 text-xs font-medium text-ink-500">per year</span>
                    </p>
                  </div>
                )}

                {/* Action Row */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-ink-100">
                  {activeApplication ? (
                    <Button
                      as={Link}
                      to={`/app/candidate/applications/${activeApplication._id}`}
                      size="sm"
                      variant="secondary"
                    >
                      Track Application ({activeApplication.status?.replace("_", " ")})
                    </Button>
                  ) : (
                    <Button
                      as={Link}
                      to={`/app/candidate/jobs/${activeJobId}`}
                      size="sm"
                    >
                      Apply Now <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => save.mutate(activeJobId)}
                    leftIcon={<Bookmark className={cn("h-4 w-4", isActiveSaved && "fill-brand-600 text-brand-600")} />}
                  >
                    {isActiveSaved ? "Saved" : "Save"}
                  </Button>
                  <Button
                    as={Link}
                    to={`/app/candidate/jobs/${activeJobId}`}
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                  >
                    Full details
                  </Button>
                </div>

                {/* Skills */}
                <div className="space-y-2 border-t border-ink-100 pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Required Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(activeJob.requiredSkills?.length ? activeJob.requiredSkills : activeJob.skills || []).map((s) => (
                      <Badge key={s} variant="brand" size="sm">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Description Preview */}
                <div className="space-y-2 border-t border-ink-100 pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Description Preview</p>
                  <p className="line-clamp-6 text-sm leading-6 text-ink-600 whitespace-pre-wrap">
                    {activeJob.description || "No description provided."}
                  </p>
                  <Link
                    to={`/app/candidate/jobs/${activeJobId}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 pt-1"
                  >
                    Read complete job specifications <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {/* Benefits */}
                {activeJob.benefits?.length > 0 && (
                  <div className="space-y-2 border-t border-ink-100 pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Perks & Benefits</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeJob.benefits.map((b) => (
                        <span key={b} className="inline-flex items-center gap-1 rounded-lg bg-success-50 px-2.5 py-1 text-xs font-medium text-success-800">
                          <Check className="h-3 w-3 text-success-600 shrink-0" />
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
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
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/app/candidate/jobs"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all jobs
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => saveMutation.mutate()}
          leftIcon={<Bookmark className={cn("h-4 w-4", isSaved && "fill-brand-600 text-brand-600")} />}
        >
          {isSaved ? "Saved" : "Save Job"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Left Column: Job Description & Details */}
        <article className="panel space-y-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="brand">{job.workplaceMode || "On-site"}</Badge>
              <Badge variant="outline">{job.jobType || "Full-Time"}</Badge>
              {job.experience && <Badge variant="outline">{job.experience} experience</Badge>}
              {job.organization?.verificationStatus === "verified" && (
                <Badge variant="success">Verified Employer</Badge>
              )}
            </div>
            {job.createdAt && (
              <span className="text-xs text-ink-400">
                Posted {formatRelativeTime(job.createdAt)}
              </span>
            )}
          </div>

          <div>
            <h1 className="text-3xl font-extrabold text-ink-950">{job.title}</h1>
            <p className="mt-2 text-base text-ink-600">
              {job.company || "Company Undisclosed"} · {job.location || "Location Flexible"}
            </p>
          </div>

          {salary && (
            <div className="rounded-2xl border border-ink-100 bg-ink-50/70 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Compensation Package</p>
              <p className="mt-1 text-2xl font-black text-ink-950">
                {salary}
                <span className="ml-1.5 text-xs font-medium text-ink-500">per year</span>
              </p>
            </div>
          )}

          {/* Key Job Specifications Overview */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-ink-100 bg-white p-4 text-xs">
            <div>
              <p className="font-bold text-ink-400 uppercase tracking-wider text-[10px]">Workplace</p>
              <p className="mt-0.5 font-semibold text-ink-900 capitalize">{job.workplaceMode || "On-site"}</p>
            </div>
            <div>
              <p className="font-bold text-ink-400 uppercase tracking-wider text-[10px]">Type</p>
              <p className="mt-0.5 font-semibold text-ink-900">{job.jobType || "Full-Time"}</p>
            </div>
            <div>
              <p className="font-bold text-ink-400 uppercase tracking-wider text-[10px]">Experience</p>
              <p className="mt-0.5 font-semibold text-ink-900">{job.experience || "Not specified"}</p>
            </div>
            <div>
              <p className="font-bold text-ink-400 uppercase tracking-wider text-[10px]">Location</p>
              <p className="mt-0.5 font-semibold text-ink-900 truncate">{job.location || "Anywhere"}</p>
            </div>
          </div>

          {/* Required & Preferred Skills */}
          <div className="space-y-4 border-t border-ink-100 pt-6">
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
          <div className="border-t border-ink-100 pt-6">
            <h2 className="text-lg font-bold text-ink-950">Role Description & Responsibilities</h2>
            <div className="mt-4 whitespace-pre-wrap leading-7 text-ink-700">{job.description || "No detailed description provided for this role."}</div>
          </div>

          {/* Benefits */}
          {job.benefits?.length > 0 && (
            <div className="border-t border-ink-100 pt-6">
              <h2 className="text-lg font-bold text-ink-950">Benefits & Perks</h2>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {job.benefits.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-ink-700">
                    <Check className="h-4 w-4 text-success-600 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* About Company */}
          <div className="border-t border-ink-100 pt-6">
            <h2 className="text-lg font-bold text-ink-950">About {job.company || "Employer"}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {job.company || "The employer"} is an active employer on HireSmart-AI. Applications submitted through HireSmart are directly delivered to the designated hiring team.
            </p>
          </div>
        </article>

        {/* Right Column: Actions & Fit Matching */}
        <aside className="space-y-4">
          {existingApplication ? (
            <div className="panel space-y-4 p-5 shadow-sm">
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
                    <SearchableSelect
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
                    </SearchableSelect>
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
        <section className="rounded-2xl border border-brand-200/90 bg-gradient-to-br from-brand-50/70 via-white to-brand-50/30 p-6 shadow-xs">
          <AIProvenance
            metadata={tailorPlan.improvement?.metadata}
            confidence={tailorPlan.improvement?.confidence}
            limitations={tailorPlan.improvement?.uncertainties}
          />
          <h2 className="mt-5 text-lg font-bold text-ink-950">Tailoring suggestions for this role</h2>
          <div className="mt-3 space-y-3">
            {tailorPlan.improvement?.suggestions?.map((s) => (
              <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-2xs" key={s.title}>
                <p className="font-semibold text-ink-950">{s.title}</p>
                <p className="mt-1 text-sm leading-6 text-ink-600">{s.detail}</p>
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
            <p className="text-xs text-ink-500">{job.company || "Company Undisclosed"} · {job.location || "Location Flexible"}</p>
            <p className="mt-2 text-xs text-ink-600">
              Applying with: <strong>{readyVersions.find((v) => v.id === selectedVersionId)?.originalName} (Version {readyVersions.find((v) => v.id === selectedVersionId)?.version})</strong>
            </p>
          </div>
          <p className="text-xs text-ink-500">
            By submitting, your contact information, resume evidence, and application details will be securely shared with {job.company || "the company"}'s hiring team.
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
  const [activeTab, setActiveTab] = useState("applications"),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("recently_applied"),
    [selectedOfferApp, setSelectedOfferApp] = useState(null),
    [offerActionType, setOfferActionType] = useState(null),
    [offerNote, setOfferNote] = useState(""),
    q = useQuery({
      queryKey: ["applications-candidate", status],
      queryFn: () => candidateApi.applications({ status: status || undefined, limit: 100 }),
    }),
    allAppsQuery = useQuery({
      queryKey: ["applications-candidate", "all-summary"],
      queryFn: () => candidateApi.applications({ limit: 100 }),
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
    }),
    respondOffer = useMutation({
      mutationFn: ({ appId, response, note }) =>
        candidateApi.respondOffer(appId, { response, note }),
      onSuccess: (_res, { response }) => {
        toast.success(response === "accept" ? "Employment offer accepted! Congratulations!" : "Offer declined");
        qc.invalidateQueries({ queryKey: ["applications-candidate"] });
        qc.invalidateQueries({ queryKey: ["application"] });
        setSelectedOfferApp(null);
        setOfferActionType(null);
        setOfferNote("");
      },
      onError: (error) => toast.error(error.message),
    });

  const allApps = allAppsQuery.data?.data || q.data?.data || [];

  // Summary counts based on real API data
  const summaryCounts = {
    total: allApps.length,
    inReview: allApps.filter((a) =>
      ["submitted", "under_review", "shortlisted"].includes(normalizeAppStatus(a.status))
    ).length,
    interview: allApps.filter((a) => normalizeAppStatus(a.status) === "interview").length,
    offers: allApps.filter((a) =>
      normalizeAppStatus(a.status) === "offer" ||
      (a.offer?.status && a.offer.status !== "none")
    ).length,
    closed: allApps.filter((a) =>
      ["rejected", "withdrawn", "closed"].includes(normalizeAppStatus(a.status))
    ).length,
  };

  const pendingOffersCount = allApps.filter(
    (a) =>
      a.offer?.status === "issued" ||
      (normalizeAppStatus(a.status) === "offer" && a.offer?.status !== "accepted" && a.offer?.status !== "declined")
  ).length;

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

  // Applications filtering & sorting
  const rawList = q.data?.data || [];
  const filteredApps = rawList.filter((a) => {
    if (status && normalizeAppStatus(a.status) !== normalizeAppStatus(status)) {
      return false;
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      const title = (a.job?.title || a.jobSnapshot?.title || "").toLowerCase();
      const comp = (a.job?.company || a.jobSnapshot?.company || "").toLowerCase();
      const loc = (a.job?.location || a.jobSnapshot?.location || "").toLowerCase();
      if (!title.includes(s) && !comp.includes(s) && !loc.includes(s)) {
        return false;
      }
    }
    return true;
  });

  const sortedApps = [...filteredApps].sort((a, b) => {
    if (sort === "recently_applied") {
      return new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0);
    }
    if (sort === "recently_updated") {
      const dateA = a.updatedAt || a.statusHistory?.[a.statusHistory.length - 1]?.changedAt || a.appliedAt || 0;
      const dateB = b.updatedAt || b.statusHistory?.[b.statusHistory.length - 1]?.changedAt || b.appliedAt || 0;
      return new Date(dateB) - new Date(dateA);
    }
    if (sort === "company") {
      const compA = a.job?.company || a.jobSnapshot?.company || "";
      const compB = b.job?.company || b.jobSnapshot?.company || "";
      return compA.localeCompare(compB);
    }
    if (sort === "title") {
      const titleA = a.job?.title || a.jobSnapshot?.title || "";
      const titleB = b.job?.title || b.jobSnapshot?.title || "";
      return titleA.localeCompare(titleB);
    }
    return 0;
  });

  // Offers list
  const offersList = allApps.filter(
    (a) => (a.offer?.status && a.offer.status !== "none") || normalizeAppStatus(a.status) === "offer"
  );

  return (
    <div className="page-wrap space-y-7">
      <PageHeader
        eyebrow="Candidate Workspace"
        title="Track your applications"
        description="Follow your progress at every hiring stage — each application is tied to the exact resume version and job requirements you submitted."
      />

      {/* Summary KPI Cards Grid */}
      <section aria-label="Applications Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="panel p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">Total Applied</span>
            <BriefcaseBusiness className="h-4 w-4 text-ink-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-ink-950">{summaryCounts.total}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">Submitted roles</p>
        </div>

        <div className="panel p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">In Review</span>
            <Clock className="h-4 w-4 text-brand-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-ink-950">{summaryCounts.inReview}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">Active screening</p>
        </div>

        <div className="panel p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">Interviews</span>
            <Video className="h-4 w-4 text-brand-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-ink-950">{summaryCounts.interview}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">Scheduled rounds</p>
        </div>

        <div className={cn("panel p-4 shadow-2xs transition-colors", summaryCounts.offers > 0 && "border-warning-300 bg-warning-50/30")}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">Offers</span>
            <Award className={cn("h-4 w-4", summaryCounts.offers > 0 ? "text-warning-600" : "text-ink-400")} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-black text-ink-950">{summaryCounts.offers}</p>
            {pendingOffersCount > 0 && (
              <span className="rounded-full bg-warning-100 px-2 py-0.5 text-[10px] font-bold text-warning-800 animate-pulse">
                Action Required
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-ink-500">{pendingOffersCount > 0 ? `${pendingOffersCount} awaiting response` : "Received offers"}</p>
        </div>

        <div className="panel p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">Closed</span>
            <AlertCircle className="h-4 w-4 text-ink-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-ink-950">{summaryCounts.closed}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">Not selected / Withdrawn</p>
        </div>
      </section>

      {/* Primary Category View Tabs */}
      <div className="flex items-center gap-2 border-b border-ink-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("applications")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all",
            activeTab === "applications"
              ? "bg-brand-600 text-white shadow-xs"
              : "bg-white text-ink-600 hover:bg-ink-50"
          )}
        >
          <BriefcaseBusiness className="h-4 w-4" />
          <span>Applications</span>
          <span className={cn(
            "ml-1 rounded-full px-2 py-0.5 text-xs font-bold",
            activeTab === "applications" ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-700"
          )}>
            {summaryCounts.total}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("offers")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all",
            activeTab === "offers"
              ? "bg-brand-600 text-white shadow-xs"
              : "bg-white text-ink-600 hover:bg-ink-50"
          )}
        >
          <Award className="h-4 w-4" />
          <span>Offers &amp; Decisions</span>
          <span className={cn(
            "ml-1 rounded-full px-2 py-0.5 text-xs font-bold",
            activeTab === "offers" ? "bg-brand-700 text-white" : pendingOffersCount > 0 ? "bg-warning-500 text-white" : "bg-ink-100 text-ink-700"
          )}>
            {summaryCounts.offers}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("saved")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all",
            activeTab === "saved"
              ? "bg-brand-600 text-white shadow-xs"
              : "bg-white text-ink-600 hover:bg-ink-50"
          )}
        >
          <Bookmark className="h-4 w-4" />
          <span>Saved jobs</span>
          <span className={cn(
            "ml-1 rounded-full px-2 py-0.5 text-xs font-bold",
            activeTab === "saved" ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-700"
          )}>
            {saved.data?.data?.length || 0}
          </span>
        </button>
      </div>

      {/* TAB CONTENT: APPLICATIONS */}
      {activeTab === "applications" && (
        <div className="space-y-6">
          {/* Search, Sort and Filter Bar */}
          <div className="panel space-y-4 p-4 shadow-2xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  placeholder="Search by job title, company, or location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-hidden"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-500 shrink-0">Sort:</span>
                <SearchableSelect
                  aria-label="Sort applications"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  searchable={false}
                  className="w-44 text-xs font-medium"
                >
                  <option value="recently_applied">Recently Applied</option>
                  <option value="recently_updated">Recently Updated</option>
                  <option value="company">Company (A-Z)</option>
                  <option value="title">Role Title (A-Z)</option>
                </SearchableSelect>

                {(search || status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatus("");
                    }}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {/* Stage Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-3">
              {statuses.map((s) => {
                const isSelected = status === s.key;
                return (
                  <button
                    key={s.key || "all"}
                    type="button"
                    onClick={() => setStatus(s.key)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-xs font-bold transition-all",
                      isSelected
                        ? "bg-ink-950 text-white shadow-2xs"
                        : "bg-ink-50 text-ink-600 hover:bg-ink-100"
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Applications List */}
          {q.isLoading ? (
            <SkeletonList count={4} />
          ) : q.error ? (
            <ErrorState error={q.error} />
          ) : sortedApps.length ? (
            <div className="space-y-4">
              {sortedApps.map((a) => {
                const currentStageIndex = getStageIndex(a.status);
                const isRejected = normalizeAppStatus(a.status) === "rejected";
                const isWithdrawn = normalizeAppStatus(a.status) === "withdrawn";
                const isOfferIssued = a.offer?.status === "issued";
                const isOfferAccepted = a.offer?.status === "accepted";
                const isOfferDeclined = a.offer?.status === "declined";
                const salary = formatJobSalary(a.jobSnapshot || a.job);

                return (
                  <article
                    key={a._id}
                    className="panel group block p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-bold text-ink-950">
                            <Link
                              to={`/app/candidate/applications/${a._id}`}
                              className="hover:text-brand-600 transition-colors"
                            >
                              {a.job?.title || a.jobSnapshot?.title || "Position"}
                            </Link>
                          </h2>
                          <Badge variant="brand">{a.jobSnapshot?.workplaceMode || a.job?.workplaceMode || "On-site"}</Badge>
                          <Badge variant="outline">{a.jobSnapshot?.jobType || a.job?.jobType || "Full-Time"}</Badge>
                        </div>

                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-600 font-medium">
                          <span className="inline-flex items-center gap-1 text-ink-900 font-semibold">
                            <Building2 className="h-3.5 w-3.5 text-ink-400" />
                            {a.job?.company || a.jobSnapshot?.company || "Company Undisclosed"}
                          </span>
                          <span className="text-ink-300">·</span>
                          <span className="inline-flex items-center gap-1 text-ink-500">
                            <MapPin className="h-3.5 w-3.5 text-ink-400" />
                            {a.job?.location || a.jobSnapshot?.location || "Location Flexible"}
                          </span>
                          {salary && (
                            <>
                              <span className="text-ink-300">·</span>
                              <span className="font-semibold text-ink-900">{salary}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <StatusPill status={a.status} />
                        <Link
                          to={`/app/candidate/applications/${a._id}`}
                          className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-brand-600 transition-colors"
                          aria-label="View application details"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>

                    {/* Special Offer Alert Callout */}
                    {isOfferIssued && (
                      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-warning-300 bg-warning-50/70 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2.5">
                          <Award className="h-5 w-5 text-warning-700 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-warning-900">Employment Offer Extended</p>
                            <p className="text-xs text-warning-800">
                              {a.offer.designation || a.jobSnapshot?.title || "Role"}
                              {a.offer.ctc ? ` · CTC: ₹${Number(a.offer.ctc).toLocaleString("en-IN")}/yr` : ""}
                              {a.offer.joiningDate ? ` · Proposed start: ${formatDate(a.offer.joiningDate)}` : ""}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          as={Link}
                          to={`/app/candidate/applications/${a._id}`}
                          className="shrink-0 text-xs"
                        >
                          Review Offer Details
                        </Button>
                      </div>
                    )}

                    {isOfferAccepted && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-success-50 px-3 py-1.5 text-xs font-medium text-success-800">
                        <CheckCircle2 className="h-4 w-4 text-success-600 shrink-0" />
                        <span>You accepted this offer on {formatDate(a.offer.respondedAt)}.</span>
                      </div>
                    )}

                    {isOfferDeclined && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-700">
                        <X className="h-4 w-4 text-ink-500 shrink-0" />
                        <span>You declined this offer on {formatDate(a.offer.respondedAt)}.</span>
                      </div>
                    )}

                    {/* Progress Stepper Bar */}
                    <div className="mt-4 border-t border-ink-100 pt-3.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-ink-500">
                        <span>
                          {isRejected
                            ? "Status: Not selected"
                            : isWithdrawn
                              ? "Status: Withdrawn"
                              : `Stage: ${HIRING_STAGES[currentStageIndex]?.label || "Submitted"}`}
                        </span>
                        <span>Applied {formatDate(a.appliedAt)}</span>
                      </div>

                      {!isRejected && !isWithdrawn && (
                        <div className="mt-2.5 flex items-center gap-1.5">
                          {HIRING_STAGES.slice(0, 6).map((stage, idx) => {
                            const isDone = currentStageIndex > idx;
                            const isCurrent = currentStageIndex === idx;
                            return (
                              <div key={stage.id} className="flex flex-1 items-center gap-1.5">
                                <div
                                  title={`${stage.label}: ${isDone ? "Completed" : isCurrent ? "Current stage" : "Upcoming"}`}
                                  className={cn(
                                    "h-2 w-full rounded-full transition-all",
                                    isDone
                                      ? "bg-success-500"
                                      : isCurrent
                                        ? "bg-brand-500 ring-2 ring-brand-200"
                                        : "bg-ink-100"
                                  )}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="mt-3 flex items-center justify-between pt-2 text-xs text-ink-400">
                      <span className="font-mono">ID: {a._id}</span>
                      <Link
                        to={`/app/candidate/applications/${a._id}`}
                        className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700"
                      >
                        View hiring progress journey <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={BriefcaseBusiness}
              title={status || search ? "No applications found" : "No applications yet"}
              description={
                status || search
                  ? "Try broadening your search term or selecting another stage filter."
                  : "When you apply for a job, you will be able to track every stage of the process right here."
              }
              action={
                status || search ? (
                  <Button
                    onClick={() => {
                      setStatus("");
                      setSearch("");
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Reset filters
                  </Button>
                ) : (
                  <Button as={Link} to="/app/candidate/jobs" size="sm">
                    Browse jobs
                  </Button>
                )
              }
            />
          )}
        </div>
      )}

      {/* TAB CONTENT: OFFERS & DECISIONS */}
      {activeTab === "offers" && (
        <div className="space-y-6">
          <div className="panel p-5 shadow-2xs">
            <h2 className="text-lg font-bold text-ink-950">Employment Offers &amp; Decisions</h2>
            <p className="mt-1 text-sm text-ink-600">
              Review compensation packages, designations, and proposed start dates for formal employment offers extended to you.
            </p>
          </div>

          {offersList.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {offersList.map((a) => {
                const offer = a.offer || {};
                const isIssued = offer.status === "issued";
                const isAccepted = offer.status === "accepted";
                const isDeclined = offer.status === "declined";
                const isExpired = offer.status === "expired" || (offer.expiresAt && new Date(offer.expiresAt) < new Date());

                return (
                  <article
                    key={a._id}
                    className={cn(
                      "panel flex flex-col justify-between p-6 transition-all shadow-sm",
                      isIssued && !isExpired && "border-2 border-warning-400 bg-warning-50/20",
                      isExpired && "border-ink-200 bg-ink-50/40"
                    )}
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-ink-400">
                            {a.job?.company || a.jobSnapshot?.company || "Company"}
                          </span>
                          <h3 className="mt-0.5 text-xl font-extrabold text-ink-950">
                            {offer.designation || a.job?.title || a.jobSnapshot?.title || "Role"}
                          </h3>
                        </div>
                        <Badge
                          variant={isAccepted ? "success" : isDeclined ? "outline" : isExpired ? "neutral" : "brand"}
                          size="sm"
                        >
                          {isAccepted ? "Accepted" : isDeclined ? "Declined" : isExpired ? "Expired" : "Offer Pending"}
                        </Badge>
                      </div>

                      {/* Offer Specifications */}
                      <div className="grid grid-cols-2 gap-3 rounded-xl border border-ink-100 bg-white p-3.5 text-xs shadow-2xs">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Designation</p>
                          <p className="mt-0.5 font-semibold text-ink-900 truncate">
                            {offer.designation || a.jobSnapshot?.title || "Role"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Compensation (CTC)</p>
                          <p className="mt-0.5 font-bold text-ink-950">
                            {offer.ctc ? `₹${Number(offer.ctc).toLocaleString("en-IN")}/yr` : "As negotiated"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Joining Date</p>
                          <p className="mt-0.5 font-semibold text-ink-900">
                            {offer.joiningDate ? formatDate(offer.joiningDate) : "Flexible"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Extended On</p>
                          <p className="mt-0.5 font-semibold text-ink-900">
                            {formatDate(offer.issuedAt || a.appliedAt)}
                          </p>
                        </div>
                      </div>

                      {isIssued && !isExpired && (
                        <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-900">
                          <p className="font-semibold">Action Required: Awaiting Your Decision</p>
                          <p className="mt-0.5 text-warning-800">
                            Please confirm whether you accept or decline this offer. Accepting will notify the hiring team to prepare your onboarding package.
                          </p>
                        </div>
                      )}

                      {isExpired && !isAccepted && !isDeclined && (
                        <div className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-xs text-danger-900">
                          <p className="font-semibold">Offer Expired</p>
                          <p className="mt-0.5 text-danger-800">
                            This offer expired on {formatDate(offer.expiresAt || offer.updatedAt)}. Acceptance is no longer available.
                          </p>
                        </div>
                      )}

                      {isAccepted && (
                        <div className="rounded-xl border border-success-200 bg-success-50 p-3 text-xs text-success-900">
                          <p className="font-semibold">✓ Offer Accepted on {formatDate(offer.respondedAt)}</p>
                          <p className="mt-0.5 text-success-800">
                            Your acceptance is on record.
                          </p>
                        </div>
                      )}

                      {isDeclined && (
                        <div className="rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs text-ink-700">
                          <p className="font-semibold">Offer Declined on {formatDate(offer.respondedAt)}</p>
                          {offer.responseNote && <p className="mt-0.5 text-ink-600">Note: “{offer.responseNote}”</p>}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
                      {isIssued && !isExpired && (
                        <>
                          <Button
                            size="sm"
                            variant="success"
                            leftIcon={<Check className="h-4 w-4" />}
                            onClick={() => {
                              setSelectedOfferApp(a);
                              setOfferActionType("accept");
                            }}
                          >
                            Accept Offer
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedOfferApp(a);
                              setOfferActionType("decline");
                            }}
                          >
                            Decline Offer
                          </Button>
                        </>
                      )}
                      {isIssued && isExpired && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled
                          title="Offer has expired and cannot be accepted"
                        >
                          Offer Expired
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        as={Link}
                        to={`/app/candidate/applications/${a._id}`}
                        className="ml-auto text-xs"
                      >
                        Application Journey →
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Award}
              title="No employment offers yet"
              description="When hiring teams complete interviews and issue a formal offer, it will appear here with full salary breakdown, designation, and accept/decline actions."
              action={
                <Button onClick={() => setActiveTab("applications")} size="sm">
                  View active applications
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* TAB CONTENT: SAVED JOBS */}
      {activeTab === "saved" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-ink-950">Saved jobs</h2>
              <p className="mt-1 text-sm text-ink-500">Roles you bookmarked for later review</p>
            </div>
            <Link to="/app/candidate/jobs" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              Browse more roles →
            </Link>
          </div>

          {saved.data?.data?.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {saved.data.data.map((j) => (
                <JobTile key={j.id || j._id} job={j} saved onSave={(id) => unsave.mutate(id)} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Bookmark}
              title="No saved jobs"
              description="Save interesting opportunities while browsing to keep track of them here."
              action={
                <Button as={Link} to="/app/candidate/jobs" size="sm">
                  Browse open opportunities
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* Offer Response Confirmation Modal */}
      <Modal
        isOpen={Boolean(selectedOfferApp && offerActionType)}
        onClose={() => {
          setSelectedOfferApp(null);
          setOfferActionType(null);
        }}
        title={offerActionType === "accept" ? "Accept Employment Offer" : "Decline Employment Offer"}
        description={
          offerActionType === "accept"
            ? "Confirm that you accept this employment offer. This will record your acceptance with the employer."
            : "Are you sure you want to decline this employment offer? This action notifies the hiring team."
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedOfferApp(null);
                setOfferActionType(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant={offerActionType === "accept" ? "success" : "danger"}
              isLoading={respondOffer.isPending}
              onClick={() => {
                if (selectedOfferApp && offerActionType) {
                  respondOffer.mutate({
                    appId: selectedOfferApp._id,
                    response: offerActionType,
                    note: offerNote.trim() || undefined,
                  });
                }
              }}
            >
              {offerActionType === "accept" ? "Confirm Acceptance" : "Confirm Decline"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-ink-700">
          {selectedOfferApp && (
            <div className="rounded-xl border border-ink-100 bg-ink-50 p-4 space-y-1">
              <p className="font-bold text-ink-950">
                {selectedOfferApp.offer?.designation || selectedOfferApp.jobSnapshot?.title || "Role"}
              </p>
              <p className="text-xs text-ink-600">
                {selectedOfferApp.job?.company || selectedOfferApp.jobSnapshot?.company} · {selectedOfferApp.job?.location || selectedOfferApp.jobSnapshot?.location}
              </p>
              {selectedOfferApp.offer?.ctc && (
                <p className="pt-1 text-xs font-semibold text-ink-900">
                  Compensation: ₹{Number(selectedOfferApp.offer.ctc).toLocaleString("en-IN")} per year
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-ink-700" htmlFor="offer-response-note">
              {offerActionType === "accept"
                ? "Message to the hiring team (optional)"
                : "Reason for declining (optional)"}
            </label>
            <Textarea
              id="offer-response-note"
              className="mt-1.5"
              placeholder={offerActionType === "accept" ? "e.g. Excited to join the team!" : "e.g. Accepted another position..."}
              value={offerNote}
              onChange={(e) => setOfferNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* Application Detail / Hiring Progress Journey */
export const ApplicationDetail = () => {
  const { applicationId } = useParams(),
    qc = useQueryClient(),
    toast = useToast(),
    [reason, setReason] = useState(""),
    [withdrawOpen, setWithdrawOpen] = useState(false),
    [acceptModalOpen, setAcceptModalOpen] = useState(false),
    [declineModalOpen, setDeclineModalOpen] = useState(false),
    [offerNote, setOfferNote] = useState("");

  const q = useQuery({
      queryKey: ["application", "candidate", applicationId],
      queryFn: () => candidateApi.application(applicationId),
    }),
    interviews = useQuery({
      queryKey: ["candidate-interviews"],
      queryFn: candidateApi.interviews,
    }),
    respondOffer = useMutation({
      mutationFn: (body) => candidateApi.respondOffer(applicationId, body),
      onSuccess: (_res, body) => {
        toast.success(body.response === "accept" ? "Employment offer accepted! Congratulations!" : "Offer declined");
        qc.invalidateQueries({ queryKey: ["application", "candidate", applicationId] });
        qc.invalidateQueries({ queryKey: ["applications-candidate"] });
        setAcceptModalOpen(false);
        setDeclineModalOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
    withdraw = useMutation({
      mutationFn: () => candidateApi.withdraw(applicationId, reason),
      onSuccess: () => {
        toast.success("Application withdrawn successfully");
        qc.invalidateQueries({ queryKey: ["application", "candidate", applicationId] });
        qc.invalidateQueries({ queryKey: ["applications-candidate"] });
        setWithdrawOpen(false);
      },
      onError: (error) => toast.error(error.message),
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
  const offer = a.offer || { status: "none" };
  const isOfferIssued = offer.status === "issued";
  const isOfferAccepted = offer.status === "accepted";
  const isOfferDeclined = offer.status === "declined";
  const isOfferExpired = offer.status === "expired" || (offer.expiresAt && new Date(offer.expiresAt) < new Date());

  const appInterviews = (interviews.data?.data || []).filter(
    (i) => String(i.application?._id || i.application?.id || i.application) === String(applicationId)
  );

  return (
    <div className="page-wrap max-w-4xl space-y-6">
      <Link
        to="/app/candidate/applications"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to all applications</span>
      </Link>

      <PageHeader
        eyebrow="Application Tracking"
        title={a.job?.title || a.jobSnapshot?.title || "Application Progress"}
        description={`${a.job?.company || a.jobSnapshot?.company || "Company Undisclosed"} · Submitted on ${formatDate(a.appliedAt)}`}
        action={<StatusPill status={a.status} />}
      />

      {/* EXECUTIVE OFFER SECTION */}
      {(isOfferIssued || isOfferExpired) && !isOfferAccepted && !isOfferDeclined && (
        <section aria-label="Formal Offer Received" className="rounded-2xl border-2 border-warning-400 bg-gradient-to-br from-warning-50/80 via-white to-warning-50/40 p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-warning-500 text-white shadow-xs">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-ink-950">Formal Employment Offer Received</h2>
                <p className="text-xs text-ink-600 font-medium">
                  {a.job?.company || a.jobSnapshot?.company || "Employer"} has issued an employment offer. Review the terms below.
                </p>
              </div>
            </div>
            <Badge variant={isOfferExpired ? "neutral" : "brand"}>
              {isOfferExpired ? "Offer Expired" : "Decision Required"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-warning-200 bg-white p-4 text-xs shadow-2xs">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Designation</p>
              <p className="mt-0.5 font-bold text-ink-950 truncate">
                {offer.designation || a.jobSnapshot?.title || "Role"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Annual CTC</p>
              <p className="mt-0.5 font-bold text-success-700">
                {offer.ctc ? `₹${Number(offer.ctc).toLocaleString("en-IN")}/yr` : "As discussed"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Proposed Joining Date</p>
              <p className="mt-0.5 font-semibold text-ink-900">
                {offer.joiningDate ? formatDate(offer.joiningDate) : "Flexible"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Issued On</p>
              <p className="mt-0.5 font-semibold text-ink-900">
                {formatDate(offer.issuedAt || a.appliedAt)}
              </p>
            </div>
          </div>

          {isOfferExpired ? (
            <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-xs text-danger-900">
              <p className="font-bold">This offer has expired</p>
              <p className="mt-1 text-danger-800">
                The response window for this employment offer closed on {formatDate(offer.expiresAt || offer.updatedAt)}. Acceptance is unavailable. Contact the recruiting team if you require an extension or re-issue.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-ink-700" htmlFor="offer-detail-message">
                Message to the company (optional)
              </label>
              <Textarea
                id="offer-detail-message"
                className="mt-1"
                placeholder="Add an optional note to accompany your decision..."
                value={offerNote}
                onChange={(e) => setOfferNote(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              variant="success"
              leftIcon={<Check className="h-4 w-4" />}
              onClick={() => setAcceptModalOpen(true)}
              isLoading={respondOffer.isPending}
              disabled={isOfferExpired || respondOffer.isPending}
            >
              Accept Offer
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeclineModalOpen(true)}
              isLoading={respondOffer.isPending}
              disabled={isOfferExpired || respondOffer.isPending}
            >
              Decline Offer
            </Button>
          </div>
        </section>
      )}

      {isOfferAccepted && (
        <section aria-label="Offer Accepted" className="panel border-success-200 bg-success-50/50 p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-success-600 shrink-0" />
            <div>
              <h2 className="font-bold text-success-950">You accepted this employment offer</h2>
              <p className="text-xs text-success-800">
                Accepted on {formatDate(offer.respondedAt)}. The hiring team has been notified to record the formal placement.
              </p>
            </div>
          </div>
        </section>
      )}

      {isOfferDeclined && (
        <section aria-label="Offer Declined" className="panel border-ink-200 bg-ink-50 p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-ink-500 shrink-0" />
            <div>
              <h2 className="font-bold text-ink-950">You declined this employment offer</h2>
              <p className="text-xs text-ink-600">
                Declined on {formatDate(offer.respondedAt)}. {offer.responseNote && `Note: “${offer.responseNote}”`}
              </p>
            </div>
          </div>
        </section>
      )}

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
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={interview.status} />
                  {!["cancelled", "completed", "no_show"].includes(interview.status) && (
                    <CandidateJoinButton interview={interview} />
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
            <p><strong>Role:</strong> {a.jobSnapshot?.title || a.job?.title || "Position"}</p>
            <p><strong>Company:</strong> {a.jobSnapshot?.company || a.job?.company || "Company Undisclosed"}</p>
            <p><strong>Location:</strong> {a.jobSnapshot?.location || a.job?.location || "Location Flexible"}</p>
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

      {/* Candidate Offer Panel (Embedded for offer compatibility) */}
      {!isOfferIssued && (
        <CandidateOfferPanel
          application={a}
          pending={respondOffer.isPending}
          onRespond={(body) => respondOffer.mutate(body)}
        />
      )}

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

      {/* Withdraw Confirmation Modal */}
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

      {/* Accept Offer Modal */}
      <Modal
        isOpen={acceptModalOpen}
        onClose={() => setAcceptModalOpen(false)}
        title="Confirm Acceptance of Offer"
        description={`Confirm that you accept the offer from ${a.job?.company || a.jobSnapshot?.company || "Employer"}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAcceptModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="success"
              isLoading={respondOffer.isPending}
              onClick={() => respondOffer.mutate({ response: "accept", note: offerNote.trim() || undefined })}
            >
              Confirm Acceptance
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-700">
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-4 space-y-1">
            <p className="font-bold text-ink-950">
              {offer.designation || a.jobSnapshot?.title || "Role"}
            </p>
            <p className="text-xs text-ink-600">
              {a.job?.company || a.jobSnapshot?.company} · {a.job?.location || a.jobSnapshot?.location}
            </p>
            {offer.ctc && (
              <p className="pt-1 text-xs font-semibold text-ink-900">
                Annual CTC: ₹{Number(offer.ctc).toLocaleString("en-IN")} per year
              </p>
            )}
            {offer.joiningDate && (
              <p className="text-xs text-ink-600">
                Proposed Start Date: {formatDate(offer.joiningDate)}
              </p>
            )}
          </div>
          <p className="text-xs text-ink-500">
            By accepting, you confirm your intent to join the company under the stated terms. The hiring team will be notified immediately.
          </p>
        </div>
      </Modal>

      {/* Decline Offer Modal */}
      <Modal
        isOpen={declineModalOpen}
        onClose={() => setDeclineModalOpen(false)}
        title="Confirm Offer Decline"
        description={`Are you sure you want to decline the offer from ${a.job?.company || a.jobSnapshot?.company || "Employer"}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeclineModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={respondOffer.isPending}
              onClick={() => respondOffer.mutate({ response: "decline", note: offerNote.trim() || undefined })}
            >
              Confirm Decline
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-700">
          <p className="text-xs text-ink-600">
            Declining this offer will notify the employer that you are not moving forward. This action cannot be reversed.
          </p>
        </div>
      </Modal>
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

      {/* Segmented Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 pb-3">
        <Link
          to="/app/candidate/jobs"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink-600 transition-all hover:bg-ink-50 hover:text-ink-900"
        >
          <BriefcaseBusiness className="h-4 w-4" />
          <span>All Jobs</span>
        </Link>
        <Link
          to="/app/candidate/recommendations"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink-600 transition-all hover:bg-ink-50 hover:text-ink-900"
        >
          <Sparkles className="h-4 w-4" />
          <span>Recommended For You</span>
        </Link>
        <Link
          to="/app/candidate/saved"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-2xs transition-all"
        >
          <Bookmark className="h-4 w-4" />
          <span>Saved Jobs</span>
          {(saved.data?.data?.length || 0) > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
              {saved.data.data.length}
            </span>
          )}
        </Link>
      </div>

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
    [typeFilter, setTypeFilter] = useState("all"),
    [rescheduleTarget, setRescheduleTarget] = useState(null),
    [rescheduleReason, setRescheduleReason] = useState(""),
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

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, reason }) => interviewApi.reschedule(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-interviews"] });
      toast.success("Reschedule request sent to recruiter");
      setRescheduleTarget(null);
      setRescheduleReason("");
    },
    onError: (err) => toast.error(err.message),
  });

  const allInterviews = q.data?.data || [];
  const now = new Date();
  const { start: startOfToday, end: endOfToday } = istDayBounds(now);
  const endOfThisWeek = new Date(now.getTime() + 7 * 86400000);

  // Buckets never overlap. An active interview stays "upcoming" until its scheduled end has passed, so a live
  // interview remains visible while it runs. Completed interviews, and active ones whose end has passed, are "past".
  const ACTIVE_INTERVIEW_STATUSES = ["invited", "confirmed", "reschedule_requested", "rescheduled", "in_progress"];
  const hasEnded = (i) => {
    const end = new Date(i.scheduledEnd || i.scheduledStart || 0);
    return !Number.isNaN(end.getTime()) && end.getTime() > 0 && end < now;
  };
  const isUpcomingBucket = (i) => ACTIVE_INTERVIEW_STATUSES.includes(i.status) && !hasEnded(i);
  const isPastBucket = (i) => i.status === "completed" || i.status === "no_show" || (i.status !== "cancelled" && hasEnded(i));

  const filterByTab = (i) => {
    if (tab === "upcoming") return isUpcomingBucket(i);
    if (tab === "past") return isPastBucket(i);
    if (tab === "cancelled") return i.status === "cancelled";
    if (tab === "today") {
      const sDate = i.scheduledStart ? new Date(i.scheduledStart) : null;
      return sDate && sDate >= startOfToday && sDate < endOfToday && i.status !== "cancelled";
    }
    if (tab === "this_week") {
      const sDate = i.scheduledStart ? new Date(i.scheduledStart) : null;
      return sDate && sDate >= now && sDate <= endOfThisWeek && i.status !== "cancelled";
    }
    return true; // "all"
  };

  const filteredInterviews = allInterviews.filter((i) => {
    if (!filterByTab(i)) return false;
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase();
    const title = (i.title || "").toLowerCase();
    const job = (i.application?.job?.title || "").toLowerCase();
    const company = (i.application?.job?.company || "").toLowerCase();
    return title.includes(term) || job.includes(term) || company.includes(term);
  });

  const tabCounts = {
    upcoming: allInterviews.filter(isUpcomingBucket).length,
    past: allInterviews.filter(isPastBucket).length,
    all: allInterviews.length,
    today: allInterviews.filter((i) => {
      const d = i.scheduledStart ? new Date(i.scheduledStart) : null;
      return d && d >= startOfToday && d < endOfToday && i.status !== "cancelled";
    }).length,
    this_week: allInterviews.filter((i) => {
      const d = i.scheduledStart ? new Date(i.scheduledStart) : null;
      return d && d >= now && d <= endOfThisWeek && i.status !== "cancelled";
    }).length,
    cancelled: allInterviews.filter((i) => i.status === "cancelled").length,
  };

  const kpis = {
    total: allInterviews.length,
    upcoming: tabCounts.upcoming,
    completed: allInterviews.filter((i) => i.status === "completed").length,
    noShow: allInterviews.filter((i) => i.status === "no_show").length,
    pendingConfirmation: allInterviews.filter((i) => i.status === "invited").length,
    rescheduleRequested: allInterviews.filter((i) => i.status === "reschedule_requested").length,
  };

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Interviews"
        title="Your interview schedule"
        description="Track upcoming interview rounds, join authorized video meetings, manage attendance, and generate tailored AI preparation plans."
      />

      {/* A. Interview Dashboard Overview KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Total Interviews"
          value={kpis.total}
          icon={Video}
          detail="All rounds tracked"
        />
        <Kpi
          label="Upcoming"
          value={kpis.upcoming}
          tone="brand"
          icon={Calendar}
          detail="Scheduled & active"
        />
        <Kpi
          label="Completed"
          value={kpis.completed}
          tone="success"
          icon={CheckCircle2}
          detail={kpis.noShow > 0 ? `${kpis.noShow} no-show recorded` : "Finished interviews"}
        />
        <Kpi
          label="Pending Confirmation"
          value={kpis.pendingConfirmation}
          tone={kpis.pendingConfirmation > 0 ? "warning" : "ink"}
          icon={Clock}
          detail="Attendance action required"
        />
        <Kpi
          label="Reschedule Requests"
          value={kpis.rescheduleRequested}
          tone={kpis.rescheduleRequested > 0 ? "warning" : "ink"}
          icon={RefreshCw}
          detail="Awaiting new recruiter time"
        />
      </div>

      {/* B & C. Tabs, Search, and Type Filter */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-ink-100 bg-ink-50/50 p-1">
          {[
            { id: "upcoming", label: `Upcoming (${tabCounts.upcoming})` },
            { id: "past", label: `Past & Completed (${tabCounts.past})` },
            { id: "all", label: `All Interviews (${tabCounts.all})` },
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <SearchableSelect
              aria-label="Filter by interview type"
              options={[
                { value: "all", label: "All types" },
                { value: "video", label: "Video call" },
                { value: "phone", label: "Phone screen" },
                { value: "technical", label: "Technical round" },
                { value: "panel", label: "Panel" },
                { value: "onsite", label: "On-site" },
                { value: "hr", label: "HR round" },
              ]}
              value={typeFilter}
              onChange={setTypeFilter}
              searchable={false}
            />
          </div>
          <div className="w-full sm:w-60">
            <Input
              aria-label="Filter interviews"
              placeholder="Search by job or company"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* C. Interview Cards */}
      {q.isLoading ? (
        <SkeletonList count={3} />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : filteredInterviews.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredInterviews.map((i) => {
            const startDate = i.scheduledStart ? new Date(i.scheduledStart) : null;
            const duration = formatDuration(i.scheduledStart, i.scheduledEnd);
            const isLive = i.status === "in_progress";
            const isInvited = i.status === "invited";
            const isConfirmed = i.status === "confirmed";
            const isRescheduleRequested = i.status === "reschedule_requested";
            const isClosed = ["cancelled", "completed", "no_show"].includes(i.status);

            return (
              <div
                key={i._id}
                className="panel flex flex-col justify-between p-5 transition-all hover:border-brand-200 hover:shadow-2xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {startDate ? (
                        <div className="flex min-w-[56px] flex-col items-center justify-center rounded-xl border border-brand-200 bg-brand-50/70 px-2.5 py-1.5 text-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
                            {formatDate(startDate).split(" ")[1]}
                          </span>
                          <span className="text-lg font-black leading-tight text-ink-950">
                            {formatDate(startDate).split(" ")[0]}
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
                          {isLive && (
                            <Badge variant="success" className="animate-pulse text-[11px]">
                              Live Now
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

                  {/* Status Banner Notes */}
                  {isInvited && (
                    <div className="mt-3 flex items-center justify-between rounded-lg border border-warning-200 bg-warning-50/70 px-3 py-2 text-xs text-warning-900">
                      <span>Please confirm your attendance below.</span>
                    </div>
                  )}

                  {isRescheduleRequested && (
                    <div className="mt-3 rounded-lg border border-warning-200 bg-warning-50/70 px-3 py-2 text-xs text-warning-900">
                      <span>Reschedule requested: Waiting for recruiter to propose a new time.</span>
                    </div>
                  )}

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
                    ) : i.meetingProvider === "google_meet" ? (
                      <p className="flex items-center gap-2 text-brand-700">
                        <Video className="h-3.5 w-3.5 text-brand-600" />
                        <span>Google Meet (Authorized Video Conference)</span>
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 text-ink-500">
                        <Video className="h-3.5 w-3.5 text-ink-400" />
                        <span>Online video conference</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
                  {!isClosed && <CandidateJoinButton interview={i} />}

                  {isInvited && (
                    <Button
                      size="sm"
                      variant="primary"
                      isLoading={confirmMutation.isPending && confirmMutation.variables === i._id}
                      onClick={() => confirmMutation.mutate(i._id)}
                    >
                      Confirm Attendance
                    </Button>
                  )}

                  {(isInvited || isConfirmed) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRescheduleTarget(i);
                        setRescheduleReason("");
                      }}
                    >
                      Request Reschedule
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

      {/* Reschedule Request Modal */}
      <Modal
        isOpen={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="Request interview reschedule"
        description="Let the hiring team know why you need to reschedule and what times work best for you."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                rescheduleMutation.mutate({
                  id: rescheduleTarget?._id,
                  reason: rescheduleReason,
                })
              }
              isLoading={rescheduleMutation.isPending}
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
  const hasValidLink = Boolean(interview?.joinState?.canJoin);

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
              {interview.application && (
                <p className="mt-1.5">
                  <Link
                    to={`/app/candidate/applications/${interview.application._id || interview.application.id || interview.application}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    View Application Journey →
                  </Link>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <CandidateJoinButton interview={interview} />
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
const CANDIDATE_WELCOME_CARDS = [
  {
    title: "Improve my resume",
    desc: "Tailor bullet points, quantify achievements, and fix ATS readability issues.",
    prompt: "How should I tailor my resume for senior roles and make my achievements quantifiable?",
    icon: FileText,
  },
  {
    title: "Analyze my skills",
    desc: "Detect skill gaps between your profile and target high-paying engineering roles.",
    prompt: "Analyze skill gaps between my profile and high-paying backend roles.",
    icon: Sparkles,
  },
  {
    title: "Prepare for an interview",
    desc: "Practice role-specific behavioral and technical interview questions.",
    prompt: "Generate 5 behavioral and technical interview questions tailored to my experience.",
    icon: Calendar,
  },
  {
    title: "Find suitable jobs",
    desc: "Discover published job openings that best match your verified qualifications.",
    prompt: "Summarize my strongest job matches based on verified ATS skills.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Explain application status",
    desc: "Get personalized guidance on next steps and follow-up etiquette for active applications.",
    prompt: "What are the recommended next steps and follow-up etiquette for my submitted applications?",
    icon: Clock,
  },
];

export const CareerCopilot = () => {
  const [params] = useSearchParams(),
    initialPrompt = params.get("prompt") || params.get("q") || "",
    [question, setQuestion] = useState(initialPrompt),
    [activeCategory, setActiveCategory] = useState("career_guidance"),
    [history, setHistory] = useState(() => {
      try {
        const stored = sessionStorage.getItem("hiresmart_candidate_copilot_chat");
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }),
    [lastAttemptedPrompt, setLastAttemptedPrompt] = useState(""),
    messagesEndRef = useRef(null),
    messagesContainerRef = useRef(null),
    run = useMutation({
      mutationFn: (text) => aiApi.run("career_copilot", { text }),
      onSuccess: (r, text) => {
        setHistory((prev) => [
          ...prev,
          { question: text, result: r.data, timestamp: new Date() },
        ]);
        setQuestion("");
        setLastAttemptedPrompt("");
      },
    });

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      if (typeof messagesContainerRef.current.scrollTo === "function") {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      } else {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    } else if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [history, run.isPending]);

  useEffect(() => {
    try {
      sessionStorage.setItem("hiresmart_candidate_copilot_chat", JSON.stringify(history));
    } catch {
      // ignore storage error
    }
  }, [history]);

  const handleSend = (textToSend) => {
    const prompt = (typeof textToSend === "string" ? textToSend : question).trim();
    if (prompt.length < 5 || run.isPending) return;
    setLastAttemptedPrompt(prompt);
    run.mutate(prompt);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    setQuestion("");
    try {
      sessionStorage.removeItem("hiresmart_candidate_copilot_chat");
    } catch {
      // ignore
    }
  };

  const currentCategoryObj =
    CANDIDATE_COPILOT_CATEGORIES.find((c) => c.id === activeCategory) ||
    CANDIDATE_COPILOT_CATEGORIES[0];

  return (
    <div className="w-full max-w-[95%] xl:max-w-[92%] 2xl:max-w-[90%] mx-auto px-2 sm:px-4 py-3 flex flex-col h-[calc(100vh-6rem)] min-h-[720px] space-y-3">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200 shadow-xs">
            <Bot className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success-500 border border-white"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-ink-900">Career Copilot</h1>
              <span className="text-xs font-semibold text-ink-500">Ask your career assistant</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
                <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                Active
              </span>
            </div>
            <p className="text-xs text-ink-500">
              Personalized career guidance grounded in your profile, skills evidence, and job matches.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleClearHistory}
            leftIcon={<Trash2 className="h-3.5 w-3.5 text-ink-500" />}
            title="Start new conversation"
          >
            New Conversation
          </Button>
        </div>
      </div>

      {/* 6 Category Tabs - Flex Wrap, No Horizontal Scrollbars */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1 shrink-0 border-b border-ink-100">
        {CANDIDATE_COPILOT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeCategory === cat.id
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-ink-50 text-ink-700 hover:bg-ink-100"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Prompt Pills under selected category - Flex Wrap, No Horizontal Scrollbars */}
      <div className="flex flex-wrap items-center gap-2 py-2 shrink-0 border-b border-ink-100">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400 shrink-0 flex items-center gap-1 mr-1">
          <Sparkles className="h-3 w-3 text-brand-500" />
          Suggested:
        </span>
        {currentCategoryObj.prompts.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleSend(s)}
            className="rounded-full border border-ink-200 bg-white px-3.5 py-1 text-xs font-medium text-ink-700 transition-colors hover:border-brand-500 hover:text-brand-600 hover:bg-brand-50/40 shadow-2xs text-left"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Chat Messages Stream */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto pr-2 space-y-5">
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center my-auto py-10 px-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 border border-brand-200 shadow-xs mb-3">
              <Bot className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-ink-900">How can I assist your career journey today?</h2>
            <p className="mt-1 text-sm text-ink-500 max-w-lg mx-auto">
              Ask about optimizing your resume, identifying skill gaps, matching job requisitions, or practicing behavioral and technical interview questions.
            </p>

            {/* 5 Onboarding Suggestion Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-w-4xl w-full mx-auto mt-6">
              {CANDIDATE_WELCOME_CARDS.map((card, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(card.prompt)}
                  className="group flex flex-col items-start p-4 rounded-xl border border-ink-200 bg-white text-left shadow-2xs hover:border-brand-500 hover:shadow-xs hover:bg-brand-50/20 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-brand-600 mb-1.5">
                    <card.icon className="h-4 w-4 shrink-0 text-brand-600" />
                    <span className="text-xs font-bold text-ink-900 group-hover:text-brand-700 transition-colors">
                      {card.title}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500 line-clamp-2 leading-relaxed">
                    {card.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((item, idx) => (
          <div key={idx} className="space-y-3">
            {/* User message bubble */}
            <div className="flex items-start justify-end gap-3">
              <div className="max-w-[80%] rounded-2xl rounded-tr-xs bg-brand-600 p-4 text-xs sm:text-sm text-white shadow-xs font-medium">
                <p className="whitespace-pre-wrap leading-relaxed">{item.question}</p>
                <p className="mt-1.5 text-[10px] text-brand-100 text-right">
                  {formatRelativeTime(item.timestamp)}
                </p>
              </div>
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-900 text-white text-xs font-bold shadow-xs">
                <User className="h-4 w-4" />
              </div>
            </div>

            {/* Assistant message bubble */}
            <div className="flex items-start justify-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200 shadow-xs">
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-xs border border-ink-200/90 bg-white p-5 text-xs sm:text-sm text-ink-900 shadow-xs space-y-3">
                {item.result?.metadata && (
                  <div className="pb-2 border-b border-ink-100">
                    <AIProvenance
                      tone="light"
                      metadata={item.result?.metadata}
                      confidence={item.result?.confidence}
                      limitations={item.result?.limitations}
                    />
                  </div>
                )}
                <ChatMessageContent
                  text={item.result?.answer}
                  metadata={item.result?.metadata}
                />

                {item.result?.recommendations?.length > 0 && (
                  <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-600">Actionable Steps</p>
                    <ul className="mt-2.5 space-y-2 text-xs text-ink-800">
                      {item.result.recommendations.map((x) => (
                        <li key={x} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 text-success-600 shrink-0" />
                          <span className="leading-relaxed">{x}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-[10px] text-ink-400">
                  {formatRelativeTime(item.timestamp)}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Loading / Typing indicator */}
        {run.isPending && (
          <div className="flex items-start gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200 shadow-xs">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-xs border border-ink-200 bg-white p-4 shadow-xs flex items-center gap-2.5 text-xs text-ink-600">
              <RefreshCw className="h-4 w-4 animate-spin text-brand-600 shrink-0" />
              <span>Analyzing candidate profile and generating career guidance...</span>
            </div>
          </div>
        )}

        {/* Error Callout with Retry */}
        {run.error && (
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-xs text-danger-900 flex items-center justify-between gap-3">
            <ErrorCallout error={run.error} />
            {lastAttemptedPrompt && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSend(lastAttemptedPrompt)}
                className="shrink-0 text-danger-700 border-danger-300 hover:bg-danger-100"
              >
                Retry
              </Button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Modern Wide Composer Fixed at Bottom */}
      <div className="pt-2 border-t border-ink-200 bg-white shrink-0">
        <div className="rounded-2xl border border-ink-200 bg-white shadow-xs focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all p-3">
          <textarea
            aria-label="What would you like assistance with?"
            placeholder="Ask your career assistant a question... (Press Enter to send, Shift + Enter for new line)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={run.isPending}
            rows={3}
            className="w-full resize-none border-0 bg-transparent p-1 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-0 leading-relaxed"
          />
          <div className="flex items-center justify-between pt-2 border-t border-ink-100/70 mt-1">
            <span className="text-[11px] text-ink-400 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-brand-500 shrink-0" />
              Grounded in your profile and ATS resume evidence
            </span>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={question.trim().length < 5 || run.isPending}
              isLoading={run.isPending}
              onClick={() => handleSend()}
              leftIcon={<Send className="h-3.5 w-3.5" />}
            >
              Ask Assistant
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   11. ALERTS PAGE
   ========================================================================= */
const JobAlertModal = ({ isOpen, onClose, mode, initialAlert, onSubmit, isPending }) => {
  const [name, setName] = useState(initialAlert?.name || "My job alert");
  const [query, setQuery] = useState(initialAlert?.query || "");
  const [location, setLocation] = useState(initialAlert?.location || "");
  const [workplaceMode, setWorkplaceMode] = useState(initialAlert?.workplaceMode || "");
  const [cadence, setCadence] = useState(initialAlert?.cadence || "weekly");
  const toast = useToast();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a name for the alert");
      return;
    }
    onSubmit({
      name: name.trim(),
      query: query.trim(),
      location: location.trim(),
      workplaceMode,
      cadence,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "edit" ? "Edit job alert" : "Create new job alert"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="alert-form-name" className="block text-xs font-semibold text-ink-700">
            Alert Name *
          </label>
          <Input
            id="alert-form-name"
            required
            maxLength={100}
            placeholder="e.g. Senior React Engineer"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label htmlFor="alert-form-query" className="block text-xs font-semibold text-ink-700">
            Keywords or Job Title
          </label>
          <Input
            id="alert-form-query"
            maxLength={100}
            placeholder="e.g. React, Node.js, Frontend, Full Stack"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label htmlFor="alert-form-location" className="block text-xs font-semibold text-ink-700">
            Location Filter
          </label>
          <Input
            id="alert-form-location"
            maxLength={150}
            placeholder="e.g. Surat, Gujarat or Bengaluru or Remote"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-700">Workplace Mode</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[
              { value: "", label: "Any mode" },
              { value: "remote", label: "Remote" },
              { value: "hybrid", label: "Hybrid" },
              { value: "onsite", label: "Onsite" },
            ].map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setWorkplaceMode(m.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  workplaceMode === m.value
                    ? "bg-brand-600 text-white shadow-xs"
                    : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-700">Notification Frequency</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[
              { value: "daily", label: "Daily Digest" },
              { value: "weekly", label: "Weekly Digest" },
            ].map((cad) => (
              <button
                key={cad.value}
                type="button"
                onClick={() => setCadence(cad.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  cadence === cad.value
                    ? "bg-brand-600 text-white shadow-xs"
                    : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {cad.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-ink-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isPending}>
            {mode === "edit" ? "Save changes" : "Create alert"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export const AlertsPage = () => {
  const toast = useToast();
  const qc = useQueryClient();
  const [alertToDelete, setAlertToDelete] = useState(null);
  const [modalState, setModalState] = useState(null); // null | { mode: "create" } | { mode: "edit", alert }

  const q = useQuery({ queryKey: ["alerts"], queryFn: alertsApi.list });

  const remove = useMutation({
    mutationFn: (id) => alertsApi.remove(id),
    onSuccess: () => {
      setAlertToDelete(null);
      qc.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }) => alertsApi.update(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
    onError: (error) => toast.error(error.message),
  });

  const createAlert = useMutation({
    mutationFn: (body) => alertsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setModalState(null);
      toast.success("Job alert created");
    },
    onError: (error) => toast.error(error.message || "Failed to create alert"),
  });

  const updateAlert = useMutation({
    mutationFn: ({ id, body }) => alertsApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setModalState(null);
      toast.success("Job alert updated");
    },
    onError: (error) => toast.error(error.message || "Failed to update alert"),
  });

  const openCreateModal = () => {
    setModalState({ mode: "create" });
  };

  const openEditModal = (a) => {
    setModalState({ mode: "edit", alert: a });
  };

  const handleModalSubmit = (payload) => {
    if (modalState?.mode === "edit") {
      updateAlert.mutate({ id: modalState.alert.id, body: payload });
    } else {
      createAlert.mutate(payload);
    }
  };

  return (
    <div className="page-wrap max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Job alerts"
        title="Your saved job searches"
        description="We notify you when newly published and approved jobs match your preferences. Weekly by default — switch to daily for fast-moving roles."
        action={
          <Button size="sm" onClick={openCreateModal} leftIcon={<Plus className="h-4 w-4" />}>
            Create job alert
          </Button>
        }
      />

      {/* Real-time delivery transparency callout */}
      <div className="flex items-start gap-3 rounded-2xl border border-brand-200/80 bg-brand-50/50 p-4 text-xs text-brand-950">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <div className="space-y-0.5">
          <p className="font-bold text-brand-900">Automated Alert Processing</p>
          <p className="text-brand-800/90 leading-relaxed">
            Active alerts check for newly verified listings matching your preferences. Notifications are delivered to your in-app notification center and queued for email delivery when the system SMTP mailer is active.
          </p>
        </div>
      </div>

      {q.isLoading ? (
        <LoadingState message="Loading your job alerts…" />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="space-y-3">
          {q.data?.data?.map((a) => (
            <div key={a.id} className="panel flex flex-col gap-4 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-ink-950">{a.name || "Custom Search Alert"}</p>
                  <Badge variant={a.active ? "success" : "neutral"}>
                    {a.active ? "Active" : "Paused"}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-600">
                  {a.query && (
                    <span className="rounded-md bg-ink-100/70 px-2 py-0.5 font-medium text-ink-800">
                      Keywords: {a.query}
                    </span>
                  )}
                  {a.location && (
                    <span className="rounded-md bg-ink-100/70 px-2 py-0.5 font-medium text-ink-800">
                      Location: {a.location}
                    </span>
                  )}
                  {a.workplaceMode && (
                    <span className="rounded-md bg-ink-100/70 px-2 py-0.5 font-medium capitalize text-ink-800">
                      {a.workplaceMode}
                    </span>
                  )}
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 font-medium capitalize text-brand-700">
                    {a.cadence} digest
                  </span>
                  {!a.query && !a.location && !a.workplaceMode && (
                    <span className="text-ink-400">Matches all open roles</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-400">
                  {a.lastRunAt
                    ? `Last checked ${formatRelativeTime(a.lastRunAt)}`
                    : "Not checked yet"}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                  leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => openEditModal(a)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger-700 hover:bg-danger-50"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => setAlertToDelete(a)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {!q.data?.data?.length && (
            <EmptyState
              icon={Bell}
              title="No alerts configured"
              description="Create a personalized job alert to receive automated updates when new matching roles are published."
              action={
                <Button onClick={openCreateModal} size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                  Create your first alert
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
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

      {/* Create / Edit Alert Modal */}
      {Boolean(modalState) && (
        <JobAlertModal
          isOpen
          onClose={() => setModalState(null)}
          mode={modalState.mode}
          initialAlert={modalState.alert}
          onSubmit={handleModalSubmit}
          isPending={createAlert.isPending || updateAlert.isPending}
        />
      )}
    </div>
  );
};
