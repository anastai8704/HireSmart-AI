// Phase 10 report and export tests over HTTP against MongoDB (runs in CI).
// Each expectation is derivable from the fixtures below. No e-mail is sent and no external service is called.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { Membership } = require("../models/Membership");
const { Application } = require("../models/Application");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const emailService = require("../services/emailService");
const { istDayOf } = require("../domain/analyticsDefinitions");

const originalSendMail = emailService.sendMail;
emailService.sendMail = async () => ({ messageId: "test" });
const PASSWORD = "StrongPassword123!";
const API = "/api/v1";
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const ctx = {};
const DAY_MS = 24 * 60 * 60 * 1000;
const { ObjectId } = mongoose.Types;

// Each test has a bounded time so a stalled request fails with a message instead of hanging the file.
const test = (name, fn) => nodeTest(name, { timeout: 120000 }, fn);

const register = async (email, intent, organizationName) => {
  const reg = await withStep(`register ${email}`, () =>
    request(app).post(`${API}/auth/register`).send({
      email,
      password: PASSWORD,
      displayName: email.split("@")[0],
      accountIntent: intent,
      organizationName,
      termsConsent: true,
    }),
  );
  assert.equal(reg.status, 201, `register ${email}: ${JSON.stringify(reg.body)}`);
  await User.updateOne({ _id: reg.body.data.user.id }, { $set: { emailVerified: true } });
  const login = await withStep(`login ${email}`, () => request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD }));
  assert.equal(login.status, 200, `login ${email}: ${JSON.stringify(login.body)}`);
  return {
    token: login.body.data.accessToken,
    userId: reg.body.data.user.id,
    orgId: reg.body.data.organization ? String(reg.body.data.organization.id) : null,
  };
};

// Logs each step to stderr so a CI failure shows where the seed stopped.
const withStep = async (label, fn) => {
  process.stderr.write(`[reports-test] ${label}\n`);
  try {
    return await fn();
  } catch (error) {
    throw new Error(`${label} failed: ${error && error.message}`);
  }
};

let txSeq = 0;
const payment = (status, amount, { createdAt, updatedAt } = {}) => {
  txSeq += 1;
  return PaymentTransaction.collection.insertOne({
    transactionNumber: `TXN-RPT-${txSeq}`,
    subscriberType: "organization",
    subscriberId: new ObjectId(ctx.orgX),
    planTier: "recruiter_pro",
    amount,
    currency: "INR",
    status,
    gateway: "simulation",
    gatewayOrderId: `order-rpt-${txSeq}`,
    createdAt: createdAt || new Date(),
    updatedAt: updatedAt || createdAt || new Date(),
  });
};

nodeTest.before(async () => {
  await startDatabase();
});
nodeTest.after(async () => {
  emailService.sendMail = originalSendMail;
  await stopDatabase();
});

test("seed: an admin, a candidate, recruiter X (owns company X), and recruiter Y (owns company Y)", async () => {
  await clearDatabase();
  const admin = await register("admin@reports.example", "candidate");
  await User.updateOne({ _id: admin.userId }, { $set: { role: "admin" } });
  const login = await request(app).post(`${API}/auth/login`).send({ email: "admin@reports.example", password: PASSWORD });
  ctx.admin = { token: login.body.data.accessToken };
  ctx.candidate = await register("secret-candidate@reports.example", "candidate");
  ctx.recruiterX = await register("x@reports.example", "recruiter", "Reports X");
  ctx.recruiterY = await register("y@reports.example", "recruiter", "Reports Y");
  ctx.orgX = ctx.recruiterX.orgId;
  ctx.orgY = ctx.recruiterY.orgId;
  assert.ok(ctx.orgX && ctx.orgY);
});

test("seed: company-scoped job and application fixtures for X and Y", async () => {
  const now = new Date();
  const jobX = await mongoose.connection.collection("jobs").insertOne({
    organization: new ObjectId(ctx.orgX),
    title: "Backend Engineer X",
    company: "Reports X",
    status: "open",
    moderation: { status: "approved", submittedAt: now, reviewedAt: now },
    createdAt: now,
    updatedAt: now,
  });
  const jobY = await mongoose.connection.collection("jobs").insertOne({
    organization: new ObjectId(ctx.orgY),
    title: "Designer Y",
    company: "Reports Y",
    status: "open",
    moderation: { status: "approved", submittedAt: now, reviewedAt: now },
    createdAt: now,
    updatedAt: now,
  });
  await Application.collection.insertOne({
    organization: new ObjectId(ctx.orgX),
    job: jobX.insertedId,
    candidate: new ObjectId(ctx.candidate.userId),
    status: "shortlisted",
    appliedAt: now,
  });
  await Application.collection.insertOne({
    organization: new ObjectId(ctx.orgY),
    job: jobY.insertedId,
    candidate: new ObjectId(ctx.candidate.userId),
    status: "submitted",
    appliedAt: now,
  });
});

