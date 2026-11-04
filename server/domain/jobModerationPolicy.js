// Job moderation rules (Phase 3). Pure functions and Mongo expressions only, so the same
// definitions drive the company counts, the review queues, the single-job actions and the bulk
// actions. Company verification stays separate from job approval: a job is approved here, and
// the company's verification status only decides whether an approval is eligible.

const AppError = require("../utils/AppError");

/** Moderation decisions an admin can make on a job listing (or on a pending change to one). */
const ACTIONS = Object.freeze({
  approve: { to: "approved", label: "approved" },
  reject: { to: "rejected", label: "rejected", reasonRequired: true },
  request_changes: { to: "changes_requested", label: "changes requested", reasonRequired: true },
  suspend: { to: "suspended", label: "suspended", reasonRequired: true },
  reinstate: { to: "approved", label: "reinstated" },
});

/** Bulk actions only cover the two decisions that apply to many listings at once. */
const BULK_ACTIONS = Object.freeze(["approve", "reject"]);

/** Fields a proposed change may write to a live job when it is approved. */
const PUBLIC_EDIT_FIELDS = Object.freeze([
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

/** Rejection reasons are shown to the recruiter, so they are bounded and trimmed. */
const normaliseReason = (value) => String(value || "").trim().slice(0, 500);

/**
 * A job needs platform review when it is published and either its listing is pending or it has
 * a proposed change waiting. The same rule is used for counts and for queues.
 * `ref(path)` returns the field reference: "$field" for find(), "$$j.field" inside aggregation.
 */
const needsReviewExpr = (ref) => ({
  $and: [
    { $eq: [ref("status"), "published"] },
    {
      $or: [
        { $eq: [ref("moderation.status"), "pending"] },
        { $eq: [ref("pendingChanges.status"), "pending"] },
      ],
    },
  ],
});

/** Mongo query form of needsReviewExpr, for find(). */
const needsReviewQuery = () => ({ $expr: needsReviewExpr((path) => `$${path}`) });

/** Whether a job's pending change is a change review (edits to a live job), not a new listing. */
const isChangeReview = (job) =>
  Boolean(
    job.pendingChanges &&
      job.pendingChanges.status === "pending" &&
      job.pendingChanges.fields &&
      Object.keys(job.pendingChanges.fields).length > 0,
  );

/**
 * Which review a decision applies to. A pending change review takes precedence over the listing
 * status, because the listing itself is already live.
 */
// Edits are reviewed as a change only while the live listing is approved. A suspended or
// rejected job is reviewed as a listing first (reinstating it), and its pending edit is then
// reviewed as a change.
const reviewTargetOf = (job) =>
  isChangeReview(job) && (job.moderation?.status || "none") === "approved" ? "changes" : "listing";

/** Current state a decision must start from, for the given review target. */
const sourceStateOf = (action, target) => {
  if (target === "changes") return { approve: "pending", reject: "pending" }[action] || null;
  return (
    {
      approve: "pending",
      reject: "pending",
      request_changes: "pending",
      suspend: "approved",
      reinstate: "suspended",
    }[action] || null
  );
};

/**
 * Decides whether one job may take one action right now. Returns `{ ok: true, target, from, to }`
 * or `{ ok: false, code, message }` with a stable code. Callers re-read the job before calling
 * this and apply the change with a compare-and-set, so the answer cannot go stale in between.
 */
const evaluateDecision = ({ job, action, org, actorId, isReviewerConflict, reason }) => {
  if (!ACTIONS[action]) return { ok: false, code: "INVALID_ACTION", message: "Unknown moderation action" };
  const spec = ACTIONS[action];
  if (spec.reasonRequired && normaliseReason(reason).length < 3) {
    return { ok: false, code: "REASON_REQUIRED", message: `A reason of at least 3 characters is required to ${action.replace("_", " ")}` };
  }
  if (job.status === "closed" || job.status === "archived") {
    return { ok: false, code: "JOB_CLOSED", message: "A closed job cannot be moderated" };
  }
  if (job.status !== "published") {
    return { ok: false, code: "JOB_NOT_SUBMITTED", message: "Only a submitted job can be moderated" };
  }
  if (isReviewerConflict || (job.recruiter && actorId && String(job.recruiter) === String(actorId))) {
    return { ok: false, code: "REVIEWER_CONFLICT", message: "A reviewer cannot decide on a job from their own company or their own listing" };
  }

  const target = reviewTargetOf(job);
  if (target === "changes" && !["approve", "reject"].includes(action)) {
    return { ok: false, code: "INVALID_TRANSITION", message: "A pending change can only be approved or rejected" };
  }
  const from = sourceStateOf(action, target);
  if (!from) return { ok: false, code: "INVALID_ACTION", message: "Unknown moderation action" };

  const current = job.moderation?.status || "none";
  // A platform admin may take down an approved listing with a reason (rejected). Every other
  // listing decision starts from its source state.
  const allowedFrom = target === "listing" && action === "reject" ? ["pending", "approved"] : [from];
  if (target === "listing" && !allowedFrom.includes(current)) {
    const already = current === spec.to;
    return {
      ok: false,
      code: already ? "ALREADY_DECIDED" : "INVALID_TRANSITION",
      message: already ? `The job is already ${spec.label}` : `A job that is ${current} cannot be ${spec.label} from this screen`,
      current,
    };
  }
  const effectiveFrom = target === "listing" ? current : from;
  if (target === "changes" && current !== "approved") {
    return { ok: false, code: "INVALID_TRANSITION", message: "The live listing must be approved before its changes are reviewed", current };
  }

  // Company verification gates approval and reinstatement only. Rejecting, requesting changes and
  // suspending a job are always allowed, so a company cannot shield a bad listing by being unverified.
  if ((action === "approve" || action === "reinstate") && org?.verificationStatus !== "verified") {
    return {
      ok: false,
      code: "COMPANY_NOT_VERIFIED",
      message: `The company is ${org?.verificationStatus || "not verified"}; verify it before approving its jobs`,
    };
  }
  if (action === "approve" && target === "listing") {
    const complete = Boolean(job.description && job.description.length >= 20 && (job.requiredSkills?.length || job.skills?.length));
    if (!complete) return { ok: false, code: "JOB_INCOMPLETE", message: "The job needs a description and required skills before approval" };
  }

  return { ok: true, target, from: effectiveFrom, to: target === "changes" ? (action === "approve" ? "approved" : "rejected") : spec.to };
};

/** Maps a failed decision to an HTTP error for the single-job endpoints. */
const decisionError = (decision) => {
  const statusByCode = {
    REASON_REQUIRED: 422,
    INVALID_ACTION: 400,
    JOB_CLOSED: 409,
    JOB_NOT_SUBMITTED: 409,
    REVIEWER_CONFLICT: 403,
    INVALID_TRANSITION: 409,
    ALREADY_DECIDED: 409,
    COMPANY_NOT_VERIFIED: 409,
    JOB_INCOMPLETE: 409,
    STATUS_CHANGED: 409,
  };
  return new AppError(decision.message, statusByCode[decision.code] || 409, decision.code, undefined);
};

module.exports = {
  ACTIONS,
  BULK_ACTIONS,
  PUBLIC_EDIT_FIELDS,
  normaliseReason,
  needsReviewExpr,
  needsReviewQuery,
  isChangeReview,
  reviewTargetOf,
  evaluateDecision,
  decisionError,
};
