// Database-backed: legacy placement → canonical employment migration (Requirement 9).
// Runs on a separate disposable database (hiresmart_migration_test). The migration CLI runs as a child process with
// an explicit environment, so no personal database or server/.env value is used.
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const mongoose = require("mongoose");
const { startDatabase, stopDatabase } = require("./setup");
const { connectDB } = require("../config/db");
const { EMPLOYMENT_STATUSES, deriveLegacyEmployment } = require("../domain/employmentStatus");

const execFileAsync = promisify(execFile);
const SERVER_DIR = path.join(__dirname, "..");
const BACKUP_ROOT = path.join(SERVER_DIR, "backups");
const MIGRATION_DB = "hiresmart_migration_test";
const oid = () => new mongoose.Types.ObjectId();
const ctx = { uri: "", createdBackups: [], createdReports: [] };

const T0 = new Date("2026-01-10T09:00:00Z");
const T1 = new Date("2026-02-01T09:00:00Z");
const T2 = new Date("2026-03-01T09:00:00Z");

// One fixture per legacy situation. `expect` is the canonical status the evidence supports.
const FIXTURES = [
  { key: "working_verified_later", expect: "active_verified", lastVerified: "active_verified",
    doc: { status: "currently_working", employmentStatusUpdatedAt: T0,
      employmentHistory: [{ event: "placement_verified", at: T1 }] } },
  { key: "working_confirmed_unverified", expect: "joined_pending_verification", lastVerified: "",
    doc: { status: "currently_working", employmentStatusUpdatedAt: T0, joiningConfirmation: { confirmedByCandidate: true } } },
  { key: "working_no_evidence", expect: "status_unconfirmed", lastVerified: "",
    doc: { status: "currently_working", employmentStatusUpdatedAt: T0 } },
  { key: "ended_verified_later", expect: "employment_ended_verified", lastVerified: "employment_ended_verified",
    doc: { status: "employment_ended", employmentStatusUpdatedAt: T0, verification: { isVerified: true, verifiedAt: T2 } } },
  { key: "ended_unverified", expect: "employment_end_pending_verification", lastVerified: "",
    doc: { status: "employment_ended", employmentStatusUpdatedAt: T0 } },
  { key: "placement_verified_only", expect: "status_unconfirmed", lastVerified: "",
    doc: { status: "placement_verified", verification: { isVerified: true, verifiedAt: T1 } } },
  { key: "joining_confirmed", expect: "joined_pending_verification", lastVerified: "",
    doc: { status: "joining_confirmed", joiningConfirmation: { confirmedByCandidate: true } } },
  { key: "hired_with_acceptance", expect: "offer_accepted", lastVerified: "offer_accepted",
    doc: { status: "hired", offerDetails: { acceptedAt: T0 } } },
  { key: "hired_without_acceptance", expect: "status_unconfirmed", lastVerified: "",
    doc: { status: "hired" } },
  { key: "selected_with_acceptance", expect: "offer_accepted", lastVerified: "offer_accepted",
    doc: { status: "selected", offerDetails: { acceptedAt: T0 } } },
  { key: "unknown_legacy_label", expect: "status_unconfirmed", lastVerified: "",
    doc: { status: "some_old_label" } },
];

const insertFixtures = async () => {
  const docs = FIXTURES.map((f) => ({
    _id: oid(),
    organization: oid(),
    job: oid(),
    application: oid(),
    candidate: oid(),
    recruiter: oid(),
    createdAt: T0,
    updatedAt: T0,
    ...f.doc,
    employmentHistory: f.doc.employmentHistory || [{ event: "hired", at: T0, toStatus: f.doc.status, actor: null }],
    _fixtureKey: f.key,
  }));
  // A record that already has a canonical status must be skipped.
  docs.push({
    _id: oid(), organization: oid(), job: oid(), application: oid(), candidate: oid(), recruiter: oid(),
    createdAt: T0, updatedAt: T0, status: "joining_confirmed",
    employment: { status: "active_verified", lastVerifiedStatus: "active_verified" },
    employmentHistory: [], _fixtureKey: "already_canonical",
  });
  await mongoose.connection.db.collection("placements").insertMany(docs);
  return docs;
};

const runMigration = async (args) => {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [path.join("scripts", "migrate-employment-status.js"), ...args], {
      cwd: SERVER_DIR,
      env: { ...process.env, NODE_ENV: "test", MONGO_URI: ctx.uri },
      timeout: 180000,
    });
    return { code: 0, out: `${stdout}${stderr}` };
  } catch (error) {
    return { code: error.code ?? 1, out: `${error.stdout || ""}${error.stderr || ""}${error.message}` };
  }
};

const snapshot = async () =>
  JSON.stringify(await mongoose.connection.db.collection("placements").find({}).sort({ _id: 1 }).toArray());
const byKey = async () => {
  const rows = await mongoose.connection.db.collection("placements").find({}).toArray();
  return Object.fromEntries(rows.map((r) => [r._fixtureKey, r]));
};
const newestReport = (mode) => {
  const dir = BACKUP_ROOT;
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((n) => n.startsWith(`employment-migration-${mode}-`)).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
};

nodeTest.before(async () => {
  await startDatabase();
  ctx.uri = process.env.MONGO_URI.replace(/\/hiresmart_test(\?|$)/, `/${MIGRATION_DB}$1`);
  await mongoose.disconnect();
  await connectDB(ctx.uri);
  await mongoose.connection.db.dropDatabase();
});

