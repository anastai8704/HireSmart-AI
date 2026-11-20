import { useState, useRef, useEffect } from "react";
import { newId } from "../../lib/id";
import { Link, useParams, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import {
    useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Clock,
  Clock3,
  Download,
  Filter,
  MapPin,
  Plus,
  RefreshCw,
  Star,
  UsersRound,
  Video,
  WandSparkles,
  Bot,
  Send,
  Trash2,
  Sparkles,
  User,
  Layers,
  Award,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Select, Textarea } from "../../components/ui/Input";
import DatePicker from "../../components/ui/DatePicker";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Kpi from "../../components/ui/Kpi";
import SectionCard from "../../components/ui/SectionCard";
import PipelineFunnel from "../../components/ui/PipelineFunnel";
import ConfirmModal from "../../components/ui/ConfirmModal";
import QuickActions from "../../components/ui/QuickActions";
import ActivityFeed from "../../components/ui/ActivityFeed";
import { RecruiterOfferPanel } from "../../components/hiring/OfferPanels";
import MeetingStatus from "../../components/interviews/MeetingStatus";
import RecruiterMeetingControls from "../../components/interviews/RecruiterMeetingControls";
import InterviewHistory from "../../components/interviews/InterviewHistory";
import { ChatMessageContent } from "../../components/ai/ChatMessageContent";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import {
  AIProvenance,
  ErrorCallout,
  HybridMatch,
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
import {
  cn,
  formatDate,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  initials,
  isValidMeetingUrl,
  downloadInterviewIcs,
  istHour,
} from "../../lib/utils";
import { DEFAULT_TIMEZONE, toZonedLocalInput, zonedLocalToUtc } from "../../lib/interviewWorkflow";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { PlanBadge } from "../../components/billing/PlanBadge";
const greeting = () => {
  const hour = istHour();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};
const STAGES = ["submitted", "under_review", "shortlisted", "interview", "offer", "hired"];
/* Presentation mirror of the server's transition rules (see
 * v1RecruitmentController) used only to show which moves are valid —
 * the API remains the source of truth and still rejects bad moves. */
// An offer is issued with its details (RecruiterOfferPanel), and hiring needs the candidate's
// acceptance, so neither "offer" nor "hired" is a plain move from these stages.
const STAGE_MOVES = {
  submitted: ["under_review", "shortlisted"],
  under_review: ["shortlisted", "interview"],
  shortlisted: ["interview"],
  interview: [],
  offer: [],
};
const STAGE_LABELS = {
  submitted: "Submitted",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
  closed: "Closed",
};
const stageLabel = (status) => STAGE_LABELS[status] || String(status || "").replaceAll("_", " ");
const isTerminal = (status) => ["hired", "rejected", "withdrawn", "closed"].includes(status);

const RECRUITER_COPILOT_CATEGORIES = [
  {
    id: "candidate_analysis",
    label: "Candidate analysis",
    prompts: [
      "Which candidates are strongest for my open roles?",
      "Which applicants have the strongest technical skill match?",
      "Identify missing required skills among our current applicant pool.",
      "Compare candidate experience against senior engineer requirements.",
    ],
  },
  {
    id: "hiring_pipeline",
    label: "Hiring pipeline",
    prompts: [
      "Where is my hiring process slowing down?",
      "Which candidates have been waiting longest for an interview round?",
      "Summarize applicant conversion rates across our pipeline stages.",
      "Are there any bottlenecks in the current screening stages?",
    ],
  },
  {
    id: "requisition_analysis",
    label: "Requisition analysis",
    prompts: [
      "Summarize my open positions.",
      "What skills am I hiring for most across active requisitions?",
      "Analyze the skill requirements and market competitiveness for our backend role.",
      "Suggest improvements to the job description to attract top senior talent.",
    ],
  },
  {
    id: "interview_preparation",
    label: "Interview preparation",
    prompts: [
      "Generate targeted technical interview questions for full-stack developers.",
      "What behavioral questions best assess leadership and system ownership?",
      "Draft an objective scorecard evaluation rubric for candidate technical rounds.",
      "Suggest role-specific questions to assess distributed systems depth.",
    ],
  },
  {
    id: "recruitment_analytics",
    label: "Recruitment analytics",
    prompts: [
      "Summarize offer acceptance rates and average time-to-hire metrics.",
      "What percentage of applicants pass our initial screening stage?",
      "Compare applicant volume across engineering vs product departments.",
      "Analyze interview scorecard consistency across evaluation rounds.",
    ],
  },
  {
    id: "hiring_recommendations",
    label: "Hiring recommendations",
    prompts: [
      "Recommend top candidates ready for final round interviews.",
      "Provide a hiring assessment for candidates with accepted offers.",
      "What onboarding preparation is recommended for upcoming joiners?",
      "Highlight candidates with high confidence scores awaiting recruiter decision.",
    ],
  },
];
const useOrg = () => {
  const { organizationId } = useParams(),
    auth = useAuth();
  return organizationId || auth.organizationId;
};
const funnelCount = (funnel = {}, keys) => keys.reduce((sum, key) => sum + (funnel[key] || 0), 0);
const getPeriodFromDate = (range) => {
  if (range === "7d") return new Date(Date.now() - 7 * 86400000).toISOString();
  if (range === "30d") return new Date(Date.now() - 30 * 86400000).toISOString();
  if (range === "90d") return new Date(Date.now() - 90 * 86400000).toISOString();
  if (range === "all") return new Date("2020-01-01").toISOString();
  return undefined;
};

export const RecruiterDashboard = () => {
  const orgId = useOrg(),
    auth = useAuth(),
    qc = useQueryClient(),
    [dateRange, setDateRange] = useState("90d"),
    [jobFilter, setJobFilter] = useState("all"),
    [statusFilter, setStatusFilter] = useState("all"),
    [activityTab, setActivityTab] = useState("all");

  const jobs = useQuery({
    queryKey: ["jobs-org", orgId, {}],
    queryFn: () => jobsApi.orgList(orgId, { limit: 50 }),
  });

  const analytics = useQuery({
    queryKey: ["analytics-recruitment", orgId, { dateRange }],
    queryFn: () => analyticsApi.recruitment(orgId, { from: getPeriodFromDate(dateRange) }),
  });

  const interviews = useQuery({
    queryKey: ["interviews", orgId, {}],
    queryFn: () => interviewApi.list(orgId, { limit: 20 }),
  });

  const team = useQuery({
    queryKey: ["org-members", orgId, {}],
    queryFn: () => organizationApi.members(orgId, { limit: 50 }),
  });

  const applicationQueries = useQueries({
    queries: (jobs.data?.data || []).slice(0, 8).map((job) => ({
      queryKey: ["applications-job", orgId, job.id, "recent"],
      queryFn: () => recruitmentApi.applications(orgId, job.id, { limit: 10 }),
    })),
  });

  if (jobs.isLoading || analytics.isLoading) return <LoadingState />;

  const isRefreshing = jobs.isFetching || analytics.isFetching || interviews.isFetching;

  const handleRefresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["jobs-org", orgId] }),
      qc.invalidateQueries({ queryKey: ["analytics-recruitment", orgId] }),
      qc.invalidateQueries({ queryKey: ["interviews", orgId] }),
      qc.invalidateQueries({ queryKey: ["org-members", orgId] }),
    ]);
  };

  const data = analytics.data?.data || {},
    jobRows = jobs.data?.data || [],
    publishedJobs = jobRows.filter((j) => j.status === "published"),
    pendingApprovals = jobRows.filter(
      (j) => j.moderation?.status === "pending" || j.pendingChanges?.status === "pending",
    ),
    funnel = data.funnel || {},
    totalApplications = data.applications || 0,
    newApplications = funnelCount(funnel, ["submitted", "Applied"]),
    underReviewCount = funnelCount(funnel, ["under_review"]),
    toReview = newApplications + underReviewCount,
    shortlistedCount = funnelCount(funnel, ["shortlisted", "Shortlisted"]),
    interviewCount = funnelCount(funnel, ["interview", "Interview"]),
    offersOut = funnel.offer || 0,
    hiredCount = funnelCount(funnel, ["hired", "Selected"]),
    pipelineStages = [
      { label: "Submitted", value: newApplications, tone: "ink" },
      { label: "Under review", value: underReviewCount, tone: "ink" },
      {
        label: "Shortlisted",
        value: shortlistedCount,
        tone: "warning",
      },
      { label: "Interview", value: interviewCount, tone: "brand" },
      { label: "Offer", value: offersOut, tone: "warning" },
      { label: "Hired", value: hiredCount, tone: "success" },
    ],
    upcoming = (interviews.data?.data || [])
      .filter((i) => ["invited", "confirmed"].includes(i.status))
      .sort((a, b) => new Date(a.scheduledStart || 0) - new Date(b.scheduledStart || 0)),
    members = (team.data?.data || []).filter((m) => !m.status || m.status === "active"),
    newestMember = [...members].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    )[0],
    aiData = data.ai || {},
    hasAIScores = (aiData.scoresGenerated || 0) > 0,
    topAIGroup = (data.jobPerformance || [])
      .filter((row) => (row.applications || 0) > 0 && (row.averageAIScore || 0) > 0)
      .sort((a, b) => b.averageAIScore - a.averageAIScore)[0];

  // Map job performance data
  const perfMap = new Map();
  (data.jobPerformance || []).forEach((row) => {
    const key = String(row._id || row.job?._id || row.job?.id || "");
    if (key) perfMap.set(key, row);
  });

  // Recent applications gathered across active jobs
  const allRecent = applicationQueries
    .map((query, index) =>
      (query.data?.data || []).map((a) => ({
        ...a,
        job: {
          id: jobs.data?.data?.[index]?.id,
          title: jobs.data?.data?.[index]?.title,
          company: jobs.data?.data?.[index]?.company,
        },
      })),
    )
    .flat()
    .sort(
      (a, b) =>
        new Date(b.appliedAt || b.createdAt || 0) - new Date(a.appliedAt || a.createdAt || 0),
    );

  // Filter recent applications based on job and status filters
  const recent = allRecent.filter((a) => {
    if (jobFilter !== "all" && String(a.job?.id) !== String(jobFilter)) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "submitted") {
        if (!["submitted", "Applied"].includes(a.status)) return false;
      } else if (a.status !== statusFilter) {
        return false;
      }
    }
    return true;
  });

  // Jobs filtered for display
  const displayedJobs =
    jobFilter === "all" ? jobRows : jobRows.filter((j) => String(j.id) === String(jobFilter));

  const currentOrg =
    auth.organization || (auth.organizations || []).find((o) => String(o.id) === String(orgId));
  const orgName = currentOrg?.name || "Company Workspace";
  const userRole = auth.workspaceRole ? auth.workspaceRole.replace("_", " ") : "Recruiter";
  const userFirstName =
    auth.user?.displayName?.split(" ")[0] || auth.user?.name?.split(" ")[0] || "there";

  const quickActions = [
    {
      icon: Plus,
      label: "Create Job",
      hint: "Publish new opening",
      to: `/app/o/${orgId}/jobs/new`,
    },
    {
      icon: UsersRound,
      label: "View Applications",
      hint: "Candidate pipeline",
      to: `/app/o/${orgId}/jobs?tab=applications`,
    },
    {
      icon: BriefcaseBusiness,
      label: "Manage Jobs",
      hint: "Active & draft roles",
      to: `/app/o/${orgId}/jobs`,
    },
    {
      icon: Video,
      label: "Schedule Interview",
      hint: "Coordinate candidate time",
      to: `/app/o/${orgId}/interviews/schedule`,
    },
  ];

  // Total count across funnel stages for status distribution percentages
  const funnelTotal =
    pipelineStages.reduce((acc, s) => acc + s.value, 0) || totalApplications || 1;

  // Recent activity stream combining applications and interviews
  const activityItems = [
    ...recent.slice(0, 6).map((a) => ({
      title: `${a.candidate?.name || "Candidate"} applied for ${a.job?.title || "role"}`,
      meta: `${stageLabel(a.status)} · ${a.candidate?.headline || "Applicant"}`,
      time: a.appliedAt,
      tone: a.status === "hired" ? "success" : a.status === "shortlisted" ? "brand" : "ink",
      to: `/app/o/${orgId}/applications/${a._id}`,
    })),
    ...upcoming.slice(0, 3).map((i) => ({
      title: `Interview: ${i.application?.candidate?.name || "Candidate"}`,
      meta: `${i.application?.job?.title || "Role"} · ${i.title || "Scheduled call"}`,
      time: i.scheduledStart,
      tone: "warning",
      to: `/app/o/${orgId}/interviews/${i._id}`,
    })),
  ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

  return (
    <div className="page-wrap space-y-6">
      {/* 1. Welcome Header with Recruiter & Company Info */}
      <div className="flex flex-col gap-4 border-b border-ink-100 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
              Hiring workspace
            </span>
            <span className="text-ink-300">·</span>
            <span className="text-xs font-semibold text-ink-700">{orgName}</span>
            <Badge variant="brand" size="sm" className="capitalize">
              {userRole}
            </Badge>
            {currentOrg?.plan && <PlanBadge plan={currentOrg.plan} />}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">
            {greeting()}, {userFirstName}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Here's what's happening across your hiring today — pipeline velocity, candidate reviews,
            and scheduled interviews.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button as={Link} to={`/app/o/${orgId}/jobs/new`} leftIcon={<Plus className="h-4 w-4" />}>
            Create Job
          </Button>
          <Button
            variant="secondary"
            as={Link}
            to={`/app/o/${orgId}/interviews/schedule`}
            leftIcon={<Video className="h-4 w-4" />}
          >
            Schedule Interview
          </Button>
        </div>
      </div>

      {/* 7. Quick Actions */}
      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">
          Quick Actions
        </p>
        <QuickActions actions={quickActions} columns="grid-cols-2 md:grid-cols-4" />
      </section>

      {/* 8. Analytics Filters Toolbar */}
      <section className="flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-500">
            <Filter className="h-3.5 w-3.5 text-ink-400" />
            <span>Filters:</span>
          </div>

          {/* Date range filter */}
          <div className="flex items-center gap-1 rounded-lg border border-ink-200 bg-ink-50/60 p-0.5">
            {[
              { id: "7d", label: "Last 7d" },
              { id: "30d", label: "Last 30d" },
              { id: "90d", label: "Last 90d" },
              { id: "all", label: "All time" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDateRange(item.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  dateRange === item.id
                    ? "bg-white text-ink-950 shadow-sm"
                    : "text-ink-600 hover:text-ink-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Job filter dropdown */}
          <div className="w-44">
            <Select
              aria-label="Filter by job"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              options={[
                { value: "all", label: `All Jobs (${jobRows.length})` },
                ...jobRows.map((j) => ({
                  value: j.id,
                  label: `${j.title} (${j.status})`,
                })),
              ]}
            />
          </div>

          {/* Application status filter dropdown */}
          <div className="w-40">
            <Select
              aria-label="Filter by application status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "submitted", label: "Submitted / Applied" },
                { value: "under_review", label: "Under Review" },
                { value: "shortlisted", label: "Shortlisted" },
                { value: "interview", label: "Interview" },
                { value: "offer", label: "Offer" },
                { value: "hired", label: "Hired" },
                { value: "rejected", label: "Not Selected" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </section>

      {/* 2. 7 KPI Cards Grid */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Link to={`/app/o/${orgId}/jobs`}>
          <Kpi
            label="Total Active Jobs"
            value={publishedJobs.length}
            icon={BriefcaseBusiness}
            detail={
              <span>
                <span>Open positions</span> · {jobRows.length} total
              </span>
            }
            tone={publishedJobs.length ? "brand" : "ink"}
          />
        </Link>
        <Link to={`/app/o/${orgId}/jobs`}>
          <Kpi
            label="Total Applications"
            value={totalApplications}
            icon={UsersRound}
            detail="Across all positions"
            tone={totalApplications ? "brand" : "ink"}
          />
        </Link>
        <Link to={`/app/o/${orgId}/jobs`}>
          <Kpi
            label="New Applications"
            value={newApplications}
            icon={Clock3}
            detail={
              toReview ? `${toReview} to review (${newApplications} new)` : "All caught up"
            }
            tone={newApplications ? "brand" : "ink"}
          />
        </Link>
        <Link to={`/app/o/${orgId}/jobs`}>
          <Kpi
            label="Shortlisted Candidates"
            value={shortlistedCount}
            icon={CheckCircle2}
            detail={`${Math.round((data.rates?.shortlist || 0) * 100)}% shortlist rate`}
            tone="brand"
          />
        </Link>
        <Link to={`/app/o/${orgId}/interviews`}>
          <Kpi
            label="Interviews Scheduled"
            value={upcoming.length || interviewCount}
            icon={Video}
            detail={upcoming.length ? `${upcoming.length} upcoming on calendar` : "None scheduled"}
            tone={upcoming.length ? "warning" : "ink"}
          />
        </Link>
        <Link to={`/app/o/${orgId}/jobs`}>
          <Kpi
            label="Offers Sent"
            value={offersOut}
            icon={Star}
            detail={
              <span>
                <span>Offers out</span> · Decisions in play
              </span>
            }
            tone={offersOut ? "warning" : "ink"}
          />
        </Link>
        <Link to={`/app/o/${orgId}/analytics`}>
          <Kpi
            label="Hired Candidates"
            value={hiredCount}
            icon={Star}
            detail={
              <span>
                <span>Hired</span> · {Math.round((data.rates?.hired || 0) * 100)}% rate
              </span>
            }
            tone="success"
          />
        </Link>
      </section>

      {/* Pending Approvals Notice Banner */}
      {pendingApprovals.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-200 bg-warning-50/80 p-3.5 text-xs text-warning-950">
          <div className="flex items-center gap-2.5 font-medium">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-warning-200 text-warning-900 font-bold">
              !
            </span>
            <span>
              <strong>Pending approvals</strong>: {pendingApprovals.length} job
              {pendingApprovals.length === 1 ? "" : "s"} awaiting platform moderation or edit
              approval.
            </span>
          </div>
          <Link
            to={`/app/o/${orgId}/jobs`}
            className="font-semibold text-warning-900 underline hover:text-black"
          >
            Review pending roles &rarr;
          </Link>
        </div>
      )}

      {/* Main Grid: Application Analytics & Job Performance | Upcoming Interviews & Team */}
      <section className="grid gap-6 lg:grid-cols-[1.35fr_.75fr]">
        <div className="min-w-0 space-y-6">
          {/* 3. Candidate Hiring Progress & Application Analytics */}
          <SectionCard
            title="Candidate Hiring Progress"
            description="Applications by hiring stage and funnel conversion"
            action={
              <Link
                to={`/app/o/${orgId}/analytics`}
                className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                Explore analytics
              </Link>
            }
          >
            {totalApplications ? (
              <>
                <PipelineFunnel stages={pipelineStages} />

                {/* Conversion Rates */}
                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-ink-100 pt-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                      Shortlist rate
                    </p>
                    <p className="mt-1 text-lg font-extrabold tabular-nums text-ink-950">
                      {Math.round((data.rates?.shortlist || 0) * 100)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                      Interview rate
                    </p>
                    <p className="mt-1 text-lg font-extrabold tabular-nums text-ink-950">
                      {Math.round((data.rates?.interview || 0) * 100)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                      Hire rate
                    </p>
                    <p className="mt-1 text-lg font-extrabold tabular-nums text-success-700">
                      {Math.round((data.rates?.hired || 0) * 100)}%
                    </p>
                  </div>
                </div>

                {/* Application Status Distribution */}
                <div className="mt-5 border-t border-ink-100 pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Application Status Distribution
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {pipelineStages.map((stage) => {
                      const pct = Math.round((stage.value / funnelTotal) * 100);
                      return (
                        <div key={stage.label}>
                          <div className="flex justify-between text-xs font-medium text-ink-700">
                            <span>{stage.label}</span>
                            <span className="tabular-nums font-semibold text-ink-900">
                              {stage.value} ({pct}%)
                            </span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="h-full rounded-full bg-brand-500 transition-all duration-500"
                              style={{ width: `${Math.max(pct, stage.value > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Time to Stage velocity */}
                {Boolean(data.timeToStage?.length) && (
                  <div className="mt-4 border-t border-ink-100 pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                      Stage Velocity (Avg Hours)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {data.timeToStage.map((s) => (
                        <span
                          key={s._id}
                          className="rounded-lg bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700"
                        >
                          <strong className="capitalize">{stageLabel(s._id)}:</strong>{" "}
                          {Math.round(s.averageHoursFromApplication || 0)}h
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={UsersRound}
                title="No applications yet"
                description="Your funnel fills in as candidates apply to open jobs."
              />
            )}
          </SectionCard>

          {/* 4. Job Performance & Attention */}
          <SectionCard
            title="Jobs needing attention"
            description="Active roles and positions requiring recruiter action"
            action={
              <Link
                to={`/app/o/${orgId}/jobs`}
                className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                View all
              </Link>
            }
          >
            <div className="space-y-3">
              {displayedJobs.slice(0, 6).map((j) => {
                const perf = perfMap.get(String(j.id)) || {};
                const jApps = perf.applications ?? 0;
                const jShort = perf.shortlisted ?? 0;
                const jInt = perf.interviews ?? 0;
                const jHires = perf.hires ?? 0;
                const needsAttention =
                  j.moderation?.status === "pending" ||
                  j.pendingChanges?.status === "pending" ||
                  (j.status === "published" && jApps === 0);

                return (
                  <Link
                    key={j.id}
                    to={`/app/o/${orgId}/jobs/${j.id}/applications`}
                    className="group flex flex-col gap-2 rounded-xl border border-ink-100 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                          j.status === "published"
                            ? needsAttention
                              ? "bg-warning-500"
                              : "bg-success-500"
                            : "bg-ink-300"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate font-semibold text-ink-950 transition-colors group-hover:text-brand-700">
                            {j.title}
                          </p>
                          {j.moderation?.status === "pending" && (
                            <Badge variant="warning" size="sm">
                              Review pending
                            </Badge>
                          )}
                          {j.pendingChanges?.status === "pending" && (
                            <Badge variant="warning" size="sm">
                              Edits pending
                            </Badge>
                          )}
                          {j.status === "published" && jApps === 0 && (
                            <Badge variant="ink" size="sm">
                              0 applicants
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-ink-500">
                          {j.location || "Remote"} · {j.status.replace("_", " ")} · updated{" "}
                          {formatRelativeTime(j.updatedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-right text-xs">
                        <span className="tabular-nums font-bold text-ink-900">{jApps}</span>
                        <span className="text-ink-500"> apps</span>
                        {jShort > 0 && (
                          <span className="ml-1 tabular-nums font-semibold text-brand-600">
                            · {jShort} short
                          </span>
                        )}
                        {jInt > 0 && (
                          <span className="ml-1 tabular-nums font-semibold text-warning-700">
                            · {jInt} int
                          </span>
                        )}
                        {jHires > 0 && (
                          <span className="ml-1 tabular-nums font-semibold text-success-700">
                            · {jHires} hired
                          </span>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                    </div>
                  </Link>
                );
              })}
              {!displayedJobs.length && (
                <EmptyState
                  icon={BriefcaseBusiness}
                  title="No jobs found"
                  description="No jobs match the current filter criteria."
                  action={
                    <Button as={Link} to={`/app/o/${orgId}/jobs/new`} size="sm">
                      Create Job
                    </Button>
                  }
                />
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right Sidebar Columns */}
        <div className="space-y-6">
          {/* Pending Approvals Card */}
          <SectionCard
            title="Pending approvals"
            description="Jobs waiting on platform review"
            tone="dark"
          >
            {pendingApprovals.length ? (
              <div className="space-y-3">
                {pendingApprovals.slice(0, 4).map((j) => (
                  <Link
                    key={j.id}
                    to={`/app/o/${orgId}/jobs/${j.id}`}
                    className="group block rounded-xl bg-white/6 p-3.5 transition-colors hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white transition-colors group-hover:text-brand-200">
                        {j.title}
                      </p>
                      <Badge
                        variant={j.pendingChanges?.status === "pending" ? "warning" : "brand"}
                        size="sm"
                      >
                        {j.moderation?.status === "pending" ? "Job review" : "Edits review"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-400">
                      {j.moderation?.status === "pending"
                        ? "Submitted for approval"
                        : "Proposed changes awaiting review"}{" "}
                      · {formatRelativeTime(j.updatedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">
                All clear — no jobs or edits are waiting on review.
              </p>
            )}
          </SectionCard>

          {/* 6. Upcoming Interviews Card */}
          <SectionCard
            title="Upcoming interviews"
            tone="dark"
            action={
              <Link
                to={`/app/o/${orgId}/interviews`}
                className="text-xs font-semibold text-brand-300 transition-colors hover:text-brand-200"
              >
                View all
              </Link>
            }
          >
            <div className="space-y-3">
              {upcoming.slice(0, 5).map((i) => (
                <Link
                  key={i._id}
                  to={`/app/o/${orgId}/interviews/${i._id}`}
                  className="group block rounded-xl bg-white/6 p-3.5 transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-white transition-colors group-hover:text-brand-200">
                      {i.title}
                    </p>
                    <Badge variant={i.status === "confirmed" ? "success" : "warning"} size="sm">
                      {i.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-300">
                    Candidate: {i.application?.candidate?.name || "Candidate"}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {i.application?.job?.title || "Role"} ·{" "}
                    {i.scheduledStart ? formatDateTime(i.scheduledStart) : "Awaiting schedule"}
                  </p>
                </Link>
              ))}
              {!upcoming.length && (
                <p className="text-sm text-ink-400">No upcoming interviews scheduled.</p>
              )}
            </div>
          </SectionCard>

          {/* AI Insights Card */}
          <SectionCard title="AI insights" description="Decision-support, not a verdict">
            {hasAIScores ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <WandSparkles className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-2xl font-extrabold tabular-nums text-ink-950">
                      {Math.round(aiData.averageAIScore || 0)}
                      <span className="text-sm font-bold text-ink-400">/100 avg</span>
                    </p>
                    <p className="text-xs text-ink-500">
                      Across {aiData.scoresGenerated} candidate match
                      {aiData.scoresGenerated === 1 ? "" : "es"}
                    </p>
                  </div>
                </div>
                {topAIGroup && (
                  <p className="rounded-lg bg-ink-50 p-3 text-xs leading-5 text-ink-600">
                    Strongest AI signals on{" "}
                    <span className="font-semibold text-ink-800">
                      {topAIGroup.job?.title || "a role"}
                    </span>{" "}
                    — avg {Math.round(topAIGroup.averageAIScore)}/100 across{" "}
                    {topAIGroup.applications} applicant
                    {topAIGroup.applications === 1 ? "" : "s"}.
                  </p>
                )}
                <p className="text-[11px] leading-4 text-ink-400">{data.note}</p>
              </div>
            ) : (
              <p className="text-sm text-ink-500">
                Score candidates against a job to surface AI match insights here.
              </p>
            )}
          </SectionCard>

          {/* Team Card */}
          <SectionCard
            title="Team"
            action={
              <Link
                to={`/app/o/${orgId}/team`}
                className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                Manage
              </Link>
            }
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                <UsersRound className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">
                  {members.length} active member{members.length === 1 ? "" : "s"}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {newestMember?.user?.name
                    ? `Newest: ${newestMember.user.name} (${newestMember.role})`
                    : "Invite your hiring team to collaborate."}
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </section>

      {/* 5. Recent Activity & Candidates to Review */}
      <section className="mt-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Team activity</p>
            <h2 className="mt-1 text-xl font-bold">Candidates to Review</h2>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-ink-200 bg-ink-50/70 p-0.5">
            {[
              { id: "all", label: `All Candidates (${recent.length})` },
              {
                id: "review",
                label: `Needs Review (${recent.filter((a) => ["submitted", "Applied", "under_review"].includes(a.status)).length})`,
              },
              { id: "feed", label: "Activity Feed" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivityTab(tab.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  activityTab === tab.id
                    ? "bg-white text-ink-950 shadow-sm"
                    : "text-ink-600 hover:text-ink-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activityTab === "feed" ? (
          <div className="mt-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
            <ActivityFeed items={activityItems} emptyText="No recent team activity recorded." />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {(activityTab === "review"
              ? recent.filter((a) => ["submitted", "Applied", "under_review"].includes(a.status))
              : recent
            ).map((a) => (
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
                    {a.candidate?.headline || "New applicant"} ·{" "}
                    {a.job?.title ? `${a.job.title} · ` : ""}
                    {formatRelativeTime(a.appliedAt)}
                  </p>
                </div>
                <StatusPill status={a.status} />
              </Link>
            ))}
            {!recent.length && (
              <p className="text-sm text-ink-500 lg:col-span-2">
                No recent applications found. New applicants from your jobs appear here.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
export { RequisitionsDashboard as JobsPage } from "./RequisitionsDashboard";
export { JobEditorPage as JobEditor } from "./JobEditorPage";
export { ApplicationsPipelinePage as ApplicantsPage } from "./ApplicationsPipelinePage";

export const CandidateDetail = () => {
  const orgId = useOrg(),
    { applicationId } = useParams(),
    location = useLocation(),
    navigate = useNavigate(),
    qc = useQueryClient(),
    toast = useToast(),
    [note, setNote] = useState(""),
    [tags, setTags] = useState(""),
    [moveTarget, setMoveTarget] = useState(null),
    [moveNote, setMoveNote] = useState(""),
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
  const move = useMutation({
    mutationFn: () =>
      recruitmentApi.transition(orgId, applicationId, {
        toStatus: moveTarget,
        note:
          moveNote.trim() ||
          (moveTarget === "hired"
            ? "Marked as hired by the hiring team"
            : `Moved to ${stageLabel(moveTarget)} in the candidate workspace`),
      }),
    onSuccess: () => {
      toast.success(
        moveTarget === "hired"
          ? "Candidate marked as Hired"
          : moveTarget === "rejected"
            ? "Candidate marked as not selected"
            : `Moved to ${stageLabel(moveTarget)}`,
      );
      setMoveTarget(null);
      setMoveNote("");
      qc.invalidateQueries({ queryKey: ["application", orgId, applicationId] });
      qc.invalidateQueries({ queryKey: ["applications-job", orgId] });
      qc.invalidateQueries({ queryKey: ["analytics-recruitment", orgId] });
    },
    onError: (error) => {
      const bad = /^Cannot transition from (\w+) to (\w+)/.exec(error?.message || "");
      toast.error(
        bad
          ? `That move isn't allowed — a candidate in “${stageLabel(bad[1])}” moves one stage at a time.`
          : error.message,
      );
    },
  }),
    shortlist = useAction(
      () =>
        recruitmentApi.transition(orgId, applicationId, {
          toStatus: "shortlisted",
          note: "Shortlisted from candidate review",
        }),
      "Moved to shortlist",
    ),
    issueOffer = useAction((body) => recruitmentApi.issueOffer(orgId, applicationId, body), "Offer issued to the candidate"),
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

  const backTarget =
    location.state?.from ||
    (a?.job?._id
      ? `/app/o/${orgId}/jobs/${a.job._id}/applications`
      : `/app/o/${orgId}/applications`);
  const backLabel =
    location.state?.fromLabel ||
    (a?.job?.title ? `Back to ${a.job.title} Pipeline` : "Back to Applications");

  return (
    <div className="page-wrap space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (location.state?.from) {
              navigate(location.state.from);
            } else {
              navigate(backTarget);
            }
          }}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          className="font-medium text-ink-600 hover:text-ink-950"
        >
          {backLabel}
        </Button>
      </div>
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
            <ol className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
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
            <h2 className="font-bold">Hiring progress</h2>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-ink-500">Current stage</span>
              <StatusPill status={a.status} />
            </div>
            {!isTerminal(a.status) && (
              <div className="mt-4">
                <RecruiterOfferPanel
                  application={a}
                  pending={issueOffer.isPending}
                  onIssue={(body) => issueOffer.mutate(body)}
                  onHire={() => setMoveTarget("hired")}
                />
              </div>
            )}
            {isTerminal(a.status) ? (
              <p className="mt-4 text-sm leading-6 text-ink-500">
                This application has ended — no further stage changes are available. You can still
                review the candidate, notes and history.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {(STAGE_MOVES[a.status] || []).map((to) => (
                  <Button
                    key={to}
                    fullWidth
                    variant={to === "hired" ? "primary" : "secondary"}
                    onClick={() => setMoveTarget(to)}
                  >
                    {to === "hired" ? "Mark as Hired" : `Move to ${stageLabel(to)}`}
                  </Button>
                ))}
                <Button
                  fullWidth
                  variant="ghost"
                  className="text-danger-600 hover:text-danger-700"
                  onClick={() => setMoveTarget("rejected")}
                >
                  Mark as not selected
                </Button>
              </div>
            )}
            <p className="mt-4 text-xs leading-5 text-ink-400">
              The candidate is notified automatically and every change is recorded in the
              application history.
            </p>
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
        isOpen={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
        title={
          moveTarget === "hired"
            ? "Mark this candidate as Hired?"
            : moveTarget === "rejected"
              ? "Mark as not selected?"
              : `Move to ${stageLabel(moveTarget)}?`
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={moveTarget === "rejected" ? "danger" : "primary"}
              isLoading={move.isPending}
              onClick={() => moveTarget && move.mutate()}
            >
              {moveTarget === "hired"
                ? "Confirm Hired"
                : moveTarget === "rejected"
                  ? "Mark as not selected"
                  : `Move to ${stageLabel(moveTarget)}`}
            </Button>
          </>
        }
      >
        {moveTarget && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ink-50 p-4">
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Current stage
                </p>
                <p className="mt-1 text-sm font-bold">{stageLabel(a.status)}</p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  New stage
                </p>
                <p className="mt-1 text-sm font-bold text-brand-700">{stageLabel(moveTarget)}</p>
              </div>
              <div className="ml-auto min-w-0 text-right text-xs text-ink-500">
                <p className="truncate font-semibold text-ink-800">{c.name}</p>
                <p className="truncate">{a.job?.title || "Application"}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-ink-600">
              {moveTarget === "hired"
                ? "You're about to mark this candidate as Hired. The candidate is notified, the job's hiring progress updates, and the decision is recorded in the audit log."
                : moveTarget === "rejected"
                  ? "The candidate is notified that they were not selected for this role. This closes the application."
                  : moveTarget === "offer"
                    ? "The candidate is notified that an offer has been made. Use this once the decision to hire is made."
                    : "The candidate is notified and the change appears in the application history."}
            </p>
            <Input
              label="Note (optional)"
              placeholder={
                moveTarget === "hired" ? "Hiring note — recorded in the history" : "Add context for the team"
              }
              value={moveNote}
              onChange={(e) => setMoveNote(e.target.value)}
            />
          </div>
        )}
      </Modal>
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
const extractScore = (component) => {
  if (component == null) return null;
  if (typeof component === "object") return component.score ?? null;
  if (typeof component === "number") return component;
  return null;
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

  const candidatesData = q.data?.data || [];

  return (
    <div className="page-wrap max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-4">
        <PageHeader
          eyebrow="Candidate Comparison"
          title="Side-by-Side Candidate Evaluation"
          description="Scores do not select a winner. Review missing evidence, work history, and human feedback together."
        />
        <Button
          as={Link}
          to={`/app/o/${orgId}/applications`}
          variant="secondary"
          size="sm"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          className="shrink-0"
        >
          Return to Applications
        </Button>
      </div>

      {ids.length < 2 ? (
        <EmptyState
          icon={UsersRound}
          title="Select at least two candidates to compare"
          description="Open your applications pipeline or candidate list, select two or more candidates using the checkboxes, then choose Compare."
          action={
            <Button as={Link} to={`/app/o/${orgId}/applications`} variant="primary" size="sm">
              Go to Applications
            </Button>
          }
        />
      ) : q.isLoading ? (
        <LoadingState message="Loading candidate comparison metrics and evidence…" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>Comparing <strong>{candidatesData.length}</strong> selected candidates side by side</span>
            <span className="italic">AI scores are advisory decision support and require human review.</span>
          </div>

          {/* Side-by-Side Horizontal Matrix Layout */}
          <div className="overflow-x-auto pb-4">
            <div className={`grid gap-4 min-w-[760px] ${
              candidatesData.length === 2 ? "grid-cols-2" : candidatesData.length === 3 ? "grid-cols-3" : "grid-cols-4"
            }`}>
              {candidatesData.map((x) => {
                const c = x.candidate || {};
                const m = x.match || {};
                const pr = x.parsedResume || {};
                const ivs = x.interviews || [];
                const latestIv = ivs[ivs.length - 1];
                const latestFeedback = latestIv?.feedback?.[0];

                return (
                  <article key={x.applicationId} className="panel flex flex-col justify-between p-5 space-y-5 bg-white shadow-xs">
                    {/* Candidate Identity Header */}
                    <div className="space-y-2 border-b border-ink-100 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">
                            {initials(c.name || "Candidate")}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-bold text-ink-950 truncate text-base">{c.name || "Candidate"}</h3>
                            <p className="text-xs text-ink-500 truncate">{c.email || "—"}</p>
                          </div>
                        </div>
                        <Badge tone={x.status === "hired" ? "success" : x.status === "rejected" ? "danger" : "brand"}>
                          {stageLabel(x.status)}
                        </Badge>
                      </div>

                      {c.headline && (
                        <p className="text-xs text-ink-600 line-clamp-2">{c.headline}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400">
                        {c.location ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {c.location}
                          </span>
                        ) : (
                          <span className="italic">— No location specified</span>
                        )}
                        {x.appliedAt && (
                          <span>Applied {formatDate(x.appliedAt)}</span>
                        )}
                      </div>
                    </div>

                    {/* AI Fit & Hybrid Match Section */}
                    <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/50 p-3.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold uppercase tracking-wider text-ink-600 text-[10px]">AI Fit &amp; Match</span>
                        {m.overallScore != null ? (
                          <Badge tone={m.overallScore >= 75 ? "success" : m.overallScore >= 50 ? "warning" : "ink"}>
                            {m.overallScore}% Fit
                          </Badge>
                        ) : (
                          <Badge tone="default">Score Pending</Badge>
                        )}
                      </div>

                      {m.overallScore != null ? (
                        <div className="space-y-2">
                          {m.recommendation && (
                            <p className="text-xs font-semibold text-ink-800">
                              Recommendation: <span className="capitalize text-brand-700">{m.recommendation}</span>
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
                            <div className="rounded-lg bg-white p-1.5 border border-ink-100">
                              <span className="text-ink-400 block text-[10px]">Skill Match</span>
                              <span className="font-bold text-ink-900">
                                {extractScore(m.componentScores?.skills) ?? extractScore(m.componentScores?.skillScore) ?? "—"}%
                              </span>
                            </div>
                            <div className="rounded-lg bg-white p-1.5 border border-ink-100">
                              <span className="text-ink-400 block text-[10px]">Experience Fit</span>
                              <span className="font-bold text-ink-900">
                                {extractScore(m.componentScores?.experience) ?? extractScore(m.componentScores?.experienceScore) ?? "—"}%
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-400 italic">No AI match calculated yet for this candidate.</p>
                      )}
                    </div>

                    {/* Matched vs Missing Skills */}
                    <div className="space-y-3 text-xs">
                      <h4 className="font-bold uppercase tracking-wider text-ink-500 text-[10px]">Skills Evidence</h4>
                      
                      {/* Matched Skills */}
                      <div>
                        <span className="text-[11px] font-semibold text-success-800 block mb-1">
                          Matched Skills ({(m.matchedSkills || []).length}):
                        </span>
                        {(m.matchedSkills || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {m.matchedSkills.map((sk) => (
                              <span key={sk} className="rounded bg-success-50 border border-success-200 px-1.5 py-0.5 text-[10px] font-medium text-success-800">
                                {sk}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-ink-400 italic">— No matched skills recorded</span>
                        )}
                      </div>

                      {/* Missing Required Skills */}
                      <div>
                        <span className="text-[11px] font-semibold text-danger-800 block mb-1">
                          Missing Required Skills:
                        </span>
                        {(m.missingRequiredSkills || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {m.missingRequiredSkills.map((sk) => (
                              <span key={sk} className="rounded bg-danger-50 border border-danger-200 px-1.5 py-0.5 text-[10px] font-medium text-danger-800">
                                {sk}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-success-700 font-medium">✓ None missing</span>
                        )}
                      </div>

                      {/* Missing Preferred Skills */}
                      {(m.missingPreferredSkills || []).length > 0 && (
                        <div>
                          <span className="text-[11px] font-semibold text-amber-800 block mb-1">
                            Missing Preferred Skills:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {m.missingPreferredSkills.map((sk) => (
                              <span key={sk} className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                {sk}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Experience & Background */}
                    <div className="space-y-2 border-t border-ink-100 pt-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold uppercase tracking-wider text-ink-500 text-[10px]">Experience</span>
                        <span className="font-bold text-ink-900">
                          {pr.experienceYears != null ? `${pr.experienceYears} yrs total` : "— Not specified"}
                        </span>
                      </div>
                      {(pr.experiences || []).length > 0 ? (
                        <div className="space-y-1.5">
                          {pr.experiences.slice(0, 2).map((exp, idx) => (
                            <div key={idx} className="rounded-lg bg-ink-50/50 p-2">
                              <p className="font-semibold text-ink-900 text-xs">{exp.title || "Role"}</p>
                              <p className="text-[11px] text-ink-500">{exp.company || "Company"}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-ink-400 italic">— No recent roles extracted from resume</p>
                      )}
                    </div>

                    {/* Education */}
                    <div className="space-y-2 border-t border-ink-100 pt-3 text-xs">
                      <span className="font-bold uppercase tracking-wider text-ink-500 text-[10px] block">Education</span>
                      {(pr.education || []).length > 0 ? (
                        <div className="space-y-1">
                          {pr.education.slice(0, 2).map((edu, idx) => (
                            <div key={idx} className="text-[11px]">
                              <span className="font-semibold text-ink-900">{edu.degree || edu.field || "Degree"}</span>
                              {edu.institution && <span className="text-ink-500"> · {edu.institution}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-ink-400 italic">— No education details on file</p>
                      )}
                    </div>

                    {/* Interview Feedback & Evaluation */}
                    <div className="space-y-2 border-t border-ink-100 pt-3 text-xs mt-auto">
                      <div className="flex items-center justify-between">
                        <span className="font-bold uppercase tracking-wider text-ink-500 text-[10px]">Interviews ({ivs.length})</span>
                        {latestFeedback?.recommendation ? (
                          <Badge tone={
                            latestFeedback.recommendation.includes("yes") ? "success" :
                            latestFeedback.recommendation === "mixed" ? "warning" : "danger"
                          }>
                            {latestFeedback.recommendation.replace("_", " ")}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-ink-400 italic">— Pending</span>
                        )}
                      </div>
                      {latestFeedback?.summary ? (
                        <p className="text-[11px] text-ink-600 line-clamp-3 italic bg-ink-50/50 p-2 rounded-lg">
                          "{latestFeedback.summary}"
                        </p>
                      ) : ivs.length > 0 ? (
                        <p className="text-[11px] text-ink-500">
                          Latest round: {latestIv.type || "Interview"} ({latestIv.status})
                        </p>
                      ) : (
                        <p className="text-[11px] text-ink-400 italic">— No interview feedback recorded yet</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export const CandidateSearch = () => {
  const orgId = useOrg(),
    [filters, set] = useState({ query: "", location: "", minExperience: "" }),
    debouncedQuery = useDebouncedValue(filters.query, 350),
    debouncedLocation = useDebouncedValue(filters.location, 350),
    q = useQuery({
      queryKey: [
        "candidate-search",
        orgId,
        debouncedQuery,
        debouncedLocation,
        filters.minExperience,
      ],
      queryFn: ({ signal }) =>
        recruitmentApi.search(
          orgId,
          {
            query: debouncedQuery || undefined,
            location: debouncedLocation || undefined,
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
        description="Search candidates by skills, experience and hiring needs."
      />
      <div className="panel mb-6 grid gap-3 p-4 sm:grid-cols-3">
        <Input
          aria-label="Search candidates"
          placeholder="Search by name or skill"
          value={filters.query}
          onChange={(e) => set((f) => ({ ...f, query: e.target.value }))}
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
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data?.data?.length ? (
        <div className="grid gap-3">
          {q.data.data.map((x) => (
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
              <Kpi label="Experience" value={x.experienceYears ?? "?"} />
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
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No candidates found"
          description={
            filters.skill || filters.location || filters.minExperience
              ? "No candidates match these filters. Try broadening your search."
              : "Candidates appear here once they apply to your open jobs."
          }
          action={
            (filters.query || filters.location || filters.minExperience) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => set({ query: "", location: "", minExperience: "" })}
              >
                Clear filters
              </Button>
            )
          }
        />
      )}
    </div>
  );
};
export const InterviewDetail = () => {
  const orgId = useOrg(),
    { interviewId } = useParams(),
    { user } = useAuth(),
    toast = useToast(),
    qc = useQueryClient(),
    [questions, setQuestions] = useState(null),
    [ratings, setRatings] = useState([
      { criterion: "Technical skills", score: 4, evidence: "" },
      { criterion: "Problem solving", score: 4, evidence: "" },
      { criterion: "Communication", score: 4, evidence: "" },
      { criterion: "Culture & Values", score: 4, evidence: "" },
    ]),
    [summary, setSummary] = useState(""),
    [recommendation, setRecommendation] = useState("yes"),
    [cancelOpen, setCancelOpen] = useState(false),
    [cancelReason, setCancelReason] = useState(""),
    [completeOpen, setCompleteOpen] = useState(false),
    [rescheduleOpen, setRescheduleOpen] = useState(false),
    [editForm, setEditForm] = useState({
      title: "",
      type: "video",
      scheduledStart: "",
      scheduledEnd: "",
      timezone: "UTC",
      location: "",
      meetingUrl: "",
    }),
    q = useQuery({
      queryKey: ["interview-detail", orgId, interviewId],
      queryFn: async () => {
        try {
          return await interviewApi.get(orgId, interviewId);
        } catch {
          const res = await interviewApi.list(orgId, { limit: 100 });
          const found = res?.data?.find((i) => i._id === interviewId);
          return { data: found };
        }
      },
    }),
    generate = useMutation({
      mutationFn: () => interviewApi.questions(orgId, interviewId),
      onSuccess: (r) => {
        setQuestions(r.data);
        toast.success("AI interview questions generated");
      },
      onError: (err) => toast.error(err.message),
    }),
    feedback = useMutation({
      mutationFn: () =>
        interviewApi.feedback(
          orgId,
          interviewId,
          ratings
            .filter((r) => r.criterion.trim())
            .map((r) => ({
              criterion: r.criterion.trim(),
              score: Math.min(5, Math.max(1, Number(r.score) || 1)),
              evidence: r.evidence,
            })),
          recommendation,
          summary,
        ),
      onSuccess: () => {
        toast.success("Scorecard feedback submitted and recorded");
        qc.invalidateQueries({ queryKey: ["interview-detail", orgId, interviewId] });
        qc.invalidateQueries({ queryKey: ["interviews", orgId] });
      },
      onError: (error) =>
        toast.error(
          /already been submitted/i.test(error?.message || "")
            ? "You've already submitted feedback for this interview."
            : error.message,
        ),
    }),
    cancel = useMutation({
      mutationFn: () => interviewApi.cancel(orgId, interviewId, cancelReason || "Cancelled by the hiring team"),
      onSuccess: () => {
        setCancelOpen(false);
        setCancelReason("");
        toast.success("Interview cancelled — the candidate has been notified");
        qc.invalidateQueries({ queryKey: ["interview-detail", orgId, interviewId] });
        qc.invalidateQueries({ queryKey: ["interviews", orgId] });
      },
      onError: (error) => toast.error(error.message),
    }),
    complete = useMutation({
      mutationFn: () => interviewApi.complete(orgId, interviewId),
      onSuccess: () => {
        setCompleteOpen(false);
        toast.success("Interview marked as completed");
        qc.invalidateQueries({ queryKey: ["interview-detail", orgId, interviewId] });
        qc.invalidateQueries({ queryKey: ["interviews", orgId] });
      },
      onError: (error) => toast.error(error.message),
    }),
    updateInterview = useMutation({
      mutationFn: (body) => interviewApi.update(orgId, interviewId, body),
      onSuccess: () => {
        setRescheduleOpen(false);
        toast.success("Interview schedule updated");
        qc.invalidateQueries({ queryKey: ["interview-detail", orgId, interviewId] });
        qc.invalidateQueries({ queryKey: ["interviews", orgId] });
      },
      onError: (err) => toast.error(err.message),
    });

  const interview = q.data?.data;

  const openRescheduleModal = () => {
    if (!interview) return;
    // Wall-clock value in the interview's own zone, so the form shows the time the recruiter set.
    const formatLocal = (d) => toZonedLocalInput(d, interview.timezone || DEFAULT_TIMEZONE);
    setEditForm({
      title: interview.title || "",
      type: interview.type || "video",
      scheduledStart: formatLocal(interview.scheduledStart),
      scheduledEnd: formatLocal(interview.scheduledEnd),
      timezone: interview.timezone || DEFAULT_TIMEZONE,
      location: interview.location || "",
      meetingUrl: interview.meetingUrl || "",
    });
    setRescheduleOpen(true);
  };

  if (q.isLoading) return <LoadingState />;
  if (q.error)
    return (
      <div className="page-wrap">
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  if (!interview)
    return (
      <div className="page-wrap">
        <EmptyState
          icon={Video}
          title="Interview not found"
          description="It may have been removed, or you don't have access to it."
          action={
            <Button as={Link} to={`/app/o/${orgId}/interviews`} variant="secondary" size="sm">
              Back to interviews
            </Button>
          }
        />
      </div>
    );

  const startDate = interview.scheduledStart ? new Date(interview.scheduledStart) : null;
  const duration = formatDuration(interview.scheduledStart, interview.scheduledEnd);
  const hasValidLink = isValidMeetingUrl(interview.meetingUrl);
  const canComplete =
    interview.scheduledStart &&
    new Date(interview.scheduledStart) <= new Date() &&
    !["completed", "cancelled"].includes(interview.status);
  const canCancel = !["completed", "cancelled"].includes(interview.status);
  const canReschedule = !["completed", "cancelled"].includes(interview.status);
  const feedbackList = interview.feedback || [];
  const hasUserSubmitted = feedbackList.some(
    (f) => String(f.evaluator?._id || f.evaluator) === String(user?._id || user?.id),
  );

  const calculateAverageScore = () => {
    if (!feedbackList.length) return null;
    let totalScore = 0;
    let totalRatings = 0;
    feedbackList.forEach((fb) => {
      (fb.ratings || []).forEach((r) => {
        if (r.score) {
          totalScore += Number(r.score);
          totalRatings += 1;
        }
      });
    });
    return totalRatings > 0 ? (totalScore / totalRatings).toFixed(1) : null;
  };

  const avgScore = calculateAverageScore();

  const RECOMMENDATION_META = {
    strong_yes: { label: "Strong Hire", variant: "success" },
    yes: { label: "Hire", variant: "success" },
    mixed: { label: "Mixed / Neutral", variant: "warning" },
    no: { label: "No Hire", variant: "danger" },
    strong_no: { label: "Strong No Hire", variant: "danger" },
  };

  return (
    <div className="page-wrap max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={`/app/o/${orgId}/interviews`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          ← Back to interviews
        </Link>
      </div>

      <PageHeader
        eyebrow="Interview workspace"
        title={interview.title || "Interview"}
        description="Grounded AI question kit, candidate attendance tracking, and multi-criteria scorecard evaluations."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canReschedule && (
              <Button size="sm" variant="secondary" onClick={openRescheduleModal}>
                Reschedule
              </Button>
            )}
            {canComplete && (
              <Button size="sm" variant="secondary" onClick={() => setCompleteOpen(true)}>
                Mark completed
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger-600 hover:text-danger-700"
                onClick={() => setCancelOpen(true)}
              >
                Cancel interview
              </Button>
            )}
            <StatusPill status={interview.status} />
          </div>
        }
      />

      <section aria-labelledby="meeting-panel-heading" className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="meeting-panel-heading" className="font-bold text-ink-950">
            Meeting and start
          </h2>
          <span className="text-xs text-ink-500">The candidate can join only after you start the interview.</span>
        </div>
        <MeetingStatus interview={interview} />
        <RecruiterMeetingControls orgId={orgId} interview={interview} />
      </section>

      {/* Candidate & Logistics Context Panel */}
      <div className="panel p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">
              {initials(interview.application?.candidate?.name || "Candidate")}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-ink-950">
                  {interview.application?.candidate?.name || "Candidate"}
                </h2>
                {interview.application?.candidate?.email && (
                  <span className="text-xs text-ink-400">({interview.application.candidate.email})</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-600">
                Application: <span className="font-semibold text-ink-900">{interview.application?.job?.title || "Job"}</span>
                {" · "}Stage: <Badge variant="brand">{stageLabel(interview.application?.status)}</Badge>
              </p>
              {interview.participants?.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                  <span className="font-semibold text-ink-700">Interviewers:</span>
                  {interview.participants.map((p) => (
                    <Badge key={p._id || p} variant="outline" className="text-[10px]">
                      {p.name || p.email || "Interviewer"}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

        {/* Candidate Confirmation Status Banner */}
        {interview.status === "confirmed" && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 p-3 text-xs text-success-900">
            <CheckCircle2 className="h-4 w-4 text-success-600 shrink-0" />
            <span>
              Candidate confirmed attendance on {interview.candidateConfirmedAt ? formatDate(interview.candidateConfirmedAt) : "schedule"}.
            </span>
          </div>
        )}

        {interview.status === "reschedule_requested" && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">Candidate requested reschedule</p>
              <p className="mt-0.5 text-warning-700">{interview.cancelledReason ? `"${interview.cancelledReason}"` : "Candidate requested a new time."}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={openRescheduleModal} className="shrink-0">
              Reschedule Now
            </Button>
          </div>
        )}

        {interview.status === "invited" && (
          <div className="mt-4 rounded-xl border border-warning-100 bg-warning-50/50 p-3 text-xs text-warning-800">
            Awaiting candidate attendance confirmation. An invitation email was sent to {interview.application?.candidate?.email || "the candidate"}.
          </div>
        )}

        {interview.status === "cancelled" && (
          <div className="mt-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-xs text-danger-800">
            <span className="font-bold">Interview Cancelled:</span> {interview.cancelledReason || "Cancelled by hiring team"}
          </div>
        )}

        {/* Logistics details */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3 border-t border-ink-100 pt-3 text-xs text-ink-600">
          <div>
            <span className="font-semibold text-ink-900">Scheduled Time:</span>
            <p className="mt-0.5 text-ink-600">{startDate ? formatDateTime(startDate, interview.timezone) : "Pending"}</p>
            {duration && <p className="text-[11px] text-ink-400">Duration: {duration}</p>}
          </div>
          <div>
            <span className="font-semibold text-ink-900">Timezone:</span>
            <p className="mt-0.5 text-ink-600">{interview.timezone || "UTC"}</p>
          </div>
          <div>
            <span className="font-semibold text-ink-900">Location / URL:</span>
            <p className="mt-0.5 text-ink-600">
              {interview.location || (hasValidLink ? "Online video meeting" : "Details pending")}
            </p>
          </div>
        </div>

        {interview.instructions && (
          <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-3.5 text-xs text-brand-950">
            <span className="font-semibold text-brand-900">Interview Instructions:</span>
            <p className="mt-1 whitespace-pre-line text-ink-700">{interview.instructions}</p>
          </div>
        )}
      </div>

      {/* Two-Column Workspace: AI Kit & Scorecards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Grounded Question Kit */}
        <section className="ai-panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Interview Question Kit</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => generate.mutate()}
              isLoading={generate.isPending}
              leftIcon={<WandSparkles className="h-4 w-4" />}
            >
              {questions ? "Regenerate" : "Generate Questions"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-ink-300">
            Grounded strictly in the job requirements and competency profile.
          </p>

          {generate.error && (
            <div className="mt-4">
              <ErrorCallout error={generate.error} />
            </div>
          )}

          {questions && (
            <div className="mt-5 space-y-3">
              <AIProvenance
                metadata={questions.metadata}
                confidence={questions.confidence}
                limitations={questions.limitations}
              />
              {questions.questions?.map((qItem, idx) => (
                <article className="rounded-xl bg-white/10 p-4" key={qItem.question || idx}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">{qItem.competency}</p>
                    <span className="text-[11px] text-ink-300">Question #{idx + 1}</span>
                  </div>
                  <p className="mt-2 text-sm text-white font-medium">{qItem.question}</p>
                  {qItem.rubric?.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-ink-300">
                      {qItem.rubric.map((r, rIdx) => (
                        <li key={rIdx}>• {r}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Multi-Criteria Scorecards */}
        <div className="space-y-6">
          {/* Feedback Submission Form */}
          <form
            className="panel p-6"
            onSubmit={(e) => {
              e.preventDefault();
              feedback.mutate();
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-ink-950">Evaluation Scorecard</h2>
                <p className="mt-1 text-xs text-ink-500">
                  Rate each criterion 1–5 with observable evidence. Objective criteria only.
                </p>
              </div>
              {avgScore && (
                <div className="text-right">
                  <span className="text-xs text-ink-400">Team Average</span>
                  <p className="text-lg font-black text-brand-700">{avgScore} / 5.0</p>
                </div>
              )}
            </div>

            {hasUserSubmitted ? (
              <div className="mt-5 rounded-xl border border-success-200 bg-success-50 p-4 text-xs text-success-900">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-success-600" />
                  <span>You have submitted feedback for this interview.</span>
                </div>
                <p className="mt-1 text-success-700">Your evaluation is recorded below in the team evaluation log.</p>
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-4">
                  {ratings.map((rating, index) => (
                    <div key={index} className="rounded-xl border border-ink-100 bg-ink-50/40 p-4">
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`Criterion ${index + 1}`}
                          label="Criterion"
                          value={rating.criterion}
                          onChange={(e) =>
                            setRatings((rows) =>
                              rows.map((r, i) => (i === index ? { ...r, criterion: e.target.value } : r)),
                            )
                          }
                          className="flex-1"
                        />
                        <div className="pt-0.5">
                          <SearchableSelect
                            aria-label={`Score for ${rating.criterion || `criterion ${index + 1}`}`}
                            label="Score"
                            value={String(rating.score)}
                            onChange={(e) =>
                              setRatings((rows) =>
                                rows.map((r, i) => (i === index ? { ...r, score: Number(e.target.value) } : r)),
                              )
                            }
                            className="w-24"
                            options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}/5` }))}
                          />
                        </div>
                        {ratings.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setRatings((rows) => rows.filter((_, i) => i !== index))}
                            aria-label={`Remove criterion ${index + 1}`}
                            className="mt-6 rounded-lg p-2 text-ink-400 transition hover:bg-danger-50 hover:text-danger-600"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <Textarea
                        className="mt-3"
                        label="Observable evidence &amp; notes"
                        placeholder="Specific answers or behaviors observed during the round..."
                        rows={2}
                        value={rating.evidence}
                        onChange={(e) =>
                          setRatings((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, evidence: e.target.value } : r)),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setRatings((rows) => [...rows, { criterion: "", score: 4, evidence: "" }])
                    }
                  >
                    + Add criterion
                  </Button>
                </div>

                <SearchableSelect
                  className="mt-5"
                  label="Overall recommendation"
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                  options={[
                    { value: "strong_yes", label: "Strong hire" },
                    { value: "yes", label: "Hire" },
                    { value: "mixed", label: "Mixed / Neutral" },
                    { value: "no", label: "No hire" },
                    { value: "strong_no", label: "Strong no" },
                  ]}
                />

                <Textarea
                  className="mt-3"
                  label="Executive evaluation summary"
                  placeholder="Summarize key strengths, reservations, and overall fit..."
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />

                <Button className="mt-4" type="submit" isLoading={feedback.isPending}>
                  Submit Scorecard
                </Button>
                {feedback.error && (
                  <div className="mt-3">
                    <ErrorCallout error={feedback.error} />
                  </div>
                )}
              </>
            )}
          </form>

          {/* Team Scorecards History */}
          {feedbackList.length > 0 && (
            <div className="panel p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <h3 className="font-bold text-ink-950">
                  Team Scorecards ({feedbackList.length})
                </h3>
                {avgScore && (
                  <span className="text-xs font-semibold text-brand-700">
                    Avg Score: {avgScore} / 5.0
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {feedbackList.map((fb, idx) => {
                  const recMeta = RECOMMENDATION_META[fb.recommendation] || {
                    label: fb.recommendation,
                    variant: "outline",
                  };
                  return (
                    <div key={fb._id || idx} className="rounded-xl border border-ink-100 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                            {initials(fb.evaluator?.name || "Evaluator")}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-ink-900">{fb.evaluator?.name || "Evaluator"}</p>
                            <p className="text-[10px] text-ink-400">
                              {fb.submittedAt ? formatDateTime(fb.submittedAt) : "Submitted"}
                            </p>
                          </div>
                        </div>
                        <Badge variant={recMeta.variant}>{recMeta.label}</Badge>
                      </div>

                      {/* Criteria ratings list */}
                      <div className="space-y-1.5 rounded-lg bg-ink-50/50 p-2.5">
                        {fb.ratings?.map((r, rIdx) => (
                          <div key={rIdx} className="text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-ink-800">{r.criterion}</span>
                              <span className="font-bold text-brand-700">{r.score} / 5</span>
                            </div>
                            {r.evidence && (
                              <p className="mt-0.5 text-[11px] text-ink-500 italic">"{r.evidence}"</p>
                            )}
                          </div>
                        ))}
                      </div>

                      {fb.summary && (
                        <p className="text-xs text-ink-700 bg-white p-2 rounded border border-ink-100">
                          {fb.summary}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reschedule Modal */}
      <Modal
        isOpen={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Reschedule Interview"
        description="Update interview time or details. An update notification will be sent to the candidate."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                updateInterview.mutate({
                  title: editForm.title,
                  type: editForm.type,
                  scheduledStart: editForm.scheduledStart
                    ? zonedLocalToUtc(editForm.scheduledStart, editForm.timezone)?.toISOString()
                    : undefined,
                  scheduledEnd: editForm.scheduledEnd
                    ? zonedLocalToUtc(editForm.scheduledEnd, editForm.timezone)?.toISOString()
                    : undefined,
                  timezone: editForm.timezone,
                  location: editForm.location,
                  meetingUrl: editForm.meetingUrl,
                })
              }
              isLoading={updateInterview.isPending}
            >
              Update &amp; Reschedule
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Title"
            value={editForm.title}
            onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-700">Starts</label>
              <DatePicker
                placeholder="Select start date & time"
                showTime
                value={editForm.scheduledStart}
                onChange={(e) => setEditForm((f) => ({ ...f, scheduledStart: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-700">Ends</label>
              <DatePicker
                placeholder="Select end date & time"
                showTime
                value={editForm.scheduledEnd}
                onChange={(e) => setEditForm((f) => ({ ...f, scheduledEnd: e.target.value }))}
              />
            </div>
          </div>
          <Input
            label="Timezone"
            value={editForm.timezone}
            onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))}
          />
          <Input
            label="Location (optional)"
            value={editForm.location}
            onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
          />
          <Input
            label="Meeting URL (optional)"
            value={editForm.meetingUrl}
            onChange={(e) => setEditForm((f) => ({ ...f, meetingUrl: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Complete Modal */}
      <ConfirmModal
        isOpen={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() => complete.mutate()}
        title="Mark this interview as completed?"
        description="The interview is preserved in the hiring record with its feedback. This can't be undone."
        confirmLabel="Mark completed"
        isLoading={complete.isPending}
      />

      {/* Cancel Modal */}
      <Modal
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this interview?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep interview
            </Button>
            <Button
              variant="danger"
              isLoading={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Cancel interview
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            The candidate will be notified that the interview was cancelled.
          </p>
          <Input
            label="Reason (optional)"
            placeholder="e.g. Position filled, scheduling conflict"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </div>
      </Modal>
      <InterviewHistory interview={interview} />
    </div>
  );
};
export const AnalyticsPage = () => {
  const orgId = useOrg();
  const [range, setRange] = useState("90d");
  const from = getPeriodFromDate(range);
  const q = useQuery({
    queryKey: ["analytics-recruitment", orgId, range],
    queryFn: () => analyticsApi.recruitment(orgId, { from }),
  });
  const ai = useQuery({
    queryKey: ["analytics-ai", orgId],
    queryFn: () => analyticsApi.ai(orgId),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.error)
    return (
      <div className="page-wrap">
        <ErrorState error={q.error} />
      </div>
    );

  const d = q.data?.data || {};
  const totalApps = d.applications || 0;
  const activeJobs = d.jobs || 0;
  const shortlistRate = Math.round((d.rates?.shortlist || 0) * 100);
  const interviewRate = Math.round((d.rates?.interview || 0) * 100);
  const hireRate = Math.round((d.rates?.hired || 0) * 100);

  const funnelStages = [
    { label: "Submitted", value: d.funnel?.submitted || 0, tone: "ink" },
    { label: "Under Review", value: d.funnel?.under_review || 0, tone: "ink" },
    { label: "Shortlisted", value: d.funnel?.shortlisted || 0, tone: "brand" },
    { label: "Interview", value: d.funnel?.interview || 0, tone: "brand" },
    { label: "Offer", value: d.funnel?.offer || 0, tone: "warning" },
    { label: "Hired", value: d.funnel?.hired || d.funnel?.Selected || 0, tone: "success" },
  ];

  const formatHours = (hrs) => {
    if (hrs == null) return "—";
    if (hrs < 24) return `${Math.round(hrs)} hrs`;
    return `${(hrs / 24).toFixed(1)} days`;
  };

  return (
    <div className="page-wrap space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          eyebrow="Hiring Insights"
          title="Recruitment Analytics & Intelligence"
          description="Real-time pipeline volume, conversion funnels, sourcing channels, and hiring velocity."
        />
        {/* Date Filter Range Controls */}
        <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-2xs">
          {[
            { id: "7d", label: "7 Days" },
            { id: "30d", label: "30 Days" },
            { id: "90d", label: "90 Days" },
            { id: "all", label: "All Time" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                range === item.id
                  ? "bg-brand-600 text-white shadow-xs"
                  : "text-ink-600 hover:text-ink-900 hover:bg-ink-50",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Total Applications"
          value={totalApps}
          icon={BriefcaseBusiness}
          hint={`In selected period (${range})`}
        />
        <Kpi
          label="Active Requisitions"
          value={activeJobs}
          icon={Layers}
          hint="Open jobs accepting applicants"
        />
        <Kpi
          label="Interview Stage"
          value={d.funnel?.interview || 0}
          tone="brand"
          icon={Video}
          hint={`${interviewRate}% interview rate`}
        />
        <Kpi
          label="Placements & Hires"
          value={d.funnel?.hired || d.funnel?.Selected || 0}
          tone="success"
          icon={Award}
          hint={`${hireRate}% overall conversion`}
        />
        <Kpi
          label="Avg AI Fit Score"
          value={d.ai?.averageAIScore ? `${Math.round(d.ai.averageAIScore)}%` : "—"}
          tone="brand"
          icon={Sparkles}
          hint={`${d.ai?.scoresGenerated || 0} candidates analyzed`}
        />
      </div>

      {/* Pipeline Funnel & Stage Progression */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="Candidate Pipeline Progression"
            description="Applications distribution and pass-through volume across hiring stages"
          >
            <div className="space-y-6 pt-2">
              <PipelineFunnel stages={funnelStages} />

              {/* Conversion Rate Tiles */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-ink-100">
                <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Shortlist Rate</p>
                  <p className="mt-1 text-lg font-extrabold text-ink-900">{shortlistRate}%</p>
                  <p className="text-[10px] text-ink-400">Applications → Shortlisted</p>
                </div>
                <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Interview Rate</p>
                  <p className="mt-1 text-lg font-extrabold text-brand-600">{interviewRate}%</p>
                  <p className="text-[10px] text-ink-400">Applications → Interview</p>
                </div>
                <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Hire Conversion</p>
                  <p className="mt-1 text-lg font-extrabold text-success-600">{hireRate}%</p>
                  <p className="text-[10px] text-ink-400">Applications → Hired</p>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Hiring Velocity & Turnaround Time */}
        <div>
          <SectionCard
            title="Stage Velocity"
            description="Average duration to reach key hiring stages"
          >
            {d.timeToStage && d.timeToStage.length > 0 ? (
              <div className="space-y-3 pt-1">
                {d.timeToStage.map((stage) => (
                  <div
                    key={stage._id}
                    className="flex items-center justify-between rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-ink-400" />
                      <span className="font-semibold text-ink-800 capitalize">
                        {String(stage._id).replaceAll("_", " ")}
                      </span>
                    </div>
                    <span className="font-bold text-ink-950 tabular-nums">
                      {formatHours(stage.averageHoursFromApplication)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-ink-400">
                <Clock className="mx-auto h-6 w-6 text-ink-300 mb-2" />
                <span>Turnaround metrics will appear as candidates transition through stages.</span>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Sourcing Attribution & Requisition Performance */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Candidate Sourcing & Attribution" description="Applications and hires broken down by channel">
          {d.sourcePerformance?.length ? (
            <div className="space-y-3 pt-1">
              {d.sourcePerformance.map((s) => {
                const apps = s.applications || 0;
                const hires = s.hires || 0;
                const conv = apps > 0 ? Math.round((hires / apps) * 100) : 0;
                const sharePct = totalApps > 0 ? Math.round((apps / totalApps) * 100) : 0;
                return (
                  <div key={s._id} className="rounded-xl border border-ink-100 bg-ink-50/40 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink-900 capitalize">
                          {String(s._id || "Direct").replaceAll("_", " ")}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {sharePct}% share
                        </Badge>
                      </div>
                      <span className="text-ink-600 font-medium">
                        <strong>{apps}</strong> apps · <strong className="text-success-700">{hires}</strong> hires ({conv}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-ink-200/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.max(sharePct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-ink-400 py-6 text-center">
              Source attribution data appears once candidates submit applications.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Requisition Breakdown" description="Candidate funnel by requisition">
          {d.jobPerformance?.length ? (
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {d.jobPerformance.map((job) => (
                <div
                  key={job._id}
                  className="flex items-center justify-between rounded-xl border border-ink-100 bg-white p-3 text-xs shadow-2xs"
                >
                  <div className="min-w-0 pr-3">
                    <p className="font-bold text-ink-900 truncate">Requisition #{String(job._id).slice(-6)}</p>
                    <p className="text-[11px] text-ink-500">{job.applications || 0} total applications</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                      {job.interviews || 0} interviews
                    </span>
                    <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold">
                      {job.hires || 0} hired
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-400 py-6 text-center">
              Requisition-level performance will populate as hiring progresses.
            </p>
          )}
        </SectionCard>
      </div>

      {/* AI Usage & Intelligence Signals */}
      <section className="ai-panel p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-400" />
          <h2 className="font-bold text-base text-white">AI Assistant Insights &amp; Model Operations</h2>
        </div>
        <p className="mt-1 text-xs text-ink-400">
          How frequently hiring intelligence features run. AI outputs serve strictly as decision support signals and never perform automated hiring actions.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ai.data?.data?.length ? (
            ai.data.data.map((x) => (
              <div key={JSON.stringify(x._id)} className="rounded-xl border border-white/10 bg-white/6 p-4">
                <p className="font-semibold text-white capitalize">{x._id.feature.replaceAll("_", " ")}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-ink-400">
                  <span>{x._id.provider} · {x._id.model || "default"}</span>
                  <span className="font-bold text-ink-200 tabular-nums">{x.runs} runs</span>
                </div>
                {x.averageLatencyMs && (
                  <p className="mt-1 text-[11px] text-ink-500">
                    Avg latency: {Math.round(x.averageLatencyMs)}ms · {x.fallbacks || 0} fallbacks
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs text-ink-400 py-3">
              AI feature telemetry will appear as your team interacts with Copilot and scoring tools.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
const INITIAL_COPILOT_MESSAGES = [];

const RECRUITER_WELCOME_CARDS = [
  {
    icon: UsersRound,
    title: "Analyze open job candidates",
    desc: "Evaluate applicant volume, experience depth, and qualification match across your open requisitions.",
    prompt: "Which candidates are strongest for my open roles?",
  },
  {
    icon: Sparkles,
    title: "Find strongest matching candidates",
    desc: "Identify top candidate profiles with verified skill evidence and high confidence scores.",
    prompt: "Which applicants have the strongest technical skill match?",
  },
  {
    icon: Layers,
    title: "Analyze recruitment pipeline",
    desc: "Detect bottlenecks in screening, interview scheduling, and offer velocity across all stages.",
    prompt: "Where is my hiring process slowing down?",
  },
  {
    icon: Video,
    title: "Prepare interview questions",
    desc: "Generate targeted technical and behavioral interview questions and objective scorecards.",
    prompt: "Generate targeted technical interview questions for full-stack developers.",
  },
  {
    icon: Award,
    title: "Summarize hiring performance",
    desc: "Review offer acceptance rates, time-to-hire metrics, and recruiter activity trends.",
    prompt: "Summarize offer acceptance rates and average time-to-hire metrics.",
  },
];

export const RecruiterCopilot = () => {
  const orgId = useOrg();
  const [activeCategory, setActiveCategory] = useState("candidate_analysis");
  const [messages, setMessages] = useState(() => {
    try {
      const stored = sessionStorage.getItem(`hiresmart_recruiter_copilot_chat_${orgId}`);
      return stored ? JSON.parse(stored) : INITIAL_COPILOT_MESSAGES;
    } catch {
      return INITIAL_COPILOT_MESSAGES;
    }
  });
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

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
  }, [messages]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`hiresmart_recruiter_copilot_chat_${orgId}`, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, orgId]);

  const mutation = useMutation({
    mutationFn: (text) => aiApi.runOrg(orgId, "recruiter_copilot", { text }),
    onSuccess: (res) => {
      const data = res?.data || {};
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${prev.length + 1}`,
          role: "assistant",
          content: data.answer || "I could not generate an answer for that query.",
          data,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (err, promptText) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${prev.length + 1}`,
          role: "assistant",
          isError: true,
          lastPrompt: promptText,
          content: err.message || "Failed to communicate with AI Assistant. Please try again.",
          timestamp: new Date(),
        },
      ]);
    },
  });

  const handleSend = (textToSend) => {
    const prompt = (typeof textToSend === "string" ? textToSend : input).trim();
    if (!prompt || mutation.isPending) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${prev.length + 1}`,
        role: "user",
        content: prompt,
        timestamp: new Date(),
      },
    ]);
    setInput("");
    mutation.mutate(prompt);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages(INITIAL_COPILOT_MESSAGES);
    setInput("");
    try {
      sessionStorage.removeItem(`hiresmart_recruiter_copilot_chat_${orgId}`);
    } catch {
      // ignore
    }
  };

  const currentCategoryObj =
    RECRUITER_COPILOT_CATEGORIES.find((c) => c.id === activeCategory) ||
    RECRUITER_COPILOT_CATEGORIES[0];

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
              <h1 className="text-lg font-bold text-ink-900">Recruiter Copilot</h1>
              <span className="text-xs font-semibold text-ink-500">Recruitment Copilot</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
                <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                Active
              </span>
            </div>
            <p className="text-xs text-ink-500">
              Conversational hiring intelligence & pipeline decision support grounded in verified applicant data.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleClearChat}
            leftIcon={<Trash2 className="h-3.5 w-3.5 text-ink-500" />}
            title="Start new conversation"
          >
            New Conversation
          </Button>
        </div>
      </div>

      {/* 6 Category Tabs - Flex Wrap, No Horizontal Scrollbars */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1 shrink-0 border-b border-ink-100">
        {RECRUITER_COPILOT_CATEGORIES.map((cat) => (
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
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center my-auto py-10 px-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 border border-brand-200 shadow-xs mb-3">
              <Bot className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-ink-900">How can I assist your hiring workflow today?</h2>
            <p className="mt-1 text-sm text-ink-500 max-w-lg mx-auto">
              Ask about candidate suitability, pipeline bottlenecks, job requisition benchmarks, or generate interview questions and scorecards.
            </p>

            {/* 5 Onboarding Suggestion Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-w-4xl w-full mx-auto mt-6">
              {RECRUITER_WELCOME_CARDS.map((card, idx) => (
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

        {messages.map((m) => {
          const isUser = m.role === "user";
          return (
            <div
              key={m.id}
              className={cn("flex items-start gap-3", isUser ? "justify-end" : "justify-start")}
            >
              {!isUser && (
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200 shadow-xs">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={cn(
                  "rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-xs transition-all",
                  isUser
                    ? "max-w-[80%] rounded-tr-xs bg-brand-600 text-white font-medium"
                    : m.isError
                      ? "max-w-[85%] rounded-tl-xs border border-danger-200 bg-danger-50 text-danger-900"
                      : "max-w-[85%] rounded-tl-xs border border-ink-200/80 bg-white text-ink-900",
                )}
              >
                {/* AI Provenance / Confidence if available */}
                {!isUser && m.data && (
                  <div className="mb-2.5 pb-2 border-b border-ink-100">
                    <AIProvenance
                      metadata={m.data.metadata}
                      confidence={m.data.confidence}
                      limitations={m.data.limitations}
                    />
                  </div>
                )}

                {/* Message Body */}
                <ChatMessageContent
                  text={m.content}
                  metadata={m.data?.metadata}
                  isUser={isUser}
                />

                {/* Proposed Actions if present */}
                {!isUser &&
                  m.data?.proposedActions?.map((a, i) => (
                    <div
                      key={i}
                      className="mt-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3 text-xs"
                    >
                      <p className="font-semibold text-ink-900">{a.description}</p>
                      <p className="mt-1 text-[11px] text-amber-700">
                        Recommendation only — HireSmart requires human verification before action.
                      </p>
                    </div>
                  ))}

                {m.isError && m.lastPrompt && (
                  <div className="mt-2.5 pt-2 border-t border-danger-200">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleSend(m.lastPrompt)}
                      className="text-danger-700 border-danger-300 hover:bg-danger-100"
                    >
                      Retry
                    </Button>
                  </div>
                )}

                <p
                  className={cn(
                    "mt-2 text-[10px]",
                    isUser ? "text-brand-100 text-right" : "text-ink-400",
                  )}
                >
                  {formatDateTime(m.timestamp)}
                </p>
              </div>

              {isUser && (
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-900 text-white text-xs font-bold shadow-xs">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}

        {/* Loading / Typing Indicator */}
        {mutation.isPending && (
          <div className="flex items-start gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200 shadow-xs">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-xs border border-ink-200 bg-white p-4 shadow-xs flex items-center gap-2 text-xs text-ink-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand-600" />
              <span>Analyzing recruitment signals and formulating insights...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Modern Sticky Bottom Composer */}
      <div className="pt-3 border-t border-ink-200 bg-white shrink-0 space-y-2">
        <div className="relative flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ask about candidate suitability, hiring bottlenecks, job descriptions..."
            className="w-full resize-none rounded-xl border border-ink-200 bg-white p-3 pr-12 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <Button
            size="md"
            variant="primary"
            onClick={() => handleSend()}
            disabled={!input.trim() || mutation.isPending}
            isLoading={mutation.isPending}
            className="h-11 px-4 shrink-0 rounded-xl"
            leftIcon={<Send className="h-4 w-4" />}
          >
            Send
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] text-ink-400 px-1">
          <span>AI responses are decision-support signals grounded in verified organization and candidate data.</span>
          <span>
            Press{" "}
            <kbd className="rounded border border-ink-200 bg-ink-50 px-1 py-0.5 font-mono text-[10px]">
              Enter
            </kbd>{" "}
            to send,{" "}
            <kbd className="rounded border border-ink-200 bg-ink-50 px-1 py-0.5 font-mono text-[10px]">
              Shift+Enter
            </kbd>{" "}
            for new line
          </span>
        </div>
      </div>
    </div>
  );
};
export { TeamManagementPage as TeamPage } from "./TeamManagementPage";
export { CompanyProfileCard } from "./CompanyProfileCard";
export const JobApprovalToggle = () => (
  <section className="panel mb-4 flex flex-wrap items-center gap-4 p-4">
    <div className="min-w-56 flex-1">
      <p className="font-bold">Job Approval</p>
      <p className="mt-0.5 text-sm text-ink-500">
        Every new job — and every edit to a published job — is reviewed by the platform before it is
        (or stays) visible to candidates.
      </p>
    </div>
    <Badge variant="brand">Always on</Badge>
  </section>
);
