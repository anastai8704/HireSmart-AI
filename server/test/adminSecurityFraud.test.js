// Integration tests: Admin Fraud & Risk Management (Phase 4G)
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
const SecurityEvent = require("../models/SecurityEvent");
const AuditLog = require("../models/AuditLog");
const emailService = require("../services/emailService");

emailService.sendMail = async () => ({ messageId: "test" });

const PASSWORD = "Password123!Secure";
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const ctx = {};

nodeTest.before(async () => {
  await startDatabase();
});

nodeTest.after(async () => {
  await stopDatabase();
});

nodeTest.test("seed: admin, candidate, organization, and security events", async () => {
  await clearDatabase();

  // 1. Admin
  const regAdmin = await request(app).post("/api/v1/auth/register").send({
    email: "secadmin@hiresmart.ai",
    password: PASSWORD,
    displayName: "Security Admin",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regAdmin.status, 201);
  await User.updateOne({ email: "secadmin@hiresmart.ai" }, { $set: { role: "admin", emailVerified: true } });
  const adminLogin = await request(app).post("/api/v1/auth/login").send({
    email: "secadmin@hiresmart.ai",
    password: PASSWORD,
  });
  assert.equal(adminLogin.status, 200);
  ctx.adminToken = adminLogin.body.data.accessToken;

  // 2. Candidate
  const regCand = await request(app).post("/api/v1/auth/register").send({
    email: "suspect.user@example.com",
    password: PASSWORD,
    displayName: "Suspect Candidate",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regCand.status, 201);
  await User.updateOne({ email: "suspect.user@example.com" }, { $set: { emailVerified: true } });
  const candLogin = await request(app).post("/api/v1/auth/login").send({
    email: "suspect.user@example.com",
    password: PASSWORD,
  });
  assert.equal(candLogin.status, 200);
  ctx.candidateToken = candLogin.body.data.accessToken;
  ctx.candidateId = (await User.findOne({ email: "suspect.user@example.com" }))._id;

  // 3. Organization with risk factors (suspicious payment keyword in job)
  const org = await Organization.create({
    name: "Questionable Dynamics",
    slug: "questionable-dynamics",
    verificationStatus: "pending",
    riskScore: 65,
    businessEmail: "hr@freemail.com",
    gstin: "27AAPFU0939F1ZV",
  });
  ctx.orgId = org._id;

  await Job.create({
    title: "Data Entry - Registration fee required",
    description: "Must pay refundable deposit for laptop before interview.",
    organization: org._id,
    company: org.name,
    recruiter: ctx.candidateId,
    experience: "0-1 years",
    location: "Remote",
    skills: ["Data Entry"],
    status: "published",
    salary: 50000,
  });

  // 4. Security Events
  // Critical event
  const ev1 = await SecurityEvent.create({
    user: ctx.candidateId,
    organization: org._id,
    type: "suspicious_payment_keyword_detected",
    severity: "critical",
    status: "open",
    requestId: "req-sec-1",
    ipHash: "abcdef1234567890abcdef",
    details: {
      keyword: "refundable deposit",
      jobTitle: "Data Entry - Registration fee required",
      signals: [{ code: "PAYMENT_DEMAND_KEYWORD", severity: "critical", message: "Keyword found in job" }],
    },
  });
  ctx.ev1Id = ev1._id;

  // Medium event
  const ev2 = await SecurityEvent.create({
    user: ctx.candidateId,
    type: "multiple_failed_login_attempts",
    severity: "medium",
    status: "open",
    requestId: "req-sec-2",
    ipHash: "9876543210fedcba",
    details: { attempts: 5 },
  });
  ctx.ev2Id = ev2._id;

  // Resolved event
  await SecurityEvent.create({
    user: ctx.candidateId,
    type: "session_revoked",
    severity: "low",
    status: "resolved",
    resolutionReason: "User confirmed revocation",
    resolvedAt: new Date(),
  });
});

nodeTest.test("security: unauthorized requests are blocked", async () => {
  // Non-admin attempting to access overview
  const res1 = await request(app)
    .get("/api/v1/admin/security/overview")
    .set(auth(ctx.candidateToken));
  assert.equal(res1.status, 404);

  // Unauthenticated request to events list
  const res2 = await request(app).get("/api/v1/admin/security-events");
  assert.equal(res2.status, 401);

  // Non-admin attempting to add note
  const res3 = await request(app)
    .post(`/api/v1/admin/security-events/${ctx.ev1Id}/notes`)
    .set(auth(ctx.candidateToken))
    .send({ note: "Hacker note" });
  assert.equal(res3.status, 404);
});

nodeTest.test("admin security overview: returns real platform counts and severity distribution", async () => {
  const res = await request(app)
    .get("/api/v1/admin/security/overview")
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  const { metrics, severityDistribution } = res.body.data;
  assert.ok(metrics.totalEvents >= 3);
  assert.ok(metrics.highRiskEvents >= 1);
  assert.ok(metrics.openInvestigations >= 2);
  assert.ok(metrics.resolvedInvestigations >= 1);
  assert.ok(metrics.suspiciousOrganizations >= 1);

  assert.ok(severityDistribution.critical >= 1);
  assert.ok(severityDistribution.medium >= 1);
});

nodeTest.test("admin security events list: supports search and severity/status filtering", async () => {
  // 1. List all events
  const res1 = await request(app)
    .get("/api/v1/admin/security-events")
    .set(auth(ctx.adminToken));

  assert.equal(res1.status, 200);
  assert.ok(Array.isArray(res1.body.data));
  assert.ok(res1.body.data.length >= 3);
  assert.ok(res1.body.meta.counts.total >= 3);

  // 2. Filter by severity=critical
  const res2 = await request(app)
    .get("/api/v1/admin/security-events?severity=critical")
    .set(auth(ctx.adminToken));
  assert.equal(res2.status, 200);
  assert.equal(res2.body.data.length, 1);
  assert.equal(res2.body.data[0].type, "suspicious_payment_keyword_detected");

  // 3. Search by organization name
  const res3 = await request(app)
    .get("/api/v1/admin/security-events?q=Questionable")
    .set(auth(ctx.adminToken));
  assert.equal(res3.status, 200);
  assert.ok(res3.body.data.some((e) => e.organization?.name === "Questionable Dynamics"));
});

nodeTest.test("admin security event details: returns masked IP, historical incidents, risk signals, and audit trail", async () => {
  const res = await request(app)
    .get(`/api/v1/admin/security-events/${ctx.ev1Id}`)
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200);
  const { event, relatedHistory, riskSignals, auditTrail } = res.body.data;

  assert.equal(event.id, String(ctx.ev1Id));
  assert.equal(event.type, "suspicious_payment_keyword_detected");
  assert.equal(event.severity, "critical");
  assert.ok(event.ipHashPreview.includes("...[masked]"));
  assert.equal(event.organization.name, "Questionable Dynamics");

  // Historical events for same user/org
  assert.ok(Array.isArray(relatedHistory));
  assert.ok(relatedHistory.length >= 1);

  // Real risk signals detected from gatherRiskFacts
  assert.ok(Array.isArray(riskSignals));
  assert.ok(riskSignals.length >= 1);
});

nodeTest.test("admin investigation note: adds note and transitions event status", async () => {
  // 1. Short note fails validation
  const failRes = await request(app)
    .post(`/api/v1/admin/security-events/${ctx.ev1Id}/notes`)
    .set(auth(ctx.adminToken))
    .send({ note: "no" });
  assert.equal(failRes.status, 400);

  // 2. Valid note succeeds
  const noteRes = await request(app)
    .post(`/api/v1/admin/security-events/${ctx.ev1Id}/notes`)
    .set(auth(ctx.adminToken))
    .send({ note: "Contacted employer regarding payment keyword in job posting" });

  assert.equal(noteRes.status, 200);
  assert.equal(noteRes.body.data.status, "investigating");
  assert.ok(noteRes.body.data.investigationNotes.length >= 1);

  // 3. Verify audit trail was recorded
  const auditEntry = await AuditLog.findOne({
    action: "admin.security_event_note_added",
    resourceId: String(ctx.ev1Id),
  });
  assert.ok(auditEntry);
});

nodeTest.test("admin resolve event: resolves security event with reason", async () => {
  // 1. Missing reason fails
  const failRes = await request(app)
    .post(`/api/v1/admin/security-events/${ctx.ev1Id}/resolve`)
    .set(auth(ctx.adminToken))
    .send({ resolution: "resolved", reason: "ok" });
  assert.equal(failRes.status, 400);

  // 2. Valid resolution succeeds
  const resolveRes = await request(app)
    .post(`/api/v1/admin/security-events/${ctx.ev1Id}/resolve`)
    .set(auth(ctx.adminToken))
    .send({ resolution: "resolved", reason: "Employer revised job description and removed deposit clause" });

  assert.equal(resolveRes.status, 200);
  assert.equal(resolveRes.body.data.status, "resolved");

  // 3. Verify audit trail
  const auditEntry = await AuditLog.findOne({
    action: "admin.security_event_resolved",
    resourceId: String(ctx.ev1Id),
  });
  assert.ok(auditEntry);
  assert.equal(auditEntry.reason, "Employer revised job description and removed deposit clause");
});

nodeTest.test("admin flag entity: flags user for security review", async () => {
  const res = await request(app)
    .post(`/api/v1/admin/security-events/${ctx.ev2Id}/flag`)
    .set(auth(ctx.adminToken))
    .send({ targetType: "user", reason: "Repeated credential stuffing pattern detected" });

  assert.equal(res.status, 200);

  const updatedUser = await User.findById(ctx.candidateId);
  assert.equal(updatedUser.isFlagged, true);

  const auditEntry = await AuditLog.findOne({
    action: "admin.user_flagged_suspicious",
    resourceId: String(ctx.candidateId),
  });
  assert.ok(auditEntry);
});
