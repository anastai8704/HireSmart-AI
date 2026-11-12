import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Clock, Video } from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input, { Select } from "../../components/ui/Input";
import { EmptyState, ErrorState, SkeletonList } from "../../components/ui/States";
import { PageHeader, StatusPill } from "../../components/Product";
import MeetingStatus from "../../components/interviews/MeetingStatus";
import RecruiterScheduleActions from "../../components/interviews/RecruiterScheduleActions";
import { useAuth } from "../../context/useAuth";
import { interviewApi, jobsApi } from "../../lib/api";
import {
  formatInZone,
  groupRecruiterInterviews,
  interviewCandidateName,
  interviewJobTitle,
  roundLabel,
} from "../../lib/interviewWorkflow";

const idOf = (value) => value?.id || value?._id || "";
const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const useOrg = () => {
  const { organizationId } = useParams();
  const auth = useAuth();
  return organizationId || auth.organizationId;
};

const InterviewCard = ({ orgId, interview }) => {
  const id = idOf(interview);
  const name = interviewCandidateName(interview);
  const job = interviewJobTitle(interview);
  return (
    <article aria-labelledby={`interview-${id}`} className="panel flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`interview-${id}`} className="text-base font-bold text-ink-950">
              {interview.title || "Interview"}
            </h3>
            <Badge variant="outline" className="text-[11px]">
              {roundLabel(interview.round)}
            </Badge>
            {interview.type && (
              <Badge variant="outline" className="text-[11px] capitalize">
                {String(interview.type).replaceAll("_", " ")}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-700">
            <span className="font-semibold">{name}</span> · {job}
          </p>
        </div>
        <StatusPill status={interview.status} />
      </div>

      <dl className="grid gap-2 text-xs text-ink-600 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
          <dd>
            {formatInZone(interview.scheduledStart, interview.timezone)}
            <span className="text-ink-500"> ({interview.timezone || "UTC"})</span>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Video className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
          <dd className="min-w-0">
            <MeetingStatus interview={interview} compact />
          </dd>
        </div>
      </dl>

      <RecruiterScheduleActions orgId={orgId} interview={interview} />
    </article>
  );
};

const RecruiterInterviewDashboard = () => {
  const orgId = useOrg();
  const [tab, setTab] = useState("upcoming");
  const [jobId, setJobId] = useState("");
  const [search, setSearch] = useState("");
  const now = new Date();

  const jobs = useQuery({
    queryKey: ["jobs-org", orgId, "scheduler"],
    queryFn: () => jobsApi.orgList(orgId, { limit: 100 }),
    enabled: Boolean(orgId),
  });
  const interviews = useQuery({
    queryKey: ["interviews", orgId, { jobId }],
    queryFn: () => interviewApi.list(orgId, { limit: 100, ...(jobId ? { jobId } : {}) }),
    enabled: Boolean(orgId),
  });

  const groups = groupRecruiterInterviews(interviews.data?.data || [], now);
  const term = search.trim().toLowerCase();
  const visible = (groups[tab] || []).filter((i) =>
    term
      ? [i.title, interviewCandidateName(i), interviewJobTitle(i)].some((v) => (v || "").toLowerCase().includes(term))
      : true,
  );

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Interviews"
        title="Interview schedule"
        description="Upcoming, past, completed and cancelled interviews. Start an interview when you are ready; the candidate can join only after you start."
        action={
          <Button as={Link} to={`/app/o/${orgId}/interviews/schedule`} leftIcon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}>
            Schedule interview
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <Select
          label="Job"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          options={[
            { value: "", label: "All jobs" },
            ...(jobs.data?.data || []).map((job) => ({ value: idOf(job), label: job.title })),
          ]}
        />
        <Input
          label="Search"
          placeholder="Candidate, job or title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div role="tablist" aria-label="Interview groups" className="flex flex-wrap gap-1 rounded-xl border border-ink-100 bg-ink-50/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="interview-tabpanel"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              tab === t.id ? "bg-ink-950 text-white shadow-sm" : "text-ink-600 hover:bg-white/80"
            }`}
          >
            {t.label} ({(groups[t.id] || []).length})
          </button>
        ))}
      </div>

      <div id="interview-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-4">
        {interviews.isLoading ? (
          <SkeletonList rows={3} />
        ) : interviews.error ? (
          <ErrorState error={interviews.error} onRetry={() => interviews.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title={search ? "No interviews match that search" : `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} interviews`}
            description={
              tab === "upcoming"
                ? "Schedule an interview from a job's applicants to see it here."
                : "Interviews move here when their time has passed, they are completed, or they are cancelled."
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visible.map((interview) => (
              <InterviewCard key={idOf(interview)} orgId={orgId} interview={interview} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecruiterInterviewDashboard;
