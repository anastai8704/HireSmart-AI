// Server-side subscription enforcement (Phase 6).
// Entitlement rules are pure functions in domain/subscriptionRules.js. This module loads the stored
// records and applies those rules. Limits are never taken from the request.
const { Subscription } = require("../models/Subscription");
const Job = require("../models/Job");
const AIAnalysis = require("../models/AIAnalysis");
const { Membership } = require("../models/Membership");
const { ALL_PLANS, CANDIDATE_PLANS } = require("../config/subscriptionPlans");
const {
  effectiveState,
  decideJobPublish,
  decideTeamInvite,
  decideAiUse,
  refusalCodeFor,
  featureDecision,
  FREE_TIER,
} = require("../domain/subscriptionRules");
const { audit } = require("../services/auditService");
const AppError = require("../utils/AppError");
const asyncHandler = require("./asyncHandler");

const planNameOf = (tier) => (ALL_PLANS[tier] || ALL_PLANS[FREE_TIER.organization]).name;

/**
 * Returns the entitlement for a subscriber right now. A paid period that has ended is marked expired
 * once, with an audit entry. Nothing else about the subscriber's records is changed.
 */
const getEffectiveSubscription = async (subscriberType, subscriberId, now = new Date()) => {
  const sub = await Subscription.findOne({
    subscriberType,
    subscriberId,
    status: { $in: ["active", "past_due"] },
  }).sort({ createdAt: -1 });

  // A provider-managed subscription whose period ended is in grace, not expired: the provider's renewal
  // charge (or its failure notice) may still be on its way. Cancelled subscriptions do not get grace.
  if (
    sub &&
    sub.status === "active" &&
    sub.providerSubscriptionId &&
    !sub.cancelAtPeriodEnd &&
    sub.currentPeriodEnd &&
    new Date(sub.currentPeriodEnd) <= now
  ) {
    const periodEnd = new Date(sub.currentPeriodEnd);
    const result = await Subscription.updateOne(
      { _id: sub._id, status: "active", currentPeriodEnd: { $lte: now } },
      { $set: { status: "past_due", pastDueSince: periodEnd } },
    );
    if (result.modifiedCount === 1) {
      await audit({
        organization: subscriberType === "organization" ? subscriberId : null,
        action: "subscription.payment_grace_started",
        resourceType: "subscription",
        resourceId: sub._id,
        metadata: { planTier: sub.planTier, periodEnd },
      });
    }
    return effectiveState({ ...sub.toObject(), status: "past_due", pastDueSince: periodEnd }, subscriberType, now);
  }

  if (sub && sub.status === "active" && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) <= now) {
    const result = await Subscription.updateOne(
      { _id: sub._id, status: "active", currentPeriodEnd: { $lte: now } },
      { $set: { status: "expired" } },
    );
    if (result.modifiedCount === 1) {
      await audit({
        organization: subscriberType === "organization" ? subscriberId : null,
        action: "subscription.expired",
        resourceType: "subscription",
        resourceId: sub._id,
        metadata: { planTier: sub.planTier, periodEnd: sub.currentPeriodEnd },
      });
    }
    return effectiveState({ ...sub.toObject(), status: "expired" }, subscriberType, now);
  }
  const effective = effectiveState(sub ? sub.toObject() : null, subscriberType, now);
  // A past_due subscription whose grace window has ended is expired in the record too (eventual expiry).
  if (sub && sub.status === "past_due" && effective.status === "expired") {
    const result = await Subscription.updateOne(
      { _id: sub._id, status: "past_due" },
      { $set: { status: "expired" } },
    );
    if (result.modifiedCount === 1) {
      await audit({
        organization: subscriberType === "organization" ? subscriberId : null,
        action: "subscription.expired",
        resourceType: "subscription",
        resourceId: sub._id,
        metadata: { planTier: sub.planTier, reason: "payment_grace_ended", periodEnd: sub.currentPeriodEnd },
      });
    }
  }
  return effective;
};

/**
 * Ensures an organization has a subscription record. A new organization gets the FREE recruiter plan,
 * never a paid plan without a payment record.
 */
const getOrCreateOrgSubscription = async (organizationId) => {
  // One record per subscriber (unique index). Expired records are kept and read as free by
  // getEffectiveSubscription, so a lookup must not filter by status or it would try to insert a duplicate.
  let sub = await Subscription.findOne({
    subscriberType: "organization",
    subscriberId: organizationId,
  });

  if (!sub) {
    const freePlan = ALL_PLANS[FREE_TIER.organization];
    sub = await Subscription.create({
      subscriberType: "organization",
      subscriberId: organizationId,
      planTier: freePlan.tier,
      status: "active",
      priceInr: 0,
      limits: freePlan.limits,
      usage: {
        activeJobsCount: 0,
        teamMembersCount: 1,
        aiAnalysesUsedThisMonth: 0,
      },
    });
  }
  return sub;
};

/**
 * Ensures a candidate has a subscription record. New candidates get the free plan.
 */
const getOrCreateCandidateSubscription = async (candidateId) => {
  let sub = await Subscription.findOne({
    subscriberType: "candidate",
    subscriberId: candidateId,
  });
  if (!sub) {
    const freePlan = CANDIDATE_PLANS.candidate_free;
    sub = await Subscription.create({
      subscriberType: "candidate",
      subscriberId: candidateId,
      planTier: freePlan.tier,
      status: "active",
      priceInr: freePlan.priceInr,
      limits: freePlan.limits,
      usage: {
        activeJobsCount: 0,
        teamMembersCount: 0,
        aiAnalysesUsedThisMonth: 0,
      },
    });
  }
  return sub;
};

