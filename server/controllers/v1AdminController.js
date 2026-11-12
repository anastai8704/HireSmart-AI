const User = require("../models/User");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { Placement } = require("../models/Placement");
const { Subscription } = require("../models/Subscription");
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
const AuthSession = require("../models/AuthSession");
const AIAnalysis = require("../models/AIAnalysis");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { audit } = require("../services/auditService");
const { parse, applyCursor, meta } = require("../utils/pagination");
const { resolveRange, AnalyticsRangeError } = require("../domain/analyticsDefinitions");
const { computeAnalytics } = require("../services/adminAnalyticsService");
const { redact } = require("../utils/redact");const { TIME_ZONE, istDayKey } = require("../utils/istTime");


const requireAdmin = (req) => {
  if (req.auth.platformRole !== "platform_admin")
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
};

/**
 * Aggregated Admin Overview Analytics API
 * GET /api/v1/admin/analytics/overview
 */
exports.overviewAnalytics = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const targetOrgId = req.query.organizationId ? String(req.query.organizationId) : null;

  // Range-aware KPIs and series (Phase 5). Dates are IST days; see domain/analyticsDefinitions.js.
  let range;
  try {
    range = resolveRange({ range: req.query.range, from: req.query.from, to: req.query.to });
  } catch (error) {
    if (error instanceof AnalyticsRangeError) throw new AppError(error.message, 400, error.code);
    throw error;
  }
  const analytics = await computeAnalytics(range);

  // 1. Users Counts
  const [totalUsers, totalCandidates, totalRecruiters, totalAdmins, suspendedUsers] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: "candidate" }),
    User.countDocuments({ role: "recruiter" }),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ accountStatus: "suspended" }),
  ]);

  // 2. Companies Counts
  const [
    totalCompanies,
    verifiedCompanies,
    pendingVerification,
    underReviewCompanies,
    rejectedCompanies,
    suspendedCompanies,
  ] = await Promise.all([
    Organization.countDocuments({}),
    Organization.countDocuments({ verificationStatus: "verified" }),
    Organization.countDocuments({ verificationStatus: "pending" }),
    Organization.countDocuments({ verificationStatus: "under_review" }),
    Organization.countDocuments({ verificationStatus: "rejected" }),
    Organization.countDocuments({ verificationStatus: "suspended" }),
  ]);

  // 3. Jobs Counts
  const [totalJobs, activeJobs, pendingJobs, draftJobs, closedJobs] = await Promise.all([
    Job.countDocuments({}),
    Job.countDocuments({ status: "published", "moderation.status": { $in: ["approved", "none"] } }),
    Job.countDocuments({ $or: [{ "moderation.status": "pending" }, { "pendingChanges.status": "pending" }] }),
    Job.countDocuments({ status: "draft" }),
    Job.countDocuments({ status: "closed" }),
  ]);

  // 4. Applications Counts
  const [
    totalApplications,
    submittedApps,
    underReviewApps,
    shortlistedApps,
    interviewApps,
    offerApps,
    hiredApps,
    rejectedApps,
  ] = await Promise.all([
    Application.countDocuments({}),
    Application.countDocuments({ status: { $in: ["Applied", "submitted"] } }),
    Application.countDocuments({ status: "under_review" }),
    Application.countDocuments({ status: { $in: ["Shortlisted", "shortlisted"] } }),
    Application.countDocuments({ status: { $in: ["Interview", "interview"] } }),
    Application.countDocuments({ status: "offer" }),
    Application.countDocuments({ status: { $in: ["Selected", "hired"] } }),
    Application.countDocuments({ status: { $in: ["Rejected", "rejected"] } }),
  ]);

  // 5. Placements Counts
  const [
    totalPlacements,
    joiningConfirmedCount,
    verifiedPlacementsCount,
    currentlyWorkingCount,
    employmentEndedCount,
  ] = await Promise.all([
    Placement.countDocuments({}),
    Placement.countDocuments({ status: "joining_confirmed" }),
    // "Verified" means a platform admin verified it, never an organization- or candidate-reported status.
    Placement.countDocuments({ "verification.isVerified": true }),
    Placement.countDocuments({ status: "currently_working" }),
    Placement.countDocuments({ status: "employment_ended" }),
  ]);

  // 6. 12-Month Time-Series Aggregations
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const [appMonthly, placementMonthly] = await Promise.all([
    Application.aggregate([
      { $match: { appliedAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$appliedAt" } },
          applications: { $sum: 1 },
          hires: {
            $sum: { $cond: [{ $in: ["$status", ["Selected", "hired"]] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Placement.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          verifiedPlacements: {
            $sum: { $cond: [{ $eq: ["$verification.isVerified", true] }, 1, 0] },
          },
          joinings: {
            $sum: { $cond: [{ $in: ["$status", ["joining_confirmed", "placement_verified", "currently_working"]] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const monthlyTrends = [];
  const cur = new Date(twelveMonthsAgo);
  const now = new Date();
  while (cur <= now) {
    const ym = istDayKey(cur).slice(0, 7);
    const a = appMonthly.find((m) => m._id === ym);
    const p = placementMonthly.find((m) => m._id === ym);
    monthlyTrends.push({
      yearMonth: ym,
      monthLabel: new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", year: "2-digit" }).format(cur),
      applications: a ? a.applications : 0,
      hires: a ? a.hires : 0,
      verifiedPlacements: p ? p.verifiedPlacements : 0,
      joinings: p ? p.joinings : 0,
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  // 7. Company-Wise Statistics
  const companyAgg = await Organization.aggregate([
    {
      $lookup: {
        from: "jobs",
        localField: "_id",
        foreignField: "organization",
        as: "jobs",
      },
    },
    {
      $lookup: {
        from: "applications",
        localField: "_id",
        foreignField: "organization",
        as: "applications",
      },
    },
    {
      $lookup: {
        from: "placements",
        localField: "_id",
        foreignField: "organization",
        as: "placements",
      },
    },
    {
      $project: {
        id: "$_id",
        name: 1,
        slug: 1,
        verificationStatus: 1,
        riskScore: 1,
        jobCount: { $size: "$jobs" },
        publishedJobsCount: {
          $size: {
            $filter: {
              input: "$jobs",
              as: "j",
              cond: { $eq: ["$$j.status", "published"] },
            },
          },
        },
        applicationCount: { $size: "$applications" },
        shortlistCount: {
          $size: {
            $filter: {
              input: "$applications",
              as: "a",
              cond: { $in: ["$$a.status", ["Shortlisted", "shortlisted"]] },
            },
          },
        },
        hiredCount: {
          $size: {
            $filter: {
              input: "$applications",
              as: "a",
              cond: { $in: ["$$a.status", ["Selected", "hired"]] },
            },
          },
        },
        placementCount: { $size: "$placements" },
      },
    },
    { $sort: { applicationCount: -1, jobCount: -1 } },
  ]);

  const topActiveCompanies = companyAgg.slice(0, 5);

  // Optional: Deep dive for single company
  let deepDive = null;
  if (targetOrgId) {
    const target = companyAgg.find((c) => String(c.id) === targetOrgId || c.slug === targetOrgId);
    if (target) {
      deepDive = target;
    }
  }

  // 7b. Operational queues that need an administrator now (live counts, not range-based).
  // Joinings confirmed by the parties but not yet verified by the platform.
  // Renewals whose payment failed and that are waiting on the provider or the subscriber.
  const [placementsAwaitingVerification, subscriptionsPastDue] = await Promise.all([
    Placement.countDocuments({ status: "joining_confirmed", "verification.isVerified": { $ne: true } }),
    Subscription.countDocuments({ status: "past_due" }),
  ]);

  // 8. Recent Audit Activity
  const recentActivity = await AuditLog.find({})
    .populate("actor", "name email role")
    .populate("organization", "name slug")
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    data: {
      range: { preset: range.preset, timezone: range.timezone, from: range.fromDay, to: range.toDay, days: range.days },
      ...analytics,
      users: {
        total: totalUsers,
        candidates: totalCandidates,
        recruiters: totalRecruiters,
        admins: totalAdmins,
        suspended: suspendedUsers,
      },
      companies: {
        total: totalCompanies,
        verified: verifiedCompanies,
        pending: pendingVerification,
        underReview: underReviewCompanies,
        rejected: rejectedCompanies,
        suspended: suspendedCompanies,
      },
      jobs: {
        total: totalJobs,
        active: activeJobs,
        pending: pendingJobs,
        draft: draftJobs,
        closed: closedJobs,
      },
      applications: {
        total: totalApplications,
        submitted: submittedApps,
        underReview: underReviewApps,
        shortlisted: shortlistedApps,
        interview: interviewApps,
        offer: offerApps,
        hired: hiredApps,
        rejected: rejectedApps,
      },
      placements: {
        total: totalPlacements,
        joiningConfirmed: joiningConfirmedCount,
        verifiedPlacements: verifiedPlacementsCount,
        currentlyWorking: currentlyWorkingCount,
        employmentEnded: employmentEndedCount,
      },
      queues: { placementsAwaitingVerification, subscriptionsPastDue },
      companyWiseStats: companyAgg,
      deepDive,
      monthlyTrends,
      topActiveCompanies,
      recentActivity,
    },
  });
});

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.users = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const page = parse(req.query);
  const filter = {};
  if (req.query.status) filter.accountStatus = req.query.status;
  if (req.query.role) filter.role = req.query.role;
  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(req.query.search).slice(0, 100), "i");
    filter.$or = [{ name: pattern }, { email: pattern }];
  }
  const scoped = applyCursor(filter, page.after);
  const items = await User.find(scoped)
    .select("name email role isActive accountStatus emailVerified createdAt updatedAt")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit, await User.countDocuments(filter)) });
});

exports.organizations = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const page = parse(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.verificationStatus && req.query.verificationStatus !== "all") {
    filter.verificationStatus = req.query.verificationStatus;
  }
  if (req.query.riskLevel && req.query.riskLevel !== "all") {
    if (req.query.riskLevel === "low") filter.riskScore = { $lte: 25 };
    else if (req.query.riskLevel === "medium") filter.riskScore = { $gt: 25, $lte: 60 };
    else if (req.query.riskLevel === "high") filter.riskScore = { $gt: 60 };
  }
  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(req.query.search).slice(0, 100), "i");
    filter.$or = [
      { name: pattern },
      { businessEmail: pattern },
      { gstin: pattern },
      { registrationNumber: pattern },
    ];
  }
  const items = await Organization.find(applyCursor(filter, page.after))
    .select(
      "name slug industry size timezone status verificationStatus businessEmail phone address registrationNumber gstin riskScore riskFlags verifiedAt rejectionReason settings createdAt updatedAt",
    )
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({
    data: items,
    meta: meta(items, page.limit, await Organization.countDocuments(filter)),
  });
});

exports.audit = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const page = parse(req.query);
  const filter = req.query.organizationId ? { organization: req.query.organizationId } : {};
  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(req.query.search).slice(0, 100), "i");
    filter.$or = [{ action: pattern }, { resourceType: pattern }, { outcome: pattern }];
  }
  if (req.query.action) filter.action = String(req.query.action).slice(0, 120);
  if (req.query.resourceType) filter.resourceType = String(req.query.resourceType).slice(0, 80);
  if (req.query.actorId && /^[a-f\d]{24}$/i.test(req.query.actorId)) filter.actor = req.query.actorId;
  const items = await AuditLog.find(applyCursor(filter, page.after))
    .populate("actor", "name email")
    .populate("organization", "name")
    .sort({ _id: -1 })
    .limit(page.limit)
    .lean();
  // Defence in depth: rows written before redaction existed are cleaned on the way out too.
  const data = items.map((item) => ({
    ...item,
    metadata: redact(item.metadata || {}),
    previousState: item.previousState === undefined ? undefined : redact(item.previousState),
    newState: item.newState === undefined ? undefined : redact(item.newState),
  }));
  res.json({ data, meta: meta(items, page.limit) });
});

