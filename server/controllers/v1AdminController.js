const mongoose = require("mongoose");
const User = require("../models/User");
const { ResumeVersion } = require("../models/Resume");
const storageService = require("../services/storageService");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { Placement } = require("../models/Placement");
const Interview = require("../models/Interview");
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
    Placement.countDocuments({ "employment.status": "active_verified" }),
    Placement.countDocuments({ "employment.status": "employment_ended_verified" }),
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
            $sum: {
              $cond: [
                { $or: [{ $in: ["$status", ["joining_confirmed", "placement_verified"]] }, { $eq: ["$employment.status", "active_verified"] }] },
                1,
                0,
              ],
            },
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

// Admin read-only access to a candidate's resume files (Requirement 9). Platform admins only; every list and
// download is audited before anything is returned, so a failed audit write blocks the access.
const loadCandidateForAdmin = async (candidateId) => {
  if (!mongoose.isValidObjectId(candidateId)) throw new AppError("Candidate not found", 404, "RESOURCE_NOT_FOUND");
  const candidate = await User.findOne({ _id: candidateId, role: "candidate" }).select("_id name").lean();
  if (!candidate) throw new AppError("Candidate not found", 404, "RESOURCE_NOT_FOUND");
  return candidate;
};

const adminResumeDto = (v) => ({
  id: v._id,
  resumeId: v.resume,
  version: v.version,
  originalName: v.originalName,
  mimeType: v.mimeType,
  size: v.size,
  processingStatus: v.processingStatus,
  createdAt: v.createdAt,
});

exports.candidateResumes = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const candidate = await loadCandidateForAdmin(req.params.candidateId);
  const versions = await ResumeVersion.find({
    candidate: candidate._id,
    processingStatus: { $ne: "deleted" },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  await audit({
    req,
    action: "admin.candidate_resumes_viewed",
    resourceType: "user",
    resourceId: candidate._id,
    metadata: { versionCount: versions.length },
  });
  res.json({ data: versions.map(adminResumeDto) });
});

