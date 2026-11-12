// Interview workflow rules for the client (Requirements 3–6). These mirror the server rules in
// server/domain/interviewPolicy.js for display only. The server is the authority and re-checks every action.
import { isValidMeetingUrl } from "./interviewFormat";

export const START_WINDOW_BEFORE_MS = 15 * 60 * 1000;
export const START_WINDOW_AFTER_END_MS = 60 * 60 * 1000;
const PAST_TOLERANCE_MS = 5 * 60 * 1000;
const SCHEDULED_STATUSES = ["invited", "confirmed"];

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const TIMEZONE_OPTIONS = [
  "Asia/Kolkata",
  "UTC",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];
export const INTERVIEW_TYPES = [
  { value: "video", label: "Video call" },
  { value: "phone", label: "Phone screen" },
  { value: "technical", label: "Technical round" },
  { value: "panel", label: "Panel" },
  { value: "onsite", label: "On-site" },
  { value: "hr", label: "HR round" },
];

const isValidTimezone = (tz) => {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Offset in ms of `timeZone` from UTC at the instant `ms`. */
const zoneOffsetMs = (ms, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
};

/**
 * Converts a wall-clock value from a datetime-local input ("YYYY-MM-DDTHH:mm") in `timeZone` to a Date.
 * Returns null for an invalid value or timezone. Example: "2026-11-20T10:00" in Asia/Kolkata is 04:30Z.
 */
export const zonedLocalToUtc = (local, timeZone) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local || ""));
  if (!match || !isValidTimezone(timeZone)) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const first = asUtc - zoneOffsetMs(asUtc, timeZone);
  const second = asUtc - zoneOffsetMs(first, timeZone);
  const result = new Date(second);
  return Number.isNaN(result.getTime()) ? null : result;
};

/** Formats an instant as a datetime-local value in `timeZone` (for reschedule forms). */
export const toZonedLocalInput = (value, timeZone) => {
  if (!value || !isValidTimezone(timeZone)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
};

/** Human-readable instant in the interview's timezone, e.g. "20 Nov 2026, 10:00 am". */
export const formatInZone = (value, timeZone = DEFAULT_TIMEZONE) => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: isValidTimezone(timeZone) ? timeZone : "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
};

export const applicationJobId = (application) =>
  application?.job?._id || application?.job?.id || application?.job || "";

export const interviewJobTitle = (interview) => interview?.application?.job?.title || "Job";
export const interviewCandidateName = (interview) =>
  interview?.application?.candidate?.name || interview?.application?.candidate?.email || "Candidate";

/** Groups recruiter interviews into the four tabs. Cancelled and ended interviews are kept out of "upcoming". */
export const groupRecruiterInterviews = (items = [], now = new Date()) => {
  const buckets = { upcoming: [], past: [], completed: [], cancelled: [] };
  for (const item of items) buckets[bucketOf(item, now)].push(item);
  const startTime = (i) => (i.scheduledStart ? new Date(i.scheduledStart).getTime() : Number.MAX_SAFE_INTEGER);
  buckets.upcoming.sort((a, b) => startTime(a) - startTime(b));
  buckets.past.sort((a, b) => startTime(b) - startTime(a));
  buckets.completed.sort((a, b) => startTime(b) - startTime(a));
  buckets.cancelled.sort((a, b) => startTime(b) - startTime(a));
  return buckets;
};

export const bucketOf = (interview, now = new Date()) => {
  if (interview.status === "cancelled") return "cancelled";
  if (interview.status === "completed" || interview.status === "no_show") return "completed";
  if (interview.status === "in_progress") return "upcoming";
  if (!interview.scheduledStart) return "upcoming";
  const end = new Date(interview.scheduledEnd || interview.scheduledStart).getTime();
  return end < now.getTime() ? "past" : "upcoming";
};

/** Whether the recruiter can start now, with the reason shown when they cannot. Server re-checks on click. */
export const startAvailability = (interview, now = new Date()) => {
  const status = interview?.status;
  if (status === "in_progress") return { ok: false, reason: "The interview has already started." };
  if (status === "cancelled") return { ok: false, reason: "A cancelled interview cannot be started." };
  if (status === "completed" || status === "no_show") return { ok: false, reason: "This interview has ended." };
  if (status === "reschedule_requested") {
    return { ok: false, reason: "The candidate asked to reschedule. Set a new time first." };
  }
  if (!SCHEDULED_STATUSES.includes(status) || !interview.scheduledStart) {
    return { ok: false, reason: "Set a date and time before starting." };
  }
  const start = new Date(interview.scheduledStart).getTime();
  const end = new Date(interview.scheduledEnd || interview.scheduledStart).getTime();
  if (now.getTime() < start - START_WINDOW_BEFORE_MS) {
    return {
      ok: false,
      reason: `You can start from 15 minutes before the scheduled time (${formatInZone(
        new Date(start - START_WINDOW_BEFORE_MS),
        interview.timezone,
      )}).`,
    };
  }
  if (now.getTime() > end + START_WINDOW_AFTER_END_MS) {
    return { ok: false, reason: "The start window has closed. Reschedule the interview to start it." };
  }
  if (!interview.meetingUrl) {
    return { ok: false, reason: "Add a meeting link before starting. The candidate needs it to join." };
  }
  return { ok: true, reason: "" };
};

