// Admin job moderation endpoints (Phase 3). Replaces the moderation handlers that lived in
// v1AdminController. Counts, queues and actions all use domain/jobModerationPolicy.js, so a number
// shown on screen is the same set of records the action will touch.
const mongoose = require("mongoose");
const Job = require("../models/Job");
const Organization = require("../models/Organization");
const { Application } = require("../models/Application");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { parse, meta } = require("../utils/pagination");
const { findCurrentCase } = require("../services/companyVerificationService");
const { decideJob, decideJobs, jobHistory } = require("../services/jobModerationService");
const policy = require("../domain/jobModerationPolicy");

const requireAdmin = (req) => {
  if (req.auth.platformRole !== "platform_admin")
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const RISK_BANDS = Object.freeze({
  low: { $lte: 25 },
  medium: { $gt: 25, $lte: 60 },
  high: { $gt: 60 },
});

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

// Count expressions. Each one is the same predicate the matching queue uses.
const jobRef = (path) => `$$j.${path}`;
const countWhere = (cond) => ({ $size: { $filter: { input: "$jobs", as: "j", cond } } });
const pendingCond = policy.needsReviewExpr(jobRef);
const liveApprovedCond = {
  $and: [{ $eq: [jobRef("status"), "published"] }, { $eq: [jobRef("moderation.status"), "approved"] }],
};

/** Company cards: one row per company with job counts. Filters apply to the companies, not the jobs. */
exports.companyModerationSummary = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const search = req.query.search ? String(req.query.search).trim().slice(0, 100) : "";
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
          pending: countWhere(pendingCond),
          eligible: {
            $cond: [{ $eq: ["$verificationStatus", "verified"] }, countWhere(pendingCond), 0],
          },
          approved: countWhere(liveApprovedCond),
          rejected: countWhere({ $eq: [jobRef("moderation.status"), "rejected"] }),
          changesRequested: countWhere({ $eq: [jobRef("moderation.status"), "changes_requested"] }),
          suspended: countWhere({ $eq: [jobRef("moderation.status"), "suspended"] }),
          closed: countWhere({ $eq: [jobRef("status"), "closed"] }),
          drafts: countWhere({ $eq: [jobRef("status"), "draft"] }),
        },
        // A short preview of the jobs that need review, in the same order the queue uses.
        jobs: {
          $map: {
            input: {
              $slice: [{ $filter: { input: "$jobs", as: "j", cond: pendingCond } }, 3],
            },
            as: "j",
            in: {
              id: "$$j._id",
              title: "$$j.title",
              location: "$$j.location",
              workplaceMode: "$$j.workplaceMode",
              status: "$$j.status",
              salary: "$$j.salary",
              compensation: "$$j.compensation",
              moderation: { status: "$$j.moderation.status" },
              changeReview: { status: "$$j.pendingChanges.status" },
              createdAt: "$$j.createdAt",
            },
          },
        },
        latestSubmission: { $max: "$jobs.createdAt" },
      },
    },
  ];

  const matchConditions = {};
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    matchConditions.$or = [{ companyName: pattern }, { companySlug: pattern }];
  }
  if (verificationStatus && verificationStatus !== "all") matchConditions.verificationStatus = verificationStatus;
  if (riskLevel && riskLevel !== "all" && RISK_BANDS[riskLevel]) matchConditions.riskScore = RISK_BANDS[riskLevel];
  if (Object.keys(matchConditions).length > 0) pipeline.push({ $match: matchConditions });

  pipeline.push({ $sort: { "jobCounts.pending": -1, latestSubmission: -1, companyName: 1 } });

  const companies = await Organization.aggregate(pipeline);
  res.json({ data: companies, meta: { total: companies.length } });
});

const parseDate = (value, field, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(String(value).length === 10 ? `${value}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}` : value);
  if (Number.isNaN(date.getTime())) throw new AppError(`${field} must be a valid date`, 422, "VALIDATION_ERROR");
  return date;
};

/** JS form of the review predicate, for a single loaded job. */
const needsReviewNow = (job) =>
  job.status === "published" && (job.moderation?.status === "pending" || job.pendingChanges?.status === "pending");

/** Jobs of one company, filtered. Uses the same predicates as the company counts. */
const companyJobFilter = (organizationId, query) => {
  const filter = { organization: organizationId };
  const status = query.status;
  if (status && status !== "all") {
    if (status === "pending") Object.assign(filter, policy.needsReviewQuery());
    else if (status === "approved") {
      filter.status = "published";
      filter["moderation.status"] = "approved";
    } else if (["draft", "published", "closed"].includes(status)) filter.status = status;
    else if (["none", "rejected", "changes_requested", "suspended", "approved"].includes(status)) filter["moderation.status"] = status;
    else throw new AppError("Unknown job status filter", 422, "VALIDATION_ERROR");
  }
  if (query.jobStatus && query.jobStatus !== "all") {
    if (!["draft", "published", "closed"].includes(query.jobStatus)) throw new AppError("Unknown job status", 422, "VALIDATION_ERROR");
    filter.status = query.jobStatus;
  }
  if (query.recruiterId) {
    if (!mongoose.isValidObjectId(query.recruiterId)) throw new AppError("recruiterId is invalid", 422, "VALIDATION_ERROR");
    filter.recruiter = query.recruiterId;
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(String(query.search).trim().slice(0, 100)), "i");
    filter.title = pattern;
  }
  const from = parseDate(query.from, "from");
  const to = parseDate(query.to, "to", true);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  return filter;
};

