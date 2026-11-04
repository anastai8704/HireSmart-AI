// Phase 3 job moderation, end to end over HTTP against MongoDB (runs in CI).
// Companies are verified directly in the fixtures, because verification has its own tests in
// companyVerification.test.js. Everything here exercises job moderation itself.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");

// Failure summary printed last, so CI log tails show which assertions failed.
const failedTests = [];
process.on("exit", () => {
  if (failedTests.length) {
    process.stderr.write(`\nJOB-MODERATION FAILURES (${failedTests.length}):\n${failedTests.join("\n")}\n`);
  }
});
// Progress marker and watchdog: if the file stalls, the last step is printed and the
// process exits non-zero, so the runner's annotation shows where it stopped.
let lastStep = "file start";
let finished = false;
const watchdog = setTimeout(() => {
  process.stderr.write(
    `\nJOB-MODERATION WATCHDOG: ${finished ? "all tests finished but the process did not exit" : `stalled at "${lastStep}"`}\n`,
  );
  process.exit(1);
}, 240000);
const test = Object.assign(
  (name, fn) =>
    nodeTest(name, async (t) => {
      lastStep = name;
      process.stderr.write(`JOB-MODERATION STEP: ${name}\n`);
      try {
        await fn(t);
      } catch (error) {
        failedTests.push(`- ${name}: ${String(error && error.message).slice(0, 400).replace(/\s+/g, " ")}`);
        throw error;
      }
    }),
  { before: nodeTest.before, after: nodeTest.after },
);

const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const emailService = require("../services/emailService");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const AuditLog = require("../models/AuditLog");
const { Membership } = require("../models/Membership");
const { JobModerationEvent } = require("../models/JobModerationEvent");

// Outbound email is mocked: notifications to recruiters must never reach a real mail transport.
const originalSendMail = emailService.sendMail;
emailService.sendMail = async () => ({ messageId: "test" });

const PASSWORD = "StrongPassword123!";
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ctx = {};

