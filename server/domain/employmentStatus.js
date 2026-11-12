// Canonical employment status workflow (Requirement 9). Pure functions only: the controller, the migration and the
// tests all use these rules, so there is one definition.
//
// Employment status is SEPARATE from the placement lifecycle (Placement.status: selected → hired → joining_confirmed →
// placement_verified). Lifecycle answers "where is this hire in the pipeline"; employment answers "is the candidate
// working here, and has that been verified".
//
// Rules:
// - A candidate or company report only ever records a PENDING change. The last verified status does not move.
// - Only an authorised employer (application.manage) or a platform administrator can verify a pending change.
//   Nobody can verify a change they reported themselves, except a platform administrator.
// - Rejecting a pending change returns the record to its last verified status.
// - status_unconfirmed is the state for legacy records the evidence cannot support. Only an administrator resolves it.

const EMPLOYMENT_STATUSES = Object.freeze([
  "offer_accepted",
  "pending_joining",
  "joined_pending_verification",
  "active_verified",
  "employment_end_pending_verification",
  "employment_ended_verified",
  "status_unconfirmed",
]);

/** Changes that a candidate or a company may report. Each one becomes pending until verified. */
const REPORTED_TARGETS = Object.freeze({
  pending_joining: Object.freeze(["offer_accepted"]),
  joined_pending_verification: Object.freeze(["offer_accepted", "pending_joining"]),
  employment_end_pending_verification: Object.freeze(["active_verified"]),
});

/** Pending changes awaiting verification, mapped to the verified status they become. */
const VERIFICATION_TARGET = Object.freeze({
  joined_pending_verification: "active_verified",
  employment_end_pending_verification: "employment_ended_verified",
});

/** Statuses an administrator may set when resolving status_unconfirmed. */
const RESOLVABLE_TARGETS = Object.freeze(["offer_accepted", "pending_joining", "active_verified", "employment_ended_verified"]);

/** Statuses that are a verified fact (and so may be stored as lastVerifiedStatus). */
const LAST_VERIFIABLE = Object.freeze(["offer_accepted", "pending_joining", "active_verified", "employment_ended_verified"]);

const PENDING_STATUSES = Object.freeze(Object.keys(VERIFICATION_TARGET));

const isEmploymentStatus = (value) => EMPLOYMENT_STATUSES.includes(value);
const isPending = (status) => PENDING_STATUSES.includes(status);

/**
 * Whether a candidate or company may report a change from `from` to `to`.
 * Returns { ok: true } or { ok: false, code }.
 */
const canReport = ({ from, to }) => {
  if (!isEmploymentStatus(to)) return { ok: false, code: "INVALID_STATUS" };
  if (isPending(from)) return { ok: false, code: "CHANGE_ALREADY_PENDING" };
  const allowedFrom = REPORTED_TARGETS[to];
  if (!allowedFrom) return { ok: false, code: "INVALID_TRANSITION" };
  if (!allowedFrom.includes(from)) return { ok: false, code: "INVALID_TRANSITION" };
  return { ok: true };
};

/**
 * Verification of a pending change. `reportedBy` is the user who reported it; `verifierId` the user verifying it.
 * Returns { ok: true, nextStatus } or { ok: false, code }.
 */
const canVerify = ({ from, reportedById, verifierId, isPlatformAdmin }) => {
  const target = VERIFICATION_TARGET[from];
  if (!target) return { ok: false, code: "NOT_PENDING" };
  if (!isPlatformAdmin && reportedById && String(reportedById) === String(verifierId)) {
    return { ok: false, code: "SELF_VERIFICATION_NOT_ALLOWED" };
  }
  return { ok: true, nextStatus: target };
};

/** Status after a pending change is rejected: back to the last verified status (or status_unconfirmed if none). */
const rejectTarget = ({ from, lastVerifiedStatus }) => {
  if (!isPending(from)) return { ok: false, code: "NOT_PENDING" };
  if (!lastVerifiedStatus || !LAST_VERIFIABLE.includes(lastVerifiedStatus)) {
    return { ok: true, nextStatus: "status_unconfirmed" };
  }
  return { ok: true, nextStatus: lastVerifiedStatus };
};

/** Administrator resolution of status_unconfirmed. */
const canResolve = ({ from, to }) => {
  if (from !== "status_unconfirmed") return { ok: false, code: "NOT_UNCONFIRMED" };
  if (!RESOLVABLE_TARGETS.includes(to)) return { ok: false, code: "INVALID_STATUS" };
  return { ok: true };
};

/** Whether a status is a verified employment fact. */
const isVerifiedStatus = (status) => LAST_VERIFIABLE.includes(status);