test("authorisation: anonymous, candidate and recruiter callers cannot read platform reports", async () => {
  const anon = await request(app).get(`${API}/admin/reports/revenue?format=csv`);
  assert.equal(anon.status, 401);
  for (const caller of [ctx.candidate, ctx.recruiterX]) {
    const res = await request(app).get(`${API}/admin/reports/revenue?format=csv`).set(auth(caller.token));
    assert.equal(res.status, 404, `${res.status} ${res.text.slice(0, 120)}`);
  }
});

test("authorisation: organisation reports are refused to candidates, cross-tenant members, and for platform-only types", async () => {
  const candidate = await request(app).get(`${API}/organizations/${ctx.orgX}/reports/applications`).set(auth(ctx.candidate.token));
  assert.ok([403, 404].includes(candidate.status), `candidate ${candidate.status}`);
  const crossTenant = await request(app).get(`${API}/organizations/${ctx.orgX}/reports/applications`).set(auth(ctx.recruiterY.token));
  assert.ok([403, 404].includes(crossTenant.status), `cross-tenant ${crossTenant.status}`);
  const platformOnly = await request(app).get(`${API}/organizations/${ctx.orgX}/reports/revenue`).set(auth(ctx.recruiterX.token));
  assert.equal(platformOnly.status, 404);
});

test("validation: unknown report types, bad formats and bad date ranges are rejected", async () => {
  const unknown = await request(app).get(`${API}/admin/reports/passwords`).set(auth(ctx.admin.token));
  assert.equal(unknown.status, 404);
  const badFormat = await request(app).get(`${API}/admin/reports/revenue?format=xlsx`).set(auth(ctx.admin.token));
  assert.equal(badFormat.status, 422, JSON.stringify(badFormat.body));
  const badRange = await request(app).get(`${API}/admin/reports/revenue?range=custom&from=2026-11-05&to=2026-11-01`).set(auth(ctx.admin.token));
  assert.equal(badRange.status, 400);
  assert.equal(badRange.body.error?.code || badRange.body.code, "INVALID_RANGE");
});

test("revenue export: totals row matches the admin overview KPIs for the same range", async () => {
  const now = Date.now();
  await payment("captured", 1000, { createdAt: new Date(now - 2 * DAY_MS) });
  await payment("refunded", 200, { createdAt: new Date(now - 3 * DAY_MS), updatedAt: new Date(now - 1 * DAY_MS) });
  await payment("failed", 500, { createdAt: new Date(now - 2 * DAY_MS) });
  await payment("initiated", 300, { createdAt: new Date(now - 2 * DAY_MS) });

  const overview = await request(app).get(`${API}/admin/analytics/overview?range=30d`).set(auth(ctx.admin.token));
  assert.equal(overview.status, 200, JSON.stringify(overview.body));
  const kpis = overview.body.data.kpis;

  const json = await request(app).get(`${API}/admin/reports/revenue?range=30d`).set(auth(ctx.admin.token));
  assert.equal(json.status, 200, JSON.stringify(json.body));
  const total = json.body.data.rows.find((r) => r.date === "TOTAL");
  assert.ok(total, "totals row present");
  assert.equal(total.netRevenue, kpis.revenue);
  assert.equal(total.successfulPayments, kpis.successfulPayments);
  assert.equal(total.failedPayments, kpis.failedPayments);
  assert.equal(total.refunds, 200);
  assert.equal(total.grossCaptured, 1200);
  assert.equal(total.netRevenue, 1000);
});

test("CSV export: download headers, IST-labelled columns, and a header row that matches the JSON columns", async () => {
  const res = await request(app).get(`${API}/admin/reports/revenue?range=30d&format=csv`).set(auth(ctx.admin.token));
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /^text\/csv/);
  assert.match(res.headers["content-disposition"], /^attachment; filename="hiresmart-revenue-/);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["cache-control"], "no-store");
  const [header] = res.text.split("\r\n");
  assert.equal(header, "Date (IST),Gross captured (INR),Refunds (INR),Net revenue (INR),Successful payments,Failed payments");
  assert.ok(res.text.trimEnd().split("\r\n").pop().startsWith("TOTAL,"));
});

