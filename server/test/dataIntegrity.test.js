// Phase 11 data-integrity tests: duplicate applications, concurrent duplicates, and failed operations that must not
// leave partial records. Runs against the test database in CI. Fixtures are inserted directly where the behaviour under
// test is not the fixture itself (job publication and resume processing have their own suites).
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

// A ready resume owned by the candidate, inserted directly. The apply endpoint only checks status and ownership.
const readyResume = async (candidateId, processingStatus = "ready") => {
  const doc = await ResumeVersion.collection.insertOne({
    // Each version belongs to its own resume document (unique index on resume + version).
    resume: new ObjectId(),
    candidate: new ObjectId(candidateId),
    version: 1,
    processingStatus,
    storageKey: `fixtures/integrity-${new ObjectId().toHexString()}.pdf`,
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

const publishedJob = async (orgId, title, status = "published") => {
  const now = new Date();
  const doc = await mongoose.connection.collection("jobs").insertOne({
    organization: new ObjectId(orgId),
    title,
    company: "Integrity Co",
    location: "Remote",
    status,
    moderation: { status: "approved", submittedAt: now, reviewedAt: now },
    closesAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return String(doc.insertedId);
};

const applyWith = (candidate, jobId, resumeVersionId, key) =>
  request(app)
    .post(`${API}/jobs/${jobId}/applications`)
    .set(auth(candidate.token))
    .set("Idempotency-Key", key)
    .send({ resumeVersionId, source: "direct" });

const countApplications = (jobId, candidateId) =>
  Application.countDocuments({ job: new ObjectId(jobId), candidate: new ObjectId(candidateId) });

nodeTest.before(async () => {
  await startDatabase();
});
nodeTest.after(async () => {
  await stopDatabase();
});

test("seed: a verified company with a published job, and two candidates with ready resumes", async () => {
  await clearDatabase();
  ctx.recruiter = await register("owner@integrity.example", "recruiter", "Integrity Co");
  await Organization.updateOne({ _id: ctx.recruiter.orgId }, { $set: { verificationStatus: "verified" } });
  await grantTestPlan(ctx.recruiter.orgId);
  ctx.jobId = await publishedJob(ctx.recruiter.orgId, "Platform Engineer");
  ctx.draftJobId = await publishedJob(ctx.recruiter.orgId, "Unpublished Role", "draft");
  ctx.candidate = await register("ada@integrity.example", "candidate");
  ctx.candidate.resumeId = await readyResume(ctx.candidate.userId);
  ctx.racer = await register("grace@integrity.example", "candidate");
  ctx.racer.resumeId = await readyResume(ctx.racer.userId);
  ctx.pending = await register("linus@integrity.example", "candidate");
  ctx.pending.resumeId = await readyResume(ctx.pending.userId, "processing");
  assert.ok(ctx.jobId && ctx.candidate.resumeId && ctx.racer.resumeId);
});

test("duplicates: a second application to the same job is refused and exactly one record remains", async () => {
  const first = await applyWith(ctx.candidate, ctx.jobId, ctx.candidate.resumeId, "integrity-first");
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await applyWith(ctx.candidate, ctx.jobId, ctx.candidate.resumeId, "integrity-second");
  assert.equal(second.status, 409, JSON.stringify(second.body));
  assert.equal(second.body.error?.code || second.body.code, "APPLICATION_EXISTS");
  assert.equal(await countApplications(ctx.jobId, ctx.candidate.userId), 1);
});

test("duplicates under concurrency: two simultaneous applications yield one record, never two", async () => {
  const [a, b] = await Promise.all([
    applyWith(ctx.racer, ctx.jobId, ctx.racer.resumeId, "race-a"),
    applyWith(ctx.racer, ctx.jobId, ctx.racer.resumeId, "race-b"),
  ]);
  const summary = (r) => `${r.status} ${r.body?.error?.code || r.body?.code || ""}`.trim();
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(
    statuses,
    [201, 409],
    `expected one success and one refusal, got [${summary(a)}] and [${summary(b)}]`,
  );
  assert.equal(await countApplications(ctx.jobId, ctx.racer.userId), 1);
});

test("failed operations leave no partial record: a resume that is not ready is refused", async () => {
  const res = await applyWith(ctx.pending, ctx.jobId, ctx.pending.resumeId, "not-ready");
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.equal(res.body.error?.code || res.body.code, "RESUME_NOT_READY");
  assert.equal(await countApplications(ctx.jobId, ctx.pending.userId), 0);
});

test("invalid references: an unpublished or missing job, or a resume the candidate does not own, creates nothing", async () => {
  const draft = await applyWith(ctx.pending, ctx.draftJobId, ctx.pending.resumeId, "draft-job");
  assert.equal(draft.status, 404, JSON.stringify(draft.body));
  const missing = await applyWith(ctx.pending, new ObjectId().toHexString(), ctx.pending.resumeId, "missing-job");
  assert.equal(missing.status, 404, JSON.stringify(missing.body));
  // The first candidate's resume, used by someone else, must not be accepted.
  const foreign = await applyWith(ctx.pending, ctx.jobId, ctx.candidate.resumeId, "foreign-resume");
  assert.equal(foreign.status, 422, JSON.stringify(foreign.body));
  assert.equal(await countApplications(ctx.draftJobId, ctx.pending.userId), 0);
  assert.equal(await countApplications(ctx.jobId, ctx.pending.userId), 0);
});

test("idempotency: replaying the same key returns the original response and does not create a second record", async () => {
  const first = await applyWith(ctx.pending, ctx.jobId, ctx.pending.resumeId, "replay-key");
  // The first attempt is refused (resume still processing), so the replay must not turn it into an application either.
  const replay = await applyWith(ctx.pending, ctx.jobId, ctx.pending.resumeId, "replay-key");
  assert.equal(replay.status, first.status);
  assert.equal(await countApplications(ctx.jobId, ctx.pending.userId), 0);
});
