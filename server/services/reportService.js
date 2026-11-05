// Authorised reports and CSV exports (Phase 10).
//
// Every report reads the database through the same definitions the dashboards use (domain/analyticsDefinitions.js):
// IST day boundaries, cash-basis revenue, canonical stage names. Scope is applied here, on the server:
//   - platform administrators may run every report, across all companies;
//   - an organisation member with analytics.read may run only the company-scoped reports, and only for their own
//     organisation (the organizationId is passed in by the route, never taken from the query string).
// Personal data is excluded from every report: no names, e-mail addresses, phone numbers, resume text or
// gateway secrets. Candidate-level detail is represented by record ids only.

const mongoose = require("mongoose");
const {
  resolveRange,
  ANALYTICS_TIMEZONE,
  AnalyticsRangeError,
  summarizeRevenue,
  canonicalStage,
  istDayOf,
} = require("../domain/analyticsDefinitions");
const { inRange, dayOf } = require("./reportHelpers");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { Placement } = require("../models/Placement");
const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const AuditLog = require("../models/AuditLog");
const AppError = require("../utils/AppError");

/** Maximum rows in one export. Larger requests are refused with a clear message rather than truncated silently. */
const MAX_ROWS = 10000;

const toIso = (value) => (value ? new Date(value).toISOString() : "");

const limitRows = (rows) => {
  if (rows.length > MAX_ROWS) {
    throw new AppError(
      `This report has more than ${MAX_ROWS} rows. Narrow the date range and export again.`,
      413,
      "EXPORT_TOO_LARGE",
    );
  }
  return rows;
};

/** Records in range, bounded so a single export cannot load unbounded data. */
const records = async (query) => limitRows(await query.limit(MAX_ROWS + 1).lean());

// ---- Report definitions --------------------------------------------------------------------------------------------
// audience: "admin" = platform administrators only; "organization" = a member of one company (own data only).

