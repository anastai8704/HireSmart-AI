import { formatDateTime } from "./utils";
// Display helpers for the admin Revenue & Plans and placement screens (Requirements 8–9).
// Pure functions: no fetching, no rules. The server decides eligibility; these only label what it returns.

export const fmtInr = (n) =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? "—"
    : `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const fmtCount = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-IN"));

// IST date and time for display. Input is an ISO string or Date.
export const fmtIst = (value) => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDateTime(d, "Asia/Kolkata");
};

export const PAYMENT_STATUS_LABELS = {
  captured: "Captured",
  refunded: "Captured, refunded",
  failed: "Failed",
  initiated: "Pending",
  cancelled: "Cancelled",
};

export const REFUND_LABELS = { refunded: "Refunded", none: "Not refunded" };

// "simulation" is shown as Sandbox so it can never read as a real charge.
export const MODE_LABELS = { test: "Test mode", live: "Live", simulation: "Sandbox (excluded)" };

export const VERIFICATION_LABELS = {
  verified: "Verified",
  unverified: "Unverified",
  not_captured: "Not captured",
  sandbox_excluded: "Sandbox (excluded)",
  not_applicable: "Not applicable",
};

export const VERIFICATION_TONE = {
  verified: "success",
  unverified: "warning",
  not_captured: "default",
  sandbox_excluded: "default",
  not_applicable: "default",
};

export const PLACEMENT_STATUS_LABELS = {
  selected: "Selected",
  hired: "Hired",
  joining_confirmed: "Joining confirmed",
  placement_verified: "Placement verified",
  currently_working: "Currently working",
  employment_ended: "Employment ended",
};

export const EMPLOYMENT_EVENT_LABELS = {
  placement_created: "Placement created from hire",
  joining_confirmed: "Candidate confirmed joining",
  employment_reported: "Employment status reported",
  placement_verified: "Platform verified placement",
};

export const SOURCE_LABELS = {
  candidate_reported: "Reported by candidate",
  organization_reported: "Reported by company",
  platform_reported: "Platform",
  candidate: "Candidate",
  "": "—",
};

// Turns a range form into the query the server expects. Returns null when the custom range is incomplete.
export const rangeParams = (range) =>
  range.preset === "custom"
    ? range.from && range.to
      ? { range: "custom", from: range.from, to: range.to }
      : null
    : { range: range.preset };
