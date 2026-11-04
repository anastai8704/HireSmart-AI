// Job moderation service (Phase 3). Applies admin decisions to job listings.
//
// Concurrency: every decision is a compare-and-set on the job document. The update only applies
// when the job still matches the state that was read and checked (its updatedAt and moderation
// status). Two admins, or a retried request, therefore cannot both succeed on the same job.
//
// Transactions: MongoDB multi-document transactions need a replica set, which the CI database and
// some deployments do not run. Each decision changes one job document atomically. Its history
// event is written after the change; if that write fails, the change is reverted with another
// compare-and-set and the error is returned. A bulk request is processed item by item, and each
// item reports its own outcome.

const crypto = require("node:crypto");
const Job = require("../models/Job");
const Organization = require("../models/Organization");
const User = require("../models/User");
const { Membership } = require("../models/Membership");
const { JobModerationEvent } = require("../models/JobModerationEvent");
const { audit } = require("./auditService");
const { notify } = require("./notificationService");
const logger = require("../utils/logger");
const AppError = require("../utils/AppError");
const policy = require("../domain/jobModerationPolicy");

const AUDIT_ACTIONS = Object.freeze({
  approve: "job.moderation.approved",
  reject: "job.moderation.rejected",
  request_changes: "job.moderation.changes_requested",
  suspend: "job.moderation.suspended",
  reinstate: "job.moderation.reinstated",
});
const CHANGE_AUDIT_ACTIONS = Object.freeze({ approve: "job.changes_approved", reject: "job.changes_rejected" });

// Codes that mean "not eligible under the rules" (skipped) versus "the job changed or was
// already decided" (failed). The bulk report uses this split.
const SKIPPED_CODES = new Set([
  "COMPANY_NOT_VERIFIED",
  "REVIEWER_CONFLICT",
  "JOB_INCOMPLETE",
  "JOB_CLOSED",
  "JOB_NOT_SUBMITTED",
  "DUPLICATE_IN_REQUEST",
]);

const isReviewerConflict = async (organizationId, actorId) =>
  Boolean(await Membership.exists({ organization: organizationId, user: actorId, status: "active" }));

const ownerOf = (organizationId) =>
  Membership.findOne({ organization: organizationId, role: "owner", status: "active" }).lean();

/** Recruiter-facing notification for a decision. Failures are logged, never block the decision. */
const notifyDecision = async ({ job, action, target, reason, approved }) => {
  try {
    const owner = await ownerOf(job.organization);
    const ownerUser = owner ? await User.findById(owner.user).select("email").lean() : null;
    const targets = new Set([owner?.user, job.recruiter].filter(Boolean).map(String));
    const copy = (() => {
      if (target === "changes") {
        return approved
          ? { title: `Changes approved: ${job.title}`, message: "Your changes were approved and are now live." }
          : {
              title: `Changes rejected: ${job.title}`,
              message: `Your job changes were rejected${reason ? `. Reason: ${reason}` : ""}. The previously approved version remains visible; edit and resubmit to try again.`,
            };
      }
      switch (action) {
        case "approve":
          return { title: `Job approved: ${job.title}`, message: "Your job has been approved and is now visible to candidates." };
        case "reject":
          return { title: `Job rejected: ${job.title}`, message: `Your job was rejected${reason ? `. Reason: ${reason}` : ""}. You can edit and republish it.` };
        case "request_changes":
          return { title: `Changes requested: ${job.title}`, message: `The reviewer asked for changes${reason ? `: ${reason}` : ""}. Edit the job and submit it again.` };
        case "suspend":
          return { title: `Job suspended: ${job.title}`, message: `This job is no longer visible to candidates${reason ? `. Reason: ${reason}` : ""}.` };
        default:
          return { title: `Job reinstated: ${job.title}`, message: "This job is visible to candidates again." };
      }
    })();
    for (const userId of targets) {
      await notify({
        user: userId,
        organization: job.organization,
        type: "job_moderation",
        category: "jobs",
        title: copy.title,
        message: copy.message,
        resourceType: "job",
        resourceId: job._id,
        email: owner && String(userId) === String(owner.user) ? ownerUser?.email || null : null,
        idempotencyKey: `moderation:${job._id}:${action}:${target}:${job.version}:${job.updatedAt?.getTime?.() || 0}`,
        emailContext: { jobTitle: job.title, company: job.company, location: job.location, organizationId: job.organization, jobId: job._id, approved, reason, isChangeReview: target === "changes" },
      });
    }
  } catch (error) {
    logger.error(`Job moderation notification failed: ${error.message}`);
  }
};

