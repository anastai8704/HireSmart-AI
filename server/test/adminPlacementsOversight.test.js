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
const { Application } = require("../models/Application");
const { Placement } = require("../models/Placement");
const AuditLog = require("../models/AuditLog");
const emailService = require("../services/emailService");

const originalSendMail = emailService.sendMail;
emailService.sendMail = async () => ({ messageId: "test" });
const PASSWORD = "StrongPassword123!";
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ctx = {};

nodeTest.before(async () => {
  await startDatabase();
});

nodeTest.after(async () => {
  emailService.sendMail = originalSendMail;
  await stopDatabase();
});

nodeTest("seed: admin, candidate, organization, job, application, and placement", async () => {
  await clearDatabase();

  // 1. Admin
  const regAdmin = await request(app).post("/api/v1/auth/register").send({
    email: "place-admin@example.test",
    password: PASSWORD,
    displayName: "Placement Admin",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regAdmin.status, 201);
  await User.updateOne({ email: "place-admin@example.test" }, { $set: { role: "admin", emailVerified: true } });
  const loginAdmin = await request(app).post("/api/v1/auth/login").send({
    email: "place-admin@example.test",
    password: PASSWORD,
  });
  ctx.adminToken = loginAdmin.body.data.accessToken;

  // 2. Candidate
  const regCand = await request(app).post("/api/v1/auth/register").send({
    email: "place-cand@example.test",
    password: PASSWORD,
    displayName: "Ananya Deshmukh",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regCand.status, 201);
  ctx.candidateId = regCand.body.data.user.id || regCand.body.data.user._id;
  await User.updateOne({ _id: ctx.candidateId }, { $set: { emailVerified: true } });
  const loginCand = await request(app).post("/api/v1/auth/login").send({
    email: "place-cand@example.test",
    password: PASSWORD,
  });
  ctx.candidateToken = loginCand.body.data.accessToken;

  // 3. Organization & Job
  const org = await Organization.create({
    name: "Starlight Dynamics",
    slug: "starlight-dynamics",
    businessEmail: "hr@starlight.test",
    verificationStatus: "verified",
  });
  ctx.orgId = org._id;

  const job = await Job.create({
    title: "Lead AI Researcher",
    company: org.name,
    organization: org._id,
    recruiter: regAdmin.body.data.user.id || regAdmin.body.data.user._id,
    location: "Hyderabad, India",
    salary: 4500000,
    experience: "6+ years",
    description: "Conduct frontier multimodal intelligence research and deployment.",
    skills: ["PyTorch", "Transformers", "Distributed Systems"],
    status: "published",
  });
  ctx.jobId = job._id;

  // 4. Application
  const app1 = await Application.create({
    organization: org._id,
    job: job._id,
    jobSnapshot: { title: job.title, company: org.name, location: job.location },
    candidate: ctx.candidateId,
    status: "hired",
    resumeSnapshot: {
      storageKey: "internal/vault/ananya-resume.pdf",
      provider: "local",
      originalName: "ananya-cv.pdf",
      mimeType: "application/pdf",
      size: 512000,
    },
    offer: {
      status: "accepted",
      designation: "Lead AI Researcher",
      ctc: 4500000,
      currency: "INR",
      joiningDate: new Date(),
    },
  });
  ctx.applicationId = app1._id;

  // 5. Placement
  const pl1 = await Placement.create({
    application: app1._id,
    organization: org._id,
    candidate: ctx.candidateId,
    job: job._id,
    status: "hired",
    offerDetails: {
      designation: "Lead AI Researcher",
      ctc: 4500000,
      currency: "INR",
      acceptedAt: new Date(Date.now() - 86400000 * 5),
    },
    joiningConfirmation: {
      confirmedByCandidate: true,
      actualJoiningDate: new Date(Date.now() - 86400000 * 2),
      candidateNotes: "Joined Hyderabad office on schedule.",
    },
    verification: {
      isVerified: false,
      proofDocumentUrl: "https://documents.internal/starlight/joining-ananya.pdf",
    },
    employment: {
      status: "joined_pending_verification",
      lastVerifiedStatus: "offer_accepted",
    },
    employmentHistory: [
      {
        event: "placement_created",
        fromStatus: "",
        toStatus: "hired",
        source: "platform_reported",
        at: new Date(Date.now() - 86400000 * 5),
      },
    ],
  });
  ctx.placementId = pl1._id;
});

nodeTest("security: unauthorized requests to admin placements are blocked", async () => {
  const anon = await request(app).get("/api/v1/admin/placements");
  assert.equal(anon.status, 401);

  const nonAdmin = await request(app)
    .get("/api/v1/admin/placements")
    .set(auth(ctx.candidateToken));
  assert.equal(nonAdmin.status, 404);
});

nodeTest("admin placements list: supports search, status counts, and metadata", async () => {
  const res = await request(app)
    .get("/api/v1/admin/placements?search=Ananya")
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  const p = res.body.data[0];
  assert.equal(p.candidate?.name, "Ananya Deshmukh");
  assert.equal(p.organization?.name, "Starlight Dynamics");
  assert.equal(p.verification?.isVerified, false);
  assert.ok(res.body.meta.counts);
  assert.equal(res.body.meta.counts.total, 1);
  assert.equal(res.body.meta.counts.pending, 1);
  assert.equal(res.body.meta.counts.verified, 0);
});

nodeTest("admin placement details: returns compensation, designation, and evidence", async () => {
  const res = await request(app)
    .get(`/api/v1/admin/placements/${ctx.placementId}`)
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  const data = res.body.data;
  assert.ok(data.placement);
  assert.equal(data.placement.offerDetails?.ctc, 4500000);
  assert.equal(data.placement.offerDetails?.designation, "Lead AI Researcher");
  assert.equal(data.placement.joiningConfirmation?.confirmedByCandidate, true);
  assert.equal(data.placement.verification?.proofDocumentUrl, "https://documents.internal/starlight/joining-ananya.pdf");
});

nodeTest("admin placement verification: verifies placement and prevents duplicate verification", async () => {
  const verifyRes = await request(app)
    .post(`/api/v1/admin/placements/${ctx.placementId}/verify`)
    .set(auth(ctx.adminToken))
    .send({ adminRemarks: "Official joining verified against badge record" });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.data.verification.isVerified, true);
  assert.equal(verifyRes.body.data.verification.adminRemarks, "Official joining verified against badge record");

  // Audit event check
  const auditEntry = await AuditLog.findOne({
    action: "admin.placement_verified",
    resourceId: ctx.placementId,
  });
  assert.ok(auditEntry, "audit log was recorded");

  // Duplicate verification attempt must fail with 409
  const dupRes = await request(app)
    .post(`/api/v1/admin/placements/${ctx.placementId}/verify`)
    .set(auth(ctx.adminToken))
    .send({ adminRemarks: "Duplicate try" });

  assert.equal(dupRes.status, 409);
  assert.equal(dupRes.body.code, "ALREADY_VERIFIED");
});

nodeTest("admin placement rejection: enforces mandatory reason of at least 3 characters", async () => {
  // Reset verification to false for rejection test
  await Placement.updateOne({ _id: ctx.placementId }, { $set: { "verification.isVerified": false } });

  // Missing or short reason
  const failRes = await request(app)
    .post(`/api/v1/admin/placements/${ctx.placementId}/reject`)
    .set(auth(ctx.adminToken))
    .send({ reason: "No" });
  assert.equal(failRes.status, 422);

  // Valid reason
  const passRes = await request(app)
    .post(`/api/v1/admin/placements/${ctx.placementId}/reject`)
    .set(auth(ctx.adminToken))
    .send({ reason: "Disputed joining: candidate did not report to work" });

  assert.equal(passRes.status, 200);
  assert.equal(passRes.body.data.verification.isVerified, false);
  assert.equal(passRes.body.data.verification.adminRemarks, "Disputed joining: candidate did not report to work");

  const auditEntry = await AuditLog.findOne({
    action: "admin.placement_rejected",
    resourceId: ctx.placementId,
  });
  assert.ok(auditEntry);
});

nodeTest("admin placement evidence request: records evidence request with note", async () => {
  const reqRes = await request(app)
    .post(`/api/v1/admin/placements/${ctx.placementId}/request-evidence`)
    .set(auth(ctx.adminToken))
    .send({ note: "Please upload official signed appointment letter or first salary slip" });

  assert.equal(reqRes.status, 200);
  assert.equal(reqRes.body.data.verification.adminRemarks, "Please upload official signed appointment letter or first salary slip");

  const auditEntry = await AuditLog.findOne({
    action: "admin.placement_evidence_requested",
    resourceId: ctx.placementId,
  });
  assert.ok(auditEntry);
});