test("personal data: candidate registration exports contain counts only, never a candidate's name or e-mail", async () => {
  const res = await request(app).get(`${API}/admin/reports/candidate_registrations?range=30d&format=csv`).set(auth(ctx.admin.token));
  assert.equal(res.status, 200);
  assert.equal(res.text.includes("@"), false, "an e-mail address leaked into the export");
  assert.equal(res.text.includes("secret-candidate"), false);
  assert.equal(res.text.split("\r\n")[0], "Date (IST),New candidate accounts");
});

test("company scope: recruiter X sees only company X's applications and cannot see company Y's", async () => {
  const res = await request(app).get(`${API}/organizations/${ctx.orgX}/reports/applications?range=30d`).set(auth(ctx.recruiterX.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const titles = res.body.data.rows.map((r) => r.jobTitle);
  assert.deepEqual(titles, ["Backend Engineer X"]);
  assert.equal(JSON.stringify(res.body).includes("Designer Y"), false);
  assert.equal(JSON.stringify(res.body).includes("secret-candidate"), false);

  const csv = await request(app).get(`${API}/organizations/${ctx.orgX}/reports/applications?range=30d&format=csv`).set(auth(ctx.recruiterX.token));
  assert.equal(csv.status, 200);
  assert.equal(csv.text.includes("Designer Y"), false, "company Y leaked into company X's CSV");
  assert.match(csv.text, /Backend Engineer X/);

  const pipeline = await request(app).get(`${API}/organizations/${ctx.orgX}/reports/hiring_pipeline?range=30d`).set(auth(ctx.recruiterX.token));
  assert.equal(pipeline.status, 200);
  assert.deepEqual(pipeline.body.data.rows, [{ stage: "shortlisted", applications: 1 }]);
});

test("formula injection: a company name starting with '=' is neutralised in the company export", async () => {
  await register("evil@reports.example", "recruiter", "=HYPERLINK(\"http://evil.example\")");
  const res = await request(app).get(`${API}/admin/reports/company_verification?range=30d&format=csv`).set(auth(ctx.admin.token));
  assert.equal(res.status, 200);
  for (const line of res.text.split("\r\n")) {
    assert.equal(/(^|,)=/.test(line), false, `unneutralised formula cell: ${line}`);
  }
  assert.ok(res.text.includes("'=HYPERLINK"), "expected the neutralised form");
});

test("audit: every CSV export is recorded with actor and row count, and holds no personal data", async () => {
  const entries = await AuditLog.find({ action: "report.exported" }).lean();
  assert.ok(entries.length >= 4, `expected export audit rows, got ${entries.length}`);
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes("secret-candidate"), false);
  assert.equal(serialized.includes("PASSWORD"), false);
  assert.ok(entries.every((e) => e.actor && typeof e.metadata?.rowCount === "number"));
  const orgExport = entries.find((e) => String(e.organization) === ctx.orgX && e.resourceId === "applications");
  assert.ok(orgExport, "the organisation export is attributed to its organisation");
  assert.equal(String(orgExport.actor), ctx.recruiterX.userId);
  const platformExport = entries.find((e) => e.organization === null && e.resourceId === "revenue");
  assert.ok(platformExport, "platform exports are recorded without an organisation");
});

test("JSON reports carry the timezone and the resolved date range", async () => {
  const today = istDayOf(new Date());
  const res = await request(app)
    .get(`${API}/admin/reports/platform_activity?range=custom&from=${today}&to=${today}`)
    .set(auth(ctx.admin.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.timezone, "Asia/Kolkata");
  assert.deepEqual(res.body.data.range, { preset: "custom", from: today, to: today });
  assert.ok(res.body.data.generatedAt);
});

test("membership is still required: a removed member loses organisation report access", async () => {
  await Membership.updateMany({ organization: ctx.orgX, user: ctx.recruiterX.userId }, { $set: { status: "removed" } });
  const res = await request(app).get(`${API}/organizations/${ctx.orgX}/reports/applications`).set(auth(ctx.recruiterX.token));
  assert.ok([403, 404].includes(res.status), `expected refusal, got ${res.status}`);
});