exports.candidateResumeDownload = asyncHandler(async (req, res, next) => {
  requireAdmin(req);
  const candidate = await loadCandidateForAdmin(req.params.candidateId);
  if (!mongoose.isValidObjectId(req.params.versionId)) {
    throw new AppError("Resume version not found", 404, "RESOURCE_NOT_FOUND");
  }
  const version = await ResumeVersion.findOne({ _id: req.params.versionId, candidate: candidate._id }).select("+storageKey");
  if (!version || version.processingStatus === "deleted") {
    throw new AppError("Resume version not found", 404, "RESOURCE_NOT_FOUND");
  }
  await audit({
    req,
    action: "admin.candidate_resume_downloaded",
    resourceType: "resume",
    resourceId: version._id,
    metadata: { candidateId: String(candidate._id), resumeId: String(version.resume), version: version.version },
  });
  const stream = await storageService.getFileStream(version.storageKey, version.storageProvider);
  res.setHeader("Content-Type", version.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(version.originalName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  stream.on("error", next);
  stream.pipe(res);
});

/**
 * Candidate 360° Profile (Phase 8).
 * Secure admin-only overview of a candidate's complete journey across companies:
 * profile, resumes, applications, interviews, offers, and verified vs reported placements.
 */
exports.candidate360 = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const { candidateId } = req.params;
  if (!mongoose.isValidObjectId(candidateId)) {
    throw new AppError("Candidate not found", 404, "RESOURCE_NOT_FOUND");
  }
  const candidate = await User.findOne({ _id: candidateId, role: "candidate" })
    .select("_id name email phone headline location bio skills experience education accountStatus emailVerified createdAt updatedAt")
    .lean();
  if (!candidate) throw new AppError("Candidate not found", 404, "RESOURCE_NOT_FOUND");

  const [resumes, applications, interviews, placements] = await Promise.all([
    ResumeVersion.find({ candidate: candidate._id, processingStatus: { $ne: "deleted" } })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    Application.find({ candidate: candidate._id })
      .populate("job", "title location workplaceMode department")
      .populate("organization", "name slug")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Interview.find({ candidate: candidate._id })
      .populate("job", "title")
      .populate("organization", "name")
      .sort({ scheduledStart: -1 })
      .limit(50)
      .lean(),
    Placement.find({ candidate: candidate._id })
      .populate("job", "title")
      .populate("organization", "name")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  await audit({
    req,
    action: "admin.candidate_360_viewed",
    resourceType: "user",
    resourceId: candidate._id,
    metadata: {
      resumeCount: resumes.length,
      applicationCount: applications.length,
      interviewCount: interviews.length,
      placementCount: placements.length,
    },
  });

  res.json({
    data: {
      candidate: {
        id: candidate._id,
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        headline: candidate.headline,
        location: candidate.location,
        bio: candidate.bio,
        skills: candidate.skills || [],
        experience: candidate.experience || [],
        education: candidate.education || [],
        accountStatus: candidate.accountStatus,
        emailVerified: candidate.emailVerified,
        createdAt: candidate.createdAt,
      },
      resumes: resumes.map(adminResumeDto),
      applications: applications.map((a) => ({
        id: a._id,
        jobId: a.job?._id || a.job,
        jobTitle: a.job?.title || "Job",
        workplaceMode: a.job?.workplaceMode,
        organizationId: a.organization?._id || a.organization,
        organizationName: a.organization?.name || "Company",
        status: a.status,
        matchScore: a.matchScore,
        offer:
          a.offer?.status && a.offer.status !== "none"
            ? {
                status: a.offer.status,
                designation: a.offer.designation,
                ctc: a.offer.ctc,
                joiningDate: a.offer.joiningDate,
                issuedAt: a.offer.issuedAt,
                respondedAt: a.offer.respondedAt,
              }
            : null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      interviews: interviews.map((i) => ({
        id: i._id,
        jobTitle: i.job?.title || "Job",
        organizationName: i.organization?.name || "Company",
        round: i.round,
        type: i.type,
        status: i.status,
        scheduledStart: i.scheduledStart,
        scheduledEnd: i.scheduledEnd,
        timezone: i.timezone,
        meetingProvider: i.meetingProvider,
        meetingUrl: i.meetingUrl,
      })),
      placements: placements.map((p) => ({
        id: p._id,
        jobTitle: p.job?.title || "Job",
        organizationName: p.organization?.name || "Company",
        status: p.status,
        lastVerifiedStatus: p.lastVerifiedStatus,
        isVerified: Boolean(p.verification?.isVerified),
        verifiedAt: p.verification?.verifiedAt,
        reportedBy: p.reportedBy || "system",
        joinedDate: p.employment?.startDate || p.joinedDate,
        createdAt: p.createdAt,
      })),
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
    const rawSearch = String(req.query.search).trim();
    const pattern = new RegExp(escapeRegex(rawSearch).slice(0, 100), "i");
    filter.$or = [{ name: pattern }, { email: pattern }];
    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
      filter.$or.push({ _id: new mongoose.Types.ObjectId(rawSearch) });
    }
  }

  let sort = { _id: -1 };
  if (req.query.sortBy === "oldest") sort = { _id: 1 };
  else if (req.query.sortBy === "name_asc") sort = { name: 1, _id: 1 };
  else if (req.query.sortBy === "name_desc") sort = { name: -1, _id: -1 };
  else if (req.query.sortBy === "status") sort = { accountStatus: 1, _id: -1 };

  const scoped = applyCursor(filter, page.after);
  const [items, totalMatching, totalUsers, totalCandidates, totalRecruiters, totalAdmins, suspendedUsers, activeUsers] =
    await Promise.all([
      User.find(scoped)
        .select("name email role headline location phone skills isActive accountStatus emailVerified createdAt updatedAt")
        .sort(sort)
        .limit(page.limit),
      User.countDocuments(filter),
      User.countDocuments({}),
      User.countDocuments({ role: "candidate" }),
      User.countDocuments({ role: "recruiter" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ accountStatus: "suspended" }),
      User.countDocuments({ accountStatus: "active" }),
    ]);

  const responseMeta = meta(items, page.limit, totalMatching);
  responseMeta.counts = {
    total: totalUsers,
    candidates: totalCandidates,
    recruiters: totalRecruiters,
    admins: totalAdmins,
    suspended: suspendedUsers,
    active: activeUsers,
  };

  res.json({ data: items, meta: responseMeta });
});

exports.applications = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const page = parse(req.query);
  const filter = {};

  if (req.query.status && req.query.status !== "all") {
    const st = String(req.query.status).trim();
    if (st.toLowerCase() === "applied" || st.toLowerCase() === "submitted") {
      filter.status = { $in: ["Applied", "submitted"] };
    } else if (st.toLowerCase() === "under_review") {
      filter.status = "under_review";
    } else if (st.toLowerCase() === "shortlisted") {
      filter.status = { $in: ["Shortlisted", "shortlisted"] };
    } else if (st.toLowerCase() === "interview") {
      filter.status = { $in: ["Interview", "interview"] };
    } else if (st.toLowerCase() === "offer") {
      filter.status = "offer";
    } else if (st.toLowerCase() === "hired" || st.toLowerCase() === "selected") {
      filter.status = { $in: ["Selected", "hired"] };
    } else if (st.toLowerCase() === "rejected") {
      filter.status = { $in: ["Rejected", "rejected"] };
    } else {
      filter.status = st;
    }
  }

  if (req.query.organizationId && mongoose.Types.ObjectId.isValid(req.query.organizationId)) {
    filter.organization = new mongoose.Types.ObjectId(req.query.organizationId);
  }

  if (req.query.jobId && mongoose.Types.ObjectId.isValid(req.query.jobId)) {
    filter.job = new mongoose.Types.ObjectId(req.query.jobId);
  }

  if (req.query.candidateId && mongoose.Types.ObjectId.isValid(req.query.candidateId)) {
    filter.candidate = new mongoose.Types.ObjectId(req.query.candidateId);
  }

  if (req.query.search) {
    const rawSearch = String(req.query.search).trim();
    const pattern = new RegExp(escapeRegex(rawSearch).slice(0, 100), "i");
    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
      filter.$or = [
        { _id: new mongoose.Types.ObjectId(rawSearch) },
        { "jobSnapshot.title": pattern },
        { "jobSnapshot.company": pattern },
      ];
    } else {
      const [matchedCandidates, matchedJobs, matchedOrgs] = await Promise.all([
        User.find({ role: "candidate", $or: [{ name: pattern }, { email: pattern }] }).select("_id").limit(50),
        Job.find({ title: pattern }).select("_id").limit(50),
        Organization.find({ name: pattern }).select("_id").limit(50),
      ]);
      const candIds = matchedCandidates.map((c) => c._id);
      const jobIds = matchedJobs.map((j) => j._id);
      const orgIds = matchedOrgs.map((o) => o._id);

      filter.$or = [
        { "jobSnapshot.title": pattern },
        { "jobSnapshot.company": pattern },
        { candidate: { $in: candIds } },
        { job: { $in: jobIds } },
        { organization: { $in: orgIds } },
      ];
    }
  }

  if (req.query.from || req.query.to) {
    filter.appliedAt = {};
    if (req.query.from) filter.appliedAt.$gte = new Date(req.query.from);
    if (req.query.to) {
      const toDate = new Date(req.query.to);
      toDate.setHours(23, 59, 59, 999);
      filter.appliedAt.$lte = toDate;
    }
  }

  let sort = { _id: -1 };
  if (req.query.sortBy === "oldest") sort = { appliedAt: 1, _id: 1 };
  else if (req.query.sortBy === "status") sort = { status: 1, _id: -1 };
  else sort = { appliedAt: -1, _id: -1 };

  const scoped = applyCursor(filter, page.after);
  const [
    items,
    totalMatching,
    totalAll,
    submittedCount,
    underReviewCount,
    shortlistedCount,
    interviewCount,
    offerCount,
    hiredCount,
    rejectedCount,
  ] = await Promise.all([
    Application.find(scoped)
      .populate("candidate", "name email phone location headline accountStatus")
      .populate("job", "title department workplaceMode employmentType location status")
      .populate("organization", "name slug logo verificationStatus")
      .sort(sort)
      .limit(page.limit)
      .lean(),
    Application.countDocuments(filter),
    Application.countDocuments({}),
    Application.countDocuments({ status: { $in: ["Applied", "submitted"] } }),
    Application.countDocuments({ status: "under_review" }),
    Application.countDocuments({ status: { $in: ["Shortlisted", "shortlisted"] } }),
    Application.countDocuments({ status: { $in: ["Interview", "interview"] } }),
    Application.countDocuments({ status: "offer" }),
    Application.countDocuments({ status: { $in: ["Selected", "hired"] } }),
    Application.countDocuments({ status: { $in: ["Rejected", "rejected"] } }),
  ]);

  const responseMeta = meta(items, page.limit, totalMatching);
  responseMeta.counts = {
    total: totalAll,
    submitted: submittedCount,
    underReview: underReviewCount,
    shortlisted: shortlistedCount,
    interview: interviewCount,
    offer: offerCount,
    hired: hiredCount,
    rejected: rejectedCount,
  };

  res.json({
    data: items,
    meta: responseMeta,
  });
});

exports.applicationDetail = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const { applicationId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(applicationId)) {
    throw new AppError("Invalid application ID", 400, "INVALID_ID");
  }

  const application = await Application.findById(applicationId)
    .populate("candidate", "name email phone location headline bio skills experience education accountStatus emailVerified createdAt")
    .populate("job", "title department workplaceMode employmentType location status compensation experience")
    .populate("organization", "name slug logo verificationStatus industry size")
    .populate("statusHistory.changedBy", "name email role")
    .lean();

  if (!application) {
    throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  }

  const interviews = await Interview.find({
    candidate: application.candidate?._id,
    job: application.job?._id,
  })
    .sort({ scheduledStart: -1 })
    .lean();

  await audit({
    req,
    action: "admin.application_viewed",
    resourceType: "application",
    resourceId: application._id,
    metadata: {
      candidateId: application.candidate?._id,
      jobId: application.job?._id,
      organizationId: application.organization?._id,
      status: application.status,
    },
  });

  res.json({
    data: {
      ...application,
      interviews,
    },
  });
});

exports.flagUser = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const { userId } = req.params;
  const { reason } = req.body;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user ID", 400, "INVALID_ID");
  }
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404, "RESOURCE_NOT_FOUND");

  await SecurityEvent.create({
    user: user._id,
    type: "suspicious_activity_flagged",
    severity: "medium",
    details: { reason: String(reason || "Flagged by platform admin").slice(0, 500), flaggedBy: req.user._id },
  });

  await audit({
    req,
    action: "admin.user_flagged_suspicious",
    resourceType: "user",
    resourceId: user._id,
    metadata: { reason },
  });

  res.json({ data: { success: true, userId: user._id } });
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
    const rawSearch = String(req.query.search).trim();
    const pattern = new RegExp(escapeRegex(rawSearch).slice(0, 100), "i");
    filter.$or = [
      { name: pattern },
      { businessEmail: pattern },
      { gstin: pattern },
      { registrationNumber: pattern },
    ];
    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
      filter.$or.push({ _id: new mongoose.Types.ObjectId(rawSearch) });
    }
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) {
      const toDate = new Date(req.query.to);
      toDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = toDate;
    }
  }

  let sort = { _id: -1 };
  if (req.query.sortBy === "oldest") sort = { _id: 1 };
  else if (req.query.sortBy === "name_asc") sort = { name: 1 };
  else if (req.query.sortBy === "name_desc") sort = { name: -1 };
  else if (req.query.sortBy === "risk_high") sort = { riskScore: -1, _id: -1 };
  else if (req.query.sortBy === "risk_low") sort = { riskScore: 1, _id: -1 };

  const [items, totalMatching, pendingCount, underReviewCount, verifiedCount, rejectedCount, suspendedCount] =
    await Promise.all([
      Organization.find(applyCursor(filter, page.after))
        .select(
          "name slug industry size timezone status verificationStatus businessEmail phone address registrationNumber gstin businessType authorizedRepresentative riskScore riskFlags verifiedAt rejectionReason settings createdAt updatedAt",
        )
        .sort(sort)
        .limit(page.limit),
      Organization.countDocuments(filter),
      Organization.countDocuments({ verificationStatus: "pending" }),
      Organization.countDocuments({ verificationStatus: "under_review" }),
      Organization.countDocuments({ verificationStatus: "verified" }),
      Organization.countDocuments({ verificationStatus: "rejected" }),
      Organization.countDocuments({ verificationStatus: "suspended" }),
    ]);

  const responseMeta = meta(items, page.limit, totalMatching);
  responseMeta.counts = {
    total: await Organization.countDocuments({}),
    pending: pendingCount,
    underReview: underReviewCount,
    verified: verifiedCount,
    rejected: rejectedCount,
    suspended: suspendedCount,
  };

  res.json({
    data: items,
    meta: responseMeta,
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
