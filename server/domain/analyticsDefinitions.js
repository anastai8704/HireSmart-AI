// Admin analytics: date ranges, metric definitions and pure calculations (Phase 5).
// Everything here is free of database access so the rules can be unit-tested directly.
// Reporting timezone is Asia/Kolkata (IST, UTC+05:30, no DST). Day boundaries are IST midnight.

const ANALYTICS_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS = Object.freeze({ "7d": 7, "30d": 30, "90d": 90 });
const MAX_CUSTOM_DAYS = 366;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

class AnalyticsRangeError extends Error {
  constructor(message) {
    super(message);
    this.name = "AnalyticsRangeError";
    this.code = "INVALID_RANGE";
  }
}

// "YYYY-MM-DD" (IST calendar day) → Date of that day's IST midnight, in UTC.
const istMidnightUtc = (ymd) => {
  const m = DATE_RE.exec(ymd || "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(utc - IST_OFFSET_MS);
};

// Calendar day ("YYYY-MM-DD") in IST for an instant.
const istDayOf = (date) => new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const addDays = (ymd, delta) => {
  const start = istMidnightUtc(ymd);
  return istDayOf(new Date(start.getTime() + delta * DAY_MS + IST_OFFSET_MS));
};

// Resolve a request's range to inclusive IST days and a half-open UTC interval [start, end).
// Presets are the last N IST days including today. Custom ranges require from/to and are capped.
const resolveRange = ({ range = "30d", from, to } = {}, now = new Date()) => {
  let fromDay;
  let toDay;
  let preset = range;
  if (Object.prototype.hasOwnProperty.call(PRESET_DAYS, range)) {
    toDay = istDayOf(now);
    fromDay = addDays(toDay, -(PRESET_DAYS[range] - 1));
  } else if (range === "custom") {
    if (!istMidnightUtc(from) || !istMidnightUtc(to)) {
      throw new AnalyticsRangeError("Custom range needs from and to as valid YYYY-MM-DD dates");
    }
    fromDay = from;
    toDay = to;
  } else {
    throw new AnalyticsRangeError("range must be one of 7d, 30d, 90d or custom");
  }
  if (fromDay > toDay) throw new AnalyticsRangeError("from must be on or before to");
  const days = Math.round((istMidnightUtc(toDay) - istMidnightUtc(fromDay)) / DAY_MS) + 1;
  if (days > MAX_CUSTOM_DAYS) throw new AnalyticsRangeError(`Range cannot exceed ${MAX_CUSTOM_DAYS} days`);
  if (preset === "custom" && toDay > istDayOf(now)) {
    throw new AnalyticsRangeError("to cannot be in the future");
  }
  const start = istMidnightUtc(fromDay);
  const end = new Date(istMidnightUtc(toDay).getTime() + DAY_MS);
  return { preset, timezone: ANALYTICS_TIMEZONE, fromDay, toDay, days, start, end };
};

// Percentage with one decimal. A zero or missing denominator yields null ("not applicable"), never 0.
const ratePercent = (numerator, denominator) => {
  if (!denominator || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
};

// Revenue is cash-basis from verified billing records only:
//   net revenue = gross captured payments created in the range − refunds processed in the range.
// Failed and initiated attempts never count as revenue or as successful payments.
const summarizeRevenue = ({ grossCapturedAmount = 0, refundsAmount = 0, successfulCount = 0, failedCount = 0 } = {}) => {
  const round = (n) => Math.round(n * 100) / 100;
  return {
    grossCaptured: round(grossCapturedAmount),
    refunds: round(refundsAmount),
    netRevenue: round(grossCapturedAmount - refundsAmount),
    successfulPayments: successfulCount,
    failedPayments: failedCount,
  };
};

// Legacy application status values are still stored on older records. Map them to the lifecycle names.
const LEGACY_STAGE_MAP = Object.freeze({
  Applied: "submitted",
  Shortlisted: "shortlisted",
  Interview: "interview",
  Selected: "hired",
  Rejected: "rejected",
  Withdrawn: "withdrawn",
});
const canonicalStage = (status) => LEGACY_STAGE_MAP[status] || status;

// Metric definitions shipped with every dashboard response, so the UI and docs show the same rules.
// period: "range" = counted inside the selected dates; "as_of_now" = current state; "all_time" = no date filter.
const METRIC_DEFINITIONS = Object.freeze({
  candidatesTotal: { label: "Registered candidates", period: "as_of_now", definition: "User accounts with role candidate." },
  candidatesNew: { label: "New candidate registrations", period: "range", definition: "Candidate accounts created in the range (createdAt, IST day)." },
  recruitersTotal: { label: "Registered recruiters", period: "as_of_now", definition: "User accounts with role recruiter." },
  recruitersNew: { label: "New recruiter registrations", period: "range", definition: "Recruiter accounts created in the range." },
  companiesTotal: { label: "Total companies", period: "as_of_now", definition: "Organization records." },
  companiesVerified: { label: "Verified companies", period: "as_of_now", definition: "Organizations with verificationStatus verified." },
  companiesAwaitingVerification: { label: "Awaiting verification", period: "as_of_now", definition: "Organizations with verificationStatus pending or under_review." },
  activeJobs: { label: "Active job listings", period: "as_of_now", definition: "Jobs published with moderation approved or none (not pending, rejected or suspended)." },
  pendingJobApprovals: { label: "Pending job approvals", period: "as_of_now", definition: "Jobs whose moderation.status is pending." },
  jobPostings: { label: "Job postings", period: "range", definition: "Jobs created in the range, any status." },
  applications: { label: "Applications", period: "range", definition: "Applications submitted in the range, excluding withdrawn ones." },
  interviewsScheduled: { label: "Interviews created", period: "range", definition: "Interview records created in the range, excluding cancelled." },
  offersIssued: { label: "Offers issued", period: "range", definition: "Applications whose offer.issuedAt falls in the range." },
  candidatesHired: { label: "Candidates marked hired", period: "range", definition: "Applications with a statusHistory entry to hired, changed in the range." },
  confirmedEmployment: { label: "Confirmed employment records", period: "range", definition: "Placements with verification.isVerified true and verifiedAt in the range. Candidate or company reports are not counted here. Legacy records without verifiedAt are excluded." },
  activePaidSubscriptions: { label: "Active paid subscriptions", period: "as_of_now", definition: "Subscriptions with status active and priceInr > 0 (free plans excluded)." },
  subscriptionConversion: { label: "Subscription conversion", period: "as_of_now", definition: "Organizations with an active paid subscription ÷ all organizations × 100. Null when there are no organizations." },
  successfulPayments: { label: "Successful payments", period: "range", definition: "Razorpay payment transactions in captured or refunded status created in the range. Sandbox, initiated and failed attempts are not counted." },
  revenue: { label: "Net revenue (cash basis)", period: "range", definition: "Gross captured Razorpay payments created in the range, minus refunds processed in the range by refundedAt (INR). Sandbox, failed and pending records are excluded." },
  testRevenue: { label: "Net revenue, test mode", period: "range", definition: "Net revenue from Razorpay test-mode payments. Shown separately from live revenue; never combined into one figure without this label." },
  liveRevenue: { label: "Net revenue, live mode", period: "range", definition: "Net revenue from live-mode payments. Live payments are not offered in this release, so this is zero until live billing is enabled." },
  upcomingInterviews: { label: "Upcoming interviews", period: "as_of_now", definition: "Interviews with status invited, confirmed, rescheduled or reschedule_requested whose start time is now or later." },
  verifiedPlacements: { label: "Verified placements", period: "as_of_now", definition: "Placements an administrator has verified (verification.isVerified true). Reported but unverified employment is not counted." },
  refunds: { label: "Refunds", period: "range", definition: "Transactions in refunded status whose last update (refund) falls in the range, with their amounts." },
  failedPayments: { label: "Failed payments", period: "range", definition: "Payment transactions in failed status created in the range." },
  suspendedAccounts: { label: "Suspended accounts", period: "as_of_now", definition: "User accounts with accountStatus suspended." },
  fraudReviewQueue: { label: "Fraud-risk review queue", period: "as_of_now", definition: "Organizations awaiting verification (pending or under_review) that carry at least one risk flag. Risk flags route to review; they never block or ban on their own." },
  hiringConversion: { label: "Hiring conversion", period: "range", definition: "Applications submitted in the range that have reached hired ÷ eligible applications submitted in the range (non-withdrawn) × 100. Null when there are none." },
});

module.exports = {
  ANALYTICS_TIMEZONE,
  MAX_CUSTOM_DAYS,
  AnalyticsRangeError,
  resolveRange,
  istDayOf,
  istMidnightUtc,
  ratePercent,
  summarizeRevenue,
  canonicalStage,
  LEGACY_STAGE_MAP,
  METRIC_DEFINITIONS,
};
