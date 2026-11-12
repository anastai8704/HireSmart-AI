// Small pure helpers shared across the UI.

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { generateIcsContent } from "./interviewFormat";

export { formatDuration, isValidMeetingUrl, generateIcsContent } from "./interviewFormat";

// Merges class names so the last conflicting Tailwind utility wins.
export const cn = (...inputs) => twMerge(clsx(inputs));

/** "₹12,00,000" - Indian number formatting, matching the target job market. */
export const formatSalary = (amount) => {
  if (
    amount === null ||
    amount === undefined ||
    Number(amount) <= 0 ||
    Number.isNaN(Number(amount))
  ) {
    return "Not disclosed";
  }

  const value = Number(amount);

  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

/** "3.00 L \u2013 6.00 L" style salary line for a job; null when undisclosed. */
export const formatJobSalary = (job) => {
  const comp = job?.compensation;
  const min = comp && comp.min > 0 ? comp.min : 0;
  const max = comp && comp.max > 0 ? comp.max : 0;
  if (min && max && min !== max) return `${formatSalary(min)} \u2013 ${formatSalary(max)}`;
  const single = min || max || (job?.salary > 0 ? Number(job.salary) : 0);
  return single > 0 ? formatSalary(single) : null;
};

// ---- Requirement 10: one Indian date/time display, Asia/Kolkata by default -------------------------
// Instants are stored and sent as UTC. Display always uses an explicit zone (default Asia/Kolkata), never
// the browser's zone, so every user sees the same wall-clock time. Output is built from fixed English month
// names so it does not depend on the browser's ICU build.
export const IST_TIME_ZONE = "Asia/Kolkata";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const validZone = (zone) => {
  if (!zone) return IST_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return IST_TIME_ZONE;
  }
};

const zoneParts = (date, zone) => {
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: validZone(zone),
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
};

const toValidDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "05 Nov 2026" in the given zone (default Asia/Kolkata). */
export const formatDate = (value, timezone) => {
  const date = toValidDate(value);
  if (!date) return "-";
  const { year, month, day } = zoneParts(date, timezone);
  return `${String(day).padStart(2, "0")} ${MONTH_NAMES[month - 1]} ${year}`;
};