// ---------------------------------------------------------------------------------------------------------------------
// Legacy mapping. Old records stored employment inside Placement.status. The mapping below uses the recorded
// verification evidence. It never treats a legacy label as proof of verification by itself.
//
// Evidence used:
//   - a platform verification event (placement_verified in employmentHistory) dated at or after the employment report,
//   - Placement.verification.isVerified together with verifiedAt on or after the report time.
// ---------------------------------------------------------------------------------------------------------------------

const LEGACY_EVENT_PLACEMENT_VERIFIED = "placement_verified";

const findLatest = (items, predicate) => {
  let latest = null;
  for (const item of items || []) {
    if (!predicate(item)) continue;
    if (!latest || new Date(item.at).getTime() > new Date(latest.at).getTime()) latest = item;
  }
  return latest;
};

/** Verification evidence dated at or after `reportedAt`. */
const verifiedAfter = (placement, reportedAt) => {
  if (!reportedAt) return false;
  const t = new Date(reportedAt).getTime();
  const historyVerification = findLatest(
    placement.employmentHistory,
    (e) => e.event === LEGACY_EVENT_PLACEMENT_VERIFIED,
  );
  if (historyVerification && new Date(historyVerification.at).getTime() >= t) return true;
  const verifiedAt = placement.verification?.verifiedAt;
  return Boolean(placement.verification?.isVerified && verifiedAt && new Date(verifiedAt).getTime() >= t);
};

/**
 * Map one legacy placement document to the canonical employment status.
 * Returns { status, lastVerifiedStatus, reason } so the migration report can explain every decision.
 */
const deriveLegacyEmployment = (placement) => {
  const legacy = placement.status;
  const reportedAt = placement.employmentStatusUpdatedAt || null;
  const confirmed = Boolean(placement.joiningConfirmation?.confirmedByCandidate);
  const acceptedAt = placement.offerDetails?.acceptedAt || null;

  switch (legacy) {
    case "currently_working": {
      if (verifiedAfter(placement, reportedAt)) {
        return { status: "active_verified", lastVerifiedStatus: "active_verified", reason: "working reported and later verified" };
      }
      if (confirmed) {
        return { status: "joined_pending_verification", lastVerifiedStatus: "", reason: "working reported without verification evidence" };
      }
      return { status: "status_unconfirmed", lastVerifiedStatus: "", reason: "working reported with no joining or verification evidence" };
    }
    case "employment_ended": {
      if (verifiedAfter(placement, reportedAt)) {
        return { status: "employment_ended_verified", lastVerifiedStatus: "employment_ended_verified", reason: "end reported and later verified" };
      }
      return { status: "employment_end_pending_verification", lastVerifiedStatus: "", reason: "end reported, not yet verified" };
    }
    case "placement_verified":
      // A placement-level verification is not evidence of employment on its own (Requirement 9, rule 9).
      return { status: "status_unconfirmed", lastVerifiedStatus: "", reason: "placement verified; employment not evidenced" };
    case "joining_confirmed":
      return { status: "joined_pending_verification", lastVerifiedStatus: "", reason: "candidate confirmed joining; not verified" };
    case "hired":
      return acceptedAt
        ? { status: "offer_accepted", lastVerifiedStatus: "offer_accepted", reason: "offer accepted (recorded on the application)" }
        : { status: "status_unconfirmed", lastVerifiedStatus: "", reason: "hired without a recorded offer acceptance" };
    case "selected":
      return acceptedAt
        ? { status: "offer_accepted", lastVerifiedStatus: "offer_accepted", reason: "offer accepted (recorded on the application)" }
        : { status: "status_unconfirmed", lastVerifiedStatus: "", reason: "selected without a recorded offer acceptance" };
    default:
      return { status: "status_unconfirmed", lastVerifiedStatus: "", reason: `unknown legacy status "${legacy}"` };
  }
};

/** Canonical status for a record, derived when the stored canonical field is not set yet (pre-migration). */
const effectiveEmploymentStatus = (placement) => {
  if (placement?.employment?.status) return placement.employment.status;
  return deriveLegacyEmployment(placement || {}).status;
};

module.exports = {
  EMPLOYMENT_STATUSES,
  REPORTED_TARGETS,
  VERIFICATION_TARGET,
  RESOLVABLE_TARGETS,
  LAST_VERIFIABLE,
  PENDING_STATUSES,
  isEmploymentStatus,
  isPending,
  isVerifiedStatus,
  canReport,
  canVerify,
  rejectTarget,
  canResolve,
  deriveLegacyEmployment,
  effectiveEmploymentStatus,
};
