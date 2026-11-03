// Phase 1: transition rules for business records. Pure logic, no database.
const test = require("node:test");
const assert = require("node:assert/strict");
const sm = require("../domain/stateMachines");
const { applicationStageTransitions } = sm;

test("company verification: only defined moves are allowed", () => {
  assert.equal(sm.canTransition("companyVerification", "pending", "under_review"), true);
  assert.equal(sm.canTransition("companyVerification", "under_review", "verified"), true);
  assert.equal(sm.canTransition("companyVerification", "verified", "suspended"), true);
  assert.equal(sm.canTransition("companyVerification", "suspended", "verified"), true);
  // No shortcut from pending to verified: verification needs a review step.
  assert.equal(sm.canTransition("companyVerification", "pending", "verified"), false);
  // A verified company cannot be rejected in place; it must be suspended first.
  assert.equal(sm.canTransition("companyVerification", "verified", "rejected"), false);
});

test("job lifecycle and moderation are separate machines", () => {
  assert.equal(sm.canTransition("jobLifecycle", "draft", "published"), true);
  assert.equal(sm.canTransition("jobLifecycle", "closed", "published"), false, "closed is terminal");
  assert.equal(sm.canTransition("jobModeration", "none", "pending"), true);
  assert.equal(sm.canTransition("jobModeration", "pending", "approved"), true);
  assert.equal(sm.canTransition("jobModeration", "approved", "rejected"), false, "approved is terminal here");
  assert.equal(sm.canTransition("jobModeration", "none", "approved"), false, "moderation must be reviewed");
});

test("application stages match the recruitment rules that were enforced before Phase 1", () => {
  assert.deepEqual([...applicationStageTransitions.submitted], ["under_review", "shortlisted", "rejected"]);
  assert.deepEqual([...applicationStageTransitions.offer], ["hired", "rejected"]);
  assert.equal(sm.canTransition("applicationStage", "hired", "rejected"), false, "hired is terminal");
  assert.equal(sm.canTransition("applicationStage", "submitted", "hired"), false, "no skipping stages");
  assert.equal(sm.canTransition("applicationStage", "Applied", "shortlisted"), true, "legacy value kept");
});

test("placement employment status: reporting and ending follow the lifecycle", () => {
  assert.equal(sm.canTransition("placementEmployment", "hired", "currently_working"), true);
  assert.equal(sm.canTransition("placementEmployment", "currently_working", "employment_ended"), true);
  assert.equal(sm.canTransition("placementEmployment", "hired", "employment_ended"), false);
  assert.equal(sm.canTransition("placementEmployment", "employment_ended", "currently_working"), false);
});

test("payments and subscriptions have terminal states", () => {
  assert.equal(sm.canTransition("paymentTransaction", "initiated", "captured"), true);
  assert.equal(sm.canTransition("paymentTransaction", "captured", "initiated"), false, "no re-initiation");
  assert.equal(sm.canTransition("paymentTransaction", "failed", "captured"), false);
  assert.equal(sm.canTransition("subscription", "canceled", "active"), false);
  assert.equal(sm.canTransition("subscription", "expired", "active"), true, "renewal");
});

test("unknown states and unknown machines are refused", () => {
  assert.equal(sm.canTransition("companyVerification", "unknown", "verified"), false);
  assert.equal(sm.canTransition("companyVerification", undefined, "verified"), false);
  assert.throws(() => sm.canTransition("noSuchMachine", "a", "b"), /Unknown state machine/);
});

test("assertTransition raises a 409 INVALID_TRANSITION error", () => {
  assert.equal(sm.assertTransition("companyVerification", "pending", "under_review"), true);
  assert.throws(
    () => sm.assertTransition("companyVerification", "pending", "verified"),
    (error) => error.statusCode === 409 && error.code === "INVALID_TRANSITION",
  );
});

test("machines are frozen so callers cannot weaken them at runtime", () => {
  assert.throws(() => {
    "use strict";
    sm.MACHINES.companyVerification.pending.push("verified");
  }, TypeError);
  assert.equal(sm.canTransition("companyVerification", "pending", "verified"), false);
});

test("allowedTransitions returns a copy", () => {
  const list = sm.allowedTransitions("companyVerification", "pending");
  list.push("verified");
  assert.equal(sm.canTransition("companyVerification", "pending", "verified"), false);
});
