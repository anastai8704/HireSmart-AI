/**
 * Migration: legacy placement status → canonical employment status (Requirement 9).
 *
 *   npm run migrate:employment                      dry run (default): writes a report file, changes nothing in the database
 *   npm run migrate:employment -- --apply --confirm-migrate   applies the plan
 *
 * Safety rules:
 * - Dry run is the default. A dry run never writes to the database.
 * - --apply needs --confirm-migrate. It first writes and verifies a full backup (server/backups/), and stops if that fails.
 * - Only records without a canonical employment.status are touched. Re-running is a no-op (idempotent).
 * - Nothing is deleted or overwritten. The legacy placement `status` is left as it is. Each change appends an
 *   `employment_migrated` event to employmentHistory, and the legacy value is kept in that event.
 * - Verification evidence decides the mapping (see domain/employmentStatus.js). A legacy label is never proof on its own.
 */
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("node:fs");
const path = require("node:path");
const { connectDB, disconnectDB } = require("../config/db");
const { deriveLegacyEmployment } = require("../domain/employmentStatus");
const mongoose = require("mongoose");
const { backupDatabase } = require("./demo-reset");

const REPORT_DIR = path.join(__dirname, "..", "backups");
const MIGRATION_EVENT = "employment_migrated";

/** Pure: plan for a list of placement documents (plain objects). Records with a canonical status are skipped. */
const buildMigrationPlan = (placements) => {
  const changes = [];
  const skipped = [];
  for (const p of placements) {
    if (p.employment && p.employment.status) {
      skipped.push({ placementId: String(p._id), reason: "already has a canonical employment status" });
      continue;
    }
    const derived = deriveLegacyEmployment(p);
    changes.push({
      placementId: String(p._id),
      legacyStatus: p.status || "",
      employmentStatus: derived.status,
      lastVerifiedStatus: derived.lastVerifiedStatus,
      reason: derived.reason,
    });
  }
  const byTarget = changes.reduce((acc, c) => {
    acc[c.employmentStatus] = (acc[c.employmentStatus] || 0) + 1;
    return acc;
  }, {});
  const byLegacyToTarget = changes.reduce((acc, c) => {
    const k = `${c.legacyStatus || "(none)"} -> ${c.employmentStatus}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  return {
    scanned: placements.length,
    toMigrate: changes.length,
    alreadyMigrated: skipped.length,
    countsByTargetStatus: byTarget,
    countsByLegacyToTarget: byLegacyToTarget,
    unconfirmedForAdminReview: changes.filter((c) => c.employmentStatus === "status_unconfirmed").map((c) => c.placementId),
    changes,
  };
};

const writeReport = (plan, mode) => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `employment-migration-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ mode, createdAt: new Date().toISOString(), ...plan }, null, 2));
  return file;
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-migrate");
  if (apply && !confirmed) {
    throw new Error("--apply requires --confirm-migrate. Nothing was changed.");
  }
  await connectDB();
  const db = mongoose.connection.db;
  const docs = await db.collection("placements").find({}).toArray();
  const plan = buildMigrationPlan(docs);

  if (!apply) {
    const file = writeReport(plan, "dry-run");
    console.log(JSON.stringify({ mode: "dry-run", ...summary(plan), reportFile: file }, null, 2));
    console.log("Dry run only. No database changes were made. Re-run with --apply --confirm-migrate to apply.");
    await disconnectDB();
    return;
  }

  const host = mongoose.connection.host;
  const backup = await backupDatabase(db, host);
  console.log(`Backup written and verified: ${backup.dir}`);
  const applyPlan = writeReport(plan, "apply");

  const now = new Date();
  let applied = 0;
  let skippedOnRerun = 0;
  for (const c of plan.changes) {
    const result = await db.collection("placements").updateOne(
      { _id: new mongoose.Types.ObjectId(c.placementId), $or: [{ "employment.status": { $exists: false } }, { "employment.status": "" }, { "employment.status": null }] },
      {
        $set: {
          "employment.status": c.employmentStatus,
          "employment.lastVerifiedStatus": c.lastVerifiedStatus,
          "employment.migratedAt": now,
        },
        $push: {
          employmentHistory: {
            event: MIGRATION_EVENT,
            fromStatus: c.legacyStatus,
            toStatus: c.employmentStatus,
            source: "migration",
            actor: null,
            at: now,
            note: c.reason,
          },
        },
      },
    );
    if (result.modifiedCount === 1) applied += 1;
    else skippedOnRerun += 1;
  }
  console.log(JSON.stringify({ mode: "apply", applied, skippedOnRerun, reportFile: applyPlan, backupDir: backup.dir }, null, 2));
  await disconnectDB();
};

const summary = (plan) => ({
  scanned: plan.scanned,
  toMigrate: plan.toMigrate,
  alreadyMigrated: plan.alreadyMigrated,
  countsByTargetStatus: plan.countsByTargetStatus,
  countsByLegacyToTarget: plan.countsByLegacyToTarget,
  unconfirmedForAdminReview: plan.unconfirmedForAdminReview,
});

if (require.main === module) {
  main().catch(async (error) => {
    console.error(`Employment migration stopped: ${error.message}`);
    process.exitCode = 1;
    await disconnectDB().catch(() => {});
  });
}

module.exports = { buildMigrationPlan, MIGRATION_EVENT };
