const test = require("node:test");
const assert = require("node:assert/strict");
const {
  EMPLOYMENT_STATUSES,
  canReport,
  canVerify,
  rejectTarget,
  canResolve,
  deriveLegacyEmployment,
  effectiveEmploymentStatus,
} = require("../domain/employmentStatus");
const { buildMigrationPlan } = require("../scripts/migrate-employment-status");

const ID_A = "65f000000000000000000001";
const ID_B = "65f000000000000000000002";
const day = (d) => new Date(`2026-10-${String(d).padStart(2, "0")}T00:00:00Z`);

test("exactly the seven canonical employment statuses from the specification", () => {
  assert.deepEqual([...EMPLOYMENT_STATUSES], [
    "offer_accepted",
    "pending_joining",
    "joined_pending_verification",
    "active_verified",
    "employment_end_pending_verification",
    "employment_ended_verified",
    "status_unconfirmed",
  ]);
});

test("a candidate joining is reported as pending, never verified", () => {
  assert.deepEqual(canReport({ from: "offer_accepted", to: "joined_pending_verification" }), { ok: true });
  assert.deepEqual(canReport({ from: "pending_joining", to: "joined_pending_verification" }), { ok: true });
});

test("a candidate cannot report a verified status directly", () => {
  assert.equal(canReport({ from: "joined_pending_verification", to: "active_verified" }).code, "CHANGE_ALREADY_PENDING");
  assert.equal(canReport({ from: "offer_accepted", to: "active_verified" }).code, "INVALID_TRANSITION");
  assert.equal(canReport({ from: "offer_accepted", to: "employment_ended_verified" }).code, "INVALID_TRANSITION");
});

test("an exit is reported as employment_end_pending_verification from active_verified only", () => {
  assert.deepEqual(canReport({ from: "active_verified", to: "employment_end_pending_verification" }), { ok: true });
  assert.equal(canReport({ from: "offer_accepted", to: "employment_end_pending_verification" }).code, "INVALID_TRANSITION");
  assert.equal(canReport({ from: "employment_ended_verified", to: "employment_end_pending_verification" }).code, "INVALID_TRANSITION");
});

test("a second change cannot be reported while one is pending", () => {
  assert.equal(canReport({ from: "joined_pending_verification", to: "employment_end_pending_verification" }).code, "CHANGE_ALREADY_PENDING");
  assert.equal(canReport({ from: "employment_end_pending_verification", to: "employment_end_pending_verification" }).code, "CHANGE_ALREADY_PENDING");
});

test("unknown target statuses are rejected", () => {
  assert.equal(canReport({ from: "offer_accepted", to: "currently_working" }).code, "INVALID_STATUS");
  assert.equal(canReport({ from: "offer_accepted", to: "" }).code, "INVALID_STATUS");
});

test("an employer verifies a joining: joined_pending_verification becomes active_verified", () => {
  assert.deepEqual(
    canVerify({ from: "joined_pending_verification", reportedById: ID_A, verifierId: ID_B, isPlatformAdmin: false }),
    { ok: true, nextStatus: "active_verified" },
  );
});

test("an employer verifies an exit: employment_end_pending_verification becomes employment_ended_verified", () => {
  assert.deepEqual(
    canVerify({ from: "employment_end_pending_verification", reportedById: ID_A, verifierId: ID_B, isPlatformAdmin: false }),
    { ok: true, nextStatus: "employment_ended_verified" },
  );
});

test("nothing pending means nothing to verify", () => {
  assert.equal(canVerify({ from: "active_verified", reportedById: ID_A, verifierId: ID_B, isPlatformAdmin: false }).code, "NOT_PENDING");
  assert.equal(canVerify({ from: "offer_accepted", reportedById: ID_A, verifierId: ID_B, isPlatformAdmin: false }).code, "NOT_PENDING");
});

test("the person who reported a change cannot verify it, unless they are a platform administrator", () => {
  assert.equal(
    canVerify({ from: "joined_pending_verification", reportedById: ID_A, verifierId: ID_A, isPlatformAdmin: false }).code,
    "SELF_VERIFICATION_NOT_ALLOWED",
  );
  assert.equal(
    canVerify({ from: "joined_pending_verification", reportedById: ID_A, verifierId: ID_A, isPlatformAdmin: true }).ok,
    true,
  );
});

test("rejecting a pending change returns to the last verified status, not to a guessed one", () => {
  assert.deepEqual(rejectTarget({ from: "employment_end_pending_verification", lastVerifiedStatus: "active_verified" }), {
    ok: true,
    nextStatus: "active_verified",
  });
  assert.deepEqual(rejectTarget({ from: "joined_pending_verification", lastVerifiedStatus: "offer_accepted" }), {
    ok: true,
    nextStatus: "offer_accepted",
  });
  assert.deepEqual(rejectTarget({ from: "joined_pending_verification", lastVerifiedStatus: "" }), {
    ok: true,
    nextStatus: "status_unconfirmed",
  });
  assert.equal(rejectTarget({ from: "active_verified", lastVerifiedStatus: "active_verified" }).code, "NOT_PENDING");
});

