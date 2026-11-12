// Phase 6 subscription enforcement over HTTP against MongoDB (runs in CI).
// Limits are checked on the server; expiry never deletes or unpublishes jobs; plans cannot be
// granted from the client.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const AIAnalysis = require("../models/AIAnalysis");
const AuditLog = require("../models/AuditLog");
const { Subscription } = require("../models/Subscription");
const { ALL_PLANS } = require("../config/subscriptionPlans");
const emailService = require("../services/emailService");

const originalSendMail = emailService.sendMail;
emailService.sendMail = async () => ({ messageId: "test" });
const PASSWORD = "StrongPassword123!";
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ctx = {};
const DAY = 24 * 3600 * 1000;

const failures = [];
process.on("exit", () => {
  if (failures.length) process.stderr.write(`\nSUBSCRIPTION FAILURES (${failures.length}):\n${failures.join("\n")}\n`);
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
  return { token: login.body.data.accessToken, userId: reg.body.data.user.id, orgId: reg.body.data.organization?.id };
};

const createJob = async (title) => {
  const created = await request(app)
    .post(`/api/v1/organizations/${ctx.owner.orgId}/jobs`)
    .set(auth(ctx.owner.token))
    .send({
      title,
      company: "Plan Works",
      location: "Pune",
      experience: "2+ years",
      jobType: "Full-Time",
      workplaceMode: "hybrid",
      description: "A role used to test subscription limits with a complete description.",
      requiredSkills: ["Node.js"],
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.data.id;
};

const publish = (jobId) =>
  request(app).post(`/api/v1/organizations/${ctx.owner.orgId}/jobs/${jobId}/publish`).set(auth(ctx.owner.token));

const currentFor = (actor, orgId) => {
  const req = request(app).get("/api/v1/subscriptions/current").set(auth(actor.token));
  if (orgId) req.set("X-Organization-Id", orgId);
  return req;
};

nodeTest.before(async () => {
  await startDatabase();
});
nodeTest.after(async () => {
  emailService.sendMail = originalSendMail;
  await stopDatabase();
});

test("seed: a verified company with its owner, and a candidate", async () => {
  await clearDatabase();
  ctx.owner = await register("owner@plans.example", "recruiter", "Plan Works");
  await Organization.updateOne({ _id: ctx.owner.orgId }, { $set: { verificationStatus: "verified", verifiedAt: new Date() } });
  ctx.candidate = await register("asha@plans.example", "candidate");
});

test("a new company starts on the free plan, which is not a paid subscription", async () => {
  const res = await currentFor(ctx.owner, ctx.owner.orgId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.entitlement.tier, "recruiter_free");
  assert.equal(res.body.data.subscription.priceInr, 0);
  assert.equal(res.body.data.entitlement.limits.activeJobs, ALL_PLANS.recruiter_free.limits.activeJobs);
});

test("publishing stops at the free plan limit on the server; published jobs are kept", async () => {
  const first = await createJob("Backend Engineer");
  const ok = await publish(first);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  const second = await createJob("Data Engineer");
  const refused = await publish(second);
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  assert.equal(refused.body.code, "UPGRADE_REQUIRED");

  const kept = await Job.findById(first).lean();
  assert.equal(kept.status, "published", "the earlier job is not withdrawn");
  const blocked = await Job.findById(second).lean();
  assert.equal(blocked.status, "draft", "the refused job stays a draft");
});

test("an active paid plan, bought through checkout and verified, lifts the limit", async () => {
  const checkout = await request(app)
    .post("/api/v1/subscriptions/checkout")
    .set(auth(ctx.owner.token))
    .set("X-Organization-Id", ctx.owner.orgId)
    .send({ planTier: "recruiter_growth" });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
  const helper = checkout.body.data.simulationHelper;
  assert.ok(helper, "simulation helper is issued in the sandbox only");

  const verified = await request(app)
    .post("/api/v1/subscriptions/verify-payment")
    .set(auth(ctx.owner.token))
    .set("X-Organization-Id", ctx.owner.orgId)
    .send({ orderId: helper.orderId, paymentId: helper.paymentId, signature: helper.signature, planTier: "recruiter_growth" });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));

  const res = await currentFor(ctx.owner, ctx.owner.orgId);
  assert.equal(res.body.data.entitlement.tier, "recruiter_growth");
  const job = await createJob("Platform Engineer");
  const ok = await publish(job);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test("an expired paid period reverts to the free limits, without deleting or unpublishing jobs", async () => {
  const expired = await Subscription.findOneAndUpdate(
    { subscriberType: "organization", subscriberId: ctx.owner.orgId, planTier: "recruiter_growth", status: "active" },
    { $set: { currentPeriodEnd: new Date(Date.now() - DAY) } },
    { new: true },
  );
  assert.ok(expired);
  const res = await currentFor(ctx.owner, ctx.owner.orgId);
  assert.equal(res.body.data.entitlement.tier, "recruiter_free");
  assert.equal(res.body.data.entitlement.status, "expired", "the paid period is reported as expired, with free limits");

  const stored = await Subscription.findById(expired._id).lean();
  assert.equal(stored.status, "expired", "the expired record is kept with its status");
  const audited = await AuditLog.countDocuments({ action: "subscription.expired", "metadata.planTier": "recruiter_growth" });
  assert.equal(audited, 1);

  const published = await Job.countDocuments({ organization: ctx.owner.orgId, status: "published" });
  assert.equal(published, 2, "jobs published under the paid plan remain published");
  const more = await createJob("Analytics Engineer");
  const refused = await publish(more);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.code, "SUBSCRIPTION_EXPIRED", "a lapsed paid plan is reported as expired, not as a free-plan limit");
  assert.match(refused.body.error?.message || refused.body.message || "", /data is kept/i);
});

test("an active paid plan at its own limit is refused with PLAN_LIMIT_REACHED, and the data stays", async () => {
  await Subscription.updateOne(
    { subscriberType: "organization", subscriberId: ctx.owner.orgId },
    {
      $set: {
        planTier: "recruiter_growth",
        priceInr: 2499,
        status: "active",
        currentPeriodStart: new Date(Date.now() - DAY),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        limits: { activeJobs: 2, teamMembers: 5, aiAnalysesPerMonth: 250 },
      },
    },
  );
  const published = await Job.countDocuments({ organization: ctx.owner.orgId, status: "published" });
  const refused = await publish(await createJob("Site Reliability Engineer"));
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  assert.equal(refused.body.code, "PLAN_LIMIT_REACHED");
  assert.equal(await Job.countDocuments({ organization: ctx.owner.orgId, status: "published" }), published, "nothing is withdrawn");
});

test("AI analyses are capped by the stored AI usage for the period", async () => {
  for (let i = 0; i < 5; i += 1) {
    await AIAnalysis.create({
      user: ctx.candidate.userId,
      feature: "job_explanation",
      subjectType: "job",
      subjectId: `job-${i}`,
      provider: "test",
      model: "test",
      promptVersion: "v1",
      output: {},
    });
  }
  const res = await request(app)
    .post("/api/v1/ai/job_explanation")
    .set(auth(ctx.candidate.token))
    .send({ input: {} });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(res.body.code, "UPGRADE_REQUIRED");
});

test("a plan cannot be granted from the client: forged payment proof and free plan purchases are refused", async () => {
  const checkout = await request(app)
    .post("/api/v1/subscriptions/checkout")
    .set(auth(ctx.candidate.token))
    .send({ planTier: "candidate_plus" });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
  const helper = checkout.body.data.simulationHelper;
  assert.ok(helper);

  const forged = await request(app)
    .post("/api/v1/subscriptions/verify-payment")
    .set(auth(ctx.candidate.token))
    .send({ orderId: helper.orderId, paymentId: helper.paymentId, signature: "forged", planTier: "candidate_plus" });
  assert.equal(forged.status, 400, JSON.stringify(forged.body));
  assert.equal(forged.body.code, "PAYMENT_VERIFICATION_FAILED");

  const after = await currentFor(ctx.candidate);
  assert.equal(after.body.data.entitlement.tier, "candidate_free", "a forged proof does not activate a plan");

  const freePurchase = await request(app)
    .post("/api/v1/subscriptions/checkout")
    .set(auth(ctx.owner.token))
    .set("X-Organization-Id", ctx.owner.orgId)
    .send({ planTier: "recruiter_free" });
  assert.equal(freePurchase.status, 400);
  assert.equal(freePurchase.body.code, "PLAN_NOT_PURCHASABLE");

  const wrongRole = await request(app)
    .post("/api/v1/subscriptions/checkout")
    .set(auth(ctx.candidate.token))
    .send({ planTier: "recruiter_enterprise" });
  assert.notEqual(wrongRole.status, 201, "a candidate cannot buy a recruiter plan");
});

test("profile updates cannot change the role or account status (mass assignment)", async () => {
  await request(app).patch("/api/v1/users/me").set(auth(ctx.candidate.token)).send({ role: "admin", accountStatus: "active" });
  const user = await User.findById(ctx.candidate.userId).lean();
  assert.equal(user.role, "candidate");
});