/** The fields a decision writes, so a failed history write can revert them. */
const previousModerationOf = (job) => ({
  status: job.moderation?.status || "none",
  reviewedBy: job.moderation?.reviewedBy || null,
  reviewedAt: job.moderation?.reviewedAt || null,
  reason: job.moderation?.reason || "",
  publishedAt: job.publishedAt || null,
});

const buildListingUpdate = (job, action, spec, actorId, reason, now) => {
  const set = {
    "moderation.status": spec.to,
    "moderation.reviewedBy": actorId,
    "moderation.reviewedAt": now,
    "moderation.reason": action === "approve" || action === "reinstate" ? "" : reason,
  };
  if (action === "approve" && !job.publishedAt) set.publishedAt = now;
  return { $set: set };
};

const buildChangeUpdate = (job, approve, actorId, reason, now) => {
  const pending = job.pendingChanges || {};
  const set = {
    "pendingChanges.status": approve ? "approved" : "rejected",
    "pendingChanges.reviewedBy": actorId,
    "pendingChanges.reviewedAt": now,
    "pendingChanges.reason": approve ? "" : reason,
  };
  const update = { $set: set };
  if (approve) {
    const fields = pending.fields || {};
    for (const [key, value] of Object.entries(fields)) {
      if (policy.PUBLIC_EDIT_FIELDS.includes(key)) set[key] = value;
    }
    if (fields.requiredSkills) set.skills = fields.requiredSkills;
    update.$inc = { version: 1 };
  }
  return update;
};

/**
 * Applies one decision to one job document that was read earlier. Returns
 * `{ outcome: "done", to }` or `{ outcome: "skipped" | "failed", code, message }`.
 */
const applyOne = async ({ job, org, action, actor, req, reason, now, batchId }) => {
  const spec = policy.ACTIONS[action];
  const decision = policy.evaluateDecision({
    job,
    action,
    org,
    actorId: actor._id,
    isReviewerConflict: await isReviewerConflict(job.organization, actor._id),
    reason,
  });
  if (!decision.ok) {
    return { outcome: SKIPPED_CODES.has(decision.code) ? "skipped" : "failed", code: decision.code, message: decision.message };
  }

  const approveChange = decision.target === "changes" && action === "approve";
  const isChange = decision.target === "changes";
  const filter = {
    _id: job._id,
    updatedAt: job.updatedAt,
    status: job.status,
    "moderation.status": job.moderation?.status ?? { $exists: false },
  };
  if (isChange) filter["pendingChanges.status"] = "pending";
  const update = isChange
    ? buildChangeUpdate(job, approveChange, actor._id, reason, now)
    : buildListingUpdate(job, action, spec, actor._id, reason, now);

  const write = await Job.updateOne(filter, update);
  if (!write.matchedCount) {
    return { outcome: "failed", code: "STATUS_CHANGED", message: "The job changed while it was being reviewed. Reload and try again." };
  }

  const previous = previousModerationOf(job);
  if (!isChange) {
    try {
      await JobModerationEvent.create({
        job: job._id,
        organization: job.organization,
        area: "moderation",
        fromStatus: decision.from,
        toStatus: decision.to,
        actor: actor._id,
        reason: action === "approve" || action === "reinstate" ? "" : reason,
      });
    } catch (error) {
      // Revert the listing change so the job never moves without its history record.
      await Job.updateOne(
        { _id: job._id, "moderation.status": decision.to },
        {
          $set: {
            "moderation.status": previous.status,
            "moderation.reviewedBy": previous.reviewedBy,
            "moderation.reviewedAt": previous.reviewedAt,
            "moderation.reason": previous.reason,
            publishedAt: previous.publishedAt,
          },
        },
      );
      throw error;
    }
  }

  if (approveChange) {
    // Candidate rankings computed on the old version of the job are no longer current.
    const { CandidateMatch } = require("../models/Recruitment");
    await CandidateMatch.updateMany(
      { organization: job.organization, job: job._id, status: "completed" },
      { status: "stale" },
    );
  }

  await audit({
    req,
    organization: job.organization,
    action: isChange ? CHANGE_AUDIT_ACTIONS[action] : AUDIT_ACTIONS[action],
    resourceType: "job",
    resourceId: job._id,
    metadata: {
      target: decision.target,
      from: decision.from,
      to: decision.to,
      reason: reason || "",
      ...(batchId ? { batchId } : {}),
    },
  });

  await notifyDecision({
    job: { ...job, version: isChange && approveChange ? (job.version || 1) + 1 : job.version },
    action,
    target: decision.target,
    reason,
    approved: action === "approve" || action === "reinstate",
  });

  return { outcome: "done", to: decision.to, target: decision.target };
};