const registerAndLogin = async ({ email, intent, organizationName }) => {
  const registration = await request(app).post("/api/v1/auth/register").send({
    email,
    password: PASSWORD,
    displayName: email.split("@")[0],
    accountIntent: intent,
    organizationName,
    termsConsent: true,
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  await User.updateOne({ _id: registration.body.data.user.id }, { $set: { emailVerified: true } });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return {
    token: login.body.data.accessToken,
    userId: registration.body.data.user.id,
    orgId: registration.body.data.organization.id,
  };
};

const verifyCompany = (orgId, status = "verified") =>
  Organization.updateOne({ _id: orgId }, { $set: { verificationStatus: status, verifiedAt: new Date() } });

const jobPayload = (title) => ({
  title,
  company: "Nimbus Works",
  location: "Pune",
  experience: "2+ years",
  jobType: "Full-Time",
  workplaceMode: "hybrid",
  description: "A role used to test job moderation with a complete description.",
  requiredSkills: ["Node.js"],
});

/** Creates a job as the company's recruiter and submits it for review (status pending). */
const createPendingJob = async (company, title) => {
  const created = await request(app)
    .post(`/api/v1/organizations/${company.orgId}/jobs`)
    .set(auth(company.token))
    .send(jobPayload(title));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const published = await request(app)
    .post(`/api/v1/organizations/${company.orgId}/jobs/${created.body.data.id}/publish`)
    .set(auth(company.token));
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return created.body.data.id;
};

const adminDecide = (jobId, action, body = {}) =>
  request(app).post(`/api/v1/admin/moderation/jobs/${jobId}/${action}`).set(auth(ctx.admin.token)).send(body);
const adminBulk = (body) => request(app).post("/api/v1/admin/moderation/bulk").set(auth(ctx.admin.token)).send(body);
const stateOf = async (jobId) => {
  const job = await Job.findById(jobId).lean();
  return { status: job.status, moderation: job.moderation?.status };
};
const eventsOf = (jobId) => JobModerationEvent.find({ job: jobId }).sort({ createdAt: 1 }).lean();

test.before(async () => {
  await startDatabase();
});
test.after(async () => {
  emailService.sendMail = originalSendMail;
  process.stderr.write("JOB-MODERATION STEP: closing database\n");
  await stopDatabase();
  process.stderr.write("JOB-MODERATION STEP: database closed\n");
  finished = true;
  clearTimeout(watchdog);
});

test("seed: an admin, a candidate, and two verified companies", async () => {
  await clearDatabase();
  const admin = await registerAndLogin({ email: "admin@moderation.example", intent: "candidate" });
  await User.updateOne({ _id: admin.userId }, { $set: { role: "admin" } });
  const login = await request(app).post("/api/v1/auth/login").send({ email: "admin@moderation.example", password: PASSWORD });
  ctx.admin = { token: login.body.data.accessToken, userId: admin.userId };

  ctx.nimbus = await registerAndLogin({ email: "owner@nimbus.example", intent: "recruiter", organizationName: "Nimbus Works" });
  ctx.orion = await registerAndLogin({ email: "owner@orion.example", intent: "recruiter", organizationName: "Orion Labs" });
  await verifyCompany(ctx.nimbus.orgId);
  await verifyCompany(ctx.orion.orgId);
  assert.ok(ctx.nimbus.orgId && ctx.orion.orgId);
});

test("individual approval: a pending job goes live, and the decision is recorded with its actor", async () => {
  ctx.jobA = await createPendingJob(ctx.nimbus, "Platform Engineer");
  assert.deepEqual(await stateOf(ctx.jobA), { status: "published", moderation: "pending" });

  const approved = await adminDecide(ctx.jobA, "approve");
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.data.moderation.status, "approved");
  assert.deepEqual(await stateOf(ctx.jobA), { status: "published", moderation: "approved" });

  const history = await request(app).get(`/api/v1/admin/moderation/jobs/${ctx.jobA}/history`).set(auth(ctx.admin.token));
  assert.equal(history.status, 200);
  assert.equal(history.body.data[0].toStatus, "approved");
  assert.equal(history.body.data[0].actor.id, ctx.admin.userId, "the history names the reviewer");
  assert.equal(history.body.data[1].toStatus, "pending", "the submission is in the history too");

  const audit = await AuditLog.findOne({ action: "job.moderation.approved", resourceId: ctx.jobA }).lean();
  assert.ok(audit, "an audit entry records the approval");
  assert.equal(String(audit.actor), ctx.admin.userId);
  assert.equal(audit.metadata.from, "pending");
  assert.equal(audit.metadata.to, "approved");
});

test("rejection needs a reason; a rejected job is resubmitted and the trail is kept", async () => {
  ctx.jobB = await createPendingJob(ctx.nimbus, "Data Analyst");

  const noReason = await adminDecide(ctx.jobB, "reject", {});
  assert.equal(noReason.status, 422);
  assert.equal(noReason.body.code, "REASON_REQUIRED");
  assert.equal((await stateOf(ctx.jobB)).moderation, "pending", "a refused request changes nothing");

  const rejected = await adminDecide(ctx.jobB, "reject", { reason: "Duplicate of an existing listing" });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejected.body.data.moderation.status, "rejected");

  const resubmitted = await request(app)
    .post(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs/${ctx.jobB}/publish`)
    .set(auth(ctx.nimbus.token));
  assert.equal(resubmitted.status, 200, JSON.stringify(resubmitted.body));
  assert.equal((await stateOf(ctx.jobB)).moderation, "pending");

  const trail = (await eventsOf(ctx.jobB)).map((e) => `${e.fromStatus || "none"}>${e.toStatus}`);
  assert.deepEqual(trail, ["none>pending", "pending>rejected", "rejected>pending"]);
});

test("request for changes: the recruiter edits and resubmits; a recruiter cannot decide on a listing", async () => {
  ctx.jobC = await createPendingJob(ctx.nimbus, "Frontend Developer");

  const byRecruiter = await request(app).post(`/api/v1/admin/moderation/jobs/${ctx.jobC}/approve`).set(auth(ctx.nimbus.token)).send({});
  assert.equal(byRecruiter.status, 404, "non-admins get no moderation access, so they cannot approve their own listing");
  assert.equal((await stateOf(ctx.jobC)).moderation, "pending");

  const asked = await adminDecide(ctx.jobC, "request-changes", { reason: "Salary range is missing" });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  assert.equal(asked.body.data.moderation.status, "changes_requested");

  const edited = await request(app)
    .patch(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs/${ctx.jobC}`)
    .set(auth(ctx.nimbus.token))
    .send({ title: "Frontend Developer (React)" });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const afterEdit = await Job.findById(ctx.jobC).lean();
  assert.equal(afterEdit.title, "Frontend Developer (React)");
  assert.equal(afterEdit.pendingChanges, undefined, "a job that is not live is edited directly, not as a proposal");

  const resubmitted = await request(app)
    .post(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs/${ctx.jobC}/publish`)
    .set(auth(ctx.nimbus.token));
  assert.equal(resubmitted.status, 200);
  assert.equal((await stateOf(ctx.jobC)).moderation, "pending");
});

test("duplicate requests and invalid transitions are refused with stable codes", async () => {
  const again = await adminDecide(ctx.jobA, "approve");
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "ALREADY_DECIDED", "a repeated approval is not applied twice");

  const suspendPending = await adminDecide(ctx.jobC, "suspend", { reason: "Not yet live" });
  assert.equal(suspendPending.status, 409);
  assert.equal(suspendPending.body.code, "INVALID_TRANSITION");

  const rejectApproved = await adminDecide(ctx.jobA, "reject", { reason: "Changed my mind" });
  assert.equal(rejectApproved.status, 409);
  assert.equal(rejectApproved.body.code, "INVALID_TRANSITION");
  assert.equal((await stateOf(ctx.jobA)).moderation, "approved");
});

test("suspension restricts a live job; a suspended job cannot be resubmitted, and its edits are reviewed", async () => {
  const suspended = await adminDecide(ctx.jobA, "suspend", { reason: "Complaints are under investigation" });
  assert.equal(suspended.status, 200, JSON.stringify(suspended.body));
  assert.equal((await stateOf(ctx.jobA)).moderation, "suspended");

  const resubmit = await request(app)
    .post(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs/${ctx.jobA}/publish`)
    .set(auth(ctx.nimbus.token));
  assert.equal(resubmit.status, 409);
  assert.equal(resubmit.body.code, "JOB_SUSPENDED", "the recruiter cannot lift a suspension by publishing again");

  const edit = await request(app)
    .patch(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs/${ctx.jobA}`)
    .set(auth(ctx.nimbus.token))
    .send({ title: "Platform Engineer (Senior)" });
  assert.equal(edit.status, 200);
  const hidden = await Job.findById(ctx.jobA).lean();
  assert.equal(hidden.title, "Platform Engineer", "an edit to a suspended job waits for review");
  assert.equal(hidden.pendingChanges.status, "pending");

  const reinstated = await adminDecide(ctx.jobA, "reinstate");
  assert.equal(reinstated.status, 200, JSON.stringify(reinstated.body));
  assert.equal((await stateOf(ctx.jobA)).moderation, "approved");

  const changeApproved = await adminDecide(ctx.jobA, "approve");
  assert.equal(changeApproved.status, 200, JSON.stringify(changeApproved.body));
  const live = await Job.findById(ctx.jobA).lean();
  assert.equal(live.title, "Platform Engineer (Senior)", "the approved change is applied to the live job");
  assert.equal(live.pendingChanges.status, "approved");
  assert.equal(live.version, 2);
});

test("drafts: editing a draft does not create a pending change, so no count is inflated", async () => {
  const created = await request(app)
    .post(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs`)
    .set(auth(ctx.nimbus.token))
    .send(jobPayload("Draft Only Role"));
  ctx.draft = created.body.data.id;
  const edited = await request(app)
    .patch(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs/${ctx.draft}`)
    .set(auth(ctx.nimbus.token))
    .send({ title: "Draft Only Role (edited)" });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const draft = await Job.findById(ctx.draft).lean();
  assert.equal(draft.title, "Draft Only Role (edited)");
  assert.equal(draft.pendingChanges, undefined, "a draft edit is saved directly, with no proposal");

  // A stale proposal on a draft (written by the old code) must not count as pending either.
  await Job.updateOne({ _id: ctx.draft }, { $set: { pendingChanges: { status: "pending", fields: { title: "x" }, submittedAt: new Date() } } });
  const summary = await request(app).get("/api/v1/admin/moderation/companies").set(auth(ctx.admin.token));
  const nimbus = summary.body.data.find((c) => String(c._id) === ctx.nimbus.orgId);
  const list = await request(app)
    .get(`/api/v1/admin/moderation/companies/${ctx.nimbus.orgId}/jobs?status=pending`)
    .set(auth(ctx.admin.token));
  assert.equal(nimbus.jobCounts.pending, list.body.data.jobs.length, "the company count equals the records in the queue");
  assert.ok(!list.body.data.jobs.some((j) => String(j.id) === ctx.draft), "a draft is never in the review queue");
});

test("bulk: a mixed selection reports every job's outcome, including duplicates and cross-company ids", async () => {
  ctx.bulkP1 = await createPendingJob(ctx.nimbus, "Bulk Role One");
  ctx.bulkP2 = await createPendingJob(ctx.nimbus, "Bulk Role Two");
  ctx.bulkClosed = await createPendingJob(ctx.nimbus, "Bulk Closed Role");
  await request(app).post(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs/${ctx.bulkClosed}/close`).set(auth(ctx.nimbus.token));
  ctx.orionJob = await createPendingJob(ctx.orion, "Orion Role");
  const ids = [ctx.bulkP1, ctx.bulkP2, ctx.bulkClosed, ctx.jobA, ctx.bulkP1, ctx.orionJob];

  const res = await adminBulk({ action: "approve", jobIds: ids, organizationId: ctx.nimbus.orgId });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const byJob = Object.fromEntries(res.body.data.results.map((r) => [r.jobId, r]));
  assert.equal(res.body.data.results.length, ids.length, "one result per requested job");
  assert.equal(res.body.data.results[0].outcome, "approved");
  assert.equal(res.body.data.results[1].outcome, "approved");
  assert.equal(res.body.data.results[2].code, "JOB_CLOSED");
  assert.equal(res.body.data.results[2].outcome, "skipped");
  assert.equal(res.body.data.results[3].code, "ALREADY_DECIDED", "a job decided earlier is failed, not re-approved");
  assert.equal(res.body.data.results[3].outcome, "failed");
  assert.equal(res.body.data.results[4].code, "DUPLICATE_IN_REQUEST");
  assert.equal(res.body.data.results[5].code, "JOB_NOT_IN_COMPANY", "a job of another company is not touched");
  assert.equal(byJob[ctx.orionJob].outcome, "failed");
  assert.deepEqual(res.body.data.summary, { requested: 6, succeeded: 2, skipped: 2, failed: 2, duplicatesRemoved: 1 });

  assert.equal((await stateOf(ctx.bulkP1)).moderation, "approved");
  assert.equal((await stateOf(ctx.orionJob)).moderation, "pending", "the other company's job is unchanged");
  const batchAudit = await AuditLog.findOne({ action: "job.moderation.bulk" }).sort({ createdAt: -1 }).lean();
  assert.equal(batchAudit.metadata.succeeded, 2);
});

