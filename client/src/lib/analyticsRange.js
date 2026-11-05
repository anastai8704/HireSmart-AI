// Date-range helpers for the admin analytics dashboard (Phase 5).
// Mirrors the server rules (server/domain/analyticsDefinitions.js) so invalid input is caught before a request.
export const RANGE_PRESETS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

export const MAX_CUSTOM_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns an error message, or null when the custom range is valid.
export const validateCustomRange = (from, to, today) => {
  if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) return "Choose both a start and an end date.";
  if (from > to) return "The start date must be on or before the end date.";
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days > MAX_CUSTOM_DAYS) return `The range can be at most ${MAX_CUSTOM_DAYS} days.`;
  if (today && to > today) return "The end date cannot be in the future.";
  return null;
};

// Today's calendar day in IST (UTC+05:30) for a given instant.
export const istToday = (now = new Date()) => new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
