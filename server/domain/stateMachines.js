// Central status transition rules for business records (Phase 1 domain design).
//
// Each machine maps a current status to the statuses it may move to. Terminal statuses map to [].
// Existing enum values are kept as they are; the Master Prompt's names are mapped in
// docs/DOMAIN_MODEL.md (for example "screening" = "under_review", "pending_verification" = "pending").
//
// These rules describe the intended lifecycle. Controllers that already enforce a transition
// keep doing so; the rest adopt these machines in their owning phase.

const AppError = require("../utils/AppError");

const freeze = (machine) =>
  Object.freeze(
    Object.fromEntries(Object.entries(machine).map(([from, to]) => [from, Object.freeze([...to])])),
  );

/** Job lifecycle (Job.status). "closed" is terminal. */
const jobLifecycle = freeze({
  draft: ["published", "closed"],
  published: ["closed"],
  closed: [],
});

/**
 * Job moderation (Job.moderation.status). Phase 3 adds "changes_requested" (the reviewer asked
 * for edits; the recruiter resubmits) and "suspended" (a live job restricted by an admin; it
 * can be reinstated). Edits to an approved job still go through Job.pendingChanges.
 */
const jobModeration = freeze({
  none: ["pending"],
  pending: ["approved", "rejected", "changes_requested"],
  rejected: ["pending"],
  changes_requested: ["pending"],
  // A closed, approved job that is published again goes back through review.
  // A platform admin can take down an approved job with a reason (rejected); the job is then hidden.
  approved: ["suspended", "pending", "rejected"],
  suspended: ["approved"],
});

/**
 * Company verification (Organization.verificationStatus). "verified" can only be revoked via
 * "suspended"; reinstatement returns to "verified". Jobs of a suspended company are not
 * restored automatically; that is handled by moderation (Phase 3).
 */
const companyVerification = freeze({
  pending: ["under_review", "rejected"],
  under_review: ["verified", "rejected"],
  verified: ["suspended"],
  suspended: ["verified"],
  rejected: ["under_review"],
});

/**
 * Application stages (Application.status, versioned lifecycle plus legacy values).
 * This is the same map the recruitment controller enforced before Phase 1; it is kept
 * identical so existing behaviour does not change.
 */
const applicationStage = freeze({
  submitted: ["under_review", "shortlisted", "rejected"],
  under_review: ["shortlisted", "interview", "rejected"],
  shortlisted: ["interview", "rejected"],
  interview: ["offer", "rejected"],
  offer: ["hired", "rejected"],
  Applied: ["under_review", "shortlisted", "rejected"],
});

/**
 * Employment status (Placement.status). Verification (Placement.verification.isVerified) is a
 * separate fact and does not appear here.
 */
const placementEmployment = freeze({
  selected: ["hired"],
  hired: ["joining_confirmed", "placement_verified", "currently_working"],
  joining_confirmed: ["placement_verified", "currently_working"],
  placement_verified: ["currently_working"],
  currently_working: ["employment_ended"],
  employment_ended: [],
});

/** Payment transaction (PaymentTransaction.status). Refunds are recorded, never re-captured. */
const paymentTransaction = freeze({
  initiated: ["captured", "failed"],
  captured: ["refunded"],
  failed: [],
  refunded: [],
});

/** Subscription (Subscription.status). */
const subscription = freeze({
  active: ["past_due", "canceled", "expired"],
  past_due: ["active", "canceled", "expired"],
  expired: ["active"],
  canceled: [],
});

const MACHINES = Object.freeze({
  jobLifecycle,
  jobModeration,
  companyVerification,
  applicationStage,
  placementEmployment,
  paymentTransaction,
  subscription,
});

const getMachine = (name) => {
  const machine = MACHINES[name];
  if (!machine) throw new Error(`Unknown state machine: ${name}`);
  return machine;
};

const canTransition = (name, from, to) => (getMachine(name)[from] || []).includes(to);

const allowedTransitions = (name, from) => [...(getMachine(name)[from] || [])];

const statesOf = (name) => {
  const machine = getMachine(name);
  const states = new Set(Object.keys(machine));
  for (const targets of Object.values(machine)) targets.forEach((state) => states.add(state));
  return [...states];
};

/** Throws a 409 INVALID_TRANSITION AppError when the move is not allowed. */
const assertTransition = (name, from, to) => {
  if (!canTransition(name, from, to)) {
    throw new AppError(`Cannot transition from ${from} to ${to}`, 409, "INVALID_TRANSITION");
  }
  return true;
};

module.exports = {
  MACHINES,
  canTransition,
  allowedTransitions,
  assertTransition,
  statesOf,
  // Exported for controllers that keep their own lookup tables.
  applicationStageTransitions: applicationStage,
};
