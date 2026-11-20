import { useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  RefreshCw,
  Users,
  Video,
  ExternalLink,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Modal from "../../components/ui/Modal";
import { EmptyState, ErrorState, SkeletonList } from "../../components/ui/States";
import { PageHeader, StatusPill } from "../../components/Product";
import MeetingStatus from "../../components/interviews/MeetingStatus";
import RecruiterScheduleActions from "../../components/interviews/RecruiterScheduleActions";
import { useAuth } from "../../context/useAuth";
import { interviewApi, jobsApi, integrationsApi } from "../../lib/api";
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

const isDateInRange = (dateStr, range, now) => {
  if (range === "all" || !dateStr) return true;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (range === "today") return itemDay === todayDay;
  if (range === "upcoming_7d") {
    const sevenDaysLater = todayDay + 7 * 24 * 3600 * 1000;
    return itemDay >= todayDay && itemDay <= sevenDaysLater;
  }
  if (range === "this_month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (range === "past") {
    return d.getTime() < now.getTime();
  }
  return true;
};

const QuickViewModal = ({ isOpen, onClose, interview, orgId }) => {
  if (!interview) return null;
  const id = idOf(interview);
  const candidateName = interviewCandidateName(interview);
  const jobTitle = interviewJobTitle(interview);
  const candidateEmail = interview.application?.candidate?.email || "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Interview Quick View" size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-ink-950">{interview.title || "Interview"}</h3>
              <Badge variant="outline" className="text-xs">
                {roundLabel(interview.round)}
              </Badge>
              {interview.type && (
                <Badge variant="outline" className="text-xs capitalize">
                  {String(interview.type).replaceAll("_", " ")}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-700">
              <span className="font-semibold text-ink-900">{candidateName}</span>
              {candidateEmail && <span className="text-ink-400"> ({candidateEmail})</span>} · {jobTitle}
            </p>
          </div>
          <StatusPill status={interview.status} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-xs text-ink-600 bg-ink-50/60 p-3 rounded-xl border border-ink-100">
          <div className="space-y-1">
            <span className="font-semibold text-ink-900">Scheduled Time</span>
            <p>{formatInZone(interview.scheduledStart, interview.timezone)}</p>
            <p className="text-ink-400">Timezone: {interview.timezone || "UTC"}</p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-ink-900">Meeting Info</span>
            <MeetingStatus interview={interview} />
          </div>
        </div>

        {/* Confirmation status banner */}
        {interview.status === "confirmed" && (
          <div className="flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 p-2.5 text-xs text-success-900">
            <CheckCircle2 className="h-4 w-4 text-success-600 shrink-0" />
            <span>Candidate confirmed attendance</span>
          </div>
        )}
        {interview.status === "invited" && (
          <div className="flex items-center gap-2 rounded-xl border border-warning-200 bg-warning-50 p-2.5 text-xs text-warning-900">
            <AlertCircle className="h-4 w-4 text-warning-600 shrink-0" />
            <span>Awaiting candidate attendance confirmation</span>
          </div>
        )}
        {interview.status === "reschedule_requested" && (
          <div className="flex items-center gap-2 rounded-xl border border-warning-200 bg-warning-50 p-2.5 text-xs text-warning-900">
            <AlertCircle className="h-4 w-4 text-warning-600 shrink-0" />
            <span>Candidate requested reschedule: {interview.cancelledReason || "New time requested"}</span>
          </div>
        )}

        {interview.instructions && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-xs text-brand-950">
            <span className="font-semibold text-brand-900">Interview Instructions:</span>
            <p className="mt-1 whitespace-pre-line text-ink-700">{interview.instructions}</p>
          </div>
        )}

        <div className="pt-2">
          <RecruiterScheduleActions orgId={orgId} interview={interview} />
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button as={Link} to={`/app/o/${orgId}/interviews/${id}`} size="sm" rightIcon={<ExternalLink className="h-3.5 w-3.5" />}>
            Full Workspace &amp; Scorecard
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const InterviewCard = ({ orgId, interview }) => {
  const id = idOf(interview);
  const name = interviewCandidateName(interview);
  const job = interviewJobTitle(interview);

  return (
    <article aria-labelledby={`interview-${id}`} className="panel flex flex-col gap-4 p-5 hover:border-ink-300 transition">
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
            <span className="font-semibold text-ink-900">{name}</span> · {job}
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

      {interview.instructions && (
        <div className="rounded-lg bg-ink-50 p-2 text-xs text-ink-600 line-clamp-2">
          <span className="font-semibold text-ink-800">Instructions: </span>
          {interview.instructions}
        </div>
      )}

      <RecruiterScheduleActions orgId={orgId} interview={interview} />
    </article>
  );
};

const CalendarView = ({ interviews, currentDate, onNavigate, onSelectInterview }) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startingDayOfWeek = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const prevMonthLastDay = new Date(year, month, 0).getDate();

  const calendarDays = useMemo(() => {
    const days = [];
    // Previous month padding days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }
    // Next month padding days to complete grid (6 rows of 7 = 42 or standard multiples)
    const totalSlots = days.length <= 35 ? 35 : 42;
    const remaining = totalSlots - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }
    return days;
  }, [year, month, startingDayOfWeek, daysInMonth, prevMonthLastDay]);

  const interviewsByDate = useMemo(() => {
    const map = {};
    for (const interview of interviews) {
      if (!interview.scheduledStart) continue;
      const d = new Date(interview.scheduledStart);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(interview);
    }
    return map;
  }, [interviews]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const monthName = currentDate.toLocaleString("default", { month: "long" });

  return (
    <div className="panel overflow-hidden border border-ink-200">
      {/* Calendar header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/50 p-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-ink-950">
            {monthName} {year}
          </h3>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => onNavigate(new Date())}
          >
            Today
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onNavigate(new Date(year, month - 1, 1))}
            className="rounded-lg p-1.5 text-ink-600 transition hover:bg-ink-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => onNavigate(new Date(year, month + 1, 1))}
            className="rounded-lg p-1.5 text-ink-600 transition hover:bg-ink-200"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday columns */}
      <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50/30 text-center text-xs font-semibold text-ink-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="py-2.5">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-ink-100 bg-white">
        {calendarDays.map((cell, idx) => {
          const dateKey = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, "0")}-${String(cell.date.getDate()).padStart(2, "0")}`;
          const isToday = dateKey === todayStr;
          const dayInterviews = interviewsByDate[dateKey] || [];

          return (
            <div
              key={idx}
              className={`min-h-[100px] p-2 transition ${
                cell.isCurrentMonth ? "bg-white" : "bg-ink-50/40 text-ink-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                    isToday
                      ? "bg-brand-600 text-white font-bold"
                      : cell.isCurrentMonth
                      ? "text-ink-800"
                      : "text-ink-400"
                  }`}
                >
                  {cell.date.getDate()}
                </span>
                {dayInterviews.length > 0 && (
                  <span className="text-[10px] font-semibold text-ink-500">
                    {dayInterviews.length} {dayInterviews.length === 1 ? "event" : "events"}
                  </span>
                )}
              </div>

              <div className="mt-1 space-y-1">
                {dayInterviews.slice(0, 3).map((item) => {
                  const startTime = item.scheduledStart
                    ? new Date(item.scheduledStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "";
                  const candidateName = interviewCandidateName(item);

                  const statusColor =
                    item.status === "completed"
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : item.status === "cancelled"
                      ? "bg-danger-50 text-danger-700 border-danger-200"
                      : item.status === "confirmed"
                      ? "bg-success-50 text-success-800 border-success-200"
                      : "bg-brand-50 text-brand-800 border-brand-200";

                  return (
                    <button
                      key={idOf(item)}
                      type="button"
                      onClick={() => onSelectInterview(item)}
                      title={`${item.title} - ${candidateName} (${startTime})`}
                      className={`w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-medium transition hover:shadow-xs ${statusColor}`}
                    >
                      <span className="font-bold">{startTime}</span> {candidateName}
                    </button>
                  );
                })}
                {dayInterviews.length > 3 && (
                  <button
                    type="button"
                    onClick={() => onSelectInterview(dayInterviews[3])}
                    className="w-full text-center text-[10px] text-ink-500 hover:text-ink-900"
                  >
                    +{dayInterviews.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RecruiterInterviewDashboard = () => {
  const orgId = useOrg();
  const [tab, setTab] = useState("upcoming");
  const [jobId, setJobId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [sortOrder, setSortOrder] = useState("date_asc");
  const [viewMode, setViewMode] = useState("list"); // "list" | "calendar"
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selectedInterview, setSelectedInterview] = useState(null);

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

  const googleIntegration = useQuery({
    queryKey: ["google-integration-status"],
    queryFn: () => integrationsApi.googleStatus(),
    enabled: Boolean(orgId),
    retry: false,
  });

  const allInterviews = interviews.data?.data || [];
  const groups = groupRecruiterInterviews(allInterviews, now);

  // 6 KPI Status Metrics
  const totalCount = allInterviews.length;
  const upcomingCount = groups.upcoming.length;
  const completedCount = groups.completed.length;
  const pendingConfirmationCount = allInterviews.filter(
    (i) => i.status === "invited" && !i.candidateConfirmedAt
  ).length;
  const rescheduleRequestsCount = allInterviews.filter(
    (i) => i.status === "reschedule_requested"
  ).length;
  const cancelledCount = groups.cancelled.length;

  // Filtering logic
  const term = search.trim().toLowerCase();

  // Base list depending on tab (or all when status filter is explicitly selected)
  const basePool = statusFilter ? allInterviews : groups[tab] || [];

  let visibleInterviews = basePool.filter((i) => {
    // Search term
    if (term) {
      const matches = [i.title, interviewCandidateName(i), interviewJobTitle(i)].some((v) =>
        (v || "").toLowerCase().includes(term)
      );
      if (!matches) return false;
    }
    // Status filter
    if (statusFilter && i.status !== statusFilter) return false;
    // Date range filter
    if (!isDateInRange(i.scheduledStart, dateRange, now)) return false;
    return true;
  });

  // Sorting
  visibleInterviews = [...visibleInterviews].sort((a, b) => {
    if (sortOrder === "date_asc") {
      const aT = a.scheduledStart ? new Date(a.scheduledStart).getTime() : 0;
      const bT = b.scheduledStart ? new Date(b.scheduledStart).getTime() : 0;
      return aT - bT;
    }
    if (sortOrder === "date_desc") {
      const aT = a.scheduledStart ? new Date(a.scheduledStart).getTime() : 0;
      const bT = b.scheduledStart ? new Date(b.scheduledStart).getTime() : 0;
      return bT - aT;
    }
    if (sortOrder === "candidate_asc") {
      return interviewCandidateName(a).localeCompare(interviewCandidateName(b));
    }
    if (sortOrder === "title_asc") {
      return (a.title || "").localeCompare(b.title || "");
    }
    return 0;
  });

  const googleConnected = googleIntegration.data?.data?.connected;
  const googleSetupRequired = googleIntegration.data?.data?.status === "setup_required";

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Interviews"
        title="Interview schedule"
        description="Upcoming, past, completed and cancelled interviews. Start an interview when you are ready; the candidate can join only after you start."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<RefreshCw className={`h-4 w-4 ${interviews.isFetching ? "animate-spin" : ""}`} />}
              onClick={() => interviews.refetch()}
              disabled={interviews.isFetching}
            >
              Refresh
            </Button>
            <Button
              as={Link}
              to={`/app/o/${orgId}/interviews/schedule`}
              leftIcon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}
            >
              Schedule interview
            </Button>
          </div>
        }
      />

      {/* Google Calendar & Google Meet Integration Status Banner */}
      <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                googleConnected
                  ? "bg-success-50 text-success-700"
                  : googleSetupRequired
                  ? "bg-amber-50 text-amber-700"
                  : "bg-ink-100 text-ink-600"
              }`}
            >
              <Video className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink-950">Google Calendar &amp; Meet Integration</span>
                {googleConnected ? (
                  <Badge variant="success" className="text-[10px]">
                    Connected
                  </Badge>
                ) : googleSetupRequired ? (
                  <Badge variant="warning" className="text-[10px]">
                    Setup Required
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Not Connected
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-600">
                {googleConnected
                  ? "Google Calendar is linked. Real Google Meet links are generated automatically for video rounds."
                  : googleSetupRequired
                  ? "Google Calendar requires administrator OAuth configuration. Manual meeting URLs can be provided for any round."
                  : "Connect your Google Calendar to automatically schedule meetings and create Google Meet links."}
              </p>
            </div>
          </div>
          <Button
            as={Link}
            to="/app/settings/integrations"
            variant="secondary"
            size="sm"
            className="shrink-0"
          >
            {googleConnected ? "Manage Integration" : "Integration Settings"}
          </Button>
        </div>
      </div>

      {/* 6 KPI Status Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          data-testid="kpi-total"
          onClick={() => {
            setStatusFilter("");
            setTab("upcoming");
          }}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-ink-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total</span>
            <Users className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-950">{totalCount}</div>
          <span className="mt-1 text-[11px] text-ink-500">All interviews</span>
        </button>

        <button
          type="button"
          data-testid="kpi-upcoming"
          onClick={() => {
            setStatusFilter("");
            setTab("upcoming");
          }}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-brand-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Upcoming</span>
            <CalendarCheck className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-brand-700">{upcomingCount}</div>
          <span className="mt-1 text-[11px] text-ink-500">Scheduled ahead</span>
        </button>

        <button
          type="button"
          data-testid="kpi-completed"
          onClick={() => {
            setStatusFilter("");
            setTab("completed");
          }}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-success-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-success-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Completed</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-success-700">{completedCount}</div>
          <span className="mt-1 text-[11px] text-ink-500">Finished rounds</span>
        </button>

        <button
          type="button"
          data-testid="kpi-pending-confirmation"
          onClick={() => setStatusFilter("invited")}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-warning-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-warning-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Conf.</span>
            <Clock className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-warning-700">{pendingConfirmationCount}</div>
          <span className="mt-1 text-[11px] text-ink-500">Awaiting candidate</span>
        </button>

        <button
          type="button"
          data-testid="kpi-reschedule-requests"
          onClick={() => setStatusFilter("reschedule_requested")}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-warning-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-warning-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Reschedule</span>
            <CalendarClock className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-warning-700">{rescheduleRequestsCount}</div>
          <span className="mt-1 text-[11px] text-ink-500">Requested by candidate</span>
        </button>

        <button
          type="button"
          data-testid="kpi-cancelled"
          onClick={() => {
            setStatusFilter("");
            setTab("cancelled");
          }}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-danger-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-danger-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Cancelled</span>
            <CalendarX className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-danger-700">{cancelledCount}</div>
          <span className="mt-1 text-[11px] text-ink-500">Cancelled rounds</span>
        </button>
      </div>

      {/* Filter and Control Bar */}
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label="Search"
            placeholder="Candidate, job or title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchableSelect
            label="Job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            options={[
              { value: "", label: "All jobs" },
              ...(jobs.data?.data || []).map((job) => ({ value: idOf(job), label: job.title })),
            ]}
          />
          <SearchableSelect
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "", label: "All statuses" },
              { value: "invited", label: "Invited (Pending Confirmation)" },
              { value: "confirmed", label: "Confirmed" },
              { value: "reschedule_requested", label: "Reschedule requested" },
              { value: "rescheduled", label: "Rescheduled" },
              { value: "in_progress", label: "In progress" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
          <SearchableSelect
            label="Date range"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            options={[
              { value: "all", label: "All dates" },
              { value: "today", label: "Today" },
              { value: "upcoming_7d", label: "Next 7 days" },
              { value: "this_month", label: "This month" },
              { value: "past", label: "Past dates" },
            ]}
          />
          <SearchableSelect
            label="Sort by"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            options={[
              { value: "date_asc", label: "Date (earliest first)" },
              { value: "date_desc", label: "Date (latest first)" },
              { value: "candidate_asc", label: "Candidate (A-Z)" },
              { value: "title_asc", label: "Title (A-Z)" },
            ]}
          />
        </div>

        {/* View Mode Toggle & Active Filter indicator */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-600">View:</span>
            <div className="flex items-center rounded-xl border border-ink-200 bg-ink-50/60 p-1">
              <button
                type="button"
                aria-label="List view"
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  viewMode === "list" ? "bg-white text-ink-950 shadow-xs" : "text-ink-600 hover:text-ink-950"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
              <button
                type="button"
                aria-label="Calendar view"
                onClick={() => setViewMode("calendar")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  viewMode === "calendar" ? "bg-white text-ink-950 shadow-xs" : "text-ink-600 hover:text-ink-950"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>
          </div>

          {statusFilter && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ink-600">
                Filtered by status: <strong className="text-ink-900">{statusFilter.replaceAll("_", " ")}</strong>
              </span>
              <button
                type="button"
                onClick={() => setStatusFilter("")}
                className="font-semibold text-brand-600 hover:underline"
              >
                Clear status filter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === "calendar" ? (
        <CalendarView
          interviews={visibleInterviews}
          currentDate={calendarDate}
          onNavigate={setCalendarDate}
          onSelectInterview={(item) => setSelectedInterview(item)}
        />
      ) : (
        <div className="space-y-4">
          {!statusFilter && (
            <div
              role="tablist"
              aria-label="Interview groups"
              className="flex flex-wrap gap-1 rounded-xl border border-ink-100 bg-ink-50/60 p-1"
            >
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
          )}

          <div id="interview-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-4">
            {interviews.isLoading ? (
              <SkeletonList rows={3} />
            ) : interviews.error ? (
              <ErrorState error={interviews.error} onRetry={() => interviews.refetch()} />
            ) : visibleInterviews.length === 0 ? (
              <EmptyState
                icon={CalendarPlus}
                title={
                  search || statusFilter || dateRange !== "all"
                    ? "No interviews match those filters"
                    : `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} interviews`
                }
                description={
                  tab === "upcoming"
                    ? "Schedule an interview from a job's applicants to see it here."
                    : "Interviews move here when their time has passed, they are completed, or they are cancelled."
                }
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {visibleInterviews.map((interview) => (
                  <InterviewCard
                    key={idOf(interview)}
                    orgId={orgId}
                    interview={interview}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick view modal */}
      <QuickViewModal
        isOpen={Boolean(selectedInterview)}
        onClose={() => setSelectedInterview(null)}
        interview={selectedInterview}
        orgId={orgId}
      />
    </div>
  );
};

export default RecruiterInterviewDashboard;