// ---- Guards used by controllers (throw on refusal) ----

/** Throws UPGRADE_REQUIRED when the organization already has as many published jobs as its plan allows. */
const assertCanPublishJob = async (organizationId, jobIdToExclude = null, now = new Date()) => {
  const state = await getEffectiveSubscription("organization", organizationId, now);
  const query = { organization: organizationId, status: "published" };
  if (jobIdToExclude) query._id = { $ne: jobIdToExclude };
  const publishedCount = await Job.countDocuments(query);
  const decision = decideJobPublish({ state, publishedCount });
  if (!decision.allowed) {
    throw refusal(state, `Your ${planNameOf(state.tier)} plan allows ${decision.limit} active job posting${decision.limit === 1 ? "" : "s"}. Close a posting${state.paid ? "" : " or upgrade your plan"} to publish another.`);
  }
  return { state, decision };
};

/** Throws UPGRADE_REQUIRED when the organization already has as many active members as its plan allows. */
const assertCanInviteMember = async (organizationId, now = new Date()) => {
  const state = await getEffectiveSubscription("organization", organizationId, now);
  const activeMembers = await Membership.countDocuments({ organization: organizationId, status: "active" });
  const decision = decideTeamInvite({ state, activeMembers });
  if (!decision.allowed) {
    throw refusal(state, `Your ${planNameOf(state.tier)} plan allows up to ${decision.limit} team member${decision.limit === 1 ? "" : "s"}. ${state.paid ? "Remove a member or wait for the plan limit to change" : "Upgrade your plan to invite more teammates"}.`);
  }
  return { state, decision };
};

/**
 * The refusal for a quota action. The code depends on the entitlement state (see refusalCodeFor).
 * An expired paid plan explains that data is kept and the Free limits apply.
 */
const refusal = (state, message) => {
  const code = refusalCodeFor(state);
  const text =
    code === "SUBSCRIPTION_EXPIRED"
      ? `Your ${planNameOf(state.tier)} subscription has ended, so the Free plan limits apply. Your existing data is kept. Renew to restore ${planNameOf(state.tier)} limits.`
      : message;
  return new AppError(text, 403, code);
};

/**
 * Feature gate for a route. Throws FEATURE_NOT_INCLUDED when the subscriber's plan does not include the feature.
 * `requiredTiers` comes from the catalogue; see featureDecision.
 */
const assertFeatureIncluded = (state, requiredTiers) => {
  const decision = featureDecision({ state, requiredTiers });
  if (!decision.allowed) {
    throw new AppError(
      `This feature is not included in your ${planNameOf(state.tier)} plan. Upgrade to a plan that includes it.`,
      403,
      "FEATURE_NOT_INCLUDED",
    );
  }
  return decision;
};

/** Start of the usage window: the paid period start, or the IST calendar month on free plans. */
const aiUsageWindow = (state) => state.periodStart;

// ---- Route middleware ----

/** Job publishing limit for the organization in the request (kept for route-level use). */
const checkRecruiterJobLimit = asyncHandler(async (req, _res, next) => {
  const orgId = req.auth?.organizationId;
  if (!orgId) return next();
  await assertCanPublishJob(orgId);
  next();
});

/** Team seat limit for the organization in the request (kept for route-level use). */
const checkRecruiterTeamLimit = asyncHandler(async (req, _res, next) => {
  const orgId = req.auth?.organizationId;
  if (!orgId) return next();
  await assertCanInviteMember(orgId);
  next();
});

/**
 * AI analysis quota. Counts stored AIAnalysis rows in the current usage window, so the quota cannot
 * drift from what actually ran. Organization routes count the organization; personal routes count the user.
 */
const checkAiPlanLimit = asyncHandler(async (req, _res, next) => {
  const isOrgRoute = Boolean(req.params?.organizationId && req.auth?.organizationId);
  const subscriberType = isOrgRoute ? "organization" : "candidate";
  const subscriberId = isOrgRoute ? req.auth.organizationId : req.user?._id || req.auth?.userId;
  if (!subscriberId) return next();

  const state = await getEffectiveSubscription(subscriberType, subscriberId);
  const since = aiUsageWindow(state);
  const scope = isOrgRoute ? { organization: subscriberId } : { user: subscriberId };
  const used = await AIAnalysis.countDocuments({ ...scope, createdAt: { $gte: since } });
  const decision = decideAiUse({ state, usedThisPeriod: used });
  if (!decision.allowed) {
    throw refusal(state, `You have used the ${decision.limit} AI analyses included in your ${planNameOf(state.tier)} plan for this period. ${state.paid ? "Try again next period." : "Upgrade your plan or try again next period."}`);
  }
  req.subscription = state;
  next();
});

/** Candidate AI quota (kept for compatibility; delegates to the shared AI limit). */
const checkCandidateAILimit = checkAiPlanLimit;

module.exports = {
  getOrCreateOrgSubscription,
  getOrCreateCandidateSubscription,
  getEffectiveSubscription,
  assertCanPublishJob,
  assertCanInviteMember,
  assertFeatureIncluded,
  checkRecruiterJobLimit,
  checkRecruiterTeamLimit,
  checkCandidateAILimit,
  checkAiPlanLimit,
};