test("bulk: a company that is not verified skips every eligible job, with the reason", async () => {
  await verifyCompany(ctx.orion.orgId, "under_review");
  try {
    const res = await adminBulk({ action: "approve", jobIds: [ctx.orionJob] });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.results[0].outcome, "skipped");
    assert.equal(res.body.data.results[0].code, "COMPANY_NOT_VERIFIED");
    assert.equal((await stateOf(ctx.orionJob)).moderation, "pending");
  } finally {
    await verifyCompany(ctx.orion.orgId);
  }
});

test("bulk rejection requires a reason for the whole request", async () => {
  const res = await adminBulk({ action: "reject", jobIds: [ctx.bulkP2] });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, "REASON_REQUIRED");
  assert.equal((await stateOf(ctx.bulkP2)).moderation, "pending");
});

test("concurrency: two admins approve the same pending job at once, and only one wins", async () => {
  const contested = await createPendingJob(ctx.nimbus, "Contested Role");
  const [first, second] = await Promise.all([
    adminBulk({ action: "approve", jobIds: [contested] }),
    adminBulk({ action: "approve", jobIds: [contested] }),
  ]);
  const outcomes = [first.body.data.results[0].outcome, second.body.data.results[0].outcome].sort();
  assert.deepEqual(outcomes, ["approved", "failed"]);
  const winnerEvents = (await eventsOf(contested)).filter((e) => e.toStatus === "approved");
  assert.equal(winnerEvents.length, 1, "exactly one approval is recorded");
  assert.equal((await stateOf(contested)).moderation, "approved");
});

