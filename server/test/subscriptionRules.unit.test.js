// Subscription entitlement rules (Phase 6). Pure: no database.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  effectiveState,
  decideJobPublish,
  decideTeamInvite,
  decideAiUse,
  startOfIstMonth,
  FREE_TIER,
} = require("../domain/subscriptionRules");
const { ALL_PLANS } = require("../config/subscriptionPlans");

const NOW = new Date("2026-11-05T04:30:00.000Z");
const DAY = 24 * 3600 * 1000;
const paid = (planTier, overrides = {}) => ({
  subscriberType: "organization",
  planTier,
  status: "active",
  priceInr: ALL_PLANS[planTier].priceInr,
  currentPeriodStart: new Date(NOW.getTime() - 5 * DAY),
  currentPeriodEnd: new Date(NOW.getTime() + 25 * DAY),
  limits: ALL_PLANS[planTier].limits,
  ...overrides,
});

test("no record means the free plan for the subscriber type", () => {
  const org = effectiveState(null, "organization", NOW);
  assert.equal(org.tier, FREE_TIER.organization);
  assert.equal(org.paid, false);
  assert.equal(org.limits.activeJobs, ALL_PLANS.recruiter_free.limits.activeJobs);
  const candidate = effectiveState(null, "candidate", NOW);
  assert.equal(candidate.tier, "candidate_free");
});

test("an active paid plan within its period grants its limits", () => {
  const state = effectiveState(paid("recruiter_growth"), "organization", NOW);
  assert.equal(state.status, "active");
  assert.equal(state.paid, true);
  assert.equal(state.limits.activeJobs, 10);
});

test("a paid plan whose period has ended falls back to the free limits (expiry never deletes)", () => {
  const sub = paid("recruiter_enterprise", { currentPeriodEnd: new Date(NOW.getTime() - DAY) });
  const state = effectiveState(sub, "organization", NOW);
  assert.equal(state.status, "expired");
  assert.equal(state.tier, FREE_TIER.organization);
  assert.equal(state.limits.activeJobs, ALL_PLANS.recruiter_free.limits.activeJobs);
});

test("a cancelled plan keeps its limits until the period ends, then falls back", () => {
  const cancelled = paid("recruiter_growth", { cancelAtPeriodEnd: true });
  assert.equal(effectiveState(cancelled, "organization", NOW).limits.activeJobs, 10);
  const status = effectiveState({ ...cancelled, status: "canceled" }, "organization", NOW);
  assert.equal(status.tier, FREE_TIER.organization);
});

test("past_due keeps paid limits only within the grace window", () => {
  const within = effectiveState(paid("recruiter_growth", { status: "past_due", currentPeriodEnd: new Date(NOW.getTime() - DAY) }), "organization", NOW);
  assert.equal(within.status, "grace");
  assert.equal(within.limits.activeJobs, 10);
  const after = effectiveState(paid("recruiter_growth", { status: "past_due", currentPeriodEnd: new Date(NOW.getTime() - 10 * DAY) }), "organization", NOW);
  assert.equal(after.status, "expired");
  assert.equal(after.limits.activeJobs, ALL_PLANS.recruiter_free.limits.activeJobs);
});

test("a plan of the wrong role or an unknown plan does not grant anything", () => {
  assert.equal(effectiveState(paid("recruiter_growth"), "candidate", NOW).tier, "candidate_free");
  assert.equal(effectiveState({ planTier: "made_up_tier", status: "active" }, "organization", NOW).tier, FREE_TIER.organization);
});

test("job publishing is refused at the plan limit and allowed below it", () => {
  const free = effectiveState(null, "organization", NOW);
  assert.equal(decideJobPublish({ state: free, publishedCount: 0 }).allowed, true);
  assert.equal(decideJobPublish({ state: free, publishedCount: 1 }).allowed, false);
  const growth = effectiveState(paid("recruiter_growth"), "organization", NOW);
  assert.equal(decideJobPublish({ state: growth, publishedCount: 9 }).allowed, true);
  assert.equal(decideJobPublish({ state: growth, publishedCount: 10 }).allowed, false);
});

test("a downgrade cannot add jobs beyond the new limit", () => {
  const downgraded = effectiveState(null, "organization", NOW);
  // 4 jobs were published on the old plan; they remain, but no new one may be published.
  assert.equal(decideJobPublish({ state: downgraded, publishedCount: 4 }).allowed, false);
});

test("team seats and AI analyses follow their own limits", () => {
  const free = effectiveState(null, "organization", NOW);
  assert.equal(decideTeamInvite({ state: free, activeMembers: 1 }).allowed, false);
  assert.equal(decideTeamInvite({ state: free, activeMembers: 0 }).allowed, true);
  const candidate = effectiveState(null, "candidate", NOW);
  assert.equal(decideAiUse({ state: candidate, usedThisPeriod: 4 }).allowed, true);
  assert.equal(decideAiUse({ state: candidate, usedThisPeriod: 5 }).allowed, false);
});

test("the free usage window starts at the IST calendar month", () => {
  // 2026-11-01 00:00 IST is 2026-10-31 18:30 UTC.
  assert.equal(startOfIstMonth(NOW).toISOString(), "2026-10-31T18:30:00.000Z");
  assert.equal(startOfIstMonth(new Date("2026-10-31T18:00:00.000Z")).toISOString(), "2026-09-30T18:30:00.000Z");
});
