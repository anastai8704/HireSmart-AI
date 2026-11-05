// Phase 8 authorisation-boundary regression tests. Runs against the test database (CI service container).
// Each assertion is a boundary a regression would silently open: admin access, cross-tenant access, token
// handling, mass assignment, URL schemes, and upload content checks.
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const app = require("../app");
const { config } = require("../config/env");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const Organization = require("../models/Organization");

const PASSWORD = "StrongPassword123!";
const API = "/api/v1";
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const PNG_HEADER = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

const register = async ({ email, intent, organizationName }) => {
  const reg = await request(app).post(`${API}/auth/register`).send({
    email,
    password: PASSWORD,
    displayName: email.split("@")[0],
    accountIntent: intent,
    organizationName,
    termsConsent: true,
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const login = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return {
    token: login.body.data.accessToken,
    orgId: reg.body.data.organization ? String(reg.body.data.organization.id) : null,
  };
};

let candidate;
let recruiterX; // owns organisation X
let recruiterY; // owns unrelated organisation Y

test.before(async () => {
  await startDatabase();
});

test.after(async () => {
  await stopDatabase();
});

test("seed accounts for the boundary checks", async () => {
  await clearDatabase();
  candidate = await register({ email: "bound-candidate@example.test", intent: "candidate" });
  recruiterX = await register({ email: "bound-x@example.test", intent: "recruiter", organizationName: "Boundary X" });
  recruiterY = await register({ email: "bound-y@example.test", intent: "recruiter", organizationName: "Boundary Y" });
  assert.ok(recruiterX.orgId && recruiterY.orgId);
});

test("admin endpoints reject anonymous, candidate, and recruiter callers", async () => {
  const anonymous = await request(app).get(`${API}/admin/users`);
  assert.equal(anonymous.status, 401);

  // Non-admins get 404 so the admin surface is not revealed (same convention as the admin controllers).
  const asCandidate = await request(app).get(`${API}/admin/users`).set(auth(candidate.token));
  assert.equal(asCandidate.status, 404);

  const asRecruiter = await request(app).get(`${API}/admin/users`).set(auth(recruiterX.token));
  assert.equal(asRecruiter.status, 404);
});

test("organisation data is not readable across tenants", async () => {
  const crossTenant = await request(app)
    .get(`${API}/organizations/${recruiterX.orgId}`)
    .set(auth(recruiterY.token))
    .set("X-Organization-Id", recruiterX.orgId);
  assert.ok([403, 404].includes(crossTenant.status), `expected 403/404, got ${crossTenant.status}`);

  const candidateOrg = await request(app)
    .get(`${API}/organizations/${recruiterX.orgId}`)
    .set(auth(candidate.token));
  assert.ok([403, 404].includes(candidateOrg.status), `expected 403/404, got ${candidateOrg.status}`);
});

test("protected endpoints return 401 without a token", async () => {
  const checks = [
    ["get", `${API}/users/me`],
    ["get", `${API}/candidates/me/resumes`],
    ["post", `${API}/organizations`],
    ["get", `${API}/users/me/avatar`],
  ];
  for (const [method, path] of checks) {
    const res = await request(app)[method](path);
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path}`);
  }
});

test("a token signed with alg none is rejected", async () => {
  const forged = jwt.sign(
    { sub: "000000000000000000000001", iss: "hiresmart-api", aud: "hiresmart-web" },
    "",
    { algorithm: "none" },
  );
  const res = await request(app).get(`${API}/users/me`).set(auth(forged));
  assert.equal(res.status, 401);
});

test("a token with a valid signature but the wrong audience is rejected", async () => {
  const wrongAud = jwt.sign({ sub: "000000000000000000000001", iss: "hiresmart-api", aud: "elsewhere" }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
  const res = await request(app).get(`${API}/users/me`).set(auth(wrongAud));
  assert.equal(res.status, 401);
});

test("token refresh without a refresh cookie fails cleanly", async () => {
  const res = await request(app).post(`${API}/auth/token`).send({});
  assert.ok([400, 401, 403].includes(res.status), `expected a client error, got ${res.status}`);
  assert.ok(res.status < 500);
});

test("unknown fields and server-owned fields are refused on organisation create", async () => {
  const res = await request(app)
    .post(`${API}/organizations`)
    .set(auth(recruiterY.token))
    .send({ name: "Mass Assign Attempt", verificationStatus: "verified", riskScore: 0 });
  assert.equal(res.status, 422, JSON.stringify(res.body));
  const created = await Organization.findOne({ name: "Mass Assign Attempt" });
  assert.equal(created, null);
});

test("organisation create rejects javascript: and data: website URLs", async () => {
  for (const website of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"]) {
    const res = await request(app)
      .post(`${API}/organizations`)
      .set(auth(recruiterY.token))
      .send({ name: "Unsafe Website Org", website });
    assert.equal(res.status, 422, `${website} -> ${res.status}`);
  }
});

test("avatar upload rejects bytes that are not an image, whatever the MIME type claims", async () => {
  const res = await request(app)
    .post(`${API}/users/me/avatar`)
    .set(auth(candidate.token))
    .attach("avatar", Buffer.from("<html><script>alert(1)</script></html>"), {
      filename: "photo.png",
      contentType: "image/png",
    });
  assert.equal(res.status, 415, JSON.stringify(res.body));
  assert.equal(res.body.code, "UNSUPPORTED_FILE_TYPE");
});

test("avatar upload accepts a real PNG signature", async () => {
  const res = await request(app)
    .post(`${API}/users/me/avatar`)
    .set(auth(candidate.token))
    .attach("avatar", PNG_HEADER, { filename: "../../evil.html", contentType: "image/png" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
});

test("login gives the same answer for unknown emails and wrong passwords", async () => {
  const unknown = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: "nobody-here@example.test", password: PASSWORD });
  const wrong = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: "bound-candidate@example.test", password: "WrongPassword123!" });
  assert.equal(unknown.status, wrong.status);
  assert.equal(unknown.body.code, wrong.body.code);
  assert.equal(unknown.body.message, wrong.body.message);
});
