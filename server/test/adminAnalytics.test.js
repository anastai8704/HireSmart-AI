// Phase 5 admin analytics over HTTP against MongoDB (runs in CI).
// Records are created as fixtures with explicit dates so every expected number is derivable.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const emailService = require("../services/emailService");
const { istDayOf } = require("../domain/analyticsDefinitions");

const originalSendMail = emailService.sendMail;
emailService.sendMail = async () => ({ messageId: "test" });
const PASSWORD = "StrongPassword123!";
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ctx = {};
const DAY_MS = 24 * 60 * 60 * 1000;

const failures = [];
process.on("exit", () => {
  if (failures.length) process.stderr.write(`\nANALYTICS FAILURES (${failures.length}):\n${failures.join("\n")}\n`);
});
const test = (name, fn) =>
  nodeTest(name, async () => {
    try {
      await fn();
    } catch (error) {
      failures.push(`- ${name}: ${String(error && error.message).slice(0, 400).replace(/\s+/g, " ")}`);
      throw error;
    }
  });

const register = async (email, intent, organizationName) => {
  const reg = await request(app).post("/api/v1/auth/register").send({
    email,
    password: PASSWORD,
    displayName: email.split("@")[0],
    accountIntent: intent,
    organizationName,
    termsConsent: true,
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  await User.updateOne({ _id: reg.body.data.user.id }, { $set: { emailVerified: true } });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { token: login.body.data.accessToken, userId: reg.body.data.user.id };
};

let txSeq = 0;
// Fixtures are Razorpay test-mode records. Sandbox (simulation) records are never revenue (see domain/revenueRules.js).
const payment = (status, amount, { createdAt, updatedAt } = {}) => {
  txSeq += 1;
  const created = createdAt || new Date();
  const updated = updatedAt || created;
  return PaymentTransaction.collection.insertOne({
    transactionNumber: `TXN-TEST-${txSeq}`,
    subscriberType: "candidate",
    subscriberId: new (require("mongoose").Types.ObjectId)(),
    planTier: "candidate_free",
    amount,
    currency: "INR",
    status,
    gateway: "razorpay",
    mode: "test",
    gatewayOrderId: `order-test-${txSeq}`,
    gatewayPaymentId: `pay_test_${txSeq}`,
    refundedAt: status === "refunded" ? updated : null,
    createdAt: created,
    updatedAt: updated,
  });
};


nodeTest.before(async () => {
  await startDatabase();
});
nodeTest.after(async () => {
  emailService.sendMail = originalSendMail;
  await stopDatabase();
});

test("seed: an admin, a candidate who joined long ago, and a recent candidate", async () => {
  await clearDatabase();
  const admin = await register("admin@analytics.example", "candidate");
  await User.updateOne({ _id: admin.userId }, { $set: { role: "admin" } });
  const login = await request(app).post("/api/v1/auth/login").send({ email: "admin@analytics.example", password: PASSWORD });
  ctx.admin = { token: login.body.data.accessToken };
  ctx.recruiter = await register("owner@analytics.example", "recruiter", "Analytics Co");
  ctx.recent = await register("recent@analytics.example", "candidate");
  ctx.old = await register("old@analytics.example", "candidate");
  await User.collection.updateOne({ _id: new (require("mongoose").Types.ObjectId)(ctx.old.userId) }, { $set: { createdAt: new Date(Date.now() - 40 * DAY_MS) } });
});

test("authorization: non-admins and anonymous callers cannot read the dashboard", async () => {
  const anon = await request(app).get("/api/v1/admin/analytics/overview");
  assert.equal(anon.status, 401);
  const candidate = await request(app).get("/api/v1/admin/analytics/overview").set(auth(ctx.recent.token));
  assert.equal(candidate.status, 404);
  const recruiter = await request(app).get("/api/v1/admin/analytics/overview").set(auth(ctx.recruiter.token));
  assert.equal(recruiter.status, 404);
  const revenue = await request(app).get("/api/v1/admin/analytics/revenue").set(auth(ctx.recent.token));
  assert.equal(revenue.status, 404);
});

test("validation: bad ranges return INVALID_RANGE, not a silent default", async () => {
  for (const q of ["?range=all", "?range=custom", "?range=custom&from=2026-11-05&to=2026-11-01", "?range=custom&from=2020-01-01&to=2026-11-05"]) {
    const res = await request(app).get(`/api/v1/admin/analytics/overview${q}`).set(auth(ctx.admin.token));
    assert.equal(res.status, 400, `${q}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.error?.code || res.body.code, "INVALID_RANGE", q);
  }
});

test("registrations: the 30-day range excludes a 40-day-old account; the 90-day range includes it", async () => {
  const thirty = await request(app).get("/api/v1/admin/analytics/overview?range=30d").set(auth(ctx.admin.token));
  assert.equal(thirty.status, 200, JSON.stringify(thirty.body));
  const d30 = thirty.body.data;
  assert.equal(d30.kpis.candidatesTotal, 2);
  assert.equal(d30.kpis.candidatesNew, 1);
  assert.equal(d30.range.days, 30);
  assert.equal(d30.series.candidateRegistrations.length, 30);
  assert.equal(d30.series.candidateRegistrations.reduce((a, p) => a + p.count, 0), 1);

  const ninety = await request(app).get("/api/v1/admin/analytics/overview?range=90d").set(auth(ctx.admin.token));
  assert.equal(ninety.body.data.kpis.candidatesNew, 2);
  assert.equal(ninety.body.data.series.candidateRegistrations.length, 90);
});

test("custom range: from and to are inclusive IST days and the series covers each day", async () => {
  const today = istDayOf(new Date());
  const res = await request(app)
    .get(`/api/v1/admin/analytics/overview?range=custom&from=${today}&to=${today}`)
    .set(auth(ctx.admin.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.range.days, 1);
  assert.deepEqual(res.body.data.series.candidateRegistrations.map((p) => p.date), [today]);
  assert.equal(res.body.data.kpis.candidatesNew, 1);
});

test("revenue: captured minus refunds, with failed and initiated attempts excluded from revenue", async () => {
  await payment("captured", 1000);
  await payment("refunded", 200);
  await payment("failed", 500);
  await payment("initiated", 300);
  const res = await request(app).get("/api/v1/admin/analytics/overview?range=7d").set(auth(ctx.admin.token));
  const k = res.body.data.kpis;
  assert.equal(k.revenue, 1000, "gross 1200 less refund 200");
  assert.equal(k.successfulPayments, 2, "captured and refunded are both successful payments");
  assert.equal(k.failedPayments, 1);
  assert.equal(k.refunds, 1);
  assert.equal(res.body.data.series.failedPayments.reduce((a, p) => a + p.count, 0), 1);
});

test("payment attempts older than the range do not count", async () => {
  await payment("captured", 9999, { createdAt: new Date(Date.now() - 120 * DAY_MS) });
  const res = await request(app).get("/api/v1/admin/analytics/overview?range=30d").set(auth(ctx.admin.token));
  assert.equal(res.body.data.kpis.revenue, 1000);
});

test("legacy fields remain, and the revenue endpoint no longer returns an invented profit figure", async () => {
  const res = await request(app).get("/api/v1/admin/analytics/overview").set(auth(ctx.admin.token));
  assert.equal(typeof res.body.data.users.total, "number");
  const revenue = await request(app).get("/api/v1/admin/analytics/revenue").set(auth(ctx.admin.token));
  assert.equal(revenue.status, 200, JSON.stringify(revenue.body));
  assert.equal(revenue.body.data.metrics.estimatedNetProfit, undefined);
  // The revenue endpoint is all-time (no date filter), so the 120-day-old capture is included here:
  // gross 1000 + 9999 + refunded 200 = 11199; refunds 200; net 10999.
  assert.equal(revenue.body.data.metrics.totalGrossRevenue, 11199);
  assert.equal(revenue.body.data.metrics.totalRefunds, 200);
  assert.equal(revenue.body.data.metrics.netRevenue, 10999);
});

test("definitions: every KPI ships with a definition and period", async () => {
  const res = await request(app).get("/api/v1/admin/analytics/overview?range=30d").set(auth(ctx.admin.token));
  const defs = res.body.data.definitions;
  for (const key of Object.keys(res.body.data.kpis)) {
    assert.ok(defs[key], `missing definition for ${key}`);
    assert.ok(["range", "as_of_now", "all_time"].includes(defs[key].period), key);
  }
});

