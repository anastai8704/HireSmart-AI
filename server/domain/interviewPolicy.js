// Interview rules as pure functions (Requirements 3, 6 and 10). The controller loads records and applies these.
// All instants are JS Dates (UTC internally). Display conversion to Asia/Kolkata happens in the client.

/** The recruiter may start the interview this long before its scheduled start. */
const START_WINDOW_BEFORE_MS = 15 * 60 * 1000;
/** After the scheduled end, a late start is still allowed for this long. */
const START_WINDOW_AFTER_END_MS = 60 * 60 * 1000;
/** A new interview may not start more than this far in the past (clock skew tolerance). */
const PAST_TOLERANCE_MS = 5 * 60 * 1000;

/** Existing statuses plus the start-state lifecycle. "invited" and "confirmed" both mean scheduled. */
const SCHEDULED_STATUSES = Object.freeze(["invited", "confirmed"]);
const TERMINAL_STATUSES = Object.freeze(["cancelled", "completed", "no_show"]);

/** Job binding: the application must belong to the job the recruiter selected. */
const assertApplicationBelongsToJob = ({ applicationJobId, selectedJobId }) => {
  if (!applicationJobId || !selectedJobId || String(applicationJobId) !== String(selectedJobId)) {
    return { ok: false, code: "APPLICATION_JOB_MISMATCH" };
  }
  return { ok: true };
};

/** A new schedule must not be in the past. */
const scheduleIsInFuture = ({ scheduledStart, now = new Date() }) => {
  if (!scheduledStart) return { ok: true };
  return new Date(scheduledStart).getTime() >= now.getTime() - PAST_TOLERANCE_MS
    ? { ok: true }
    : { ok: false, code: "SCHEDULE_IN_PAST" };
};

/** The recruiter may start only a scheduled interview, inside its start window. */
const canStartInterview = ({ status, scheduledStart, scheduledEnd, now = new Date() }) => {
  if (status === "in_progress") return { ok: false, code: "ALREADY_STARTED" };
  if (status === "cancelled") return { ok: false, code: "INTERVIEW_CANCELLED" };
  if (status === "completed" || status === "no_show") return { ok: false, code: "INTERVIEW_ENDED" };
  if (!SCHEDULED_STATUSES.includes(status)) return { ok: false, code: "NOT_SCHEDULED" };
  if (!scheduledStart) return { ok: false, code: "NOT_SCHEDULED" };
  const start = new Date(scheduledStart).getTime();
  const end = scheduledEnd ? new Date(scheduledEnd).getTime() : start;
  const t = now.getTime();
  if (t < start - START_WINDOW_BEFORE_MS) return { ok: false, code: "TOO_EARLY", opensAt: new Date(start - START_WINDOW_BEFORE_MS) };
  if (t > end + START_WINDOW_AFTER_END_MS) return { ok: false, code: "START_WINDOW_CLOSED" };
  return { ok: true };
};

/**
 * What the candidate may do right now. The Join action is enabled only when the recruiter has started the interview
 * (status in_progress) and a meeting link exists. Early and late joining are governed by the start window above.
 */
const candidateJoinState = ({ status, meetingUrl, scheduledStart, now = new Date() }) => {
  if (status === "cancelled") return { canJoin: false, reason: "CANCELLED", message: "This interview was cancelled." };
  if (status === "completed" || status === "no_show") {
    return { canJoin: false, reason: "ENDED", message: "This interview has ended." };
  }
  if (status === "rescheduled" || status === "reschedule_requested") {
    return { canJoin: false, reason: "RESCHEDULE_PENDING", message: "This interview is being rescheduled. You will get a new time." };
  }
  if (status === "in_progress") {
    if (!meetingUrl) return { canJoin: false, reason: "MISSING_MEETING_URL", message: "The meeting link is not available yet. Contact your recruiter." };
    return { canJoin: true, reason: "STARTED", message: "The recruiter has started the interview. You can join now." };
  }
  if (SCHEDULED_STATUSES.includes(status) && scheduledStart) {
    const start = new Date(scheduledStart).getTime();
    if (now.getTime() < start - START_WINDOW_BEFORE_MS) {
      return { canJoin: false, reason: "NOT_STARTED", message: "Waiting for the recruiter to start the interview." };
    }
    return { canJoin: false, reason: "WAITING_FOR_RECRUITER", message: "Waiting for the recruiter to start the interview." };
  }
  return { canJoin: false, reason: "NOT_SCHEDULED", message: "This interview is not scheduled yet." };
};

module.exports = {
  START_WINDOW_BEFORE_MS,
  START_WINDOW_AFTER_END_MS,
  PAST_TOLERANCE_MS,
  SCHEDULED_STATUSES,
  TERMINAL_STATUSES,
  assertApplicationBelongsToJob,
  scheduleIsInFuture,
  canStartInterview,
  candidateJoinState,
};
