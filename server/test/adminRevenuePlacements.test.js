// Database-backed tests: admin revenue (Requirement 8) and placements/employment (Requirement 9).
// Runs against MongoDB through test/setup.js. Not verified until run with a MongoDB instance (see CHECKPOINT.md).
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
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { Placement } = require("../models/Placement");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { Subscription } = require("../models/Subscription");
const AuditLog = require("../models/AuditLog");
const emailService = require("../services/emailService");

const originalSendMail = emailService.sendMail;
emailService.sendMail = async () => ({ messageId: "test" });
const PASSWORD = "StrongPassword123!";
const DAY_MS = 24 * 60 * 60 * 1000;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const oid = () => new mongoose.Types.ObjectId();
const ctx = {};

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
  return { token: login.body.data.accessToken, userId: reg.body.data.user.id, orgId: reg.body.data.organization?.id };
};

let txSeq = 0;
const txn = (over = {}) => {
  txSeq += 1;
  const createdAt = over.createdAt || new Date();
  const status = over.status || "captured";
  return {
    transactionNumber: `TXN-R9-${txSeq}`,
    subscriberType: "organization",
    subscriberId: ctx.orgId,
    planTier: "recruiter_pro",
    amount: 1000,
    currency: "INR",
    status,
    gateway: "razorpay",
    mode: "test",
    gatewayOrderId: `order_r9_${txSeq}`,
    gatewayPaymentId: `pay_r9_${txSeq}`,
    refundedAt: status === "refunded" ? over.refundedAt || createdAt : null,
    createdAt,
    updatedAt: over.updatedAt || createdAt,
    ...over,
  };
};
// Raw driver deletes: only payment and subscription records are reset, so the placement fixtures survive.
const resetRevenueCollections = async () => {
  await PaymentTransaction.collection.deleteMany({});
  await Subscription.collection.deleteMany({});
};
const insertTxn = (over) => PaymentTransaction.collection.insertOne(txn(over));

nodeTest.before(async () => {
  await startDatabase();
});
nodeTest.after(async () => {
  emailService.sendMail = originalSendMail;
  await stopDatabase();
});

