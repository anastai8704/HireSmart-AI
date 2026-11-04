// Job moderation drift report and repair (Phase 3).
//
//   node scripts/moderation-drift-report.js            # read-only report (default)
//   node scripts/moderation-drift-report.js --apply    # clears the stale draft proposals
//
// Before Phase 3, editing a draft or a rejected job also wrote a proposed change (pendingChanges)
// to it. Those drafts were then counted as "pending" on the moderation counts and the company
// dashboard, although nothing was waiting for review. The edits themselves were already saved to
// the job, so clearing the stale proposal loses no content.
//
// The report also lists the other places where the old counts disagreed with the queue:
// closed jobs that still show a pending listing, and jobs with a proposed change that are not live.
// Those are only reported; a human decides what to do with them.

const { connectDB, disconnectDB } = require("../config/db");
const { validateEnvironment } = require("../config/env");
const Job = require("../models/Job");
const policy = require("../domain/jobModerationPolicy");

const APPLY = process.argv.includes("--apply");

const run = async () => {
  validateEnvironment();
  await connectDB();

  const staleProposals = await Job.find({
    "pendingChanges.status": "pending",
    $or: [{ status: { $ne: "published" } }, { "moderation.status": { $nin: ["approved", "none", "suspended"] } }],
  })
    .select("_id title status moderation pendingChanges organization")
    .lean();

  const closedPending = await Job.countDocuments({
    status: "closed",
    "moderation.status": "pending",
  });

  const needsReview = await Job.countDocuments(policy.needsReviewQuery());

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    needsReviewNow: needsReview,
    staleProposals: staleProposals.length,
    closedWithPendingListing: closedPending,
    examples: staleProposals.slice(0, 10).map((job) => ({
      id: String(job._id),
      title: job.title,
      status: job.status,
      moderation: job.moderation?.status,
      proposalFields: Object.keys(job.pendingChanges?.fields || {}),
    })),
  }, null, 2));

  if (APPLY && staleProposals.length) {
    const result = await Job.updateMany(
      { _id: { $in: staleProposals.map((job) => job._id) } },
      { $unset: { pendingChanges: "" } },
    );
    console.log(`Cleared ${result.modifiedCount} stale proposal(s).`);
  }
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