const REPORTS = {
  candidate_registrations: {
    label: "Candidate registrations",
    audience: ["admin"],
    columns: [
      { key: "date", label: "Date (IST)" },
      { key: "newCandidates", label: "New candidate accounts" },
    ],
    async build({ range }) {
      const rows = await User.aggregate([
        { $match: { role: "candidate", ...inRange("createdAt", range) } },
        { $group: { _id: dayOf("$createdAt"), newCandidates: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);
      return rows.map((r) => ({ date: r._id, newCandidates: r.newCandidates }));
    },
  },

  company_verification: {
    label: "Company verification",
    audience: ["admin"],
    columns: [
      { key: "organizationId", label: "Organization id" },
      { key: "company", label: "Company" },
      { key: "verificationStatus", label: "Verification status" },
      { key: "riskScore", label: "Risk score" },
      { key: "createdAt", label: "Created (UTC)" },
      { key: "verifiedAt", label: "Verified (UTC)" },
    ],
    async build({ range }) {
      const docs = await records(
        Organization.find({ ...inRange("createdAt", range) })
          .select("name verificationStatus riskScore createdAt verifiedAt")
          .sort({ createdAt: 1 }),
      );
      return docs.map((o) => ({
        organizationId: String(o._id),
        company: o.name,
        verificationStatus: o.verificationStatus || "",
        riskScore: o.riskScore ?? 0,
        createdAt: toIso(o.createdAt),
        verifiedAt: toIso(o.verifiedAt),
      }));
    },
  },

  job_moderation: {
    label: "Job moderation",
    audience: ["admin"],
    columns: [
      { key: "jobId", label: "Job id" },
      { key: "title", label: "Job title" },
      { key: "company", label: "Company" },
      { key: "moderationStatus", label: "Moderation status" },
      { key: "submittedAt", label: "Submitted (UTC)" },
      { key: "reviewedAt", label: "Reviewed (UTC)" },
      { key: "reason", label: "Decision reason" },
    ],
    async build({ range }) {
      const docs = await records(
        Job.find({ "moderation.submittedAt": { $gte: range.start, $lt: range.end } })
          .select("title company moderation")
          .sort({ "moderation.submittedAt": 1 }),
      );
      return docs.map((j) => ({
        jobId: String(j._id),
        title: j.title,
        company: j.company,
        moderationStatus: j.moderation?.status || "",
        submittedAt: toIso(j.moderation?.submittedAt),
        reviewedAt: toIso(j.moderation?.reviewedAt),
        reason: j.moderation?.reason || "",
      }));
    },
  },

  job_postings: {
    label: "Job postings",
    audience: ["admin", "organization"],
    columns: [
      { key: "jobId", label: "Job id" },
      { key: "title", label: "Job title" },
      { key: "status", label: "Status" },
      { key: "moderationStatus", label: "Moderation status" },
      { key: "createdAt", label: "Created (UTC)" },
      { key: "publishedAt", label: "Published (UTC)" },
      { key: "closesAt", label: "Closes (UTC)" },
    ],
    async build({ range, organizationId }) {
      const filter = { ...inRange("createdAt", range), ...(organizationId ? { organization: organizationId } : {}) };
      const docs = await records(Job.find(filter).select("title status moderation createdAt publishedAt closesAt").sort({ createdAt: 1 }));
      return docs.map((j) => ({
        jobId: String(j._id),
        title: j.title,
        status: j.status || "",
        moderationStatus: j.moderation?.status || "",
        createdAt: toIso(j.createdAt),
        publishedAt: toIso(j.publishedAt),
        closesAt: toIso(j.closesAt),
      }));
    },
  },

  applications: {
    label: "Applications",
    audience: ["admin", "organization"],
    columns: [
      { key: "applicationId", label: "Application id" },
      { key: "jobId", label: "Job id" },
      { key: "jobTitle", label: "Job title" },
      { key: "status", label: "Stage" },
      { key: "appliedAt", label: "Applied (UTC)" },
    ],
    async build({ range, organizationId }) {
      const filter = { ...inRange("appliedAt", range), ...(organizationId ? { organization: organizationId } : {}) };
      const docs = await records(
        Application.find(filter).select("job status appliedAt").populate("job", "title").sort({ appliedAt: 1 }),
      );
      return docs.map((a) => ({
        applicationId: String(a._id),
        jobId: a.job ? String(a.job._id) : "",
        jobTitle: a.job?.title || "",
        status: canonicalStage(a.status),
        appliedAt: toIso(a.appliedAt),
      }));
    },
  },

  hiring_pipeline: {
    label: "Hiring pipeline",
    audience: ["admin", "organization"],
    columns: [
      { key: "stage", label: "Current stage" },
      { key: "applications", label: "Applications" },
    ],
    async build({ range, organizationId }) {
      // Aggregation stages do not cast ids, so the organisation is converted explicitly.
      const match = {
        ...inRange("appliedAt", range),
        ...(organizationId ? { organization: new mongoose.Types.ObjectId(organizationId) } : {}),
      };
      const groups = await Application.aggregate([{ $match: match }, { $group: { _id: "$status", applications: { $sum: 1 } } }]);
      // Legacy stage names are folded into the lifecycle names so counts match the dashboard.
      const totals = new Map();
      for (const g of groups) {
        const stage = canonicalStage(g._id) || "unknown";
        totals.set(stage, (totals.get(stage) || 0) + g.applications);
      }
      return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([stage, applications]) => ({ stage, applications }));
    },
  },

  employment_records: {
    label: "Employment records",
    audience: ["admin", "organization"],
    columns: [
      { key: "placementId", label: "Placement id" },
      { key: "jobTitle", label: "Job title" },
      { key: "employmentStatus", label: "Employment status" },
      { key: "statusSource", label: "Status source" },
      { key: "verified", label: "Independently verified" },
      { key: "createdAt", label: "Created (UTC)" },
      { key: "statusUpdatedAt", label: "Status updated (UTC)" },
    ],
    async build({ range, organizationId }) {
      const filter = { ...inRange("createdAt", range), ...(organizationId ? { organization: organizationId } : {}) };
      const docs = await records(
        Placement.find(filter).select("status employmentStatusSource verification createdAt employmentStatusUpdatedAt job").populate("job", "title").sort({ createdAt: 1 }),
      );
      return docs.map((p) => ({
        placementId: String(p._id),
        jobTitle: p.job?.title || "",
        employmentStatus: p.status || "",
        statusSource: p.employmentStatusSource || "",
        verified: p.verification?.isVerified === true,
        createdAt: toIso(p.createdAt),
        statusUpdatedAt: toIso(p.employmentStatusUpdatedAt),
      }));
    },
  },

  subscriptions: {
    label: "Subscriptions",
    audience: ["admin", "organization"],
    columns: [
      { key: "subscriptionId", label: "Subscription id" },
      { key: "subscriberType", label: "Subscriber type" },
      { key: "subscriberId", label: "Subscriber id" },
      { key: "planTier", label: "Plan" },
      { key: "status", label: "Status" },
      { key: "priceInr", label: "Price (INR)" },
      { key: "currentPeriodStart", label: "Period start (UTC)" },
      { key: "currentPeriodEnd", label: "Period end (UTC)" },
      { key: "cancelAtPeriodEnd", label: "Cancels at period end" },
    ],
    async build({ range, organizationId }) {
      const filter = {
        ...inRange("currentPeriodStart", range),
        ...(organizationId ? { subscriberType: "organization", subscriberId: organizationId } : {}),
      };
      const docs = await records(Subscription.find(filter).sort({ currentPeriodStart: 1 }));
      return docs.map((s) => ({
        subscriptionId: String(s._id),
        subscriberType: s.subscriberType,
        subscriberId: String(s.subscriberId),
        planTier: s.planTier,
        status: s.status,
        priceInr: s.priceInr ?? 0,
        currentPeriodStart: toIso(s.currentPeriodStart),
        currentPeriodEnd: toIso(s.currentPeriodEnd),
        cancelAtPeriodEnd: s.cancelAtPeriodEnd === true,
      }));
    },
  },

  payments: {
    label: "Payments",
    audience: ["admin", "organization"],
    columns: [
      { key: "transactionNumber", label: "Transaction" },
      { key: "invoiceNumber", label: "Invoice" },
      { key: "subscriberType", label: "Subscriber type" },
      { key: "planTier", label: "Plan" },
      { key: "amount", label: "Amount" },
      { key: "currency", label: "Currency" },
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Created (UTC)" },
    ],
    async build({ range, organizationId }) {
      const filter = {
        ...inRange("createdAt", range),
        ...(organizationId ? { subscriberType: "organization", subscriberId: organizationId } : {}),
      };
      const docs = await records(
        PaymentTransaction.find(filter)
          .select("transactionNumber invoiceNumber subscriberType planTier amount currency status createdAt")
          .sort({ createdAt: 1 }),
      );
      return docs.map((t) => ({
        transactionNumber: t.transactionNumber || "",
        invoiceNumber: t.invoiceNumber || "",
        subscriberType: t.subscriberType,
        planTier: t.planTier,
        amount: t.amount ?? 0,
        currency: t.currency || "INR",
        status: t.status,
        createdAt: toIso(t.createdAt),
      }));
    },
  },

  revenue: {
    label: "Revenue (cash basis, daily)",
    audience: ["admin"],
    columns: [
      { key: "date", label: "Date (IST)" },
      { key: "grossCaptured", label: "Gross captured (INR)" },
      { key: "refunds", label: "Refunds (INR)" },
      { key: "netRevenue", label: "Net revenue (INR)" },
      { key: "successfulPayments", label: "Successful payments" },
      { key: "failedPayments", label: "Failed payments" },
    ],
    async build({ range }) {
      const [captured, refunds, failed] = await Promise.all([
        PaymentTransaction.aggregate([
          { $match: { status: { $in: ["captured", "refunded"] }, ...inRange("createdAt", range) } },
          { $group: { _id: dayOf("$createdAt"), amount: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
        // Refund date is the last status update, matching the dashboard definition.
        PaymentTransaction.aggregate([
          { $match: { status: "refunded", ...inRange("updatedAt", range) } },
          { $group: { _id: dayOf("$updatedAt"), amount: { $sum: "$amount" } } },
        ]),
        PaymentTransaction.aggregate([
          { $match: { status: "failed", ...inRange("createdAt", range) } },
          { $group: { _id: dayOf("$createdAt"), count: { $sum: 1 } } },
        ]),
      ]);
      const days = new Map();
      const day = (key) => {
        if (!days.has(key)) days.set(key, { grossCapturedAmount: 0, refundsAmount: 0, successfulCount: 0, failedCount: 0 });
        return days.get(key);
      };
      for (const r of captured) {
        const d = day(r._id);
        d.grossCapturedAmount += r.amount;
        d.successfulCount += r.count;
      }
      for (const r of refunds) day(r._id).refundsAmount += r.amount;
      for (const r of failed) day(r._id).failedCount += r.count;

      const rows = [...days.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, ...summarizeRevenue(v) }));
      // Totals are computed from the whole range (not by adding rounded daily values).
      const totalsInput = [...days.values()].reduce(
        (acc, v) => ({
          grossCapturedAmount: acc.grossCapturedAmount + v.grossCapturedAmount,
          refundsAmount: acc.refundsAmount + v.refundsAmount,
          successfulCount: acc.successfulCount + v.successfulCount,
          failedCount: acc.failedCount + v.failedCount,
        }),
        { grossCapturedAmount: 0, refundsAmount: 0, successfulCount: 0, failedCount: 0 },
      );
      return [...rows, { date: "TOTAL", ...summarizeRevenue(totalsInput) }];
    },
  },

  platform_activity: {
    label: "Platform activity (audit events by category, daily)",
    audience: ["admin"],
    columns: [
      { key: "date", label: "Date (IST)" },
      { key: "category", label: "Category" },
      { key: "events", label: "Events" },
    ],
    async build({ range }) {
      const rows = await AuditLog.aggregate([
        { $match: inRange("createdAt", range) },
        {
          $group: {
            _id: { day: dayOf("$createdAt"), category: { $arrayElemAt: [{ $split: ["$action", "."] }, 0] } },
            events: { $sum: 1 },
          },
        },
        { $sort: { "_id.day": 1, "_id.category": 1 } },
      ]);
      return rows.map((r) => ({ date: r._id.day, category: r._id.category, events: r.events }));
    },
  },
};

const REPORT_TYPES = Object.freeze(Object.keys(REPORTS));

const reportFor = (type, audience) => {
  const report = REPORTS[type];
  if (!report || !report.audience.includes(audience)) return null;
  return report;
};

/**
 * Runs one report. `scope` is { audience: "admin" | "organization", organizationId? }.
 * Returns the columns, rows and the resolved date range that the figures cover.
 */
const runReport = async ({ type, scope, query = {} }) => {
  const report = reportFor(type, scope.audience);
  if (!report) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  let range;
  try {
    range = resolveRange({ range: query.range || "30d", from: query.from, to: query.to });
  } catch (error) {
    // Same mapping as the admin dashboard: a 400 with a stable code, never a 500.
    if (error instanceof AnalyticsRangeError) throw new AppError(error.message, 400, error.code);
    throw error;
  }
  const rows = limitRows(
    await report.build({
      range,
      organizationId: scope.audience === "organization" ? scope.organizationId : null,
    }),
  );
  return {
    type,
    label: report.label,
    columns: report.columns,
    rows,
    range: { preset: range.preset, from: range.fromDay, to: range.toDay },
    timezone: ANALYTICS_TIMEZONE,
    generatedAt: new Date().toISOString(),
    generatedOn: istDayOf(new Date()),
  };
};

// ---- CSV ------------------------------------------------------------------------------------------------------------

// Spreadsheet formula injection: a text cell starting with one of these characters can run as a formula when the
// file is opened in Excel or Sheets. Such cells are prefixed with an apostrophe so they display as plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || text.startsWith("'")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

/** RFC 4180 CSV with a header row. Numbers stay numeric; text is neutralised against formula injection. */
const toCsv = (columns, rows) => {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(","));
  return [header, ...body].join("\r\n") + "\r\n";
};

module.exports = {
  REPORTS,
  REPORT_TYPES,
  MAX_ROWS,
  reportFor,
  runReport,
  toCsv,
  csvCell,
};