/** Calendar day key "YYYY-MM-DD" in the given zone (default Asia/Kolkata). */
export const dayKey = (value, timezone) => {
  const date = toValidDate(value);
  if (!date) return null;
  const { year, month, day } = zoneParts(date, timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** Start instant (inclusive) and end instant (exclusive) of the Asia/Kolkata calendar day that contains `now`. */
export const istDayBounds = (now = new Date()) => {
  const { year, month, day } = zoneParts(now, IST_TIME_ZONE);
  const start = new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

/** Hour of the day (0-23) in Asia/Kolkata, for greetings and time-of-day copy. */
export const istHour = (now = new Date()) => zoneParts(now, IST_TIME_ZONE).hour;

/** "3 days ago" - friendlier than a raw date in activity feeds. */
export const formatRelativeTime = (value) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  const units = [
    { limit: 60, divisor: 1, name: "second" },
    { limit: 3600, divisor: 60, name: "minute" },
    { limit: 86400, divisor: 3600, name: "hour" },
    { limit: 604800, divisor: 86400, name: "day" },
    { limit: 2592000, divisor: 604800, name: "week" },
    { limit: 31536000, divisor: 2592000, name: "month" },
  ];

  if (seconds < 45) return "just now";

  for (const unit of units) {
    if (seconds < unit.limit) {
      const amount = Math.round(seconds / unit.divisor);
      return `${amount} ${unit.name}${amount === 1 ? "" : "s"} ago`;
    }
  }

  const years = Math.round(seconds / 31536000);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

/** Colour family for a 0-100 match or ATS score. */
export const scoreTone = (score) => {
  if (score >= 80) return "success";
  if (score >= 60) return "brand";
  if (score >= 40) return "warning";
  return "danger";
};

/** Tailwind classes for a score badge, derived from the tone above. */
export const scoreClasses = (score) => {
  const tone = scoreTone(score);

  return {
    success: "bg-success-50 text-success-700 border-success-500/30",
    brand: "bg-brand-50 text-brand-700 border-brand-500/30",
    warning: "bg-warning-50 text-warning-700 border-warning-500/30",
    danger: "bg-danger-50 text-danger-700 border-danger-500/30",
  }[tone];
};

/** Colour per application status, kept in one place for consistency. */
export const statusClasses = (status) =>
  ({
    Applied: "bg-ink-100 text-ink-700 border-ink-300",
    Shortlisted: "bg-brand-50 text-brand-700 border-brand-300",
    Interview: "bg-warning-50 text-warning-700 border-warning-500/40",
    Selected: "bg-success-50 text-success-700 border-success-500/40",
    Rejected: "bg-danger-50 text-danger-700 border-danger-500/40",
    Withdrawn: "bg-ink-100 text-ink-500 border-ink-300",
  })[status] || "bg-ink-100 text-ink-700 border-ink-300";

/** "Anas Tai" -> "AT", used for avatar fallbacks. */
export const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** "job.moderation.approved" -> "Job Moderation Approved" */
export const humanizeAction = (value) =>
  String(value || "")
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

/** Compact identifier for object ids in tables and drawers. */
export const shortId = (id) => {
  const s = String(id || "");
  return s.length > 12 ? `${s.slice(0, 8)}\u2026` : s || "\u2014";
};

/** Shortens long text for cards and list rows. */
export const truncate = (text, max = 140) => {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}...`;
};

/** "1.2 MB" */
export const formatBytes = (bytes) => {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/**
 * Triggers a browser download for a Blob returned by the API.
 * We create a temporary object URL, click it, then release the memory.
 */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
};

/** Delays a function until the user stops typing - used for search inputs. */
export const debounce = (fn, delay = 350) => {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

/** "03:30 PM" in the given zone (default Asia/Kolkata). AM/PM is always shown. */
export const formatTime = (value, timezone) => {
  const date = toValidDate(value);
  if (!date) return "-";
  const { hour, minute } = zoneParts(date, timezone);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(h12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};

/** "15 Aug 2026, 03:30 PM" in the given zone (default Asia/Kolkata). */
export const formatDateTime = (value, timezone) => {
  const date = toValidDate(value);
  if (!date) return "-";
  return `${formatDate(date, timezone)}, ${formatTime(date, timezone)}`;
};

/** "45 mins", "1 hour", "1.5 hours" */
export const downloadInterviewIcs = (interview) => {
  if (!interview?.scheduledStart) return;
  const icsContent = generateIcsContent({
    title: interview.title,
    jobTitle: interview.application?.job?.title,
    company: interview.application?.job?.company,
    scheduledStart: interview.scheduledStart,
    scheduledEnd: interview.scheduledEnd,
    timezone: interview.timezone,
    location: interview.location,
    meetingUrl: interview.meetingUrl,
  });
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const safeName = (interview.title || "interview").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  downloadBlob(blob, `${safeName}.ics`);
};

/**
 * Where a notification should take the user when clicked, derived from the
 * role and the notification's related resource. Returns null when there is no
 * sensible destination.
 */
export const notificationTarget = (auth, notification) => {
  const orgId = auth.organizationId;
  switch (notification?.resourceType) {
    case "job":
      if (auth.role === "admin") return { to: "/app/admin/moderation", label: "Review" };
      if (orgId) return { to: `/app/o/${orgId}/jobs`, label: "View job" };
      return null;
    case "application":
      if (auth.role === "candidate") return { to: "/app/candidate/applications", label: "View" };
      if (orgId) return { to: `/app/o/${orgId}/candidates`, label: "View" };
      return null;
    case "interview":
      if (auth.role === "candidate") return { to: "/app/candidate/interviews", label: "View" };
      if (orgId) return { to: `/app/o/${orgId}/interviews`, label: "View" };
      return null;
    case "resume_version":
      if (auth.role === "candidate") return { to: "/app/candidate/resumes", label: "View" };
      return null;
    case "organization":
      if (auth.role === "admin") return { to: "/app/admin/organizations", label: "View company" };
      if (orgId) return { to: `/app/o/${orgId}`, label: "View company" };
      return null;
    case "security_event":
      if (auth.role === "admin") return { to: "/app/admin/security", label: "View" };
      return null;
    case "user":
      return { to: "/app/settings", label: "Account" };
    default:
      return null;
  }
};

