// Dependency-free interview scheduling helpers. Kept separate from utils.js so that
// server-side tests can load them without client-only packages (clsx, tailwind-merge).

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
