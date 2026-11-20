process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
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

nodeTest("seed: an admin and a candidate for candidate 360 test", async () => {
  await clearDatabase();
  const regAdmin = await request(app).post("/api/v1/auth/register").send({
    email: "c360-admin@example.test",
    password: PASSWORD,
    displayName: "360 Admin",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regAdmin.status, 201);
  await User.updateOne({ email: "c360-admin@example.test" }, { $set: { role: "admin", emailVerified: true } });
  const loginAdmin = await request(app).post("/api/v1/auth/login").send({ email: "c360-admin@example.test", password: PASSWORD });
  ctx.adminToken = loginAdmin.body.data.accessToken;

  const regCand = await request(app).post("/api/v1/auth/register").send({
    email: "c360-candidate@example.test",
    password: PASSWORD,
    displayName: "Priya Sharma",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(regCand.status, 201);
  await User.updateOne(
    { email: "c360-candidate@example.test" },
    { $set: { emailVerified: true, headline: "Senior Backend Engineer", location: "Bengaluru" } }
  );
  const loginCand = await request(app).post("/api/v1/auth/login").send({ email: "c360-candidate@example.test", password: PASSWORD });
  ctx.candidateToken = loginCand.body.data.accessToken;
  ctx.candidateId = regCand.body.data.user.id || regCand.body.data.user._id;
});

nodeTest("candidate 360 endpoint security: 401 unauthenticated, 404 non-admin", async () => {
  const anon = await request(app).get(`/api/v1/admin/candidates/${ctx.candidateId}/360`);
  assert.equal(anon.status, 401);

  const nonAdmin = await request(app)
    .get(`/api/v1/admin/candidates/${ctx.candidateId}/360`)
    .set(auth(ctx.candidateToken));
  assert.equal(nonAdmin.status, 404);
});

nodeTest("candidate 360 endpoint returns candidate journey and audits view", async () => {
  const res = await request(app)
    .get(`/api/v1/admin/candidates/${ctx.candidateId}/360`)
    .set(auth(ctx.adminToken));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  const data = res.body.data;
  assert.ok(data);
  assert.ok(data.candidate);
  assert.equal(data.candidate.email, "c360-candidate@example.test");
  assert.equal(data.candidate.name, "Priya Sharma");
  assert.equal(data.candidate.headline, "Senior Backend Engineer");
  assert.ok(Array.isArray(data.resumes));
  assert.ok(Array.isArray(data.applications));
  assert.ok(Array.isArray(data.interviews));
  assert.ok(Array.isArray(data.placements));

  const logged = await AuditLog.findOne({
    action: "admin.candidate_360_viewed",
    resourceId: ctx.candidateId,
  });
  assert.ok(logged, "audit log was created");
});
