const test = require("node:test");
const assert = require("node:assert/strict");
const { refusalCodeFor, featureDecision } = require("../domain/subscriptionRules");
const { ALL_PLANS } = require("../config/subscriptionPlans");

const state = (over) => ({ tier: "recruiter_free", status: "free", paid: false, reason: "free_plan", ...over });

test("a Free plan at its limit is UPGRADE_REQUIRED (upgrading is the next step)", () => {
  assert.equal(refusalCodeFor(state({})), "UPGRADE_REQUIRED");
  assert.equal(refusalCodeFor(state({ tier: "candidate_free", reason: "free_plan" })), "UPGRADE_REQUIRED");
});

test("an active or grace-period paid plan at its limit is PLAN_LIMIT_REACHED", () => {
  assert.equal(refusalCodeFor(state({ tier: "recruiter_growth", status: "active", paid: true, reason: "active" })), "PLAN_LIMIT_REACHED");
  assert.equal(refusalCodeFor(state({ tier: "candidate_plus", status: "grace", paid: true, reason: "payment_grace" })), "PLAN_LIMIT_REACHED");
});

test("a lapsed paid plan is SUBSCRIPTION_EXPIRED, whatever the free fallback is", () => {
  assert.equal(refusalCodeFor(state({ tier: "recruiter_free", status: "expired", paid: false, reason: "period_ended" })), "SUBSCRIPTION_EXPIRED");
  assert.equal(refusalCodeFor(state({ tier: "candidate_free", status: "expired", paid: false, reason: "payment_failed" })), "SUBSCRIPTION_EXPIRED");
});

test("a cancelled (not lapsed) paid plan is not reported as expired", () => {
  assert.equal(refusalCodeFor(state({ status: "canceled", paid: false, reason: "not_active" })), "UPGRADE_REQUIRED");
});

test("FEATURE_NOT_INCLUDED: no feature is gated unless the catalogue reserves it", () => {
  assert.deepEqual(featureDecision({ state: state({}), requiredTiers: [] }), { allowed: true });
  assert.deepEqual(featureDecision({ state: state({}), requiredTiers: undefined }), { allowed: true });
});

test("FEATURE_NOT_INCLUDED is returned when the plan tier is not in the list that includes the feature", () => {
  const free = featureDecision({ state: state({ tier: "recruiter_starter" }), requiredTiers: ["recruiter_growth", "recruiter_enterprise"] });
  assert.deepEqual(free, { allowed: false, code: "FEATURE_NOT_INCLUDED" });
  const growth = featureDecision({ state: state({ tier: "recruiter_growth" }), requiredTiers: ["recruiter_growth", "recruiter_enterprise"] });
  assert.deepEqual(growth, { allowed: true });
});

test("the four error codes are the ones the specification names", () => {
  const codes = new Set([
    refusalCodeFor(state({})),
    refusalCodeFor(state({ paid: true, status: "active" })),
    refusalCodeFor(state({ status: "expired" })),
    featureDecision({ state: state({}), requiredTiers: ["x"] }).code,
  ]);
  for (const c of ["UPGRADE_REQUIRED", "PLAN_LIMIT_REACHED", "SUBSCRIPTION_EXPIRED", "FEATURE_NOT_INCLUDED"]) {
    assert.ok(codes.has(c), `${c} is produced`);
  }
  assert.ok(ALL_PLANS.recruiter_free, "catalogue loaded");
});
