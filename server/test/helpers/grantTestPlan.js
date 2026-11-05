// Test fixture only. Gives a test organization a high-limit paid plan so suites that are not about
// billing can publish several jobs. Plan enforcement itself is tested in subscriptionEnforcement.test.js,
// which does not use this helper. Writes directly to the test database; never used by the app.
const { Subscription } = require("../../models/Subscription");
const { ALL_PLANS } = require("../../config/subscriptionPlans");

const DAY = 24 * 3600 * 1000;

const grantTestPlan = async (organizationId) => {
  const plan = ALL_PLANS.recruiter_enterprise;
  await Subscription.updateOne(
    { subscriberType: "organization", subscriberId: organizationId },
    {
      $set: {
        planTier: plan.tier,
        status: "active",
        priceInr: plan.priceInr,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * DAY),
        limits: { ...plan.limits },
      },
    },
    { upsert: true },
  );
};

module.exports = { grantTestPlan };
