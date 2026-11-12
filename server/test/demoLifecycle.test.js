// Database-backed: demo accounts, entitlements and reset safety (Requirements 11 and 15).
// Everything runs against a separate disposable database named hiresmart_demo_test. The seed and reset run as
// child processes with an explicit environment, exactly as a developer runs them. The personal database and any
// server/.env are never used: MONGO_URI and DEMO_* are set explicitly for each child.
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { startDatabase, stopDatabase } = require("./setup");
const { connectDB } = require("../config/db");
const { getEffectiveSubscription } = require("../middleware/subscriptionCheck");
const User = require("../models/User");
const Organization = require("../models/Organization");
const { Membership } = require("../models/Membership");
const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");

const execFileAsync = promisify(execFile);
const SERVER_DIR = path.join(__dirname, "..");
const BACKUP_ROOT = path.join(SERVER_DIR, "backups");
const DEMO_PASSWORD = "DemoLifecycle-Pass-2026";
const DEMO_DB = "hiresmart_demo_test";
const ADMIN = "tofu1180@gmail.com";
const RECRUITER = "2025mca150@gmail.com";
const CANDIDATE = "tanastai5018@gmail.com";
const ctx = { demoUri: "", createdBackups: [] };

// Each DB test makes sure the default connection points at the disposable demo database.
const ensureDemoDb = async () => {
  if (mongoose.connection.readyState !== 1) await connectDB(ctx.demoUri);
};

const childEnv = (extra = {}) => ({
  ...process.env,
  NODE_ENV: "test",
  MONGO_URI: ctx.demoUri,
  // validateEnvironment() requires these; the children do not load server/.env (see the header comment).
  JWT_SECRET: "demo_lifecycle_test_secret_at_least_32_characters_long",
  DEMO_PASSWORD,
  DEMO_RESET_DATABASE: "",
  ...extra,
});

// One line that says why a child process failed (the test runner summary keeps only the first line).
const failure = (res) => {
  const lines = String(res.out || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const reason = lines.find((l) => /Seed execution failed|Error:|refus|not allowed|ECONN|Missing/i.test(l)) || lines[lines.length - 1] || "no output";
  // The TAP reporter renders a message that contains ": " as a block scalar and drops it from the summary, so the
  // separators here avoid colons and the reason stays on one readable line.
  return `child exit ${res.code} - ${reason.replace(/:\s*/g, " - ")}`.slice(0, 400);
};

const runNode = async (args, env) => {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: SERVER_DIR,
      env,
      timeout: 180000,
    });
    return { code: 0, out: `${stdout}${stderr}` };
  } catch (error) {
    const out = `${error.stdout || ""}${error.stderr || ""}${error.message}`;
    // Keep the full child output as a CI artifact (test runner messages drop multi-line output).
    const logDir = path.join(SERVER_DIR, "test-results");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, "demo-lifecycle-children.log"), `\n$ node ${args.join(" ")}\n${out}\n`);
    return { code: error.code ?? 1, out };
  }
};

const seed = () => runNode([path.join("scripts", "seed-presentation-demo.js")], childEnv());

