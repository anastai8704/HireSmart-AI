// Subscription entitlements (Phase 6). Pure functions: no database access, so the rules are unit-tested.
// The database layer (middleware/subscriptionCheck.js) loads the subscription record and calls these.
//
// Principles:
// - A plan grants limits only while it is genuinely active. A paid plan whose period has ended, or
//   which is not active, falls back to the free plan for the subscriber type.
// - Expiry and downgrade never delete or hide existing records. They only block new actions
//   (publishing another job, inviting another member, using more AI analyses).
// - Limits are read from the server-side plan configuration, never from the request.

const { ALL_PLANS } = require("../config/subscriptionPlans");

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Free plan per subscriber type. Free plans cost nothing and never need a payment record.
const FREE_TIER = Object.freeze({ candidate: "candidate_free", organization: "recruiter_free" });

// After a failed renewal, a paid plan keeps its limits for this many days (only reachable once a
// recurring-billing flow sets status "past_due"). Zero means no grace period.
const PAYMENT_GRACE_DAYS = 3;

const freeStateFor = (subscriberType, reason, now) => {
  const tier = FREE_TIER[subscriberType] || FREE_TIER.candidate;
  const plan = ALL_PLANS[tier];
  return {
    tier,
    planName: plan.name,
    limits: { ...plan.limits },
    status: "free",
    paid: false,
    reason,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    periodStart: startOfIstMonth(now),
  };
};

// First instant of the IST calendar month containing `now`. Used as the usage window for free plans.
const startOfIstMonth = (now) => {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
};

/**
 * Effective entitlement for a subscriber at time `now`.
 * @param {object|null} sub  Subscription record (lean or document), or null when none exists.
 * @param {"candidate"|"organization"} subscriberType
 * @param {Date} now
 */
const effectiveState = (sub, subscriberType, now = new Date()) => {
  if (!sub) return freeStateFor(subscriberType, "no_subscription", now);

  const plan = ALL_PLANS[sub.planTier];
  if (!plan || plan.role !== (subscriberType === "organization" ? "recruiter" : "candidate")) {
    return freeStateFor(subscriberType, "unknown_plan", now);
  }

  // Free plan records simply carry the free limits.
  if (!plan.priceInr) {
    return {
      tier: plan.tier,
      planName: plan.name,
      limits: { ...plan.limits },
      status: "free",
      paid: false,
      reason: "free_plan",
      periodEnd: null,
      cancelAtPeriodEnd: false,
      periodStart: startOfIstMonth(now),
    };
  }

  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const periodStart = sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : startOfIstMonth(now);
  const limits = { ...(sub.limits && Object.keys(sub.limits).length ? sub.limits : plan.limits) };
  const base = { tier: plan.tier, planName: plan.name, limits, paid: true, periodEnd, periodStart };

  if (sub.status === "active") {
    if (periodEnd && periodEnd.getTime() <= now.getTime()) {
      return { ...freeStateFor(subscriberType, "period_ended", now), status: "expired" };
    }
    return { ...base, status: "active", reason: "active", cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd) };
  }

  if (sub.status === "past_due") {
    const graceEnd = periodEnd ? new Date(periodEnd.getTime() + PAYMENT_GRACE_DAYS * DAY_MS) : null;
    if (graceEnd && now.getTime() < graceEnd.getTime()) {
      return { ...base, status: "grace", reason: "payment_grace", graceEnd, cancelAtPeriodEnd: false };
    }
    return { ...freeStateFor(subscriberType, "payment_failed", now), status: "expired" };
  }

  // canceled, expired, or any other non-active status.
  return { ...freeStateFor(subscriberType, "not_active", now), status: sub.status || "canceled" };
};

// A new publish is allowed while the number of already-published jobs is below the plan limit.
// Existing published jobs are never withdrawn because of a downgrade.
const decideJobPublish = ({ state, publishedCount }) => {
  const limit = state.limits.activeJobs ?? 0;
  return { allowed: publishedCount < limit, limit, current: publishedCount };
};

const decideTeamInvite = ({ state, activeMembers }) => {
  const limit = state.limits.teamMembers ?? 0;
  return { allowed: activeMembers < limit, limit, current: activeMembers };
};

const decideAiUse = ({ state, usedThisPeriod }) => {
  const limit = state.limits.aiAnalysesPerMonth ?? 0;
  return { allowed: usedThisPeriod < limit, limit, current: usedThisPeriod };
};

module.exports = {
  FREE_TIER,
  PAYMENT_GRACE_DAYS,
  effectiveState,
  decideJobPublish,
  decideTeamInvite,
  decideAiUse,
  startOfIstMonth,
};