exports.security = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const page = parse(req.query);
  const filter = {};
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.search) {
    filter.type = new RegExp(escapeRegex(req.query.search).slice(0, 100), "i");
  }
  const items = await SecurityEvent.find(applyCursor(filter, page.after))
    .populate("user", "name")
    .populate("organization", "name")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});

exports.organizationAudit = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const filter = applyCursor({ organization: req.auth.organizationId }, page.after);
  if (req.query.action) filter.action = req.query.action;
  const items = await AuditLog.find(filter).sort({ _id: -1 }).limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});

exports.organizationSecurity = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const filter = applyCursor({ organization: req.auth.organizationId }, page.after);
  if (req.query.severity) filter.severity = req.query.severity;
  const items = await SecurityEvent.find(filter).sort({ _id: -1 }).limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});

exports.aiUsage = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const data = await AIAnalysis.aggregate([
    {
      $group: {
        _id: {
          organization: "$organization",
          feature: "$feature",
          provider: "$provider",
          model: "$model",
        },
        runs: { $sum: 1 },
        inputTokens: { $sum: "$usage.inputTokens" },
        outputTokens: { $sum: "$usage.outputTokens" },
        estimatedCostUsd: { $sum: "$usage.estimatedCostUsd" },
        averageLatencyMs: { $avg: "$usage.latencyMs" },
        fallbacks: { $sum: { $cond: ["$fallbackUsed", 1, 0] } },
      },
    },
    { $sort: { runs: -1 } },
    { $limit: 500 },
  ]);
  res.json({ data });
});