/** Candidate join state from the server response. Defaults to disabled when the server did not send one. */
export const candidateJoinInfo = (interview) =>
  interview?.joinState || {
    canJoin: false,
    reason: "NOT_STARTED",
    message: "Waiting for the recruiter to start the interview.",
  };

/**
 * Meeting label for the recruiter. Google Meet is named only when the record says Google created it. Manual links are
 * labelled manual. A link with no recorded source is labelled that way rather than guessed.
 */
export const meetingInfo = (interview) => {
  const url = interview?.meetingUrl || "";
  if (interview?.status === "cancelled") return { kind: "cancelled", label: "Cancelled", url: "" };
  if (interview?.meetingProvider === "google_meet" && url) {
    return { kind: "google_meet", label: "Google Meet", url, description: "Created by Google Calendar." };
  }
  if (interview?.meetingProvider === "manual" && url) {
    return {
      kind: "manual",
      label: "Manual link",
      url,
      description: "Added by the recruiter. Not created by Google Calendar.",
    };
  }
  if (interview?.meetingStatus === "setup_required") {
    return {
      kind: "setup_required",
      label: "Google Meet not set up",
      url: "",
      description: "Connect Google Calendar in Settings to create a Meet link, or add a meeting link manually.",
    };
  }
  if (interview?.meetingStatus === "pending") {
    return {
      kind: "pending",
      label: "Meet link pending",
      url: "",
      description: "Google has not returned a link yet. Retry to request it again.",
    };
  }
  if (interview?.meetingStatus === "failure") {
    return {
      kind: "failure",
      label: "Meet link failed",
      url: "",
      description: interview.meetingError || "Google could not create the link. Retry, or add a link manually.",
    };
  }
  if (url) {
    return { kind: "unknown", label: "Meeting link (source not recorded)", url, description: "" };
  }
  return { kind: "none", label: "No meeting link", url: "", description: "Add a link or connect Google Calendar." };
};

/** Checks only the date, time and timezone fields. Shared by scheduling and rescheduling. */
export const validateTiming = (form, now = new Date()) => {
  const errors = {};
  if (!isValidTimezone(form.timezone)) errors.timezone = "Choose a valid timezone.";
  const start = zonedLocalToUtc(form.start, form.timezone);
  const end = zonedLocalToUtc(form.end, form.timezone);
  if (!start) errors.start = "Enter a start date and time.";
  if (!end) errors.end = "Enter an end date and time.";
  if (start && end && end <= start) errors.end = "The end time must be after the start time.";
  if (start && start.getTime() < now.getTime() - PAST_TOLERANCE_MS) {
    errors.start = "The start time is in the past. Choose a future time.";
  }
  return { errors, start, end };
};

/** Validation for the scheduling form. Returns an object of field -> message; empty means valid. */
export const validateSchedule = (form, now = new Date()) => {
  const errors = {};
  if (!form.jobId) errors.jobId = "Choose a job first.";
  if (!form.applicationId) errors.applicationId = "Choose a candidate for this job.";
  const title = (form.title || "").trim();
  if (title.length < 2 || title.length > 150) errors.title = "Enter a title between 2 and 150 characters.";
  Object.assign(errors, validateTiming(form, now).errors);
  if (form.meetingUrl && form.meetingUrl.trim() && !isValidMeetingUrl(form.meetingUrl)) {
    errors.meetingUrl = "Enter a full link starting with https://.";
  }
  if ((form.location || "").length > 500) errors.location = "Keep the location under 500 characters.";
  if ((form.participantIds || []).length > 20) errors.participantIds = "Choose up to 20 interviewers.";
  return errors;
};

/** Builds the POST body. Instants are sent as ISO strings; the server stores UTC and the chosen timezone. */
export const buildScheduleBody = (form) => {
  const body = {
    applicationId: form.applicationId,
    jobId: form.jobId,
    title: form.title.trim(),
    type: form.type || "video",
    scheduledStart: zonedLocalToUtc(form.start, form.timezone).toISOString(),
    scheduledEnd: zonedLocalToUtc(form.end, form.timezone).toISOString(),
    timezone: form.timezone,
  };
  if ((form.location || "").trim()) body.location = form.location.trim();
  if ((form.meetingUrl || "").trim()) body.meetingUrl = form.meetingUrl.trim();
  if ((form.participantIds || []).length) body.participants = form.participantIds;
  return body;
};

/** A timeline derived from record timestamps. The server keeps no full event log for interviews yet. */
export const historyEvents = (interview) => {
  const events = [];
  const add = (at, label, detail = "") => {
    if (at) events.push({ at: new Date(at), label, detail });
  };
  add(interview?.createdAt, "Interview scheduled");
  add(interview?.candidateConfirmedAt, "Candidate confirmed attendance");
  add(interview?.startedAt, "Recruiter started the interview");
  for (const f of interview?.feedback || []) {
    add(f.submittedAt, "Scorecard submitted", `Recommendation: ${String(f.recommendation || "").replaceAll("_", " ")}`);
  }
  if (interview?.status === "cancelled") {
    add(interview.updatedAt, "Cancelled", interview.cancelledReason || "");
  }
  if (interview?.status === "reschedule_requested") {
    add(interview.updatedAt, "Candidate asked to reschedule", interview.cancelledReason || "");
  }
  return events.sort((a, b) => a.at - b.at);
};

export const roundLabel = (round) => `Round ${round || 1}`;