nodeTest.before(async () => {
  await startDatabase();
  ctx.demoUri = process.env.MONGO_URI.replace(/\/[^/?]+(\?|$)/, `/${DEMO_DB}$1`);
  // Start from an empty demo database, then move the default connection there so models can be queried.
  await mongoose.disconnect();
  await connectDB(ctx.demoUri);
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

nodeTest.after(async () => {
  if (mongoose.connection.readyState !== 1) await connectDB(ctx.demoUri).catch(() => {});
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === DEMO_DB) {
    await mongoose.connection.db.dropDatabase();
  }
  for (const dir of ctx.createdBackups) fs.rmSync(dir, { recursive: true, force: true });
  await stopDatabase();
});

nodeTest("refuses to run without DEMO_PASSWORD (min 12 characters) and writes nothing", async () => {
  const res = await runNode([path.join("scripts", "seed-presentation-demo.js")], childEnv({ DEMO_PASSWORD: "short" }));
  assert.notEqual(res.code, 0);
  assert.match(res.out, /DEMO_PASSWORD/);
});

nodeTest("first seed creates the three demo accounts with hashed passwords and no plaintext", async () => {
  await ensureDemoDb();
  const res = await seed();
  assert.equal(res.code, 0, failure(res));
  await connectDB(ctx.demoUri);
  for (const email of [ADMIN, RECRUITER, CANDIDATE]) {
    const user = await User.findOne({ email }).select("+password").lean();
    assert.ok(user, `${email} exists`);
    assert.ok(user.password.startsWith("$2"), "password is a bcrypt hash");
    assert.notEqual(user.password, DEMO_PASSWORD);
    assert.equal(await bcrypt.compare(DEMO_PASSWORD, user.password), true, `${email} accepts DEMO_PASSWORD`);
  }
  const dump = JSON.stringify(await User.collection.find({}).toArray());
  assert.equal(dump.includes(DEMO_PASSWORD), false, "the plaintext password is not stored anywhere in users");
  assert.equal((await User.findOne({ email: ADMIN }).lean()).role, "admin");
});

nodeTest("entitlements: Admin keeps platform access, recruiter company is Enterprise, candidate is Career Plus", async () => {
  await ensureDemoDb();
  const admin = await User.findOne({ email: ADMIN }).lean();
  assert.equal(admin.role, "admin", "platform admin role");

  const recruiter = await User.findOne({ email: RECRUITER }).lean();
  const membership = await Membership.findOne({ user: recruiter._id, status: "active" }).lean();
  assert.ok(membership, "recruiter belongs to a company");
  const orgEnt = await getEffectiveSubscription("organization", membership.organization);
  assert.equal(orgEnt.tier, "recruiter_enterprise");
  assert.equal(orgEnt.paid, true);
  assert.equal(orgEnt.status, "active");

  const candidate = await User.findOne({ email: CANDIDATE }).lean();
  const candEnt = await getEffectiveSubscription("candidate", candidate._id);
  assert.equal(candEnt.tier, "candidate_plus");
  assert.equal(candEnt.paid, true);
});

nodeTest("demo grants are labelled, expire in the future, and never create payment records", async () => {
  await ensureDemoDb();
  const subs = await Subscription.find({ isDemo: true }).lean();
  assert.ok(subs.length >= 2, "demo subscriptions exist");
  for (const s of subs) {
    assert.equal(s.source, "demo_seed");
    assert.equal(s.isDemo, true);
    assert.ok(new Date(s.currentPeriodEnd).getTime() > Date.now(), "future expiry");
  }
  assert.equal(await PaymentTransaction.countDocuments({}), 0, "complimentary grants are not payments or revenue");
});

nodeTest("repeated seeding keeps existing passwords, accounts and subscriptions unchanged", async () => {
  await ensureDemoDb();
  await connectDB(ctx.demoUri);
  const before = {
    users: await User.countDocuments({}),
    subs: await Subscription.countDocuments({}),
    orgs: await Organization.countDocuments({}),
  };
  const passwordBefore = (await User.findOne({ email: CANDIDATE }).select("+password").lean()).password;
  // Simulate a user who changed the demo password through the app.
  const changed = await bcrypt.hash("UserChangedPassword-99", 10);
  await User.collection.updateOne({ email: CANDIDATE }, { $set: { password: changed } });

  const res = await seed();
  assert.equal(res.code, 0, failure(res));
  await connectDB(ctx.demoUri);
  const after = await User.findOne({ email: CANDIDATE }).select("+password").lean();
  assert.equal(after.password, changed, "an existing password is not replaced by the seed");
  assert.notEqual(after.password, passwordBefore);
  assert.equal(await User.countDocuments({}), before.users, "no duplicate accounts");
  assert.equal(await Subscription.countDocuments({}), before.subs, "no duplicate subscriptions");
  assert.equal(await Organization.countDocuments({}), before.orgs, "no duplicate companies");
  assert.equal((await User.findOne({ email: ADMIN }).lean()).role, "admin");
});

nodeTest("reset refuses without --confirm-reset, in production, and for a database name mismatch; data is untouched", async () => {
  await ensureDemoDb();
  await connectDB(ctx.demoUri);
  const usersBefore = await User.countDocuments({});
  const reset = path.join("scripts", "demo-reset.js");

  const noConfirm = await runNode([reset], childEnv({ DEMO_RESET_DATABASE: DEMO_DB }));
  assert.notEqual(noConfirm.code, 0);
  assert.match(noConfirm.out, /--confirm-reset/);

  const prod = await runNode([reset, "--confirm-reset"], childEnv({ NODE_ENV: "production", DEMO_RESET_DATABASE: DEMO_DB }));
  assert.notEqual(prod.code, 0);
  assert.match(prod.out, /production/i);

  const mismatch = await runNode([reset, "--confirm-reset"], childEnv({ DEMO_RESET_DATABASE: "hiresmart_other_test" }));
  assert.notEqual(mismatch.code, 0);
  assert.match(mismatch.out, /DEMO_RESET_DATABASE/);

  await connectDB(ctx.demoUri);
  assert.equal(await User.countDocuments({}), usersBefore, "no refused run deleted anything");
});

nodeTest("confirmed reset writes a verified backup first, then reseeds the disposable database", async () => {
  await ensureDemoDb();
  await connectDB(ctx.demoUri);
  await User.collection.updateOne({ email: CANDIDATE }, { $set: { headline: "Marker before reset" } });
  const beforeCounts = {
    users: await User.countDocuments({}),
    subs: await Subscription.countDocuments({}),
  };

  const res = await runNode([path.join("scripts", "demo-reset.js"), "--confirm-reset"], childEnv({ DEMO_RESET_DATABASE: DEMO_DB }));
  assert.equal(res.code, 0, failure(res));

  const dirs = fs.readdirSync(BACKUP_ROOT).filter((n) => n.startsWith(`${DEMO_DB}-`)).map((n) => path.join(BACKUP_ROOT, n));
  assert.ok(dirs.length >= 1, "a backup directory was created");
  const dir = dirs.sort().pop();
  ctx.createdBackups.push(dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  assert.equal(manifest.database, DEMO_DB);
  assert.equal(manifest.counts.users, beforeCounts.users, "manifest counts match the database at backup time");
  assert.equal(manifest.counts.subscriptions, beforeCounts.subs);
  const EJSON = mongoose.mongo.BSON.EJSON;
  const backedUpUsers = EJSON.parse(fs.readFileSync(path.join(dir, "users.ejson"), "utf8"));
  assert.equal(backedUpUsers.length, beforeCounts.users, "backup file is readable and complete");
  assert.ok(backedUpUsers.some((u) => u.headline === "Marker before reset"), "backup holds the pre-reset data");

  await connectDB(ctx.demoUri);
  assert.equal(await User.findOne({ headline: "Marker before reset" }).lean(), null, "reset replaced the data");
  assert.ok(await User.findOne({ email: ADMIN }).lean(), "demo accounts were seeded again");
  assert.equal(await PaymentTransaction.countDocuments({}), 0);
});

nodeTest("migration dry run reads the disposable database and writes a report without changing data", async () => {
  await ensureDemoDb();
  await connectDB(ctx.demoUri);
  const before = JSON.stringify(await mongoose.connection.db.collection("placements").find({}).toArray());
  const res = await runNode([path.join("scripts", "migrate-employment-status.js")], childEnv());
  assert.equal(res.code, 0, failure(res));
  assert.match(res.out, /Dry run only/);
  assert.equal(JSON.stringify(await mongoose.connection.db.collection("placements").find({}).toArray()), before);
});
