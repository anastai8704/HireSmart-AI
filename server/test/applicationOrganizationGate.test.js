// Regression tests for the candidate application gate on job organization.
// A job without a valid organization must never accept an application, and the company verification
// check must not be skippable when job.organization is null. Runs against the test database in CI.
// Fixtures are inserted directly so each case controls the job's organization reference exactly.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Organization = require("../models/Organization");
const { Application } = require("../models/Application");
const { ResumeVersion } = require("../models/Resume");
const { grantTestPlan } = require("./helpers/grantTestPlan");

const PASSWORD = "StrongPassword123!";
const API = "/api/v1";
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ctx = {};
const { ObjectId } = mongoose.Types;
const test = (name, fn) => nodeTest(name, { timeout: 120000 }, fn);

const register = async (email, intent, organizationName) => {
  const reg = await request(app).post(`${API}/auth/register`).send({
    email,
    password: PASSWORD,
    displayName: email.split("@")[0],
    accountIntent: intent,
    organizationName,
    termsConsent: true,
  });
  assert.equal(reg.status, 201, `register ${email}: ${JSON.stringify(reg.body)}`);
  await User.updateOne({ _id: reg.body.data.user.id }, { $set: { emailVerified: true } });
  const login = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });
  assert.equal(login.status, 200, `login ${email}: ${JSON.stringify(login.body)}`);
  return {
    token: login.body.data.accessToken,
    userId: reg.body.data.user.id,
    orgId: reg.body.data.organization ? String(reg.body.data.organization.id) : null,
  };
};

