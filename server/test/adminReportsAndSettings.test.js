// Integration tests: Admin Reports & Platform Settings (Phase 4H)
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Organization = require("../models/Organization");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const AuditLog = require("../models/AuditLog");
const PlatformSetting = require("../models/PlatformSetting");
const { toCsv, csvCell } = require("../services/reportService");
const emailService = require("../services/emailService");

emailService.sendMail = async () => ({ messageId: "test" });

const PASSWORD = "Password123!Secure";
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const ctx = {};

nodeTest.before(async () => {
  await startDatabase();
});

nodeTest.after(async () => {
  await stopDatabase();
});

nodeTest.test("seed: admin and candidate users, transactions, and audit records", async () => {
  await clearDatabase();

  // 1. Admin
  const regAdmin = await request(app).post("/api/v1/auth/register").send({
    email: "superadmin@hiresmart.ai",
    password: PASSWORD,
    displayName: "Platform Admin",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regAdmin.status, 201);
  await User.updateOne({ email: "superadmin@hiresmart.ai" }, { $set: { role: "admin", emailVerified: true } });
  const adminLogin = await request(app).post("/api/v1/auth/login").send({
    email: "superadmin@hiresmart.ai",
    password: PASSWORD,
  });
  assert.equal(adminLogin.status, 200);
  ctx.adminToken = adminLogin.body.data.accessToken;

  // 2. Candidate (non-admin)
  const regCand = await request(app).post("/api/v1/auth/register").send({
    email: "regular.cand@example.com",
    password: PASSWORD,
    displayName: "Regular Candidate",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regCand.status, 201);
  const candLogin = await request(app).post("/api/v1/auth/login").send({
    email: "regular.cand@example.com",
    password: PASSWORD,
  });
  assert.equal(candLogin.status, 200);
  ctx.candToken = candLogin.body.data.accessToken;

  // 3. Organization & transactions (test vs live)
  const org = await Organization.create({
    name: "Apex Technologies",
    slug: "apex-tech",
    verificationStatus: "verified",
    createdBy: regAdmin.body.data.user.id,
  });
  ctx.orgId = org._id;

  await PaymentTransaction.create([
    {
      transactionNumber: "TXN-TEST-001",
      subscriberType: "organization",
      subscriberId: org._id,
      planTier: "recruiter_growth",
      amount: 4999,
      currency: "INR",
      status: "captured",
      gateway: "razorpay",
      mode: "test",
      invoiceNumber: "INV-TEST-001",
    },
    {
      transactionNumber: "TXN-LIVE-002",
      subscriberType: "organization",
      subscriberId: org._id,
      planTier: "recruiter_enterprise",
      amount: 19999,
      currency: "INR",
      status: "captured",
      gateway: "razorpay",
      mode: "live",
      invoiceNumber: "INV-LIVE-002",
    },
  ]);
  await PaymentTransaction.updateOne({ transactionNumber: "TXN-LIVE-002" }, { $set: { mode: "live" } });
});

nodeTest.test("security: non-admin access to reports and settings is denied", async () => {
  // Gating on reports
  const repRes = await request(app)
    .get("/api/v1/admin/reports")
    .set(auth(ctx.candToken));
  assert.equal(repRes.status, 404);

  // Gating on settings
  const setRes = await request(app)
    .get("/api/v1/admin/settings")
    .set(auth(ctx.candToken));
  assert.equal(setRes.status, 404);
});

nodeTest.test("admin reports: list available report catalog", async () => {
  const res = await request(app)
    .get("/api/v1/admin/reports")
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  const types = res.body.data.map((r) => r.type);
  assert.ok(types.includes("candidate_registrations"));
  assert.ok(types.includes("company_verification"));
  assert.ok(types.includes("job_moderation"));
  assert.ok(types.includes("job_postings"));
  assert.ok(types.includes("applications"));
  assert.ok(types.includes("hiring_pipeline"));
  assert.ok(types.includes("employment_records"));
  assert.ok(types.includes("subscriptions"));
  assert.ok(types.includes("payments"));
  assert.ok(types.includes("revenue"));
  assert.ok(types.includes("platform_activity"));
  assert.ok(types.includes("user_growth"));
  assert.ok(types.includes("security_events"));
  assert.ok(types.includes("ai_usage"));
});

nodeTest.test("admin reports: run specific report with date range", async () => {
  const res = await request(app)
    .get("/api/v1/admin/reports/user_growth?range=30d")
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  assert.equal(res.body.data.type, "user_growth");
  assert.ok(Array.isArray(res.body.data.columns));
  assert.ok(Array.isArray(res.body.data.rows));
  assert.ok(res.body.data.range);
});

nodeTest.test("admin reports: CSV export and formula injection protection", async () => {
  // 1. Endpoint returns text/csv attachment
  const res = await request(app)
    .get("/api/v1/admin/reports/payments?format=csv&range=30d")
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/csv/);
  assert.match(res.headers["content-disposition"], /attachment; filename="hiresmart-payments-/);
  assert.ok(res.text.includes("Transaction"));
  assert.ok(res.text.includes("Environment Mode"));

  // 2. Unit check for formula injection characters (=, +, -, @, tab, return)
  assert.equal(csvCell("=SUM(A1:B1)"), "\"'=SUM(A1:B1)\"");
  assert.equal(csvCell("+12345"), "\"'+12345\"");
  assert.equal(csvCell("-cmd|' /C calc'!A0"), "\"'-cmd|' /C calc'!A0\"");
  assert.equal(csvCell("@malicious"), "\"'@malicious\"");
  assert.equal(csvCell("Normal Company, Inc."), "\"Normal Company, Inc.\"");
});

nodeTest.test("financial data: test vs live mode separation in payments and revenue", async () => {
  // Test mode payments only
  const testRes = await request(app)
    .get("/api/v1/admin/reports/payments?range=30d&mode=test")
    .set(auth(ctx.adminToken));

  assert.equal(testRes.status, 200);
  const testRows = testRes.body.data.rows;
  assert.ok(testRows.length >= 1);
  assert.ok(testRows.every((r) => r.mode === "test"));

  // Live mode payments only
  const liveRes = await request(app)
    .get("/api/v1/admin/reports/payments?range=30d&mode=live")
    .set(auth(ctx.adminToken));

  assert.equal(liveRes.status, 200);
  const liveRows = liveRes.body.data.rows;
  assert.ok(liveRows.length >= 1);
  assert.ok(liveRows.every((r) => r.mode === "live"));
});

nodeTest.test("admin platform settings: get defaults and update sections", async () => {
  // 1. Get settings
  const getRes = await request(app)
    .get("/api/v1/admin/settings")
    .set(auth(ctx.adminToken));

  assert.equal(getRes.status, 200);
  const settings = getRes.body.data;
  assert.equal(settings.key, "global");
  assert.equal(settings.general.platformName, "HireSmart-AI");
  assert.equal(settings.general.maintenanceMode, false);
  assert.equal(settings.registration.allowCandidateSignup, true);
  assert.equal(settings.security.sessionTimeoutMinutes, 120);

  // 2. Update allowed sections
  const patchRes = await request(app)
    .patch("/api/v1/admin/settings")
    .set(auth(ctx.adminToken))
    .send({
      general: {
        platformName: "HireSmart Enterprise",
        maintenanceMode: true,
        maintenanceMessage: "Scheduled maintenance in progress.",
      },
      security: {
        sessionTimeoutMinutes: 60,
        maxFailedLoginsBeforeLockout: 4,
      },
      reason: "Security policy update and maintenance test",
    });

  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.data.general.platformName, "HireSmart Enterprise");
  assert.equal(patchRes.body.data.general.maintenanceMode, true);
  assert.equal(patchRes.body.data.security.sessionTimeoutMinutes, 60);

  // 3. Verify audit log entry was created
  const log = await AuditLog.findOne({ action: "platform_settings.updated" }).sort({ createdAt: -1 });
  assert.ok(log);
  assert.equal(log.resourceType, "platform_settings");
  assert.equal(log.reason, "Security policy update and maintenance test");
});

nodeTest.test("admin platform settings: rejects illegal sections and invalid values", async () => {
  // Illegal section
  const illegalRes = await request(app)
    .patch("/api/v1/admin/settings")
    .set(auth(ctx.adminToken))
    .send({
      hackedSection: { arbitraryKey: "val" },
    });

  assert.equal(illegalRes.status, 400);

  // Empty payload
  const emptyRes = await request(app)
    .patch("/api/v1/admin/settings")
    .set(auth(ctx.adminToken))
    .send({});

  assert.equal(emptyRes.status, 400);
});
