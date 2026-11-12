// Database-backed API tests for the interview workflow (Requirements 3–6).
// Runs against mongodb-memory-server through test/setup.js, like the other *.test.js suites.
// These tests were written without a local mongod in the authoring environment; they are NOT verified until run.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const { grantTestPlan } = require("./helpers/grantTestPlan");
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const request = require("supertest");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const app = require("../app");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const Interview = require("../models/Interview");

const PASSWORD = "StrongPassword123!";
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const api = "/api/v1";
const MANUAL_URL = "https://meet.google.com/abc-defg-hij";
const HOUR = 3600 * 1000;

const registerAndLogin = async ({ email, intent, organizationName }) => {
  const reg = await request(app)
    .post(`${api}/auth/register`)
    .send({
      email,
      password: PASSWORD,
      displayName: email.split("@")[0],
      accountIntent: intent,
      organizationName,
      termsConsent: true,
    });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const login = await request(app).post(`${api}/auth/login`).send({ email, password: PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { token: login.body.data.accessToken, registration: reg.body.data };
};

const ctx = {};

const createJob = async (title) => {
  const created = await request(app)
    .post(`${api}/organizations/${ctx.orgA}/jobs`)
    .set(auth(ctx.recruiterA))
    .send({
      title,
      company: "Acme",
      location: "Pune",
      compensation: { min: 1000000, max: 1800000, currency: "INR", period: "year" },
      experience: "3+ years",
      jobType: "Full-Time",
      workplaceMode: "hybrid",
      description: "Build secure Node.js APIs and production MongoDB services for our recruitment platform.",
      requiredSkills: ["Node.js", "MongoDB"],
      preferredSkills: ["Docker"],
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id;
  const published = await request(app)
    .post(`${api}/organizations/${ctx.orgA}/jobs/${id}/publish`)
    .set(auth(ctx.recruiterA));
  assert.equal(published.status, 200);
  await Job.updateOne({ _id: id }, { $set: { "moderation.status": "approved" } });
  return id;
};

const applyTo = async (token, jobId, resumeVersionId, key) => {
  const applied = await request(app)
    .post(`${api}/jobs/${jobId}/applications`)
    .set(auth(token))
    .set("Idempotency-Key", key)
    .send({ resumeVersionId, source: "direct" });
  assert.equal(applied.status, 201, JSON.stringify(applied.body));
  return applied.body.data.id;
};

test.before(async () => {
  await startDatabase();
  await clearDatabase();
  const recruiterA = await registerAndLogin({ email: "owner@acme.example", intent: "recruiter", organizationName: "Acme" });
  ctx.recruiterA = recruiterA.token;
  ctx.orgA = recruiterA.registration.organization.id;
  await Organization.updateOne(
    { _id: ctx.orgA },
    { $set: { verificationStatus: "verified", verifiedAt: new Date() } },
  );
  await grantTestPlan(ctx.orgA);

  const recruiterB = await registerAndLogin({ email: "owner@other.example", intent: "recruiter", organizationName: "Other" });
  ctx.recruiterB = recruiterB.token;
  ctx.orgB = recruiterB.registration.organization.id;
  await Organization.updateOne(
    { _id: ctx.orgB },
    { $set: { verificationStatus: "verified", verifiedAt: new Date() } },
  );
  await grantTestPlan(ctx.orgB);

  ctx.candidate = (await registerAndLogin({ email: "asha@example.com", intent: "candidate" })).token;
  ctx.otherCandidate = (await registerAndLogin({ email: "ravi@example.com", intent: "candidate" })).token;

  const upload = await request(app)
    .post(`${api}/candidates/me/resumes`)
    .set(auth(ctx.candidate))
    .attach("resume", path.join(__dirname, "fixtures", "resume.pdf"));
  assert.equal(upload.status, 202, JSON.stringify(upload.body));
  ctx.resumeVersionId = upload.body.data.resumeVersion.id;

  ctx.jobOne = await createJob("Backend Engineer");
  ctx.jobTwo = await createJob("Data Analyst");
  ctx.applicationOne = await applyTo(ctx.candidate, ctx.jobOne, ctx.resumeVersionId, "interview-flow-app-1");
  ctx.applicationTwo = await applyTo(ctx.candidate, ctx.jobTwo, ctx.resumeVersionId, "interview-flow-app-2");
});

test.after(async () => {
  await stopDatabase();
});

const createInterview = (body) =>
  request(app)
    .post(`${api}/organizations/${ctx.orgA}/interviews`)
    .set(auth(ctx.recruiterA))
    .send({ title: "Technical round", type: "video", timezone: "Asia/Kolkata", ...body });

test("job mismatch is rejected: an application cannot be scheduled under another job", async () => {
  const future = new Date(Date.now() + 2 * 24 * HOUR);
  const res = await createInterview({
    applicationId: ctx.applicationOne,
    jobId: ctx.jobTwo,
    scheduledStart: future,
    scheduledEnd: new Date(future.getTime() + HOUR),
  });
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.equal(res.body.code, "APPLICATION_JOB_MISMATCH");
});

test("a past schedule is rejected", async () => {
  const past = new Date(Date.now() - 2 * HOUR);
  const res = await createInterview({
    applicationId: ctx.applicationOne,
    jobId: ctx.jobOne,
    scheduledStart: past,
    scheduledEnd: new Date(past.getTime() + HOUR),
  });
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.equal(res.body.code, "SCHEDULE_IN_PAST");
});

test("interview is bound to organization, job, application and candidate from the application", async () => {
  const future = new Date(Date.now() + 2 * 24 * HOUR);
  const res = await createInterview({
    applicationId: ctx.applicationOne,
    jobId: ctx.jobOne,
    scheduledStart: future,
    scheduledEnd: new Date(future.getTime() + HOUR),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  ctx.interviewOne = res.body.data.id;
  const stored = await Interview.findById(ctx.interviewOne).lean();
  assert.equal(String(stored.organization), String(ctx.orgA));
  assert.equal(String(stored.job), String(ctx.jobOne));
  assert.equal(String(stored.application), String(ctx.applicationOne));
  assert.ok(stored.candidate, "candidate must be stored from the application");
  assert.equal(stored.status, "invited");
  // No Google connection in the test environment, so no Meet link is claimed.
  assert.notEqual(stored.meetingProvider, "google_meet");
});

test("job filter returns only that job's interviews", async () => {
  const res = await request(app)
    .get(`${api}/organizations/${ctx.orgA}/interviews?jobId=${ctx.jobOne}`)
    .set(auth(ctx.recruiterA));
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 1);
  for (const item of res.body.data) {
    assert.equal(String(item.job), String(ctx.jobOne));
  }
  const other = await request(app)
    .get(`${api}/organizations/${ctx.orgA}/interviews?jobId=${ctx.jobTwo}`)
    .set(auth(ctx.recruiterA));
  assert.equal(other.body.data.length, 0);
});

test("recruiter from another organization cannot read or start the interview", async () => {
  const read = await request(app)
    .get(`${api}/organizations/${ctx.orgA}/interviews/${ctx.interviewOne}`)
    .set(auth(ctx.recruiterB));
  assert.ok([403, 404].includes(read.status), `expected 403/404, got ${read.status}`);
  assert.equal(read.body.data, undefined);

  const start = await request(app)
    .post(`${api}/organizations/${ctx.orgA}/interviews/${ctx.interviewOne}/start`)
    .set(auth(ctx.recruiterB));
  assert.ok([403, 404].includes(start.status), `expected 403/404, got ${start.status}`);
});

test("candidate view before start has no meeting link and no feedback", async () => {
  const res = await request(app).get(`${api}/interviews/${ctx.interviewOne}`).set(auth(ctx.candidate));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.joinState.canJoin, false);
  assert.equal("meetingUrl" in res.body.data, false);
  assert.equal("feedback" in res.body.data, false);
  assert.equal("googleEventId" in res.body.data, false);
});

test("a candidate who is not on the application cannot read or join the interview", async () => {
  const read = await request(app).get(`${api}/interviews/${ctx.interviewOne}`).set(auth(ctx.otherCandidate));
  assert.equal(read.status, 404);
  const join = await request(app).get(`${api}/interviews/${ctx.interviewOne}/join`).set(auth(ctx.otherCandidate));
  assert.equal(join.status, 404);
});

test("candidate cannot join before the recruiter starts", async () => {
  const join = await request(app).get(`${api}/interviews/${ctx.interviewOne}/join`).set(auth(ctx.candidate));
  assert.equal(join.status, 409, JSON.stringify(join.body));
  assert.match(join.body.code, /^JOIN_/);
  assert.equal(join.body.data, undefined);
});

test("recruiter cannot start a far-future interview: start window is enforced", async () => {
  await request(app)
    .patch(`${api}/organizations/${ctx.orgA}/interviews/${ctx.interviewOne}`)
    .set(auth(ctx.recruiterA))
    .send({ meetingUrl: MANUAL_URL });
  const start = await request(app)
    .post(`${api}/organizations/${ctx.orgA}/interviews/${ctx.interviewOne}/start`)
    .set(auth(ctx.recruiterA));
  assert.equal(start.status, 409, JSON.stringify(start.body));
  assert.equal(start.body.code, "TOO_EARLY");
});

test("recruiter starts an interview inside the window; candidate can then join and sees the link", async () => {
  const soon = new Date(Date.now() + 5 * 60 * 1000);
  const created = await createInterview({
    applicationId: ctx.applicationTwo,
    jobId: ctx.jobTwo,
    scheduledStart: soon,
    scheduledEnd: new Date(soon.getTime() + HOUR),
    meetingUrl: MANUAL_URL,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  ctx.interviewTwo = created.body.data.id;
  assert.equal(created.body.data.meetingProvider, "manual");

  const before = await request(app).get(`${api}/interviews/${ctx.interviewTwo}`).set(auth(ctx.candidate));
  assert.equal("meetingUrl" in before.body.data, false);

  const started = await request(app)
    .post(`${api}/organizations/${ctx.orgA}/interviews/${ctx.interviewTwo}/start`)
    .set(auth(ctx.recruiterA));
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.data.status, "in_progress");

  const join = await request(app).get(`${api}/interviews/${ctx.interviewTwo}/join`).set(auth(ctx.candidate));
  assert.equal(join.status, 200, JSON.stringify(join.body));
  assert.equal(join.body.data.url, MANUAL_URL);

  const after = await request(app).get(`${api}/interviews/${ctx.interviewTwo}`).set(auth(ctx.candidate));
  assert.equal(after.body.data.meetingUrl, MANUAL_URL);
  assert.equal(after.body.data.joinState.canJoin, true);
});

test("feedback is recorded for recruiters and never returned to the candidate", async () => {
  const feedback = await request(app)
    .post(`${api}/organizations/${ctx.orgA}/interviews/${ctx.interviewTwo}/feedback`)
    .set(auth(ctx.recruiterA))
    .send({
      ratings: [{ criterion: "Problem solving", score: 2, evidence: "Confidential scorecard note" }],
      recommendation: "no",
      summary: "Confidential summary",
    });
  assert.equal(feedback.status, 201, JSON.stringify(feedback.body));

  const staffView = await request(app)
    .get(`${api}/organizations/${ctx.orgA}/interviews/${ctx.interviewTwo}`)
    .set(auth(ctx.recruiterA));
  assert.equal(staffView.body.data.feedback.length, 1);

  const candidateView = await request(app).get(`${api}/interviews/${ctx.interviewTwo}`).set(auth(ctx.candidate));
  assert.equal("feedback" in candidateView.body.data, false);
  assert.equal(JSON.stringify(candidateView.body).includes("Confidential"), false);

  const listMine = await request(app).get(`${api}/candidates/me/interviews`).set(auth(ctx.candidate));
  assert.equal(JSON.stringify(listMine.body).includes("Confidential"), false);
});