/**
 * Single-job decision (HTTP). Throws a typed AppError on any refusal so the response carries
 * the exact reason.
 */
const decideJob = async ({ jobId, action, actor, req, reason }) => {
  if (!policy.ACTIONS[action]) throw new AppError("Unknown moderation action", 400, "INVALID_ACTION");
  const job = await Job.findById(jobId).lean();
  if (!job) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  const org = job.organization ? await Organization.findById(job.organization).lean() : null;
  const result = await applyOne({
    job,
    org,
    action,
    actor,
    req,
    reason: policy.normaliseReason(reason),
    now: new Date(),
  });
  if (result.outcome !== "done") throw policy.decisionError(result);
  return Job.findById(jobId);
};

/**
 * Bulk decision. Returns one result per requested job, in request order.
 * `organizationId` (optional) scopes the request to one company: jobs of other companies are
 * reported as failed and are not changed.
 */
const decideJobs = async ({ jobIds, action, actor, req, reason, organizationId }) => {
  if (!policy.BULK_ACTIONS.includes(action)) throw new AppError("Bulk action must be approve or reject", 400, "INVALID_ACTION");
  const cleanReason = policy.normaliseReason(reason);
  if (policy.ACTIONS[action].reasonRequired && cleanReason.length < 3) {
    throw new AppError("A reason of at least 3 characters is required", 422, "REASON_REQUIRED");
  }

  const batchId = crypto.randomUUID();
  const seen = new Set();
  const uniqueIds = jobIds.map(String).filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  const duplicateCount = jobIds.length - uniqueIds.length;

  const jobs = await Job.find({ _id: { $in: uniqueIds } }).lean();
  const jobById = new Map(jobs.map((job) => [String(job._id), job]));
  const orgs = await Organization.find({ _id: { $in: [...new Set(jobs.map((j) => String(j.organization)))] } }).lean();
  const orgById = new Map(orgs.map((org) => [String(org._id), org]));
  const now = new Date();

  const results = [];
  const seenOnce = new Set();
  for (const jobId of jobIds.map(String)) {
    const job = jobById.get(jobId);
    const base = { jobId, title: job?.title || "", company: job?.company || "" };
    if (seenOnce.has(jobId)) {
      results.push({ ...base, outcome: "skipped", code: "DUPLICATE_IN_REQUEST", message: "This job appears more than once in the request" });
      continue;
    }
    seenOnce.add(jobId);
    if (!job) {
      results.push({ ...base, outcome: "failed", code: "NOT_FOUND", message: "The job does not exist" });
      continue;
    }
    if (organizationId && String(job.organization) !== String(organizationId)) {
      results.push({ ...base, outcome: "failed", code: "JOB_NOT_IN_COMPANY", message: "The job belongs to another company" });
      continue;
    }
    try {
      const result = await applyOne({
        job,
        org: orgById.get(String(job.organization)) || null,
        action,
        actor,
        req,
        reason: cleanReason,
        now,
        batchId,
      });
      results.push(result.outcome === "done"
        ? { ...base, outcome: "approved", code: null, message: policy.ACTIONS[action].label, to: result.to, target: result.target }
        : { ...base, ...result });
    } catch (error) {
      logger.error(`Bulk moderation item failed: ${error.message}`);
      results.push({ ...base, outcome: "failed", code: "WRITE_FAILED", message: "The change could not be saved. Try again." });
    }
  }

  const summary = {
    requested: jobIds.length,
    succeeded: results.filter((r) => r.outcome === "approved").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    duplicatesRemoved: duplicateCount,
  };

  await audit({
    req,
    organization: organizationId || null,
    action: "job.moderation.bulk",
    resourceType: "job",
    resourceId: batchId,
    metadata: { batchId, decision: action, ...summary, jobIds: results.filter((r) => r.outcome === "approved").map((r) => r.jobId) },
  });

  return { batchId, action, summary, results };
};

/** Read-side helpers: queue and detail queries use the same review predicate as the counts. */
const jobHistory = async (jobId) => {
  const events = await JobModerationEvent.find({ job: jobId }).sort({ createdAt: -1 }).limit(100).populate("actor", "name email").lean();
  return events.map((event) => ({
    id: event._id,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reason: event.reason || "",
    actor: event.actor ? { id: event.actor._id, name: event.actor.name } : null,
    createdAt: event.createdAt,
  }));
};

module.exports = {
  decideJob,
  decideJobs,
  jobHistory,
  AUDIT_ACTIONS,
  SKIPPED_CODES,
};
