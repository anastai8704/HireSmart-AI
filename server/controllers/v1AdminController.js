const mongoose = require("mongoose");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { Placement } = require("../models/Placement");
const { Membership } = require("../models/Membership");
const { notify } = require("../services/notificationService");
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
const AuthSession = require("../models/AuthSession");
const AIAnalysis = require("../models/AIAnalysis");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { audit } = require("../services/auditService");
const { parse, applyCursor, meta } = require("../utils/pagination");
const logger = require("../utils/logger");

const requireAdmin = (req) => {
  if (req.auth.platformRole !== "platform_admin")
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
};

const PUBLIC_EDIT_FIELDS = new Set([
  "title",
  "company",
  "location",
  "salary",
  "compensation",
  "experience",
  "minExpYears",
  "maxExpYears",
  "educationRequired",
  "benefits",
  "industry",
  "jobType",
  "workplaceMode",
  "description",
  "requiredSkills",
  "preferredSkills",
  "closesAt",
]);

const moderationDto = (job) => ({
  id: job._id,
  title: job.title,
  company: job.company,
  location: job.location,
  workplaceMode: job.workplaceMode,
  organization: job.organization
    ? {
        id: job.organization._id || job.organization,
        name: job.organization?.name,
        slug: job.organization?.slug,
        verificationStatus: job.organization?.verificationStatus || "pending",
        riskScore: job.organization?.riskScore || 0,
        riskFlags: job.organization?.riskFlags || [],
      }
    : null,
  status: job.status,
  version: job.version,
  requiredSkills: job.requiredSkills,
  description: job.description,
  experience: job.experience,
  compensation: job.compensation || (job.salary ? { min: 0, max: job.salary, currency: "INR", period: "year" } : null),
  moderation: job.moderation,
  changeReview: job.pendingChanges?.status
    ? {
        status: job.pendingChanges.status,
        fields: job.pendingChanges.fields,
        submittedAt: job.pendingChanges.submittedAt,
        reason: job.pendingChanges.reason,
        reviewedAt: job.pendingChanges.reviewedAt,
      }
    : null,
  createdAt: job.createdAt,
});

/**
 * Aggregated Admin Overview Analytics API
 * GET /api/v1/admin/analytics/overview
 */
exports.overviewAnalytics = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const targetOrgId = req.query.organizationId ? String(req.query.organizationId) : null;

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
    const ym = cur.toISOString().slice(0, 7);
    const a = appMonthly.find((m) => m._id === ym);
    const p = placementMonthly.find((m) => m._id === ym);
    monthlyTrends.push({
      yearMonth: ym,
      monthLabel: cur.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
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

  // 8. Recent Audit Activity
  const recentActivity = await AuditLog.find({})
    .populate("actor", "name email role")
    .populate("organization", "name slug")
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    data: {
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
      companyWiseStats: companyAgg,
      deepDive,
      monthlyTrends,
      topActiveCompanies,
      recentActivity,
    },
  });
});

/**
 * Admin: Company-level Job Listing Moderation Summary
 * Groups job listings requiring review by employer organization
 */
