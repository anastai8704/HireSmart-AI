const { grantTestPlan } = require("./helpers/grantTestPlan");
// Phase 4 candidate pipeline, end to end over HTTP against MongoDB (runs in CI).
// Applications are created directly as fixtures; the stage changes, offers, privacy and
// authorization rules under test all go through the real routes.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");

// Failure summary printed last, so CI log tails show which assertions failed.
const failedTests = [];
process.on("exit", () => {
  if (failedTests.length) {
    process.stderr.write(`\nCANDIDATE-PIPELINE FAILURES (${failedTests.length}):\n${failedTests.join("\n")}\n`);
  }
});
const test = Object.assign(
  (name, fn) =>
    nodeTest(name, async (t) => {
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
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { Placement } = require("../models/Placement");
const { Membership } = require("../models/Membership");
const CandidateProfile = require("../models/CandidateProfile");
const emailService = require("../services/emailService");

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
    orgId: registration.body.data.organization?.id,
  };
};

const verifyCompany = async (orgId) => {
  await Organization.updateOne({ _id: orgId }, { $set: { verificationStatus: "verified", verifiedAt: new Date() } });
  await grantTestPlan(orgId);
};

const jobPayload = (title) => ({
  title,
  company: "Nimbus Works",
  location: "Pune",
  experience: "2+ years",
  jobType: "Full-Time",
  workplaceMode: "hybrid",
  description: "A role used to test the candidate pipeline with a complete description.",
  requiredSkills: ["Node.js"],
});

/** A live job of the company (created, submitted, approved by the platform admin). */
const liveJob = async (title) => {
  const created = await request(app)
    .post(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs`)
    .set(auth(ctx.nimbus.token))
    .send(jobPayload(title));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const jobId = created.body.data.id;
  const published = await request(app)
    .post(`/api/v1/organizations/${ctx.nimbus.orgId}/jobs/${jobId}/publish`)
    .set(auth(ctx.nimbus.token));
  assert.equal(published.status, 200, JSON.stringify(published.body));
  const approved = await request(app)
    .post(`/api/v1/admin/moderation/jobs/${jobId}/approve`)
    .set(auth(ctx.admin.token));
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  return jobId;
};

/** An application as the candidate would have submitted it (resume stored as a snapshot). */
const applicationFor = async (jobId, status = "submitted", candidate = ctx.candidate) => {
  const job = await Job.findById(jobId).lean();
  const app = await Application.create({
    organization: job.organization,
    job: jobId,
    candidate: candidate.userId,
    status,
    resumeSnapshot: {
      storageKey: "fixture/resume.pdf",
      provider: "local",
      originalName: "resume.pdf",
      mimeType: "application/pdf",
      size: 1024,
      text: "Confidential resume text",
    },
    statusHistory: [{ status, changedBy: candidate.userId, note: "Applied" }],
  });
  return app._id.toString();
};

let jobCounter = 0;
const freshJob = () => liveJob(`Role ${++jobCounter}`);

const base = (applicationId) => `/api/v1/organizations/${ctx.nimbus.orgId}/applications/${applicationId}`;
const move = (applicationId, toStatus, extra = {}) =>
  request(app).post(`${base(applicationId)}/transitions`).set(auth(ctx.nimbus.token)).send({ toStatus, ...extra });
const stageOf = async (applicationId) => (await Application.findById(applicationId).lean()).status;

test.before(async () => {
  await startDatabase();
});
test.after(async () => {
  emailService.sendMail = originalSendMail;
  await stopDatabase();
});

test("seed: a platform admin, a verified company with its recruiter, and a second company", async () => {
  await clearDatabase();
  const admin = await registerAndLogin({ email: "admin@pipeline.example", intent: "candidate" });
  await User.updateOne({ _id: admin.userId }, { $set: { role: "admin" } });
  const login = await request(app).post("/api/v1/auth/login").send({ email: "admin@pipeline.example", password: PASSWORD });
  ctx.admin = { token: login.body.data.accessToken, userId: admin.userId };

  ctx.nimbus = await registerAndLogin({ email: "owner@nimbus.example", intent: "recruiter", organizationName: "Nimbus Works" });
  ctx.orion = await registerAndLogin({ email: "owner@orion.example", intent: "recruiter", organizationName: "Orion Labs" });
  ctx.candidate = await registerAndLogin({ email: "asha@candidate.example", intent: "candidate" });
  ctx.teammate = await registerAndLogin({ email: "ravi@candidate.example", intent: "candidate" });
  ctx.colleague = await registerAndLogin({ email: "meera@colleague.example", intent: "recruiter", organizationName: "Colleague Labs" });
  await verifyCompany(ctx.nimbus.orgId);
  await verifyCompany(ctx.orion.orgId);
  ctx.colleague.membership = await Membership.create({
    organization: ctx.nimbus.orgId,
    user: ctx.colleague.userId,
    role: "recruiter",
    status: "active",
  });
  assert.ok(ctx.colleague.membership._id);
});

test("stage history: each move records its previous stage, and invalid moves are refused", async () => {
  const applicationId = await applicationFor(await freshJob());
  const toReview = await move(applicationId, "under_review", { note: "Screening" });
  assert.equal(toReview.status, 200, JSON.stringify(toReview.body));
  const jump = await move(applicationId, "hired");
  assert.equal(jump.status, 409);
  assert.equal(jump.body.code, "INVALID_TRANSITION");
  assert.equal(await stageOf(applicationId), "under_review");

  const detail = await request(app).get(base(applicationId)).set(auth(ctx.nimbus.token));
  const history = detail.body.data.application.statusHistory;
  const move1 = history.find((h) => h.status === "under_review");
  assert.equal(move1.fromStatus, "submitted");
  assert.equal(move1.note, "Screening");
});

test("duplicate and repeated requests: a repeated move is refused and the stage does not change twice", async () => {
  const applicationId = await applicationFor(await freshJob());
  const [a, b] = await Promise.all([
    move(applicationId, "shortlisted"),
    move(applicationId, "shortlisted"),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409], "exactly one concurrent request is applied");
  const loser = a.status === 409 ? a : b;
  assert.ok(["STATUS_CHANGED", "INVALID_TRANSITION"].includes(loser.body.code));
  const record = await Application.findById(applicationId).lean();
  assert.equal(record.status, "shortlisted");
  assert.equal(record.statusHistory.filter((h) => h.status === "shortlisted").length, 1);
});

test("offers: an offer needs the interview stage, is issued with its details, and is not hiring", async () => {
  const applicationId = await applicationFor(await freshJob(), "shortlisted");
  const early = await request(app)
    .post(`${base(applicationId)}/offer`)
    .set(auth(ctx.nimbus.token))
    .send({ designation: "Backend Engineer", ctc: 1500000 });
  assert.equal(early.status, 409);
  assert.equal(early.body.code, "OFFER_STAGE_REQUIRED");

  assert.equal((await move(applicationId, "interview")).status, 200);
  const issued = await request(app)
    .post(`${base(applicationId)}/offer`)
    .set(auth(ctx.nimbus.token))
    .send({ designation: "Backend Engineer", ctc: 1500000, currency: "INR", joiningDate: "2027-01-15" });
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  assert.equal(issued.body.data.status, "offer");
  assert.equal(issued.body.data.offer.status, "issued");

  const again = await request(app)
    .post(`${base(applicationId)}/offer`)
    .set(auth(ctx.nimbus.token))
    .send({ designation: "Another" });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "OFFER_ALREADY_OPEN");
});

test("hiring requires the candidate's acceptance; a decline does not, and a new offer can follow", async () => {
  const applicationId = await applicationFor(await freshJob(), "interview");
  assert.equal(
    (
      await request(app)
        .post(`${base(applicationId)}/offer`)
        .set(auth(ctx.nimbus.token))
        .send({ designation: "Backend Engineer", ctc: 1400000 })
    ).status,
    200,
  );

  const notYet = await move(applicationId, "hired");
  assert.equal(notYet.status, 409);
  assert.equal(notYet.body.code, "OFFER_NOT_ACCEPTED");

  // Only the candidate can respond, and only to their own application.
  const byRecruiter = await request(app)
    .post(`/api/v1/candidates/me/applications/${applicationId}/offer-response`)
    .set(auth(ctx.nimbus.token))
    .send({ response: "accept" });
  assert.equal(byRecruiter.status, 403);

  const teammateTry = await request(app)
    .post(`/api/v1/candidates/me/applications/${applicationId}/offer-response`)
    .set(auth(ctx.teammate.token))
    .send({ response: "accept" });
  assert.equal(teammateTry.status, 404, "another candidate cannot respond to this offer");

  const declined = await request(app)
    .post(`/api/v1/candidates/me/applications/${applicationId}/offer-response`)
    .set(auth(ctx.candidate.token))
    .send({ response: "decline", note: "Found another role" });
  assert.equal(declined.status, 200, JSON.stringify(declined.body));
  assert.equal(declined.body.data.offer.status, "declined");

  const secondResponse = await request(app)
    .post(`/api/v1/candidates/me/applications/${applicationId}/offer-response`)
    .set(auth(ctx.candidate.token))
    .send({ response: "accept" });
  assert.equal(secondResponse.status, 409);
  assert.equal(secondResponse.body.code, "OFFER_NOT_PENDING");

  assert.equal((await move(applicationId, "hired")).body.code, "OFFER_NOT_ACCEPTED");

  const reissued = await request(app)
    .post(`${base(applicationId)}/offer`)
    .set(auth(ctx.nimbus.token))
    .send({ designation: "Backend Engineer", ctc: 1450000 });
  assert.equal(reissued.status, 200, "a declined offer may be replaced");
  await request(app)
    .post(`/api/v1/candidates/me/applications/${applicationId}/offer-response`)
    .set(auth(ctx.candidate.token))
    .send({ response: "accept" });

  const hired = await move(applicationId, "hired");
  assert.equal(hired.status, 200, JSON.stringify(hired.body));
  const placement = await Placement.findOne({ application: applicationId }).lean();
  assert.equal(placement.status, "hired", "a hire is recorded as selected by the company, not as joined");
  assert.equal(placement.offerDetails.ctc, 1450000, "the placement uses the recorded offer");
  assert.ok(placement.offerDetails.acceptedAt, "acceptance is recorded with its date");
  assert.equal(placement.joiningConfirmation.confirmedByCandidate, false);
  assert.equal(placement.verification.isVerified, false);
});

test("a hire never invents offer terms: a missing CTC stays empty", async () => {
  const jobId = await freshJob();
  const applicationId = await applicationFor(jobId, "interview");
  await request(app)
    .post(`${base(applicationId)}/offer`)
    .set(auth(ctx.nimbus.token))
    .send({ note: "Verbal offer" });
  await request(app)
    .post(`/api/v1/candidates/me/applications/${applicationId}/offer-response`)
    .set(auth(ctx.candidate.token))
    .send({ response: "accept" });
  assert.equal((await move(applicationId, "hired")).status, 200);
  const placement = await Placement.findOne({ application: applicationId }).lean();
  assert.equal(placement.offerDetails.ctc, null);
  const job = await Job.findById(jobId).lean();
  assert.equal(placement.offerDetails.designation, job.title, "without a designation the offer uses the job title");
});

test("cross-company access: another company cannot read, move, or offer on this application", async () => {
  const applicationId = await applicationFor(await freshJob(), "interview");
  const otherBase = `/api/v1/organizations/${ctx.orion.orgId}/applications/${applicationId}`;
  const read = await request(app).get(otherBase).set(auth(ctx.orion.token));
  assert.equal(read.status, 404);
  const moved = await request(app).post(`${otherBase}/transitions`).set(auth(ctx.orion.token)).send({ toStatus: "rejected" });
  assert.equal(moved.status, 404);
  const offered = await request(app).post(`${otherBase}/offer`).set(auth(ctx.orion.token)).send({ ctc: 1 });
  assert.equal(offered.status, 404);
  assert.equal(await stageOf(applicationId), "interview");
});

test("privacy: phone and current employment are hidden from recruiters until the candidate shares them", async () => {
  await User.updateOne({ _id: ctx.candidate.userId }, { $set: { phone: "+91 98765 43210" } });
  const applicationId = await applicationFor(await freshJob(), "submitted");

  const hidden = await request(app).get(base(applicationId)).set(auth(ctx.nimbus.token));
  assert.equal(hidden.status, 200);
  const view = hidden.body.data.application.candidate;
  assert.equal(view.phone, undefined, "phone is hidden by default");
  assert.equal(view.currentEmployment, undefined, "employment is hidden by default");
  assert.equal(hidden.body.data.application.resumeSnapshot?.text, undefined, "resume text is not returned in the detail view");

  const saved = await request(app)
    .patch("/api/v1/candidates/me/profile")
    .set(auth(ctx.candidate.token))
    .send({
      employmentStatus: "employed",
      currentEmployment: { disclosed: true, employer: "Acme Corp", designation: "Engineer" },
      privacy: { sharePhoneWithRecruiters: true },
    });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const profile = await CandidateProfile.findOne({ user: ctx.candidate.userId }).lean();
  assert.equal(profile.privacy.sharePhoneWithRecruiters, true);
  assert.equal(profile.privacy.shareCurrentEmployment, false, "a partial update keeps the other setting closed");

  const phoneOnly = await request(app).get(base(applicationId)).set(auth(ctx.nimbus.token));
  assert.equal(phoneOnly.body.data.application.candidate.phone, "+91 98765 43210");
  assert.equal(phoneOnly.body.data.application.candidate.currentEmployment, undefined, "employment still needs its own consent");

  await request(app)
    .patch("/api/v1/candidates/me/profile")
    .set(auth(ctx.candidate.token))
    .send({ privacy: { shareCurrentEmployment: true } });
  const shared = await request(app).get(base(applicationId)).set(auth(ctx.nimbus.token));
  assert.equal(shared.body.data.application.candidate.currentEmployment.employer, "Acme Corp");
  assert.equal(shared.body.data.application.candidate.currentEmployment.source, "candidate_reported");

  // Turning sharing back off takes effect immediately.
  await request(app).patch("/api/v1/candidates/me/profile").set(auth(ctx.candidate.token)).send({ privacy: { sharePhoneWithRecruiters: false } });
  const withdrawn = await request(app).get(base(applicationId)).set(auth(ctx.nimbus.token));
  assert.equal(withdrawn.body.data.application.candidate.phone, undefined);
});

test("placements: the organization's list hides the phone unless shared, and labels each fact by source", async () => {
  const applicationId = await applicationFor(await freshJob(), "interview", ctx.teammate);
  await request(app)
    .post(`${base(applicationId)}/offer`)
    .set(auth(ctx.nimbus.token))
    .send({ designation: "Backend Engineer", ctc: 900000 });
  await request(app)
    .post(`/api/v1/candidates/me/applications/${applicationId}/offer-response`)
    .set(auth(ctx.teammate.token))
    .send({ response: "accept" });
  assert.equal((await move(applicationId, "hired")).status, 200);

  const list = await request(app)
    .get(`/api/v1/organizations/${ctx.nimbus.orgId}/placements`)
    .set(auth(ctx.nimbus.token));
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const row = list.body.data.find((p) => String(p.application) === applicationId);
  assert.ok(row, "the hired candidate appears");
  assert.equal(row.candidate.phone, undefined, "the teammate has not shared a phone number");
  assert.equal(row.evidence.hiredByCompany.source, "organization_reported");
  assert.equal(row.evidence.offerAccepted.recorded, true);
  assert.equal(row.evidence.joiningReported.recorded, false);
  assert.equal(row.evidence.employmentConfirmed.recorded, false, "no independent verification has been recorded");

  const confirmed = await request(app)
    .post(`/api/v1/candidates/me/placements/${row._id}/confirm-joining`)
    .set(auth(ctx.teammate.token))
    .send({});
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  const after = await request(app).get("/api/v1/candidates/me/placements").set(auth(ctx.teammate.token));
  const mine = after.body.data.find((p) => String(p._id) === String(row._id));
  assert.equal(mine.evidence.joiningReported.recorded, true);
  assert.equal(mine.evidence.joiningReported.source, "candidate_reported");
  assert.equal(mine.evidence.employmentConfirmed.recorded, false, "joining does not confirm employment");
});

test("private notes are seen only by their author; hiring-team notes by the team", async () => {
  const jobId = await freshJob();
  await Job.updateOne({ _id: jobId }, { $set: { hiringTeam: [ctx.colleague.membership._id] } });
  const applicationId = await applicationFor(jobId, "submitted");
  const mine = await request(app)
    .post(`${base(applicationId)}/notes`)
    .set(auth(ctx.nimbus.token))
    .send({ body: "Private thought about compensation", visibility: "private" });
  assert.equal(mine.status, 201, JSON.stringify(mine.body));
  const shared = await request(app)
    .post(`${base(applicationId)}/notes`)
    .set(auth(ctx.nimbus.token))
    .send({ body: "Strong system design answers", visibility: "hiring_team" });
  assert.equal(shared.status, 201, JSON.stringify(shared.body));

  const authorView = await request(app).get(`${base(applicationId)}/notes`).set(auth(ctx.nimbus.token));
  assert.equal(authorView.status, 200, JSON.stringify(authorView.body));
  assert.equal(authorView.body.data.length, 2, "the author sees both notes");

  const colleagueView = await request(app)
    .get(`/api/v1/organizations/${ctx.nimbus.orgId}/applications/${applicationId}/notes`)
    .set(auth(ctx.colleague.token));
  assert.equal(colleagueView.status, 200, JSON.stringify(colleagueView.body));
  const bodies = colleagueView.body.data.map((n) => n.body);
  assert.deepEqual(bodies, ["Strong system design answers"], "a private note is never shown to another member");
});

test("candidates never see recruiter notes, and see their own offer", async () => {
  const applicationId = await applicationFor(await freshJob(), "interview");
  await Application.updateOne({ _id: applicationId }, { $set: { recruiterNotes: "Internal: slow to reply" } });
  await request(app)
    .post(`${base(applicationId)}/offer`)
    .set(auth(ctx.nimbus.token))
    .send({ designation: "Backend Engineer", ctc: 1100000 });
  const mineView = await request(app).get(`/api/v1/candidates/me/applications/${applicationId}`).set(auth(ctx.candidate.token));
  assert.equal(mineView.status, 200);
  assert.equal(mineView.body.data.recruiterNotes, undefined);
  assert.equal(mineView.body.data.resumeSnapshot, undefined);
  assert.equal(mineView.body.data.offer.status, "issued");
  assert.equal(mineView.body.data.offer.ctc, 1100000);
});

test("the company's recruiter cannot act on another company's application through the list", async () => {
  const applicationId = await applicationFor(await freshJob(), "submitted");
  const list = await request(app)
    .get(`/api/v1/organizations/${ctx.orion.orgId}/applications/${applicationId}`)
    .set(auth(ctx.orion.token));
  assert.equal(list.status, 404);
});