/** Admin: jobs of one company (drawer/modal). Returns the company's verification case link too. */
exports.companyJobsList = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const { organizationId } = req.params;
  if (!mongoose.isValidObjectId(organizationId)) throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");
  const org = await Organization.findById(organizationId);
  if (!org) throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");

  const filter = companyJobFilter(org._id, req.query);
  const limit = Math.min(Number(req.query.limit) || 200, 200);
  const [jobs, total, currentCase] = await Promise.all([
    Job.find(filter).populate("recruiter", "name email phone").sort({ createdAt: -1 }).limit(limit),
    Job.countDocuments(filter),
    findCurrentCase(org._id),
  ]);

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
    compensation: j.compensation || { min: j.salary || 0, max: j.salary || 0, currency: "INR", period: "year" },
    salaryInrLpa: j.salary ? `${(j.salary / 100000).toFixed(1)} LPA` : "Not specified",
    requiredSkills: j.requiredSkills || [],
    preferredSkills: j.preferredSkills || [],
    skills: j.skills || [],
    description: j.description,
    status: j.status,
    moderation: j.moderation || { status: "none" },
    needsReview: needsReviewNow(j),
    changeReview: j.pendingChanges?.status
      ? { status: j.pendingChanges.status, reason: j.pendingChanges.reason, fields: j.pendingChanges.fields }
      : null,
    applicationCount: countMap[String(j._id)] || 0,
    recruiter: j.recruiter ? { id: j.recruiter._id, name: j.recruiter.name, email: j.recruiter.email } : null,
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
        verificationCase: currentCase ? { id: currentCase._id, status: currentCase.status } : null,
      },
      jobs: mapped,
    },
    meta: { total, returned: mapped.length, truncated: total > mapped.length },
  });
});

/** Admin: one job with its full content and its moderation history. */
exports.moderationJobDetail = asyncHandler(async (req, res) => {
  requireAdmin(req);
  if (!mongoose.isValidObjectId(req.params.jobId)) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  const job = await Job.findById(req.params.jobId).populate("organization", "name slug verificationStatus riskScore riskFlags").populate("recruiter", "name email");
  if (!job) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  const history = await jobHistory(job._id);
  res.json({
    data: {
      ...moderationDto(job),
      recruiter: job.recruiter ? { id: job.recruiter._id, name: job.recruiter.name, email: job.recruiter.email } : null,
      needsReview: needsReviewNow(job),
      history,
    },
  });
});

/** Admin: moderation history (append-only events) for one job. */
exports.moderationJobHistory = asyncHandler(async (req, res) => {
  requireAdmin(req);
  if (!mongoose.isValidObjectId(req.params.jobId)) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  res.json({ data: await jobHistory(req.params.jobId) });
});

/** Admin: approve all eligible pending jobs of one verified company. Per-job results are returned. */
exports.bulkApproveCompanyJobs = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const { organizationId } = req.params;
  if (!mongoose.isValidObjectId(organizationId)) throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");
  const org = await Organization.findById(organizationId);
  if (!org) throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");
  if (org.verificationStatus !== "verified") {
    throw new AppError(
      "Cannot bulk-approve jobs for an unverified company. Please verify the company first.",
      400,
      "ORGANIZATION_NOT_VERIFIED",
    );
  }

  const pending = await Job.find({ organization: org._id, ...policy.needsReviewQuery() }).select("_id").lean();
  if (pending.length === 0) {
    return res.json({ success: true, approvedCount: 0, message: "No pending eligible jobs to approve", summary: { requested: 0, succeeded: 0, skipped: 0, failed: 0 }, results: [] });
  }

  const outcome = await decideJobs({
    jobIds: pending.map((j) => String(j._id)),
    action: "approve",
    actor: req.user,
    req,
    organizationId: org._id,
  });
  res.json({
    success: true,
    approvedCount: outcome.summary.succeeded,
    message: `Approved ${outcome.summary.succeeded} of ${outcome.summary.requested} job postings for ${org.name}`,
    batchId: outcome.batchId,
    summary: outcome.summary,
    results: outcome.results,
  });
});

/** Admin: bulk approve or reject selected jobs. Each job is re-checked; every item is reported. */
exports.bulkModerateJobs = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const { action, jobIds, reason, organizationId } = req.body;
  const outcome = await decideJobs({ jobIds, action, actor: req.user, req, reason, organizationId });
  res.json({ data: outcome });
});

/** Admin: one moderation decision on one job. */
const ACTION_BY_PARAM = Object.freeze({
  approve: "approve",
  reject: "reject",
  "request-changes": "request_changes",
  suspend: "suspend",
  reinstate: "reinstate",
});

exports.moderateJob = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const action = ACTION_BY_PARAM[req.params.action];
  if (!action) throw new AppError("Unknown moderation action", 400, "INVALID_ACTION");
  const job = await decideJob({
    jobId: req.params.jobId,
    action,
    actor: req.user,
    req,
    reason: req.body?.reason,
  });
  res.json({ data: moderationDto(job) });
});

/** Admin: review queue for one status. "pending" uses the same predicate as the company counts. */
exports.moderationJobs = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const page = parse(req.query);
  const status = req.query.status || "pending";
  let filter;
  if (status === "pending") filter = policy.needsReviewQuery();
  else if (status === "all") filter = { "moderation.status": { $in: ["pending", "approved", "rejected", "changes_requested", "suspended"] } };
  else if (["approved", "rejected", "changes_requested", "suspended"].includes(status)) filter = { "moderation.status": status };
  else throw new AppError("Unknown moderation status", 422, "VALIDATION_ERROR");
  const items = await Job.find(filter)
    .populate("organization", "name slug verificationStatus riskScore riskFlags")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items.map(moderationDto), meta: meta(items, page.limit, await Job.countDocuments(filter)) });
});