exports.companyModerationSummary = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const search = req.query.search ? String(req.query.search).trim() : "";
  const verificationStatus = req.query.verificationStatus;
  const riskLevel = req.query.riskLevel;

  const pipeline = [
    {
      $lookup: {
        from: "jobs",
        localField: "_id",
        foreignField: "organization",
        as: "jobs",
      },
    },
    {
      $project: {
        organizationId: "$_id",
        _id: "$_id",
        companyName: "$name",
        companyLogo: "$logoUrl",
        companySlug: "$slug",
        industry: "$industry",
        verificationStatus: { $ifNull: ["$verificationStatus", "pending"] },
        riskScore: { $ifNull: ["$riskScore", 0] },
        riskFlags: { $ifNull: ["$riskFlags", []] },
        jobCounts: {
          total: { $size: "$jobs" },
          pending: {
            $size: {
              $filter: {
                input: "$jobs",
                as: "j",
                cond: {
                  $or: [
                    { $eq: ["$$j.moderation.status", "pending"] },
                    { $eq: ["$$j.pendingChanges.status", "pending"] },
                  ],
                },
              },
            },
          },
          approved: {
            $size: {
              $filter: {
                input: "$jobs",
                as: "j",
                cond: { $eq: ["$$j.moderation.status", "approved"] },
              },
            },
          },
          rejected: {
            $size: {
              $filter: {
                input: "$jobs",
                as: "j",
                cond: { $eq: ["$$j.moderation.status", "rejected"] },
              },
            },
          },
        },
        latestSubmission: { $max: "$jobs.createdAt" },
      },
    },
  ];

  const matchConditions = {};
  if (search) {
    matchConditions.$or = [
      { companyName: { $regex: search, $options: "i" } },
      { companySlug: { $regex: search, $options: "i" } },
    ];
  }
  if (verificationStatus && verificationStatus !== "all") {
    matchConditions.verificationStatus = verificationStatus;
  }
  if (riskLevel && riskLevel !== "all") {
    if (riskLevel === "low") matchConditions.riskScore = { $lte: 25 };
    else if (riskLevel === "medium") matchConditions.riskScore = { $gt: 25, $lte: 60 };
    else if (riskLevel === "high") matchConditions.riskScore = { $gt: 60 };
  }

  if (Object.keys(matchConditions).length > 0) {
    pipeline.push({ $match: matchConditions });
  }

  pipeline.push({
    $sort: { "jobCounts.pending": -1, latestSubmission: -1, companyName: 1 },
  });

  const companies = await Organization.aggregate(pipeline);
  res.json({
    data: companies,
    meta: { total: companies.length },
  });
});

/**
 * Admin: Company Jobs List for Moderation Drawer / Modal
 */
exports.companyJobsList = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const { organizationId } = req.params;
  const org = await Organization.findById(organizationId);
  if (!org) throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");

  const status = req.query.status;
  const filter = { organization: org._id };
  if (status && status !== "all") {
    filter.$or = [
      { "moderation.status": status },
      { "pendingChanges.status": status },
    ];
  }

  const jobs = await Job.find(filter)
    .populate("recruiter", "name email phone")
    .sort({ "moderation.status": 1, createdAt: -1 });

  const jobIds = jobs.map((j) => j._id);
  const appCounts = await Application.aggregate([
    { $match: { job: { $in: jobIds } } },
    { $group: { _id: "$job", count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(appCounts.map((a) => [String(a._id), a.count]));

  const mapped = jobs.map((j) => ({
    id: j._id,
    _id: j._id,
    title: j.title,
    company: j.company || org.name,
    location: j.location,
    department: j.department || "Engineering",
    workplaceMode: j.workplaceMode,
    jobType: j.jobType,
    experience: j.experience,
    minExpYears: j.minExpYears,
    maxExpYears: j.maxExpYears,
    salary: j.salary,
    compensation: j.compensation || {
      min: j.salary || 0,
      max: j.salary || 0,
      currency: "INR",
      period: "year",
    },
    salaryInrLpa: j.salary ? `${(j.salary / 100000).toFixed(1)} LPA` : "Not specified",
    requiredSkills: j.requiredSkills || [],
    preferredSkills: j.preferredSkills || [],
    skills: j.skills || [],
    description: j.description,
    status: j.status,
    moderation: j.moderation || { status: "none" },
    changeReview: j.pendingChanges
      ? {
          status: j.pendingChanges.status,
          reason: j.pendingChanges.reason,
          fields: j.pendingChanges.fields,
        }
      : null,
    applicationCount: countMap[String(j._id)] || 0,
    recruiter: j.recruiter
      ? { id: j.recruiter._id, name: j.recruiter.name, email: j.recruiter.email }
      : null,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  }));

  res.json({
    data: {
      organization: {
        id: org._id,
        _id: org._id,
        name: org.name,
        slug: org.slug,
        verificationStatus: org.verificationStatus || "pending",
        riskScore: org.riskScore || 0,
        riskFlags: org.riskFlags || [],
        businessEmail: org.businessEmail,
        phone: org.phone,
        gstin: org.gstin,
        registrationNumber: org.registrationNumber,
      },
      jobs: mapped,
    },
  });
});

/**
 * Admin: Bulk Approve All Pending Jobs for Verified Company
 */
exports.bulkApproveCompanyJobs = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const { organizationId } = req.params;
  const org = await Organization.findById(organizationId);
  if (!org) throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");

  // Safety check 1: Company must be verified
  if (org.verificationStatus !== "verified") {
    throw new AppError(
      "Cannot bulk-approve jobs for an unverified company. Please verify the company first.",
      400,
      "ORGANIZATION_NOT_VERIFIED",
    );
  }

  // Safety check 2: Query eligible jobs belonging to company where moderation is pending
  const eligibleJobs = await Job.find({
    organization: org._id,
    status: { $nin: ["closed", "archived"] },
    $or: [
      { "moderation.status": "pending" },
      { "pendingChanges.status": "pending" },
    ],
  });

  if (eligibleJobs.length === 0) {
    return res.json({ success: true, approvedCount: 0, message: "No pending eligible jobs to approve" });
  }

  const now = new Date();
  const approvedIds = [];

  for (const job of eligibleJobs) {
    const isChangeReview = Boolean(
      job.pendingChanges &&
        job.pendingChanges.status === "pending" &&
        job.pendingChanges.fields &&
        Object.keys(job.pendingChanges.fields).length > 0,
    );

    if (isChangeReview) {
      const changes = job.pendingChanges.fields || {};
      for (const [key, value] of Object.entries(changes)) {
        if (PUBLIC_EDIT_FIELDS.has(key)) job[key] = value;
      }
      if (changes.requiredSkills) job.skills = changes.requiredSkills;
      job.version += 1;
      job.pendingChanges.status = "approved";
      job.pendingChanges.reviewedBy = req.user._id;
      job.pendingChanges.reviewedAt = now;
      job.pendingChanges.reason = "";
    } else {
      job.moderation.status = "approved";
      job.status = "published";
      job.moderation.reviewedBy = req.user._id;
      job.moderation.reviewedAt = now;
      job.moderation.reason = "";
      if (!job.publishedAt) job.publishedAt = now;
    }

    await job.save();
    approvedIds.push(job._id);
  }

  // Dispatch notification to company owner
  const owner = await Membership.findOne({
    organization: org._id,
    role: "owner",
    status: "active",
  });
  if (owner) {
    try {
      await notify({
        user: owner.user,
        organization: org._id,
        type: "job_moderation",
        category: "jobs",
        title: "All Pending Jobs Approved",
        message: `Platform administrators have approved all ${approvedIds.length} pending job postings for ${org.name}. They are now live!`,
        resourceType: "organization",
        resourceId: org._id,
      });
    } catch (_e) {}
  }

  // Audit log
  await audit({
    req,
    organization: org._id,
    action: "job.bulk_approved",
    resourceType: "organization",
    resourceId: org._id,
    metadata: { approvedCount: approvedIds.length, jobIds: approvedIds },
  });

  res.json({
    success: true,
    approvedCount: approvedIds.length,
    message: `Successfully approved ${approvedIds.length} job postings for ${org.name}`,
  });
});

