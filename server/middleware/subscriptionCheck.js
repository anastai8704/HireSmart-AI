const { Subscription } = require("../models/Subscription");
const Job = require("../models/Job");
const { Membership } = require("../models/Membership");
const { ALL_PLANS, RECRUITER_PLANS, CANDIDATE_PLANS } = require("../config/subscriptionPlans");
const AppError = require("../utils/AppError");
const asyncHandler = require("./asyncHandler");

/**
 * Ensures an organization has an active subscription record.
 * If none exists, creates the default Starter subscription.
 */
const getOrCreateOrgSubscription = async (organizationId) => {
  let sub = await Subscription.findOne({
    subscriberType: "organization",
    subscriberId: organizationId,
    status: "active",
  });

  if (!sub) {
    const starterPlan = RECRUITER_PLANS.recruiter_starter;
    sub = await Subscription.create({
      subscriberType: "organization",
      subscriberId: organizationId,
      planTier: starterPlan.tier,
      status: "active",
      priceInr: starterPlan.priceInr,
      limits: starterPlan.limits,
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
 * Ensures a candidate has an active subscription record.
 * If none exists, creates the default Free subscription.
 */
const getOrCreateCandidateSubscription = async (candidateId) => {
  let sub = await Subscription.findOne({
    subscriberType: "candidate",
    subscriberId: candidateId,
    status: "active",
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

/**
 * Middleware: Enforces active job posting limits based on organization plan.
 */
const checkRecruiterJobLimit = asyncHandler(async (req, _res, next) => {
  const orgId = req.auth?.organizationId;
  if (!orgId) return next();

  const sub = await getOrCreateOrgSubscription(orgId);
  const activeJobs = await Job.countDocuments({
    organization: orgId,
    status: "published",
  });

  // Update real usage count
  sub.usage.activeJobsCount = activeJobs;
  await sub.save();

  if (activeJobs >= (sub.limits?.activeJobs ?? 3)) {
    const plan = ALL_PLANS[sub.planTier] || RECRUITER_PLANS.recruiter_starter;
    throw new AppError(
      `Your current ${plan.name} plan has reached the maximum of ${sub.limits.activeJobs} active job postings. Upgrade your plan to Growth or Enterprise to publish additional positions.`,
      403,
      "UPGRADE_REQUIRED",
    );
  }

  req.subscription = sub;
  next();
});

/**
 * Middleware: Enforces team member seats limits based on organization plan.
 */
const checkRecruiterTeamLimit = asyncHandler(async (req, _res, next) => {
  const orgId = req.auth?.organizationId;
  if (!orgId) return next();

  const sub = await getOrCreateOrgSubscription(orgId);
  const activeMembers = await Membership.countDocuments({
    organization: orgId,
    status: "active",
  });

  // Update real usage count
  sub.usage.teamMembersCount = activeMembers;
  await sub.save();

  if (activeMembers >= (sub.limits?.teamMembers ?? 2)) {
    const plan = ALL_PLANS[sub.planTier] || RECRUITER_PLANS.recruiter_starter;
    throw new AppError(
      `Your current ${plan.name} plan allows up to ${sub.limits.teamMembers} team members. Upgrade your plan to invite more teammates.`,
      403,
      "UPGRADE_REQUIRED",
    );
  }

  req.subscription = sub;
  next();
});

/**
 * Middleware: Checks candidate AI features quota.
 */
const checkCandidateAILimit = asyncHandler(async (req, _res, next) => {
  const candidateId = req.user?._id;
  if (!candidateId) return next();

  const sub = await getOrCreateCandidateSubscription(candidateId);
  if (sub.planTier === "candidate_plus") {
    req.subscription = sub;
    return next();
  }

  if ((sub.usage?.aiAnalysesUsedThisMonth || 0) >= (sub.limits?.aiAnalysesPerMonth || 5)) {
    throw new AppError(
      "You have reached your free monthly AI usage limit. Upgrade to Career Plus for unlimited AI resume enhancements and interview preparation.",
      403,
      "UPGRADE_REQUIRED",
    );
  }

  req.subscription = sub;
  next();
});

module.exports = {
  getOrCreateOrgSubscription,
  getOrCreateCandidateSubscription,
  checkRecruiterJobLimit,
  checkRecruiterTeamLimit,
  checkCandidateAILimit,
};