const readyResume = async (candidateId) => {
  const doc = await ResumeVersion.collection.insertOne({
    resume: new ObjectId(),
    candidate: new ObjectId(candidateId),
    version: 1,
    processingStatus: "ready",
    storageKey: `fixtures/gate-${new ObjectId().toHexString()}.pdf`,
    provider: "local",
    originalName: "resume.pdf",
    mimeType: "application/pdf",
    size: 1024,
    text: "Node.js developer with MongoDB experience.",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return String(doc.insertedId);
};

// organization: an ObjectId, null, or undefined (field omitted). Undefined is inserted without the field at all.
const insertJob = async (title, organization) => {
  const now = new Date();
  const doc = {
    title,
    company: "Gate Co",
    location: "Remote",
    status: "published",
    moderation: { status: "approved", submittedAt: now, reviewedAt: now },
    closesAt: null,
    createdAt: now,
    updatedAt: now,
  };
  if (organization !== undefined) doc.organization = organization;
  const res = await mongoose.connection.collection("jobs").insertOne(doc);
  return String(res.insertedId);
};

const applyTo = (candidate, jobId, resumeVersionId, key) =>
  request(app)
    .post(`${API}/jobs/${jobId}/applications`)
    .set(auth(candidate.token))
    .set("Idempotency-Key", key)
    .send({ resumeVersionId, source: "direct" });

const errorCode = (res) => res.body.error?.code || res.body.code;

// Every application the candidate has, across all jobs. A refused request must leave this unchanged.
const applicationsFor = (candidateId) => Application.countDocuments({ candidate: new ObjectId(candidateId) });

nodeTest.before(async () => {
  await startDatabase();
});
nodeTest.after(async () => {
  await stopDatabase();
});

test("seed: a verified company, an unverified company, a candidate with a ready resume, and jobs in each state", async () => {
  await clearDatabase();
  ctx.verifiedRecruiter = await register("verified@gate.example", "recruiter", "Verified Gate Co");
  await Organization.updateOne({ _id: ctx.verifiedRecruiter.orgId }, { $set: { verificationStatus: "verified" } });
  await grantTestPlan(ctx.verifiedRecruiter.orgId);
  ctx.unverifiedRecruiter = await register("unverified@gate.example", "recruiter", "Unverified Gate Co");
  ctx.candidate = await register("ada@gate.example", "candidate");
  ctx.candidate.resumeId = await readyResume(ctx.candidate.userId);

  ctx.verifiedJob = await insertJob("Verified Role", new ObjectId(ctx.verifiedRecruiter.orgId));
  ctx.unverifiedJob = await insertJob("Unverified Role", new ObjectId(ctx.unverifiedRecruiter.orgId));
  ctx.nullOrgJob = await insertJob("Legacy Role (null organization)", null);
  ctx.missingOrgJob = await insertJob("Legacy Role (no organization field)", undefined);
  // A reference to an organization document that does not exist.
  ctx.danglingOrgJob = await insertJob("Dangling Role", new ObjectId());

  assert.ok(ctx.verifiedJob && ctx.nullOrgJob && ctx.missingOrgJob && ctx.danglingOrgJob);
});

test("verified organization: a candidate can apply and exactly one application is created", async () => {
  const res = await applyTo(ctx.candidate, ctx.verifiedJob, ctx.candidate.resumeId, "gate-verified-ok");
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(await Application.countDocuments({ job: new ObjectId(ctx.verifiedJob) }), 1);
});

test("duplicate application: a second application to the same verified job is refused and nothing is added", async () => {
  const before = await applicationsFor(ctx.candidate.userId);
  const res = await applyTo(ctx.candidate, ctx.verifiedJob, ctx.candidate.resumeId, "gate-duplicate");
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(errorCode(res), "APPLICATION_EXISTS");
  assert.equal(await applicationsFor(ctx.candidate.userId), before);
});

test("validation: a request without resumeVersionId is refused and creates no application", async () => {
  const before = await applicationsFor(ctx.candidate.userId);
  const res = await request(app)
    .post(`${API}/jobs/${ctx.verifiedJob}/applications`)
    .set(auth(ctx.candidate.token))
    .set("Idempotency-Key", "gate-validation")
    .send({ source: "direct" });
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.equal(await applicationsFor(ctx.candidate.userId), before);
});

test("unverified organization: the application is refused with ORGANIZATION_NOT_VERIFIED and nothing is created", async () => {
  const before = await applicationsFor(ctx.candidate.userId);
  const res = await applyTo(ctx.candidate, ctx.unverifiedJob, ctx.candidate.resumeId, "gate-unverified");
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(errorCode(res), "ORGANIZATION_NOT_VERIFIED");
  assert.equal(await Application.countDocuments({ job: new ObjectId(ctx.unverifiedJob) }), 0);
  assert.equal(await applicationsFor(ctx.candidate.userId), before);
});

test("organization = null: the job is unavailable (404) and no application is created", async () => {
  const before = await applicationsFor(ctx.candidate.userId);
  const res = await applyTo(ctx.candidate, ctx.nullOrgJob, ctx.candidate.resumeId, "gate-null-org");
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal(errorCode(res), "RESOURCE_NOT_FOUND");
  assert.equal(await Application.countDocuments({ job: new ObjectId(ctx.nullOrgJob) }), 0);
  assert.equal(await applicationsFor(ctx.candidate.userId), before);
});

test("organization field missing: the job is unavailable (404) and no application is created", async () => {
  const before = await applicationsFor(ctx.candidate.userId);
  const res = await applyTo(ctx.candidate, ctx.missingOrgJob, ctx.candidate.resumeId, "gate-missing-org");
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal(errorCode(res), "RESOURCE_NOT_FOUND");
  assert.equal(await Application.countDocuments({ job: new ObjectId(ctx.missingOrgJob) }), 0);
  assert.equal(await applicationsFor(ctx.candidate.userId), before);
});

test("dangling organization reference: refused as unverified (403) and no application is created", async () => {
  const before = await applicationsFor(ctx.candidate.userId);
  const res = await applyTo(ctx.candidate, ctx.danglingOrgJob, ctx.candidate.resumeId, "gate-dangling-org");
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(errorCode(res), "ORGANIZATION_NOT_VERIFIED");
  assert.equal(await Application.countDocuments({ job: new ObjectId(ctx.danglingOrgJob) }), 0);
  assert.equal(await applicationsFor(ctx.candidate.userId), before);
});