exports.moderationJobs = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const page = parse(req.query);
  const status = req.query.status || "pending";
  const filter =
    status === "all"
      ? {
          $or: [
            { "moderation.status": { $in: ["pending", "approved", "rejected"] } },
            { "pendingChanges.status": { $in: ["pending", "approved", "rejected"] } },
          ],
        }
      : {
          $or: [
            { "moderation.status": status },
            { "pendingChanges.status": status },
          ],
        };
  const items = await Job.find(filter)
    .populate("organization", "name slug verificationStatus riskScore riskFlags")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({
    data: items.map(moderationDto),
    meta: meta(items, page.limit, await Job.countDocuments(filter)),
  });
});

exports.moderateJob = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const approve = req.params.action === "approve";
  const job = await Job.findById(req.params.jobId);
  if (!job) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  const reason = String(req.body.reason || "").slice(0, 500);
  const now = new Date();
  const isChangeReview = Boolean(
    job.pendingChanges &&
      job.pendingChanges.status === "pending" &&
      job.pendingChanges.fields &&
      Object.keys(job.pendingChanges.fields).length > 0,
  );

  if (isChangeReview) {
    if (approve) {
      const changes = job.pendingChanges.fields || {};
      for (const [key, value] of Object.entries(changes))
        if (PUBLIC_EDIT_FIELDS.has(key)) job[key] = value;
      if (changes.requiredSkills) job.skills = changes.requiredSkills;
      job.version += 1;
      job.pendingChanges.status = "approved";
      job.pendingChanges.reviewedBy = req.user._id;
      job.pendingChanges.reviewedAt = now;
      job.pendingChanges.reason = "";
      const { CandidateMatch } = require("../models/Recruitment");
      await CandidateMatch.updateMany(
        { organization: job.organization, job: job._id, status: "completed" },
        { status: "stale" },
      );
    } else {
      job.pendingChanges.status = "rejected";
      job.pendingChanges.reviewedBy = req.user._id;
      job.pendingChanges.reviewedAt = now;
      job.pendingChanges.reason = reason;
    }
  } else {
    job.moderation.status = approve ? "approved" : "rejected";
    job.moderation.reviewedBy = req.user._id;
    job.moderation.reviewedAt = now;
    job.moderation.reason = approve ? "" : reason;
  }
  await job.save();

  const owner = await Membership.findOne({
    organization: job.organization,
    role: "owner",
    status: "active",
  });
  const targets = new Set(
    [owner?.user, job.recruiter].filter((id) => id).map(String),
  );
  const emailOwner = await User.findById(owner?.user).select("email").lean();
  for (const userId of targets) {
    try {
      await notify({
        user: userId,
        organization: job.organization,
        type: "job_moderation",
        category: "jobs",
        title:
          isChangeReview
            ? approve
              ? `Changes approved: ${job.title}`
              : `Changes rejected: ${job.title}`
            : approve
              ? `Job approved: ${job.title}`
              : `Job rejected: ${job.title}`,
        message: isChangeReview
          ? approve
            ? "Your changes were approved and are now live."
            : `Your job changes were rejected${reason ? `. Reason: ${reason}` : ""}. The previously approved version remains visible; edit and resubmit to try again.`
          : approve
            ? "Your job has been approved and is now visible to candidates."
            : `Your job was rejected${reason ? `. Reason: ${reason}` : ""}. You can edit and republish it.`,
        resourceType: "job",
        resourceId: job._id,
        email:
          String(userId) === String(owner?.user || "") ? (emailOwner?.email || null) : null,
        idempotencyKey: `moderation:${job._id}:${approve ? "approved" : "rejected"}:${
          isChangeReview ? `chg-${job.pendingChanges.submittedAt?.getTime() || 0}` : `v${job.version}`
        }`,
        emailContext: {
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          organizationId: job.organization,
          jobId: job._id,
          approved: approve,
          reason,
          isChangeReview,
        },
      });
    } catch (error) {
      logger.error(`Moderation notification failed: ${error.message}`);
    }
  }
  await audit({
    req,
    organization: job.organization,
    action: approve
      ? isChangeReview
        ? "job.changes_approved"
        : "job.moderation.approved"
      : isChangeReview
        ? "job.changes_rejected"
        : "job.moderation.rejected",
    resourceType: "job",
    resourceId: job._id,
    metadata: isChangeReview ? { version: job.version } : {},
  });
  res.json({ data: moderationDto(job) });
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
  const items = await AuditLog.find(applyCursor(filter, page.after))
    .populate("actor", "name email")
    .populate("organization", "name")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
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
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { isActive: false, accountStatus: "suspended", tokenInvalidBefore: new Date() },
    { returnDocument: "after" },
  ).select("name email role accountStatus");
  if (!user) throw new AppError("User not found", 404, "RESOURCE_NOT_FOUND");
  await AuthSession.updateMany(
    { user: user._id, revokedAt: null },
    { revokedAt: new Date(), revokeReason: req.body.reason },
  );
  await audit({
    req,
    action: "admin.user_suspended",
    resourceType: "user",
    resourceId: user._id,
    metadata: { reason: req.body.reason },
  });
  res.json({ data: { id: user._id, status: user.accountStatus } });
});

exports.reactivate = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const user = await User.findOneAndUpdate(
    { _id: req.params.userId, accountStatus: "suspended" },
    { isActive: true, accountStatus: "active", tokenInvalidBefore: new Date() },
    { returnDocument: "after", runValidators: true },
  ).select("name email role accountStatus");
  if (!user) throw new AppError("Suspended user not found", 404, "RESOURCE_NOT_FOUND");
  await audit({
    req,
    action: "admin.user_reactivated",
    resourceType: "user",
    resourceId: user._id,
    metadata: { reason: req.body.reason },
  });
  res.json({ data: { id: user._id, status: user.accountStatus } });
});
