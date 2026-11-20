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
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
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

nodeTest("seed: admin, candidate, organization, job, and applications for oversight test", async () => {
  await clearDatabase();

  // 1. Admin
  const regAdmin = await request(app).post("/api/v1/auth/register").send({
    email: "app-oversight-admin@example.test",
    password: PASSWORD,
    displayName: "Admin Oversight",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regAdmin.status, 201);
  await User.updateOne(
    { email: "app-oversight-admin@example.test" },
    { $set: { role: "admin", emailVerified: true } }
  );
  const loginAdmin = await request(app).post("/api/v1/auth/login").send({
    email: "app-oversight-admin@example.test",
    password: PASSWORD,
  });
  ctx.adminToken = loginAdmin.body.data.accessToken;

  // 2. Candidate
  const regCand = await request(app).post("/api/v1/auth/register").send({
    email: "app-oversight-cand@example.test",
    password: PASSWORD,
    displayName: "Rohan Verma",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regCand.status, 201);
  ctx.candidateId = regCand.body.data.user.id || regCand.body.data.user._id;
  await User.updateOne(
    { _id: ctx.candidateId },
    { $set: { emailVerified: true, headline: "Senior Platform Architect", location: "Pune", skills: ["Go", "Kubernetes", "AWS"] } }
  );
  const loginCand = await request(app).post("/api/v1/auth/login").send({
    email: "app-oversight-cand@example.test",
    password: PASSWORD,
  });
  ctx.candidateToken = loginCand.body.data.accessToken;

  // 3. Organization & Job
  const org = await Organization.create({
    name: "Apex Cloud Systems",
    slug: "apex-cloud-systems",
    businessEmail: "careers@apexcloud.test",
    verificationStatus: "verified",
  });
  ctx.orgId = org._id;

  const job = await Job.create({
    title: "Senior Cloud Engineer",
    company: org.name,
    organization: org._id,
    recruiter: regAdmin.body.data.user.id || regAdmin.body.data.user._id,
    department: "Infrastructure",
    workplaceMode: "remote",
    employmentType: "full_time",
    location: "Pune, India",
    salary: 3200000,
    experience: "5+ years",
    description: "Design and implement scalable cloud infrastructure using modern distributed computing technologies.",
    skills: ["Go", "Kubernetes", "AWS"],
    status: "published",
  });
  ctx.jobId = job._id;

  // 4. Applications
  const app1 = await Application.create({
    organization: org._id,
    job: job._id,
    jobSnapshot: {
      title: job.title,
      company: org.name,
      location: job.location,
    },
    candidate: ctx.candidateId,
    status: "interview",
    resumeSnapshot: {
      storageKey: "internal/vault/secret-resume-key-1234.pdf",
      provider: "local",
      originalName: "rohan-cloud-cv.pdf",
      mimeType: "application/pdf",
      size: 1048576,
    },
    statusHistory: [
      {
        status: "Applied",
        changedAt: new Date(Date.now() - 86400000 * 2),
        changedBy: ctx.candidateId,
      },
      {
        status: "interview",
        fromStatus: "Applied",
        changedAt: new Date(),
        changedBy: regAdmin.body.data.user.id || regAdmin.body.data.user._id,
        note: "Passed initial technical screening",
      },
    ],
    offer: {
      status: "issued",
      designation: "Senior Cloud Engineer",
      ctc: 3200000,
      currency: "INR",
      joiningDate: new Date(Date.now() + 86400000 * 30),
      notes: "Stock options included",
    },
  });
  ctx.appId = app1._id;
});

nodeTest("security: unauthorized users cannot access admin applications oversight", async () => {
  const anon = await request(app).get("/api/v1/admin/applications");
  assert.equal(anon.status, 401);

  const nonAdmin = await request(app)
    .get("/api/v1/admin/applications")
    .set(auth(ctx.candidateToken));
  assert.equal(nonAdmin.status, 404);
});

nodeTest("admin applications: lists applications with meta counts and filters", async () => {
  const res = await request(app)
    .get("/api/v1/admin/applications")
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  const appItem = res.body.data[0];
  assert.equal(appItem.candidate?.email, "app-oversight-cand@example.test");
  assert.equal(appItem.job?.title, "Senior Cloud Engineer");
  assert.equal(appItem.organization?.name, "Apex Cloud Systems");
  assert.equal(appItem.status, "interview");

  // Verify storageKey is NOT exposed in the response
  assert.equal(appItem.resumeSnapshot?.storageKey, undefined);

  // Verify meta counts
  const meta = res.body.meta;
  assert.ok(meta);
  assert.ok(meta.counts);
  assert.equal(meta.counts.total, 1);
  assert.equal(meta.counts.interview, 1);
});

nodeTest("admin applications: search by candidate, job, and ID", async () => {
  // Search by candidate name
  const res1 = await request(app)
    .get("/api/v1/admin/applications?search=Rohan")
    .set(auth(ctx.adminToken));
  assert.equal(res1.body.data.length, 1);

  // Search by job title
  const res2 = await request(app)
    .get("/api/v1/admin/applications?search=Cloud")
    .set(auth(ctx.adminToken));
  assert.equal(res2.body.data.length, 1);

  // Search by app ID
  const res3 = await request(app)
    .get(`/api/v1/admin/applications?search=${ctx.appId}`)
    .set(auth(ctx.adminToken));
  assert.equal(res3.body.data.length, 1);

  // Search no match
  const res4 = await request(app)
    .get("/api/v1/admin/applications?search=NonExistentEntity")
    .set(auth(ctx.adminToken));
  assert.equal(res4.body.data.length, 0);
});

nodeTest("admin application details: retrieves full application and logs audit event", async () => {
  const res = await request(app)
    .get(`/api/v1/admin/applications/${ctx.appId}`)
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  const data = res.body.data;
  assert.equal(data.candidate?.name, "Rohan Verma");
  assert.equal(data.job?.title, "Senior Cloud Engineer");
  assert.equal(data.offer?.status, "issued");
  assert.equal(data.offer?.ctc, 3200000);
  assert.equal(data.statusHistory.length, 2);
  assert.equal(data.statusHistory[1].note, "Passed initial technical screening");

  // Check audit log
  const auditEntry = await AuditLog.findOne({
    action: "admin.application_viewed",
    resourceId: ctx.appId,
  });
  assert.ok(auditEntry, "audit log was recorded");
});

nodeTest("admin candidate oversight: user directory search by ID, role, and meta counts", async () => {
  const res = await request(app)
    .get(`/api/v1/admin/users?search=${ctx.candidateId}`)
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].email, "app-oversight-cand@example.test");
  assert.ok(res.body.meta.counts);
  assert.ok(res.body.meta.counts.candidates >= 1);
});

nodeTest("admin actions: flag suspicious activity records security event and audit log", async () => {
  const res = await request(app)
    .post(`/api/v1/admin/users/${ctx.candidateId}/flag`)
    .set(auth(ctx.adminToken))
    .send({ reason: "Unusual rapid profile updates observed" });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.success, true);

  const secEvent = await SecurityEvent.findOne({
    user: ctx.candidateId,
    type: "suspicious_activity_flagged",
  });
  assert.ok(secEvent, "security event created");
  assert.equal(secEvent.severity, "medium");

  const auditEntry = await AuditLog.findOne({
    action: "admin.user_flagged_suspicious",
    resourceId: ctx.candidateId,
  });
  assert.ok(auditEntry, "audit log recorded for flag action");
});
