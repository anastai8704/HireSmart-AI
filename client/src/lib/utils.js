// Small pure helpers shared across the UI.

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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

/** "15 Aug 2026" */
export const formatDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

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

/** "3:30 PM" or "3:30 PM (IST)" */
export const formatTime = (value, timezone) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const options = { hour: "numeric", minute: "2-digit" };
  if (timezone) {
    try {
      options.timeZone = timezone;
    } catch {
      /* ignore invalid timezone */
    }
  }
  return new Intl.DateTimeFormat("en-IN", options).format(date);
};

/** "15 Aug 2026, 3:30 PM" */
export const formatDateTime = (value, timezone) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const options = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (timezone) {
    try {
      options.timeZone = timezone;
    } catch {
      /* ignore invalid timezone */
    }
  }
  return new Intl.DateTimeFormat("en-IN", options).format(date);
};

/** "45 mins", "1 hour", "1.5 hours" */
export const formatDuration = (start, end) => {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return null;
  }
  const diffMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  if (diffMinutes < 60) return `${diffMinutes} mins`;
  const hours = diffMinutes / 60;
  return hours === 1 ? "1 hour" : `${Number(hours.toFixed(1))} hours`;
};

/** Checks if a string is a valid absolute http/https URL */
export const isValidMeetingUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/** Generates standard RFC 5545 iCalendar content */
export const generateIcsContent = ({
  title = "Interview",
  jobTitle = "",
  company = "",
  scheduledStart,
  scheduledEnd,
  timezone = "UTC",
  location = "",
  meetingUrl = "",
  description = "",
}) => {
  const pad = (n) => String(n).padStart(2, "0");
  const formatIcsDate = (date) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  };

  const dtStamp = formatIcsDate(new Date());
  const dtStart = formatIcsDate(scheduledStart);
  const dtEnd = scheduledEnd
    ? formatIcsDate(scheduledEnd)
    : formatIcsDate(new Date(new Date(scheduledStart).getTime() + 45 * 60000));

  const summary = `${title}: ${jobTitle}${company ? ` at ${company}` : ""}`;
  const eventLocation = meetingUrl || location || "Online";
  const eventDescription = [
    description || `Interview for ${jobTitle}${company ? ` with ${company}` : ""}`,
    meetingUrl ? `Meeting Link: ${meetingUrl}` : "",
    location ? `Location: ${location}` : "",
    timezone ? `Timezone: ${timezone}` : "",
  ]
    .filter(Boolean)
    .join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HireSmart AI//Interview Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(36).slice(2, 9)}@hiresmart.ai`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary.replace(/\n/g, " ")}`,
    `DESCRIPTION:${eventDescription.replace(/\n/g, "\\n")}`,
    `LOCATION:${eventLocation.replace(/\n/g, " ")}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
};

/** Triggers a browser download of a standard .ics calendar file */
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