test("reviewer conflict: an admin who belongs to the company cannot decide on its jobs", async () => {
  const conflicted = await createPendingJob(ctx.nimbus, "Conflict Role");
  await Membership.create({ organization: ctx.nimbus.orgId, user: ctx.admin.userId, role: "recruiter", status: "active" });
  try {
    const single = await adminDecide(conflicted, "approve");
    assert.equal(single.status, 403);
    assert.equal(single.body.code, "REVIEWER_CONFLICT");

    const bulk = await adminBulk({ action: "approve", jobIds: [conflicted], organizationId: ctx.nimbus.orgId });
    assert.equal(bulk.body.data.results[0].outcome, "skipped");
    assert.equal(bulk.body.data.results[0].code, "REVIEWER_CONFLICT");
    assert.equal((await stateOf(conflicted)).moderation, "pending");
  } finally {
    await Membership.deleteOne({ organization: ctx.nimbus.orgId, user: ctx.admin.userId });
  }
});

test("cross-company access: another company's recruiter cannot see or act on moderation", async () => {
  const headers = auth(ctx.orion.token);
  assert.equal((await request(app).get("/api/v1/admin/moderation/companies").set(headers)).status, 404);
  assert.equal((await request(app).get(`/api/v1/admin/moderation/jobs/${ctx.bulkP1}`).set(headers)).status, 404);
  assert.equal((await request(app).get(`/api/v1/admin/moderation/companies/${ctx.nimbus.orgId}/jobs`).set(headers)).status, 404);
  assert.equal((await request(app).post(`/api/v1/admin/moderation/jobs/${ctx.bulkP1}/approve`).set(headers).send({})).status, 404);
  assert.equal((await request(app).post("/api/v1/admin/moderation/bulk").set(headers).send({ action: "approve", jobIds: [ctx.bulkP1] })).status, 404);
  assert.equal((await stateOf(ctx.bulkP1)).moderation, "approved", "the bulk call from outside changed nothing");
});

