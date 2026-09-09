const User = require("../models/User");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
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
    .populate("organization", "name slug")
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
      // Apply the reviewed edits on top of the live job.
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
      // Discard the proposal; the approved version stays live.
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
  const emailOwner = await require("../models/User").findById(owner?.user).select("email").lean();
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
  if (req.query.search) filter.name = new RegExp(escapeRegex(req.query.search).slice(0, 100), "i");
  const items = await Organization.find(applyCursor(filter, page.after))
    .select("name slug industry size timezone status settings createdAt updatedAt")
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
/** Recent AI runs for the activity feed — the same AIAnalysis records the
 *  usage aggregation reads, exposed one-by-one (no `output` payload). */
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
