// Phase 9 integration tests: audit trail contents and access, billing notices, and idempotent delivery.
// Runs against the test database (CI service container). No network: email transport is stubbed.
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../app");
const emailService = require("../services/emailService");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const User = require("../models/User");
const Membership = require("../models/Membership");
const { Subscription } = require("../models/Subscription");
const { audit } = require("../services/auditService");
const { runSubscriptionExpiryNotices } = require("../services/subscriptionNoticeService");
const { notifySubscriptionEvent } = require("../services/billingNotifications");

const PASSWORD = "StrongPassword123!";
const API = "/api/v1";
const DAY = 24 * 3600 * 1000;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ctx = {};
const originalSendMail = emailService.sendMail;

const register = async (email, intent, organizationName) => {
  const reg = await request(app).post(`${API}/auth/register`).send({
    email,
    password: PASSWORD,
    displayName: email.split("@")[0],
    accountIntent: intent,
    organizationName,
    termsConsent: true,
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const login = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return {
    token: login.body.data.accessToken,
    userId: String(reg.body.data.user.id || reg.body.data.user._id),
    orgId: reg.body.data.organization ? String(reg.body.data.organization.id) : null,
  };
};

test.before(async () => {
  await startDatabase();
  emailService.sendMail = async () => ({ messageId: "test-message" });
});

test.after(async () => {
  emailService.sendMail = originalSendMail;
  await stopDatabase();
});

test("seed: an admin, a candidate, and a recruiter who owns a company", async () => {
  await clearDatabase();
  ctx.admin = await register("notify-admin@example.test", "candidate");
  await User.updateOne({ _id: ctx.admin.userId }, { $set: { role: "admin" } });
  const login = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: "notify-admin@example.test", password: PASSWORD });
  ctx.admin.token = login.body.data.accessToken;
  ctx.candidate = await register("notify-candidate@example.test", "candidate");
  ctx.recruiter = await register("notify-owner@example.test", "recruiter", "Notify Company");
  assert.ok(ctx.recruiter.orgId);
});

test("audit entries never store secrets, in the database or through the admin viewer", async () => {
  await audit({
    action: "test.secret_probe",
    resourceType: "test",
    resourceId: "probe-1",
    metadata: { password: "P-SECRET-1", payment: { key_secret: "K-SECRET-2" } },
    previousState: { refreshToken: "R-SECRET-3", status: "before" },
    newState: { status: "after" },
    reason: "probe reason",
  });
  const stored = await AuditLog.findOne({ action: "test.secret_probe" }).lean();
  const raw = JSON.stringify(stored);
  for (const secret of ["P-SECRET-1", "K-SECRET-2", "R-SECRET-3"]) {
    assert.equal(raw.includes(secret), false, `stored audit row leaked ${secret}`);
  }
  assert.equal(stored.previousState.status, "before");
  assert.equal(stored.newState.status, "after");
  assert.equal(stored.reason, "probe reason");

  const viewed = await request(app)
    .get(`${API}/admin/audit-logs?action=test.secret_probe`)
    .set(auth(ctx.admin.token));
  assert.equal(viewed.status, 200, JSON.stringify(viewed.body));
  assert.equal(viewed.body.data.length, 1);
  assert.equal(viewed.body.data[0].metadata.password, "[REDACTED]");
  assert.equal(JSON.stringify(viewed.body).includes("P-SECRET-1"), false);
});

test("the audit log is visible only to platform administrators", async () => {
  const anonymous = await request(app).get(`${API}/admin/audit-logs`);
  assert.equal(anonymous.status, 401);
  const candidate = await request(app).get(`${API}/admin/audit-logs`).set(auth(ctx.candidate.token));
  assert.equal(candidate.status, 404);
  const recruiter = await request(app).get(`${API}/admin/audit-logs`).set(auth(ctx.recruiter.token));
  assert.equal(recruiter.status, 404);
});

test("suspending a user records the previous and new state and the reason", async () => {
  const before = await User.findById(ctx.candidate.userId).select("accountStatus").lean();
  assert.equal(before.accountStatus, "active");
  const res = await request(app)
    .post(`${API}/admin/users/${ctx.candidate.userId}/suspend`)
    .set(auth(ctx.admin.token))
    .send({ reason: "Policy test suspension" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.status, "suspended");

  const row = await AuditLog.findOne({ action: "admin.user_suspended", resourceId: ctx.candidate.userId }).lean();
  assert.ok(row, "suspension is audited");
  assert.equal(row.previousState.accountStatus, "active");
  assert.equal(row.newState.accountStatus, "suspended");
  assert.equal(row.reason, "Policy test suspension");
  assert.equal(String(row.actor), ctx.admin.userId);
  assert.equal(row.outcome, "success");
});

test("subscription expiry: one reminder per owner, none for auto-renewing or free plans, and no repeats", async () => {
  // Registration creates one active subscription per subscriber, so the fixtures update those records.
  // Paid, cancelled at period end, ending in 3 days: should be reminded.
  const orgSub = await Subscription.updateOne(
    { subscriberType: "organization", subscriberId: ctx.recruiter.orgId, status: "active" },
    {
      $set: {
        planTier: "recruiter_starter",
        priceInr: 999,
        currentPeriodEnd: new Date(Date.now() + 3 * DAY),
        cancelAtPeriodEnd: true,
      },
    },
  );
  assert.equal(orgSub.modifiedCount, 1, "the company has an active subscription to expire");
  // Paid, auto-renewing via the provider, ending in 2 days: must not get an expiry reminder.
  await Subscription.updateOne(
    { subscriberType: "candidate", subscriberId: ctx.candidate.userId, status: "active" },
    {
      $set: {
        planTier: "candidate_plus",
        priceInr: 199,
        currentPeriodEnd: new Date(Date.now() + 2 * DAY),
        cancelAtPeriodEnd: false,
        providerSubscriptionId: "sub_test_renewing",
      },
    },
  );

  const first = await runSubscriptionExpiryNotices();
  assert.equal(first.sent, 1, `expected one reminder, got ${first.sent}`);
  const ownerReminders = await Notification.countDocuments({
    type: "subscription_expiring",
    user: ctx.recruiter.userId,
  });
  assert.equal(ownerReminders, 1);
  const candidateReminders = await Notification.countDocuments({
    type: "subscription_expiring",
    user: ctx.candidate.userId,
  });
  assert.equal(candidateReminders, 0);

  // Running again in the same period must not duplicate the reminder.
  const second = await runSubscriptionExpiryNotices();
  assert.equal(second.sent, 0);
  assert.equal(await Notification.countDocuments({ type: "subscription_expiring", user: ctx.recruiter.userId }), 1);

  // The reminder is for the company's owner, not for other members.
  const owners = await Membership.find({ organization: ctx.recruiter.orgId, role: "owner" }).lean();
  assert.ok(owners.some((m) => String(m.user) === ctx.recruiter.userId));
});

test("billing notices use the same idempotency key for each recipient, so a replay adds nothing", async () => {
  const subscription = { subscriberType: "candidate", subscriberId: ctx.candidate.userId, _id: new mongoose.Types.ObjectId() };
  const args = {
    type: "subscription_activated",
    title: "Your plan is active",
    message: "Your plan is now active.",
    key: "subscription-activated:test-replay",
  };
  await notifySubscriptionEvent(subscription, args);
  await notifySubscriptionEvent(subscription, args);
  const count = await Notification.countDocuments({
    user: ctx.candidate.userId,
    type: "subscription_activated",
    idempotencyKey: `subscription-activated:test-replay:${ctx.candidate.userId}`,
  });
  assert.equal(count, 1);
});