nodeTest.after(async () => {
  if (mongoose.connection.readyState !== 1) await connectDB(ctx.uri).catch(() => {});
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === MIGRATION_DB) {
    await mongoose.connection.db.dropDatabase();
  }
  for (const dir of ctx.createdBackups) fs.rmSync(dir, { recursive: true, force: true });
  for (const file of ctx.createdReports) fs.rmSync(file, { force: true });
  await stopDatabase();
});

nodeTest("the canonical model has exactly the seven employment statuses", () => {
  assert.deepEqual([...EMPLOYMENT_STATUSES].sort(), [
    "active_verified",
    "employment_end_pending_verification",
    "employment_ended_verified",
    "joined_pending_verification",
    "offer_accepted",
    "pending_joining",
    "status_unconfirmed",
  ]);
});

nodeTest("dry run maps every legacy situation, reports it, and changes no record", async () => {
  const inserted = await insertFixtures();
  const before = await snapshot();
  const res = await runMigration([]);
  assert.equal(res.code, 0, res.out.slice(-1500));
  assert.match(res.out, /Dry run only/);

  assert.equal(await snapshot(), before, "a dry run does not write to the database");

  const report = JSON.parse(fs.readFileSync(newestReport("dry-run"), "utf8"));
  ctx.createdReports.push(newestReport("dry-run"));
  assert.equal(report.mode, "dry-run");
  assert.equal(report.scanned, inserted.length);
  assert.equal(report.alreadyMigrated, 1, "the record with a canonical status is skipped");
  assert.equal(report.toMigrate, FIXTURES.length);
  for (const f of FIXTURES) {
    const change = report.changes.find((c) => c.placementId === String(inserted.find((d) => d._fixtureKey === f.key)._id));
    assert.ok(change, `${f.key} is in the report`);
    assert.equal(change.employmentStatus, f.expect, `${f.key} maps to ${f.expect}`);
    assert.ok(change.reason, `${f.key} has a reason`);
  }
  assert.equal(report.unconfirmedForAdminReview.length, 4, "ambiguous records are listed for Admin review");
});

nodeTest("the mapping never marks a record verified because a legacy label says so", () => {
  // Pure check on the same rules the migration uses: a bare legacy label gives no verified status.
  assert.equal(deriveLegacyEmployment({ status: "currently_working" }).status, "status_unconfirmed");
  assert.equal(deriveLegacyEmployment({ status: "employment_ended" }).status, "employment_end_pending_verification");
  assert.equal(deriveLegacyEmployment({ status: "placement_verified" }).status, "status_unconfirmed");
});

nodeTest("apply without confirmation is refused and changes nothing", async () => {
  const before = await snapshot();
  const res = await runMigration(["--apply"]);
  assert.notEqual(res.code, 0);
  assert.match(res.out, /--confirm-migrate/);
  assert.equal(await snapshot(), before);
});

nodeTest("confirmed apply writes a verified backup first, sets canonical statuses, and keeps all history", async () => {
  const before = await byKey();
  const res = await runMigration(["--apply", "--confirm-migrate"]);
  assert.equal(res.code, 0, res.out.slice(-1500));
  assert.match(res.out, /Backup written and verified/);

  const backupDir = fs.readdirSync(BACKUP_ROOT).filter((n) => n.startsWith(`${MIGRATION_DB}-`)).sort().pop();
  assert.ok(backupDir, "a backup exists");
  ctx.createdBackups.push(path.join(BACKUP_ROOT, backupDir));
  const manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_ROOT, backupDir, "manifest.json"), "utf8"));
  assert.equal(manifest.counts.placements, Object.keys(before).length, "backup holds every placement before the change");
  ctx.createdReports.push(newestReport("apply"));

  const after = await byKey();
  for (const f of FIXTURES) {
    const row = after[f.key];
    const old = before[f.key];
    assert.equal(row.employment.status, f.expect, `${f.key} is ${f.expect}`);
    assert.equal(row.employment.lastVerifiedStatus || "", f.lastVerified, `${f.key} last verified status`);
    assert.equal(row.status, old.status, `${f.key}: legacy placement status is untouched`);
    // History is preserved: every earlier entry is still there, in order, and one migration event is appended.
    assert.deepEqual(row.employmentHistory.slice(0, old.employmentHistory.length), old.employmentHistory, `${f.key} history kept`);
    assert.equal(row.employmentHistory.length, old.employmentHistory.length + 1);
    const last = row.employmentHistory[row.employmentHistory.length - 1];
    assert.equal(last.event, "employment_migrated");
    assert.equal(last.fromStatus, old.status);
    assert.equal(last.toStatus, f.expect);
  }
  const canonical = after.already_canonical;
  assert.equal(canonical.employment.status, "active_verified", "an already-canonical record is not changed");
  assert.equal(canonical.employmentHistory.length, 0);
  assert.equal(await mongoose.connection.db.collection("placements").countDocuments({}), Object.keys(before).length, "no record deleted");
});

nodeTest("re-running the migration is a no-op (idempotent)", async () => {
  const before = await snapshot();
  const res = await runMigration(["--apply", "--confirm-migrate"]);
  assert.equal(res.code, 0, res.out.slice(-1500));
  assert.equal(await snapshot(), before, "no second history event and no changed status");
  ctx.createdReports.push(newestReport("apply"));
  const backups = fs.readdirSync(BACKUP_ROOT).filter((n) => n.startsWith(`${MIGRATION_DB}-`));
  for (const b of backups) if (!ctx.createdBackups.some((c) => c.endsWith(b))) ctx.createdBackups.push(path.join(BACKUP_ROOT, b));
});
