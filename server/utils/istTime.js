// Asia/Kolkata (IST, UTC+05:30) date and time for the server. Timestamps are stored and compared in UTC;
// this module is the only place that turns an instant into an Indian calendar day or a displayed time.
// IST has no daylight saving time, so a fixed +05:30 offset is exact. It is still derived from the zone name
// with Intl for display, so the two can be cross-checked in tests.
const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Fixed English month names so output never depends on the ICU build ("Sep", not "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const zoneParts = (d, zone) => {
  const p = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(d)) p[part.type] = part.value;
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
};

/** "05 Nov 2026" in Asia/Kolkata, or in an explicit IANA zone when given. */
const formatIstDate = (value, zone = TIME_ZONE) => {
  const d = toDate(value);
  if (!d) return "";
  const { year, month, day } = zoneParts(d, zone);
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
};

/** "03:30 PM" (12-hour with AM/PM) */
const formatIstTime = (value) => {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
};

/** "05 Nov 2026, 03:30 PM IST" */
const formatIstDateTime = (value) => {
  const date = formatIstDate(value);
  if (!date) return "";
  return `${date}, ${formatIstTime(value)} IST`;
};

/** "YYYY-MM-DD" calendar day in IST for an instant. */
const istDayKey = (value) => {
  const d = toDate(value);
  if (!d) return null;
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
};

/** Interprets "YYYY-MM-DDTHH:mm" as IST wall-clock time and returns the UTC instant. Null if malformed. */
const istLocalToUtc = (local) => {
  const m = LOCAL_RE.exec(String(local || ""));
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (h > 23 || mi > 59) return null;
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS);
  return Number.isNaN(utc.getTime()) ? null : utc;
};

/** Start (inclusive) and end (exclusive) instants of an IST calendar day "YYYY-MM-DD". */
const istDayBounds = (day) => {
  const m = DAY_RE.exec(String(day || ""));
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const start = new Date(Date.UTC(y, mo - 1, d) - IST_OFFSET_MS);
  if (Number.isNaN(start.getTime()) || new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return null;
  return { start, end: new Date(start.getTime() + DAY_MS) };
};

/** Whole IST calendar days from `now` to `end` (negative when `end` is in the past). Uses IST day keys, not 24h steps. */
const istCalendarDaysUntil = (end, now = new Date()) => {
  const a = istDayBounds(istDayKey(now));
  const b = istDayBounds(istDayKey(end));
  if (!a || !b) return null;
  return Math.round((b.start.getTime() - a.start.getTime()) / DAY_MS);
};

/**
 * Start instant for a "from" query value. A bare "YYYY-MM-DD" means the start of that IST day (not UTC midnight,
 * which is 05:30 IST). Any other value is parsed as an instant. Returns `fallback` when the value is missing or invalid.
 */
const istSinceFromQuery = (value, fallback) => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const v = value.trim();
  if (DAY_RE.test(v)) {
    const bounds = istDayBounds(v);
    return bounds ? bounds.start : fallback;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
};

module.exports = {
  TIME_ZONE,
  IST_OFFSET_MS,
  formatIstDate,
  formatIstTime,
  formatIstDateTime,
  istDayKey,
  istLocalToUtc,
  istDayBounds,
  istCalendarDaysUntil,
  istSinceFromQuery,
};