exports.aiActivity = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const page = parse(req.query);
  const filter = {};
  if (req.query.feature) filter.feature = req.query.feature;
  const items = await AIAnalysis.find(applyCursor(filter, page.after))
    .select("user organization feature subjectType provider model status fallbackUsed createdAt")
    .populate("user", "name")
    .populate("organization", "name")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});

exports.suspend = asyncHandler(async (req, res) => {
  requireAdmin(req);
  if (String(req.user._id) === req.params.userId)
    throw new AppError("Administrators cannot suspend themselves", 409, "SELF_SUSPEND");
  // "before" returns the stored status as it was when this update applied, for the audit trail.
  const before = await User.findByIdAndUpdate(
    req.params.userId,
    { isActive: false, accountStatus: "suspended", tokenInvalidBefore: new Date() },
    { returnDocument: "before" },
  ).select("name email role accountStatus");
  if (!before) throw new AppError("User not found", 404, "RESOURCE_NOT_FOUND");
  const user = { _id: before._id, accountStatus: "suspended" };
  await AuthSession.updateMany(
    { user: user._id, revokedAt: null },
    { revokedAt: new Date(), revokeReason: req.body.reason },
  );
  await audit({
    req,
    action: "admin.user_suspended",
    resourceType: "user",
    resourceId: user._id,
    previousState: { accountStatus: before.accountStatus },
    newState: { accountStatus: "suspended" },
    reason: req.body.reason,
    metadata: {},
  });
  res.json({ data: { id: user._id, status: user.accountStatus } });
});

exports.reactivate = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const before = await User.findOneAndUpdate(
    { _id: req.params.userId, accountStatus: "suspended" },
    { isActive: true, accountStatus: "active", tokenInvalidBefore: new Date() },
    { returnDocument: "before", runValidators: true },
  ).select("name email role accountStatus");
  if (!before) throw new AppError("Suspended user not found", 404, "RESOURCE_NOT_FOUND");
  await audit({
    req,
    action: "admin.user_reactivated",
    resourceType: "user",
    resourceId: before._id,
    previousState: { accountStatus: "suspended" },
    newState: { accountStatus: "active" },
    reason: req.body.reason,
    metadata: {},
  });
  res.json({ data: { id: before._id, status: "active" } });
});
