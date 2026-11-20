// Integration tests: Admin Subscriptions & Revenue Management (Phase 4F)
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
const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const AuditLog = require("../models/AuditLog");
const emailService = require("../services/emailService");

emailService.sendMail = async () => ({ messageId: "test" });

const PASSWORD = "Password123!Safe";
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const ctx = {};

nodeTest.before(async () => {
  await startDatabase();
});

nodeTest.after(async () => {
  await stopDatabase();
});

nodeTest.test("seed: admin, candidate, organization, subscriptions, and transactions", async () => {
  await clearDatabase();

  // 1. Admin
  const regAdmin = await request(app).post("/api/v1/auth/register").send({
    email: "platformadmin@hiresmart.ai",
    password: PASSWORD,
    displayName: "Admin User",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regAdmin.status, 201);
  await User.updateOne({ email: "platformadmin@hiresmart.ai" }, { $set: { role: "admin", emailVerified: true } });
  const adminLogin = await request(app).post("/api/v1/auth/login").send({
    email: "platformadmin@hiresmart.ai",
    password: PASSWORD,
  });
  assert.equal(adminLogin.status, 200);
  ctx.adminToken = adminLogin.body.data.accessToken;

  // 2. Candidate
  const regCand = await request(app).post("/api/v1/auth/register").send({
    email: "john.candidate@example.com",
    password: PASSWORD,
    displayName: "John Candidate",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regCand.status, 201);
  await User.updateOne({ email: "john.candidate@example.com" }, { $set: { emailVerified: true } });
  const candLogin = await request(app).post("/api/v1/auth/login").send({
    email: "john.candidate@example.com",
    password: PASSWORD,
  });
  assert.equal(candLogin.status, 200);
  ctx.candidateToken = candLogin.body.data.accessToken;
  const candidate = await User.findOne({ email: "john.candidate@example.com" });

  // 3. Organization
  const org = await Organization.create({
    name: "Acme Tech Corp",
    slug: "acme-tech-corp",
    verificationStatus: "verified",
  });
  ctx.orgId = org._id;

  // 4. Subscriptions
  // A: Org active paid subscription
  const orgSub = await Subscription.create({
    subscriberType: "organization",
    subscriberId: org._id,
    planTier: "recruiter_growth",
    status: "active",
    priceInr: 2499,
    billingCycle: "monthly",
    source: "razorpay",
    isDemo: false,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    limits: { activeJobs: 10, teamMembers: 5, aiAnalysesPerMonth: 250 },
    usage: { activeJobsCount: 2, teamMembersCount: 1, aiAnalysesUsedThisMonth: 15 },
  });
  ctx.orgSubId = orgSub._id;

  // B: Candidate free subscription
  const candSub = await Subscription.create({
    subscriberType: "candidate",
    subscriberId: candidate._id,
    planTier: "candidate_free",
    status: "active",
    priceInr: 0,
    billingCycle: "monthly",
    source: "razorpay",
    isDemo: false,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    limits: { activeJobs: 0, teamMembers: 0, aiAnalysesPerMonth: 5 },
    usage: { activeJobsCount: 0, teamMembersCount: 0, aiAnalysesUsedThisMonth: 1 },
  });
  ctx.candSubId = candSub._id;

  // C: Past due subscription
  const pastDueSub = await Subscription.create({
    subscriberType: "organization",
    subscriberId: new mongoose.Types.ObjectId(),
    planTier: "recruiter_starter",
    status: "past_due",
    priceInr: 999,
    billingCycle: "monthly",
    pastDueSince: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    renewalFailures: 2,
  });
  ctx.pastDueSubId = pastDueSub._id;

  // 5. Payment Transactions
  const txn1 = await PaymentTransaction.create({
    transactionNumber: "TXN-ADMIN-001",
    invoiceNumber: "INV-2026-0001",
    subscriberType: "organization",
    subscriberId: org._id,
    subscription: orgSub._id,
    planTier: "recruiter_growth",
    amount: 2499,
    currency: "INR",
    status: "captured",
    gateway: "razorpay",
    gatewayOrderId: "order_test_001",
    gatewayPaymentId: "pay_test_001",
    mode: "test",
    createdAt: new Date(),
  });
  ctx.txn1Id = txn1._id;

  const txn2 = await PaymentTransaction.create({
    transactionNumber: "TXN-ADMIN-002",
    invoiceNumber: "INV-2026-0002",
    subscriberType: "organization",
    subscriberId: org._id,
    subscription: orgSub._id,
    planTier: "recruiter_growth",
    amount: 2499,
    currency: "INR",
    status: "refunded",
    gateway: "razorpay",
    gatewayOrderId: "order_test_002",
    gatewayPaymentId: "pay_test_002",
    mode: "test",
    refundedAt: new Date(),
    createdAt: new Date(Date.now() - 86400000),
  });
  ctx.txn2Id = txn2._id;
});

nodeTest.test("security: non-admins cannot access admin subscriptions or revenue endpoints", async () => {
  // Candidate accessing /admin/subscriptions
  const res1 = await request(app)
    .get("/api/v1/admin/subscriptions")
    .set(auth(ctx.candidateToken));
  assert.equal(res1.status, 404);

  // Unauthenticated accessing /admin/revenue/export
  const res2 = await request(app).get("/api/v1/admin/revenue/export");
  assert.equal(res2.status, 401);

  // Candidate accessing /admin/revenue/transactions/:id
  const res3 = await request(app)
    .get(`/api/v1/admin/revenue/transactions/${ctx.txn1Id}`)
    .set(auth(ctx.candidateToken));
  assert.equal(res3.status, 404);
});

nodeTest.test("admin subscriptions list: returns paged subscriptions, status counts, and plan distribution", async () => {
  const res = await request(app)
    .get("/api/v1/admin/subscriptions")
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length >= 3);

  const { counts, planDistribution } = res.body.meta;
  assert.ok(counts.total >= 3);
  assert.ok(counts.activePaid >= 1);
  assert.ok(counts.free >= 1);
  assert.ok(counts.pastDue >= 1);

  assert.ok(Array.isArray(planDistribution));

  // Verify subscriber population
  const orgSubRow = res.body.data.find((s) => s.id === String(ctx.orgSubId));
  assert.ok(orgSubRow);
  assert.equal(orgSubRow.subscriber.name, "Acme Tech Corp");
  assert.equal(orgSubRow.subscriber.type, "organization");
  assert.equal(orgSubRow.planTier, "recruiter_growth");
});

nodeTest.test("admin subscriptions list: filters by status and searches by name", async () => {
  // Filter by status=past_due
  const pastDueRes = await request(app)
    .get("/api/v1/admin/subscriptions?status=past_due")
    .set(auth(ctx.adminToken));
  assert.equal(pastDueRes.status, 200);
  assert.equal(pastDueRes.body.data.length, 1);
  assert.equal(pastDueRes.body.data[0].status, "past_due");

  // Search by organization name
  const searchRes = await request(app)
    .get("/api/v1/admin/subscriptions?q=Acme")
    .set(auth(ctx.adminToken));
  assert.equal(searchRes.status, 200);
  assert.ok(searchRes.body.data.some((s) => s.subscriber.name === "Acme Tech Corp"));
});

nodeTest.test("admin subscription details: returns entitlements, usage, payment history, and audit history", async () => {
  const res = await request(app)
    .get(`/api/v1/admin/subscriptions/${ctx.orgSubId}`)
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  const { subscription, subscriber, limits, usage, paymentHistory } = res.body.data;
  assert.equal(subscription.id, String(ctx.orgSubId));
  assert.equal(subscription.planTier, "recruiter_growth");
  assert.equal(subscriber.name, "Acme Tech Corp");
  assert.ok(subscription.limits.activeJobs === 10);
  assert.ok(subscription.usage.activeJobsCount === 2);
  assert.ok(Array.isArray(paymentHistory));
  assert.ok(paymentHistory.length >= 1);
});

nodeTest.test("admin subscription cancellation: enforces validation and audit trail", async () => {
  // 1. Missing reason fails with 400
  const failRes = await request(app)
    .post(`/api/v1/admin/subscriptions/${ctx.orgSubId}/cancel`)
    .set(auth(ctx.adminToken))
    .send({ reason: "no" });
  assert.equal(failRes.status, 400);

  // 2. Valid cancellation succeeds
  const cancelRes = await request(app)
    .post(`/api/v1/admin/subscriptions/${ctx.orgSubId}/cancel`)
    .set(auth(ctx.adminToken))
    .send({ reason: "Requested by client billing admin", immediate: true });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.data.status, "canceled");

  // 3. Duplicate cancellation returns 409
  const dupRes = await request(app)
    .post(`/api/v1/admin/subscriptions/${ctx.orgSubId}/cancel`)
    .set(auth(ctx.adminToken))
    .send({ reason: "Canceling again", immediate: true });
  assert.equal(dupRes.status, 409);

  // 4. Verify audit log was recorded
  const auditEntry = await AuditLog.findOne({
    action: "admin.subscription_canceled",
    resourceId: String(ctx.orgSubId),
  });
  assert.ok(auditEntry);
  assert.equal(auditEntry.reason, "Requested by client billing admin");
});

nodeTest.test("admin payment details: returns safe transaction data without secrets", async () => {
  const res = await request(app)
    .get(`/api/v1/admin/revenue/transactions/${ctx.txn1Id}`)
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  const txn = res.body.data;
  assert.equal(txn.transactionNumber, "TXN-ADMIN-001");
  assert.equal(txn.invoiceNumber, "INV-2026-0001");
  assert.equal(txn.amount, 2499);
  assert.equal(txn.subscriber.name, "Acme Tech Corp");
  assert.equal(txn.status, "captured");
  assert.equal(txn.mode, "test");
  // Ensure no secret keys/signatures are exposed
  assert.equal(txn.gatewaySignature, undefined);
});

nodeTest.test("admin revenue export: generates CSV with filtered transactions", async () => {
  const res = await request(app)
    .get("/api/v1/admin/revenue/export?mode=test")
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  assert.ok(res.headers["content-type"].includes("text/csv"));
  assert.ok(res.headers["content-disposition"].includes("revenue-export-"));

  const csvText = res.text;
  assert.ok(csvText.includes("Transaction Number"));
  assert.ok(csvText.includes("TXN-ADMIN-001"));
  assert.ok(csvText.includes("TXN-ADMIN-002"));
});