test("company approve-all: approves eligible pending jobs only, and leaves individual decisions alone", async () => {
  const rejectedOne = await createPendingJob(ctx.nimbus, "Left Rejected");
  await adminDecide(rejectedOne, "reject", { reason: "Not a fit for the platform" });
  const pendingOne = await createPendingJob(ctx.nimbus, "Left Pending");

  const res = await request(app)
    .post(`/api/v1/admin/moderation/companies/${ctx.nimbus.orgId}/approve-all`)
    .set(auth(ctx.admin.token))
    .send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.approvedCount >= 1);
  assert.equal(res.body.results.some((r) => r.jobId === rejectedOne), false, "a rejected job is not part of approve-all");
  assert.equal((await stateOf(rejectedOne)).moderation, "rejected", "a company-level action does not override a decision");
  assert.equal((await stateOf(pendingOne)).moderation, "approved");
});

test("counts and queues agree: the summary matches the company's records", async () => {
  const summary = await request(app).get("/api/v1/admin/moderation/companies").set(auth(ctx.admin.token));
  assert.equal(summary.status, 200);
  const nimbus = summary.body.data.find((c) => String(c._id) === ctx.nimbus.orgId);
  const records = await request(app).get(`/api/v1/admin/moderation/companies/${ctx.nimbus.orgId}/jobs`).set(auth(ctx.admin.token));
  const all = records.body.data.jobs;
  const count = (predicate) => all.filter(predicate).length;
  assert.equal(nimbus.jobCounts.total, all.length);
  assert.equal(nimbus.jobCounts.pending, count((j) => j.needsReview));
  assert.equal(nimbus.jobCounts.approved, count((j) => j.status === "published" && j.moderation.status === "approved"));
  assert.equal(nimbus.jobCounts.rejected, count((j) => j.moderation.status === "rejected"));
  assert.equal(nimbus.jobCounts.suspended, count((j) => j.moderation.status === "suspended"));
  assert.equal(nimbus.jobCounts.closed, count((j) => j.status === "closed"));
  assert.equal(nimbus.jobCounts.drafts, count((j) => j.status === "draft"));
  assert.equal(nimbus.jobCounts.eligible, nimbus.jobCounts.pending, "a verified company's pending jobs are all eligible");
});

test("queue filters: status, job title search and recruiter filter; invalid dates are refused", async () => {
  const headers = auth(ctx.admin.token);
  const byTitle = await request(app).get(`/api/v1/admin/moderation/companies/${ctx.nimbus.orgId}/jobs?search=bulk%20role`).set(headers);
  assert.equal(byTitle.status, 200);
  assert.ok(byTitle.body.data.jobs.length >= 2);
  assert.ok(byTitle.body.data.jobs.every((j) => /bulk role/i.test(j.title)));

  const byRecruiter = await request(app)
    .get(`/api/v1/admin/moderation/companies/${ctx.nimbus.orgId}/jobs?recruiterId=${ctx.nimbus.userId || "000000000000000000000000"}`)
    .set(headers);
  assert.equal(byRecruiter.status, 200);

  const badDate = await request(app).get(`/api/v1/admin/moderation/companies/${ctx.nimbus.orgId}/jobs?from=not-a-date`).set(headers);
  assert.equal(badDate.status, 422);
});

test("job detail: returns the job with its moderation history for the admin only", async () => {
  const detail = await request(app).get(`/api/v1/admin/moderation/jobs/${ctx.jobB}`).set(auth(ctx.admin.token));
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.moderation.status, "pending");
  assert.ok(detail.body.data.history.length >= 3);
  const asRecruiter = await request(app).get(`/api/v1/admin/moderation/jobs/${ctx.jobB}`).set(auth(ctx.nimbus.token));
  assert.equal(asRecruiter.status, 404);
});