test("only status_unconfirmed can be resolved, and only to a verifiable status", () => {
  assert.deepEqual(canResolve({ from: "status_unconfirmed", to: "active_verified" }), { ok: true });
  assert.equal(canResolve({ from: "active_verified", to: "offer_accepted" }).code, "NOT_UNCONFIRMED");
  assert.equal(canResolve({ from: "status_unconfirmed", to: "joined_pending_verification" }).code, "INVALID_STATUS");
});

// --- Legacy mapping and migration safety ---------------------------------------------------------------------------

test("legacy currently_working is verified ONLY when verification evidence is dated after the report", () => {
  const withEvidence = deriveLegacyEmployment({
    status: "currently_working",
    employmentStatusUpdatedAt: day(5),
    employmentHistory: [{ event: "placement_verified", at: day(6) }],
  });
  assert.equal(withEvidence.status, "active_verified");

  const evidenceBeforeReport = deriveLegacyEmployment({
    status: "currently_working",
    employmentStatusUpdatedAt: day(8),
    employmentHistory: [{ event: "placement_verified", at: day(6) }],
    joiningConfirmation: { confirmedByCandidate: true },
  });
  assert.notEqual(evidenceBeforeReport.status, "active_verified", "older verification must not verify a later report");
  assert.equal(evidenceBeforeReport.status, "joined_pending_verification");
});

test("legacy currently_working without any evidence is not verified; ambiguous records become status_unconfirmed", () => {
  const ambiguous = deriveLegacyEmployment({ status: "currently_working", employmentStatusUpdatedAt: day(5) });
  assert.equal(ambiguous.status, "status_unconfirmed");
  assert.equal(ambiguous.lastVerifiedStatus, "");
});

test("legacy placement_verified alone is not employment evidence", () => {
  const r = deriveLegacyEmployment({
    status: "placement_verified",
    verification: { isVerified: true, verifiedAt: day(3) },
    joiningConfirmation: { confirmedByCandidate: true },
  });
  assert.equal(r.status, "status_unconfirmed");
  assert.equal(r.lastVerifiedStatus, "");
});

test("legacy employment_ended is verified only with evidence after the end report", () => {
  assert.equal(
    deriveLegacyEmployment({
      status: "employment_ended",
      employmentStatusUpdatedAt: day(10),
      verification: { isVerified: true, verifiedAt: day(11) },
    }).status,
    "employment_ended_verified",
  );
  assert.equal(
    deriveLegacyEmployment({ status: "employment_ended", employmentStatusUpdatedAt: day(10) }).status,
    "employment_end_pending_verification",
  );
});

test("legacy joining_confirmed maps to joined_pending_verification (not verified)", () => {
  const r = deriveLegacyEmployment({ status: "joining_confirmed" });
  assert.equal(r.status, "joined_pending_verification");
  assert.equal(r.lastVerifiedStatus, "");
});

test("legacy hired and selected map to offer_accepted only when an acceptance is recorded", () => {
  assert.equal(deriveLegacyEmployment({ status: "hired", offerDetails: { acceptedAt: day(1) } }).status, "offer_accepted");
  assert.equal(deriveLegacyEmployment({ status: "hired" }).status, "status_unconfirmed");
  assert.equal(deriveLegacyEmployment({ status: "selected" }).status, "status_unconfirmed");
});

test("unknown legacy values are never guessed", () => {
  assert.equal(deriveLegacyEmployment({ status: "something_else" }).status, "status_unconfirmed");
});

test("effectiveEmploymentStatus prefers the stored canonical value and derives it before migration", () => {
  assert.equal(effectiveEmploymentStatus({ status: "hired", employment: { status: "active_verified" } }), "active_verified");
  assert.equal(effectiveEmploymentStatus({ status: "joining_confirmed" }), "joined_pending_verification");
});

test("migration plan: dry run covers each record once, skips migrated ones, and never plans to overwrite history", () => {
  const plan = buildMigrationPlan([
    { _id: ID_A, status: "joining_confirmed" },
    { _id: ID_B, status: "currently_working", employmentStatusUpdatedAt: day(5), employmentHistory: [] },
    { _id: "65f000000000000000000003", status: "active_verified", employment: { status: "active_verified" } },
  ]);
  assert.equal(plan.scanned, 3);
  assert.equal(plan.toMigrate, 2);
  assert.equal(plan.alreadyMigrated, 1);
  assert.deepEqual(plan.unconfirmedForAdminReview, [ID_B]);
  for (const change of plan.changes) {
    assert.ok(EMPLOYMENT_STATUSES.includes(change.employmentStatus));
  }
});

test("migration plan is idempotent: a record that already has a canonical status is never re-planned", () => {
  const once = buildMigrationPlan([{ _id: ID_A, status: "joining_confirmed" }]);
  assert.equal(once.toMigrate, 1);
  const migratedDoc = { _id: ID_A, status: "joining_confirmed", employment: { status: once.changes[0].employmentStatus } };
  const twice = buildMigrationPlan([migratedDoc]);
  assert.equal(twice.toMigrate, 0);
  assert.equal(twice.alreadyMigrated, 1);
});