nodeTest("seed: admin, recruiter with a company, a second company, a candidate and a hired placement", async () => {
  await clearDatabase();
  const admin = await register("admin@r9.example", "candidate");
  await User.updateOne({ _id: admin.userId }, { $set: { role: "admin" } });
  ctx.adminId = admin.userId;
  ctx.admin = { token: (await request(app).post("/api/v1/auth/login").send({ email: "admin@r9.example", password: PASSWORD })).body.data.accessToken };

  const recruiter = await register("owner@r9.example", "recruiter", "Acme R9");
  ctx.recruiter = recruiter.token;
  ctx.orgId = recruiter.orgId;
  await Organization.updateOne({ _id: ctx.orgId }, { $set: { verificationStatus: "verified", verifiedAt: new Date() } });

  const other = await register("owner@other-r9.example", "recruiter", "Other R9");
  ctx.otherRecruiter = other.token;
  ctx.otherOrgId = other.orgId;

  const candidate = await register("cand@r9.example", "candidate");
  ctx.candidate = candidate.token;
  ctx.candidateId = candidate.userId;

  ctx.jobId = oid();
  await Job.collection.insertOne({
    _id: ctx.jobId,
    organization: new mongoose.Types.ObjectId(ctx.orgId),
    title: "Backend Engineer R9",
    status: "published",
    moderation: { status: "approved" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  ctx.applicationId = oid();
  await Application.collection.insertOne({
    _id: ctx.applicationId,
    organization: new mongoose.Types.ObjectId(ctx.orgId),
    job: ctx.jobId,
    jobVersion: 1,
    jobSnapshot: { title: "Backend Engineer R9", company: "Acme R9", location: "Pune" },
    candidate: new mongoose.Types.ObjectId(ctx.candidateId),
    status: "hired",
    appliedAt: new Date(Date.now() - 20 * DAY_MS),
    statusHistory: [
      { status: "submitted", changedAt: new Date(Date.now() - 20 * DAY_MS) },
      { status: "hired", changedAt: new Date(Date.now() - 2 * DAY_MS) },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  ctx.placementId = oid();
  await Placement.collection.insertOne({
    _id: ctx.placementId,
    application: ctx.applicationId,
    organization: new mongoose.Types.ObjectId(ctx.orgId),
    candidate: new mongoose.Types.ObjectId(ctx.candidateId),
    job: ctx.jobId,
    status: "hired",
    offerDetails: { designation: "Backend Engineer R9", ctc: 1500000, currency: "INR" },
    joiningConfirmation: { confirmedByCandidate: false },
    verification: { isVerified: false },
    employmentPeriod: {},
    employmentHistory: [{ event: "placement_created", toStatus: "hired", source: "platform_reported", at: new Date() }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

// ---- Revenue (Requirement 8) ----

nodeTest("revenue: captured less refunds; failed, pending and sandbox records are excluded", async () => {
  await resetRevenueCollections();
  // Each revenue test starts from empty payment and subscription records; placement fixtures are untouched.
  await insertTxn({ amount: 1000, status: "captured" });
  await insertTxn({ amount: 200, status: "refunded" });
  await insertTxn({ amount: 400, status: "captured", mode: "live" });
  await insertTxn({ amount: 700, status: "failed" });
  await insertTxn({ amount: 300, status: "initiated" });
  // Sandbox (simulation) capture: fabricated, must never be revenue or listed in Revenue & Plans.
  await insertTxn({ amount: 5000, status: "captured", gateway: "simulation", mode: "simulation", gatewayPaymentId: "pay_sim_1" });

  const res = await request(app).get("/api/v1/admin/revenue?range=30d").set(auth(ctx.admin.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { summary, transactions } = res.body.data;
  assert.equal(summary.total.grossCaptured, 1600, "1000 test + 200 refunded + 400 live");
  assert.equal(summary.total.refunds, 200);
  assert.equal(summary.total.netRevenue, 1400);
  assert.equal(summary.test.netRevenue, 1000, "test mode: 1000 + 200 - 200");
  assert.equal(summary.live.netRevenue, 400, "live is reported separately");
  assert.equal(summary.failedPayments, 1);
  assert.equal(summary.pendingAttempts, 1);
  assert.equal(res.body.meta.total, 5, "sandbox record is not listed");
  assert.equal(transactions.some((t) => t.mode === "simulation"), false);
});

nodeTest("revenue: a refund is counted in the period it was processed, not the period the payment was made", async () => {
  await resetRevenueCollections();
  await insertTxn({ amount: 1000, status: "refunded", createdAt: new Date(Date.now() - 40 * DAY_MS), refundedAt: new Date() });
  const res = await request(app).get("/api/v1/admin/revenue?range=30d").set(auth(ctx.admin.token));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.summary.total.grossCaptured, 0, "payment is outside the 30 day window");
  assert.equal(res.body.data.summary.total.refunds, 1000, "refund was processed inside the window");
  assert.equal(res.body.data.summary.total.netRevenue, -1000);
});

nodeTest("revenue: filters and pagination on the same records", async () => {
  await resetRevenueCollections();
  for (let i = 0; i < 5; i += 1) await insertTxn({ amount: 100 + i, status: "captured" });
  await insertTxn({ amount: 50, status: "captured", mode: "live" });
  await insertTxn({ amount: 60, status: "failed" });

  const live = await request(app).get("/api/v1/admin/revenue?range=30d&mode=live").set(auth(ctx.admin.token));
  assert.equal(live.body.meta.total, 1);
  const failed = await request(app).get("/api/v1/admin/revenue?range=30d&status=failed").set(auth(ctx.admin.token));
  assert.equal(failed.body.meta.total, 1);
  const paged = await request(app).get("/api/v1/admin/revenue?range=30d&limit=2&page=2").set(auth(ctx.admin.token));
  assert.equal(paged.body.data.transactions.length, 2);
  assert.equal(paged.body.meta.pages, 4);
  const bad = await request(app).get("/api/v1/admin/revenue?range=30d&mode=bogus").set(auth(ctx.admin.token));
  assert.equal(bad.status, 400);
});

nodeTest("revenue: a demo or complimentary grant is never counted as revenue or as a paid subscription", async () => {
  await resetRevenueCollections();
  await Subscription.collection.insertOne({
    subscriberType: "organization",
    subscriberId: oid(),
    planTier: "recruiter_pro",
    priceInr: 0,
    source: "demo_seed",
    isDemo: true,
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const res = await request(app).get("/api/v1/admin/analytics/overview?range=30d").set(auth(ctx.admin.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.kpis.activePaidSubscriptions, 0);
  assert.equal(res.body.data.kpis.successfulPayments, 0);
  assert.equal(res.body.data.kpis.revenue, 0);
});

nodeTest("revenue: the analytics overview and the Revenue & Plans page agree", async () => {
  await resetRevenueCollections();
  await insertTxn({ amount: 999, status: "captured" });
  await insertTxn({ amount: 299, status: "refunded", refundedAt: new Date() });
  const [overview, page] = await Promise.all([
    request(app).get("/api/v1/admin/analytics/overview?range=30d").set(auth(ctx.admin.token)),
    request(app).get("/api/v1/admin/revenue?range=30d").set(auth(ctx.admin.token)),
  ]);
  assert.equal(overview.status, 200);
  assert.equal(page.status, 200);
  assert.equal(overview.body.data.kpis.revenue, page.body.data.summary.total.netRevenue);
  assert.equal(overview.body.data.kpis.testRevenue, page.body.data.summary.test.netRevenue);
  assert.equal(overview.body.data.kpis.liveRevenue, 0);
});

nodeTest("revenue: recruiters and candidates cannot read the admin revenue page (404, no data)", async () => {
  const recruiter = await request(app).get("/api/v1/admin/revenue").set(auth(ctx.recruiter));
  assert.equal(recruiter.status, 404);
  assert.equal(recruiter.body.data, undefined);
  const candidate = await request(app).get("/api/v1/admin/revenue").set(auth(ctx.candidate));
  assert.equal(candidate.status, 404);
});

// ---- Placements and employment (Requirement 9) ----

nodeTest("placements: company → job → application → placement relationships are consistent", async () => {
  const companies = await request(app).get("/api/v1/admin/placements/companies").set(auth(ctx.admin.token));
  assert.equal(companies.status, 200, JSON.stringify(companies.body));
  const acme = companies.body.data.find((c) => c.organization.id === ctx.orgId);
  assert.ok(acme, "company with a placement is listed");
  assert.equal(acme.counts.total, 1);
  assert.equal(acme.counts.reportedNotVerified, 1);

  const jobs = await request(app).get(`/api/v1/admin/placements/companies/${ctx.orgId}/jobs`).set(auth(ctx.admin.token));
  assert.equal(jobs.status, 200);
  assert.equal(jobs.body.data[0].job.id, String(ctx.jobId));
  assert.equal(jobs.body.data[0].job.title, "Backend Engineer R9");

  const list = await request(app)
    .get(`/api/v1/admin/placements?organizationId=${ctx.orgId}&jobId=${ctx.jobId}`)
    .set(auth(ctx.admin.token));
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);

  const detail = await request(app).get(`/api/v1/admin/placements/${ctx.placementId}`).set(auth(ctx.admin.token));
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.data.application.id, String(ctx.applicationId), "placement points to the originating application");
  assert.equal(detail.body.data.application.status, "hired");
  assert.equal(detail.body.data.placement.employmentFacts.verified.isVerified, false);
});

nodeTest("cross-organization: a recruiter from another company cannot see this company's placements", async () => {
  const forged = await request(app).get(`/api/v1/organizations/${ctx.orgId}/placements`).set(auth(ctx.otherRecruiter));
  assert.ok([403, 404].includes(forged.status), `expected 403 or 404, got ${forged.status}`);
  const adminOnly = await request(app).get("/api/v1/admin/placements/companies").set(auth(ctx.otherRecruiter));
  assert.equal(adminOnly.status, 404);
  const detail = await request(app).get(`/api/v1/admin/placements/${ctx.placementId}`).set(auth(ctx.otherRecruiter));
  assert.equal(detail.status, 404);
});

nodeTest("sensitive profile: admin reads are audited; recruiters get nothing and leave no audit trail", async () => {
  const before = await AuditLog.countDocuments({ action: "admin.candidate_profile_viewed" });
  const denied = await request(app)
    .get(`/api/v1/admin/placements/${ctx.placementId}/candidate-profile`)
    .set(auth(ctx.otherRecruiter));
  assert.equal(denied.status, 404);
  assert.equal(denied.body.data, undefined);
  assert.equal(await AuditLog.countDocuments({ action: "admin.candidate_profile_viewed" }), before);

  const res = await request(app)
    .get(`/api/v1/admin/placements/${ctx.placementId}/candidate-profile`)
    .set(auth(ctx.admin.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const body = JSON.stringify(res.body.data);
  assert.equal(/"phone"|"address"|"gender"|"socialLinks"/.test(body), false, "contact and personal fields are withheld");
  assert.equal(res.body.data.applicationHistory.length, 1);

  const audit = await AuditLog.findOne({ action: "admin.candidate_profile_viewed", resourceId: String(ctx.candidateId) });
  assert.ok(audit, "profile view is recorded");
  assert.equal(String(audit.actor), String(ctx.adminId), "the reading administrator is recorded");
  assert.equal(audit.metadata.placementId, String(ctx.placementId));
});

nodeTest("employment: candidate reports leaving, admin verifies; earlier records are kept, reported and verified stay distinct", async () => {
  // Candidate starts working: hired → currently_working.
  const start = await request(app)
    .patch(`/api/v1/placements/${ctx.placementId}/employment-status`)
    .set(auth(ctx.candidate))
    .send({ status: "currently_working", startDate: new Date(Date.now() - 1 * DAY_MS).toISOString() });
  assert.equal(start.status, 200, JSON.stringify(start.body));

  // Candidate reports leaving: currently_working → employment_ended.
  const end = await request(app)
    .patch(`/api/v1/placements/${ctx.placementId}/employment-status`)
    .set(auth(ctx.candidate))
    .send({ status: "employment_ended", endDate: new Date().toISOString(), exitReason: "Relocated" });
  assert.equal(end.status, 200, JSON.stringify(end.body));

  // Invalid transition is refused and records nothing.
  const invalid = await request(app)
    .patch(`/api/v1/placements/${ctx.placementId}/employment-status`)
    .set(auth(ctx.candidate))
    .send({ status: "currently_working" });
  assert.equal(invalid.status, 409);

  // Admin verifies the record. Verification does not overwrite the reported employment status.
  const verify = await request(app)
    .post(`/api/v1/admin/placements/${ctx.placementId}/verify`)
    .set(auth(ctx.admin.token))
    .send({ adminRemarks: "Checked against the offer letter" });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));

  const detail = await request(app).get(`/api/v1/admin/placements/${ctx.placementId}`).set(auth(ctx.admin.token));
  const history = detail.body.data.placement.employmentHistory;
  const events = history.map((h) => h.event);
  assert.deepEqual(events.filter((e) => e === "employment_reported").length, 2, "both reports kept");
  assert.ok(events.includes("placement_created"), "creation event kept");
  assert.ok(events.includes("placement_verified"), "verification event added");
  assert.equal(detail.body.data.placement.status, "employment_ended", "reported status is not overwritten by verification");
  assert.equal(detail.body.data.placement.employmentFacts.reported.source, "candidate_reported");
  assert.equal(detail.body.data.placement.employmentFacts.verified.isVerified, true);
});
