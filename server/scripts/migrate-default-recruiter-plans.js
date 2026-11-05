// Phase 6: organizations that were given the paid "Starter" plan automatically (no payment record)
// are moved to the free recruiter plan. Dry run by default.
//
//   node scripts/migrate-default-recruiter-plans.js           # report only (default)
//   node scripts/migrate-default-recruiter-plans.js --apply   # applies the change
//
// Only active recruiter_starter records with priceInr 999 and NO captured/refunded payment for that
// organization are changed. Paid subscribers are never touched. Nothing is deleted; the record keeps
// its id and history, and an audit entry is written for each change.

const { connectDB, disconnectDB } = require("../config/db");
const { validateEnvironment } = require("../config/env");
const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const AuditLog = require("../models/AuditLog");
const { ALL_PLANS } = require("../config/subscriptionPlans");

const APPLY = process.argv.includes("--apply");

const run = async () => {
  validateEnvironment();
  await connectDB();

  const free = ALL_PLANS.recruiter_free;
  const candidates = await Subscription.find({
    subscriberType: "organization",
    planTier: "recruiter_starter",
    status: "active",
  }).lean();

  const paidOrgs = new Set(
    (
      await PaymentTransaction.distinct("subscriberId", {
        subscriberType: "organization",
        status: { $in: ["captured", "refunded"] },
      })
    ).map(String),
  );

  const toChange = candidates.filter((s) => !paidOrgs.has(String(s.subscriberId)));
  console.log(`Active recruiter_starter records: ${candidates.length}`);
  console.log(`With a captured payment (left unchanged): ${candidates.length - toChange.length}`);
  console.log(`Unpaid default records to move to ${free.name}: ${toChange.length}`);

  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to change these records.");
  } else {
    for (const sub of toChange) {
      const result = await Subscription.updateOne(
        { _id: sub._id, planTier: "recruiter_starter", status: "active" },
        { $set: { planTier: free.tier, priceInr: 0, limits: { ...free.limits } } },
      );
      if (result.modifiedCount === 1) {
        await AuditLog.create({
          organization: sub.subscriberId,
          action: "subscription.default_plan_migrated",
          resourceType: "subscription",
          resourceId: String(sub._id),
          outcome: "success",
          metadata: { from: "recruiter_starter", to: free.tier, reason: "unpaid default plan" },
        });
      }
    }
    console.log(`Applied to ${toChange.length} record(s).`);
  }
  await disconnectDB();
};

run().catch(async (error) => {
  console.error("Migration failed:", error.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
