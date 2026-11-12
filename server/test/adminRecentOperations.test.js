// Database-backed: admin recent operations (Requirement 7). Runs against MongoDB through test/setup.js.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const emailService = require("../services/emailService");

const originalSendMail = emailService.sendMail;
emailService.sendMail = async () => ({ messageId: "test" });
const PASSWORD = "StrongPassword123!";
const DAY_MS = 24 * 60 * 60 * 1000;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const oid = () => new mongoose.Types.ObjectId();
const ctx = {};

nodeTest.before(async () => {
  await startDatabase();
});
nodeTest.after(async () => {
  emailService.sendMail = originalSendMail;
  await stopDatabase();
});

nodeTest("seed: an admin and a candidate", async () => {
  await clearDatabase();
  const reg = await request(app).post("/api/v1/auth/register").send({
    email: "ops-admin@r7.example",
    password: PASSWORD,
    displayName: "Ops Admin",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  await User.updateOne({ email: "ops-admin@r7.example" }, { $set: { role: "admin", emailVerified: true } });
  const login = await request(app).post("/api/v1/auth/login").send({ email: "ops-admin@r7.example", password: PASSWORD });
  ctx.admin = login.body.data.accessToken;

  const cand = await request(app).post("/api/v1/auth/register").send({
    email: "ops-candidate@r7.example",
    password: PASSWORD,
    displayName: "Ops Candidate",
    accountIntent: "candidate",
    termsConsent: true,
  });
  assert.equal(cand.status, 201, JSON.stringify(cand.body));
  await User.updateOne({ email: "ops-candidate@r7.example" }, { $set: { emailVerified: true } });
  ctx.candidate = (await request(app).post("/api/v1/auth/login").send({ email: "ops-candidate@r7.example", password: PASSWORD })).body.data.accessToken;
});

nodeTest("only platform administrators can read recent operations; others get a 404", async () => {
  const denied = await request(app).get("/api/v1/admin/operations/recent").set(auth(ctx.candidate));
  assert.equal(denied.status, 404);
  assert.equal(denied.body.data, undefined);
  const anonymous = await request(app).get("/api/v1/admin/operations/recent");
  assert.equal(anonymous.status, 401);
});

nodeTest("the five lists are returned; upcoming interviews exclude past and closed ones; payments exclude failed and sandbox", async () => {
  const Interview = require("../models/Interview");
  const { PaymentTransaction } = require("../models/PaymentTransaction");
  const future = new Date(Date.now() + 2 * DAY_MS);
  const past = new Date(Date.now() - 2 * DAY_MS);
  await Interview.collection.insertMany([
    { organization: oid(), job: oid(), application: oid(), candidate: oid(), status: "invited", scheduledStart: future, scheduledEnd: new Date(future.getTime() + 3600e3), createdAt: new Date(), updatedAt: new Date() },
    { organization: oid(), job: oid(), application: oid(), candidate: oid(), status: "cancelled", scheduledStart: future, scheduledEnd: new Date(future.getTime() + 3600e3), createdAt: new Date(), updatedAt: new Date() },
    { organization: oid(), job: oid(), application: oid(), candidate: oid(), status: "invited", scheduledStart: past, scheduledEnd: new Date(past.getTime() + 3600e3), createdAt: new Date(), updatedAt: new Date() },
  ]);
  const base = { subscriberType: "candidate", subscriberId: oid(), planTier: "candidate_plus", amount: 149, currency: "INR", mode: "test", createdAt: new Date(), updatedAt: new Date(), gateway: "razorpay" };
  await PaymentTransaction.collection.insertMany([
    { ...base, transactionNumber: "TXN-R7-1", status: "captured", transactionKey: "k1" },
    { ...base, transactionNumber: "TXN-R7-2", status: "failed", transactionKey: "k2" },
    { ...base, transactionNumber: "TXN-R7-3", status: "captured", gateway: "simulation", transactionKey: "k3" },
  ]);

  const res = await request(app).get("/api/v1/admin/operations/recent").set(auth(ctx.admin));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const data = res.body.data;
  for (const key of ["companies", "jobPostings", "upcomingInterviews", "placementUpdates", "payments"]) {
    assert.ok(Array.isArray(data[key]), `${key} is a list`);
  }
  assert.equal(data.upcomingInterviews.length, 1, "past and cancelled interviews are not upcoming");
  assert.equal(data.upcomingInterviews[0].status, "invited");
  const numbers = data.payments.map((p) => p.transactionNumber);
  assert.deepEqual(numbers, ["TXN-R7-1"], "only captured Razorpay payments are listed as payments");
});
