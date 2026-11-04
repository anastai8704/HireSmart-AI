// Phase 2 company verification, end to end over HTTP against MongoDB (runs in CI).
// The registry and the outbound email are mocked; no external service is called.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const AuditLog = require("../models/AuditLog");
const { Membership } = require("../models/Membership");
const { CompanyVerificationCase } = require("../models/CompanyVerificationCase");
const { JobModerationEvent } = require("../models/JobModerationEvent");
const emailService = require("../services/emailService");
const registry = require("../services/registryProvider");

const PASSWORD = "StrongPassword123!";
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// ---------------------------------------------------------------------------
// Mocks: the email sender records messages so tests can read the one-time code; the registry is
// injected per test. Nothing leaves the process.
// ---------------------------------------------------------------------------
const sentMail = [];
const originalSendMail = emailService.sendMail;
emailService.sendMail = async (message) => {
  sentMail.push(message);
  return { messageId: "test" };
};
const codeSentTo = (email) => {
  const message = [...sentMail].reverse().find((item) => item.to === email);
  assert.ok(message, `no code was sent to ${email}`);
  const match = /code is: (\S+)/.exec(message.text);
  assert.ok(match, "the code email must contain the code");
  return match[1];
};
const registryReturns = (answer) => registry.setRegistryProvider(async () => answer);
const registryMatchesName = () =>
  registry.setRegistryProvider(async (query) => ({ status: "found", legalName: query.legalName }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const registerAndLogin = async ({ email, intent, organizationName, emailVerified = true }) => {
  const registration = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: PASSWORD,
      displayName: email.split("@")[0],
      accountIntent: intent,
      organizationName,
      termsConsent: true,
    });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  await User.updateOne({ _id: registration.body.data.user.id }, { $set: { emailVerified } });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return {
    token: login.body.data.accessToken,
    userId: registration.body.data.user.id,
    organization: registration.body.data.organization,
  };
};

const companyDetails = (overrides = {}) => ({
  businessEmail: "hr@acme-verify.example",
  website: "https://www.acme-verify.example",
  phone: "+91 20 5550 1234",
  businessType: "private_limited",
  registrationNumber: "U72900MH2020PTC000001",
  gstin: "27AABCA1234F1Z5",
  address: { street: "1 Park Road", city: "Pune", state: "Maharashtra", pincode: "411001", country: "India" },
  authorizedRepresentative: { name: "Asha Rao", designation: "HR Head" },
  consent: { accepted: true },
  ...overrides,
});

const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("1 0 obj << /Type /Catalog >> endobj\n")]);

const jobPayload = (title) => ({
  title,
  company: "Verification Test Co",
  location: "Pune",
  experience: "2+ years",
  jobType: "Full-Time",
  workplaceMode: "hybrid",
  description: "A role used to test that company verification gates publishing.",
  requiredSkills: ["Node.js"],
});

const submit = (token, orgId, body) =>
  request(app).post(`/api/v1/organizations/${orgId}/verification`).set(auth(token)).send(body);

const confirmEmail = async (token, orgId, email) => {
  const sent = await request(app)
    .post(`/api/v1/organizations/${orgId}/verification/business-email`)
    .set(auth(token));
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const confirmed = await request(app)
    .post(`/api/v1/organizations/${orgId}/verification/business-email/confirm`)
    .set(auth(token))
    .send({ code: codeSentTo(email) });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  return confirmed;
};

const adminCase = (adminToken, caseId) =>
  request(app).get(`/api/v1/admin/verification/cases/${caseId}`).set(auth(adminToken));

const ctx = {};

test.before(async () => {
  await startDatabase();
});
test.after(async () => {
  emailService.sendMail = originalSendMail;
  registry.setRegistryProvider(null);
  // Remove stored document bytes written by this file. Only keys referenced by the database are removed.
  const orgs = await Organization.find({ "documents.0": { $exists: true } }).select("documents.storageKey").lean();
  for (const org of orgs) {
    for (const doc of org.documents) {
      const file = path.join(__dirname, "..", "uploads", "verification", path.basename(doc.storageKey));
      fs.rmSync(file, { force: true });
    }
  }
  await stopDatabase();
});

test("seed: a platform admin, a candidate and four recruiter companies", async () => {
  await clearDatabase();
  const admin = await registerAndLogin({ email: "admin@verify.example", intent: "candidate" });
  await User.updateOne({ _id: admin.userId }, { $set: { role: "admin" } });
  ctx.admin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "admin@verify.example", password: PASSWORD })
    .then((r) => ({ token: r.body.data.accessToken, userId: admin.userId }));

  ctx.candidate = await registerAndLogin({ email: "candidate@verify.example", intent: "candidate" });
  ctx.acme = await registerAndLogin({ email: "owner@acme-verify.example", intent: "recruiter", organizationName: "Acme Verify Pvt Ltd" });
  ctx.acme.orgId = ctx.acme.organization.id;
  ctx.beta = await registerAndLogin({ email: "owner@beta-verify.example", intent: "recruiter", organizationName: "Beta Systems Pvt Ltd" });
  ctx.beta.orgId = ctx.beta.organization.id;
  ctx.gamma = await registerAndLogin({ email: "owner@gamma-verify.example", intent: "recruiter", organizationName: "Gamma Labs Pvt Ltd" });
  ctx.gamma.orgId = ctx.gamma.organization.id;
  ctx.delta = await registerAndLogin({ email: "owner@delta-verify.example", intent: "recruiter", organizationName: "Delta Analytics Pvt Ltd" });
  ctx.delta.orgId = ctx.delta.organization.id;
  assert.equal(ctx.acme.organization.verificationStatus ?? "pending", "pending");
});

// --- verified success -----------------------------------------------------------------------

test("verified success: passing evidence lets an admin verify the company, and it may publish", async () => {
  const submitted = await submit(ctx.acme.token, ctx.acme.orgId, companyDetails({ businessEmail: "hr@acme-verify.example" }));
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.data.case.status, "under_review");
  ctx.acme.caseId = submitted.body.data.case.id;

  await confirmEmail(ctx.acme.token, ctx.acme.orgId, "hr@acme-verify.example");
  registryMatchesName();
  const registryCheck = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.acme.caseId}/registry-check`)
    .set(auth(ctx.admin.token));
  assert.equal(registryCheck.status, 200, JSON.stringify(registryCheck.body));
  assert.equal(registryCheck.body.data.result, "match");

  const approved = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.acme.caseId}/approve`)
    .set(auth(ctx.admin.token))
    .send({ notes: "Registry name matches; domain owner confirmed." });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));

  const org = await Organization.findById(ctx.acme.orgId);
  assert.equal(org.verificationStatus, "verified");

  const job = await request(app).post(`/api/v1/organizations/${ctx.acme.orgId}/jobs`).set(auth(ctx.acme.token)).send(jobPayload("Verified Role"));
  assert.equal(job.status, 201, JSON.stringify(job.body));
  const published = await request(app)
    .post(`/api/v1/organizations/${ctx.acme.orgId}/jobs/${job.body.data.id}/publish`)
    .set(auth(ctx.acme.token));
  assert.equal(published.status, 200, "a verified company can publish");
  ctx.acme.jobId = job.body.data.id;
});

test("recruiter view shows status and pending checks, never internal evidence or risk", async () => {
  const view = await request(app).get(`/api/v1/organizations/${ctx.acme.orgId}/verification`).set(auth(ctx.acme.token));
  assert.equal(view.status, 200);
  const body = JSON.stringify(view.body);
  for (const forbidden of ["riskScore", "riskFlags", "riskIndicators", "storageKey", "verificationNotes", "normalizedGstin", "businessEmailTokenHash"]) {
    assert.ok(!body.includes(forbidden), `recruiter view must not include ${forbidden}`);
  }
  assert.equal(view.body.data.case.status, "verified");
});

// --- suspension restricts listings; restore does not reopen them -----------------------------

test("suspension closes live listings, blocks publishing, and restore does not reopen listings", async () => {
  const suspended = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.acme.caseId}/suspend`)
    .set(auth(ctx.admin.token))
    .send({ reason: "Complaints about job postings are under investigation" });
  assert.equal(suspended.status, 200, JSON.stringify(suspended.body));
  assert.ok(suspended.body.data.listingsClosed >= 1);

  const job = await Job.findById(ctx.acme.jobId);
  assert.equal(job.status, "closed", "suspension must close the live listing");
  const events = await JobModerationEvent.find({ job: ctx.acme.jobId, toStatus: "closed" }).lean();
  assert.equal(events.length, 1);
  assert.equal(events[0].reason, "company_suspended");

  const blocked = await request(app)
    .post(`/api/v1/organizations/${ctx.acme.orgId}/jobs`)
    .set(auth(ctx.acme.token))
    .send(jobPayload("Suspended Company Role"));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "ORGANIZATION_NOT_VERIFIED");

  const restored = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.acme.caseId}/restore`)
    .set(auth(ctx.admin.token))
    .send({ reason: "Complaint resolved" });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.data.listingsStillClosed >= 1, true, "closed listings are not reopened automatically");
  assert.equal((await Job.findById(ctx.acme.jobId)).status, "closed");
});

// --- mismatch, missing evidence, unavailable service, manual review ---------------------------

test("registration mismatch blocks approval and is recorded as a mismatch", async () => {
  const submitted = await submit(ctx.beta.token, ctx.beta.orgId, companyDetails({
    businessEmail: "hr@beta-verify.example",
    website: "https://beta-verify.example",
    registrationNumber: "U72900MH2020PTC000002",
    gstin: "27AABCB1234F1Z6",
  }));
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  ctx.beta.caseId = submitted.body.data.case.id;
  await confirmEmail(ctx.beta.token, ctx.beta.orgId, "hr@beta-verify.example");

  registryReturns({ status: "found", legalName: "Unrelated Trading Co" });
  const check = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.beta.caseId}/registry-check`)
    .set(auth(ctx.admin.token));
  assert.equal(check.body.data.result, "mismatch");

  const approve = await request(app).post(`/api/v1/admin/verification/cases/${ctx.beta.caseId}/approve`).set(auth(ctx.admin.token)).send({});
  assert.equal(approve.status, 409);
  assert.equal(approve.body.code, "VERIFICATION_REQUIREMENTS_NOT_MET");
  assert.ok(approve.body.fieldErrors.some((e) => e.path === "business_registration" && e.code === "blocking"));
  assert.equal((await Organization.findById(ctx.beta.orgId)).verificationStatus, "under_review");
});

test("missing evidence blocks approval and the case lists what is missing", async () => {
  const submitted = await submit(ctx.gamma.token, ctx.gamma.orgId, companyDetails({
    businessEmail: "hr@gamma-verify.example",
    website: "https://gamma-verify.example",
    registrationNumber: "U72900MH2020PTC000003",
    gstin: "27AABCG1234F1Z3",
  }));
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  ctx.gamma.caseId = submitted.body.data.case.id;

  const detail = await adminCase(ctx.admin.token, ctx.gamma.caseId);
  assert.equal(detail.status, 200);
  assert.ok(detail.body.data.case.manualVerificationRequired);
  assert.ok(detail.body.data.case.riskDisclaimer.includes("not proof of fraud"));

  const approve = await request(app).post(`/api/v1/admin/verification/cases/${ctx.gamma.caseId}/approve`).set(auth(ctx.admin.token)).send({});
  assert.equal(approve.status, 409);
  assert.ok(approve.body.fieldErrors.some((e) => e.path === "business_email" && e.code === "missing"));
});

test("unavailable external service: the case waits for manual verification and is never auto-verified", async () => {
  // No provider configured: the default lookup is "unavailable".
  registry.setRegistryProvider(null);
  const check = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.gamma.caseId}/registry-check`)
    .set(auth(ctx.admin.token));
  assert.equal(check.status, 200);
  assert.equal(check.body.data.result, "unavailable");
  assert.equal(check.body.data.registryStatus, "unavailable");
  assert.match(check.body.data.note, /Manual verification required/);

  const detail = await adminCase(ctx.admin.token, ctx.gamma.caseId);
  assert.equal(detail.body.data.case.assessment, "unavailable_evidence");
  assert.match(detail.body.data.case.recommendedNextAction, /Manual verification required|Resolve/);
  const recruiterView = await request(app).get(`/api/v1/organizations/${ctx.gamma.orgId}/verification`).set(auth(ctx.gamma.token));
  assert.equal(recruiterView.body.data.case.manualVerificationRequired, true);
});

test("a documented manual review of a check is recorded as manual, with the reviewer note", async () => {
  const note = "Checked the MCA portal printout uploaded by the company against the form.";
  const recorded = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.gamma.caseId}/checks`)
    .set(auth(ctx.admin.token))
    .send({ type: "business_registration", result: "match", note });
  assert.equal(recorded.status, 200, JSON.stringify(recorded.body));

  const detail = await adminCase(ctx.admin.token, ctx.gamma.caseId);
  const evidence = detail.body.data.case.evidence.find((item) => item.type === "business_registration" && item.result === "match");
  assert.ok(evidence, "manual evidence is stored");
  assert.equal(evidence.method, "manual_review");
  assert.equal(evidence.note, note);
});

test("business email cannot be confirmed by a reviewer, only by the code sent to the address", async () => {
  const check = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.gamma.caseId}/checks`)
    .set(auth(ctx.admin.token))
    .send({ type: "business_email", result: "match", note: "I looked at the address and it looks right." });
  assert.equal(check.status, 422);
  assert.equal(check.body.code, "CHECK_NOT_MANUAL");
});

test("one-time code: a wrong code is refused and a used code cannot be reused", async () => {
  const sent = await request(app).post(`/api/v1/organizations/${ctx.gamma.orgId}/verification/business-email`).set(auth(ctx.gamma.token));
  assert.equal(sent.status, 200);
  const wrong = await request(app)
    .post(`/api/v1/organizations/${ctx.gamma.orgId}/verification/business-email/confirm`)
    .set(auth(ctx.gamma.token))
    .send({ code: "not-the-code-at-all" });
  assert.equal(wrong.status, 422);
  assert.equal(wrong.body.code, "INVALID_CODE");

  const right = await request(app)
    .post(`/api/v1/organizations/${ctx.gamma.orgId}/verification/business-email/confirm`)
    .set(auth(ctx.gamma.token))
    .send({ code: codeSentTo("hr@gamma-verify.example") });
  assert.equal(right.status, 200);

  const again = await request(app)
    .post(`/api/v1/organizations/${ctx.gamma.orgId}/verification/business-email/confirm`)
    .set(auth(ctx.gamma.token))
    .send({ code: codeSentTo("hr@gamma-verify.example") });
  assert.equal(again.body.data.alreadyVerified, true, "a confirmed address does not accept a second confirmation");

  const org = await Organization.findById(ctx.gamma.orgId).select("+businessEmailTokenHash").lean();
  assert.equal(org.businessEmailTokenHash, undefined, "the one-time code is removed once used");
});

// --- recruiter identity pending ---------------------------------------------------------------

test("recruiter identity pending blocks approval until the recruiter's own email is verified", async () => {
  // Delta's owner (the recruiter who opened the case) has not verified their own email yet.
  await User.updateOne({ _id: ctx.delta.userId }, { $set: { emailVerified: false } });
  const submitted = await submit(ctx.delta.token, ctx.delta.orgId, companyDetails({
    businessEmail: "hr@delta-verify.example",
    website: "https://delta-verify.example",
    registrationNumber: "U72900MH2020PTC000004",
    gstin: "27AABCD1234F1Z1",
  }));
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  ctx.delta.caseId = submitted.body.data.case.id;
  const pending = await request(app).get(`/api/v1/organizations/${ctx.delta.orgId}/verification`).set(auth(ctx.delta.token));
  assert.ok(pending.body.data.case.pendingChecks.includes("recruiter_identity"), "the recruiter sees the pending check");

  await confirmEmail(ctx.delta.token, ctx.delta.orgId, "hr@delta-verify.example");
  registryMatchesName();
  await request(app).post(`/api/v1/admin/verification/cases/${ctx.delta.caseId}/registry-check`).set(auth(ctx.admin.token));

  const blocked = await request(app).post(`/api/v1/admin/verification/cases/${ctx.delta.caseId}/approve`).set(auth(ctx.admin.token)).send({});
  assert.equal(blocked.status, 409);
  assert.ok(blocked.body.fieldErrors.some((e) => e.path === "recruiter_identity"));

  await User.updateOne({ _id: ctx.delta.userId }, { $set: { emailVerified: true } });
  const approved = await request(app).post(`/api/v1/admin/verification/cases/${ctx.delta.caseId}/approve`).set(auth(ctx.admin.token)).send({});
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
});

// --- duplicate detection --------------------------------------------------------------------------

test("duplicate detection: a company reusing a verified company's registration is flagged for review, not restricted", async () => {
  const dupe = await registerAndLogin({ email: "owner@dupe-check.example", intent: "recruiter", organizationName: "Dupe Check Ltd" });
  const submitted = await submit(dupe.token, dupe.organization.id, companyDetails({
    businessEmail: "hr@dupe-check.example",
    website: "https://dupe-check.example",
    registrationNumber: "U72900MH2020PTC000001", // same as Acme Verify
    gstin: "27AABCA1234F1Z5",
  }));
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  ctx.dupe = { ...dupe, caseId: submitted.body.data.case.id };

  const detail = await adminCase(ctx.admin.token, ctx.dupe.caseId);
  assert.ok(detail.body.data.case.duplicateCandidates.length >= 1, "the duplicate is listed");
  assert.ok(detail.body.data.case.duplicateCandidates[0].reasons.includes("registration"));
  const indicator = detail.body.data.case.riskIndicators.find((item) => item.code === "DUPLICATE_REGISTRATION");
  assert.ok(indicator, "a duplicate registration indicator is shown");
  assert.match(indicator.explanation, /.+/);
  assert.equal(detail.body.data.case.riskIndicators.length > 0, true);

  // The dupe company is not restricted by the signal alone: its status stays under review.
  assert.equal((await Organization.findById(dupe.organization.id)).verificationStatus, "under_review");
  const approve = await request(app).post(`/api/v1/admin/verification/cases/${ctx.dupe.caseId}/approve`).set(auth(ctx.admin.token)).send({});
  assert.equal(approve.status, 409, "a duplicate must be cleared by a reviewer before approval");
});

// --- rejection, blocked publishing, resubmission ---------------------------------------------------

test("a rejected company cannot create or publish jobs, and resubmission reopens review", async () => {
  const rejected = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.beta.caseId}/reject`)
    .set(auth(ctx.admin.token))
    .send({ reason: "The registration number could not be confirmed." });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));

  const view = await request(app).get(`/api/v1/organizations/${ctx.beta.orgId}/verification`).set(auth(ctx.beta.token));
  assert.equal(view.body.data.organization.verificationStatus, "rejected");
  assert.equal(view.body.data.case.decisionReason, "The registration number could not be confirmed.");

  const create = await request(app).post(`/api/v1/organizations/${ctx.beta.orgId}/jobs`).set(auth(ctx.beta.token)).send(jobPayload("Rejected Co Role"));
  assert.equal(create.status, 403);
  assert.equal(create.body.code, "ORGANIZATION_NOT_VERIFIED");

  const resubmitted = await submit(ctx.beta.token, ctx.beta.orgId, companyDetails({
    businessEmail: "hr@beta-verify.example",
    website: "https://beta-verify.example",
    registrationNumber: "U72900MH2020PTC000002",
    gstin: "27AABCB1234F1Z6",
  }));
  assert.equal(resubmitted.status, 200, JSON.stringify(resubmitted.body));
  assert.equal(resubmitted.body.data.case.status, "under_review");
  assert.notEqual(resubmitted.body.data.case.id, ctx.beta.caseId, "resubmission opens a new case");

  const previous = await CompanyVerificationCase.findById(ctx.beta.caseId).lean();
  assert.equal(previous.status, "rejected");
  assert.ok(previous.statusHistory.some((entry) => entry.from === "under_review" && entry.to === "rejected"));
});

// --- requests for changes -------------------------------------------------------------------------

test("request for changes is shown to the recruiter and cleared on resubmission", async () => {
  const asked = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.gamma.caseId}/request-changes`)
    .set(auth(ctx.admin.token))
    .send({ items: ["Upload the incorporation certificate", "Confirm the registered address"] });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));

  const view = await request(app).get(`/api/v1/organizations/${ctx.gamma.orgId}/verification`).set(auth(ctx.gamma.token));
  assert.deepEqual(view.body.data.case.changeRequest.items, ["Upload the incorporation certificate", "Confirm the registered address"]);

  const approveWhileOpen = await request(app).post(`/api/v1/admin/verification/cases/${ctx.gamma.caseId}/approve`).set(auth(ctx.admin.token)).send({});
  assert.equal(approveWhileOpen.status, 409);
  assert.equal(approveWhileOpen.body.code, "CHANGES_PENDING");

  const resubmitted = await submit(ctx.gamma.token, ctx.gamma.orgId, companyDetails({
    businessEmail: "hr@gamma-verify.example",
    website: "https://gamma-verify.example",
    registrationNumber: "U72900MH2020PTC000003",
    gstin: "27AABCG1234F1Z3",
  }));
  assert.equal(resubmitted.status, 200, JSON.stringify(resubmitted.body));
  assert.equal(resubmitted.body.data.case.changeRequest, null, "the change request is cleared on resubmission");
});

// --- unauthorized actions ---------------------------------------------------------------------

test("unauthorized verification actions are refused", async () => {
  const candidateQueue = await request(app).get("/api/v1/admin/verification/cases").set(auth(ctx.candidate.token));
  assert.equal(candidateQueue.status, 404, "the admin queue is invisible to non-admins");

  const recruiterApprove = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.gamma.caseId}/approve`)
    .set(auth(ctx.gamma.token))
    .send({});
  assert.equal(recruiterApprove.status, 404, "recruiters cannot decide verification");

  const recruiterSuspend = await request(app)
    .post(`/api/v1/admin/verification/cases/${ctx.gamma.caseId}/suspend`)
    .set(auth(ctx.gamma.token))
    .send({ reason: "Trying to suspend a competitor" });
  assert.equal(recruiterSuspend.status, 404);

  const outsiderSubmit = await submit(ctx.candidate.token, ctx.gamma.orgId, companyDetails());
  assert.ok(outsiderSubmit.status >= 400, "a non-member cannot submit for the company");
  assert.notEqual(outsiderSubmit.status, 200);

  const forgedStatus = await request(app)
    .patch(`/api/v1/organizations/${ctx.gamma.orgId}`)
    .set(auth(ctx.gamma.token))
    .send({ name: "Gamma Labs", verificationStatus: "verified" });
  assert.equal(forgedStatus.status, 422, "a recruiter cannot set verification fields through the profile");
  assert.equal((await Organization.findById(ctx.gamma.orgId)).verificationStatus, "under_review");
});

test("a reviewer who belongs to the company cannot decide on it", async () => {
  await Membership.create({ organization: ctx.gamma.orgId, user: ctx.admin.userId, role: "member", status: "active" });
  const approve = await request(app).post(`/api/v1/admin/verification/cases/${ctx.gamma.caseId}/approve`).set(auth(ctx.admin.token)).send({});
  assert.equal(approve.status, 403);
  assert.equal(approve.body.code, "REVIEWER_CONFLICT");
  await Membership.deleteOne({ organization: ctx.gamma.orgId, user: ctx.admin.userId });
});

test("a company suspended before any case exists is refused with a clear message, not silently changed", async () => {
  const legacy = await registerAndLogin({ email: "owner@legacy-verify.example", intent: "recruiter", organizationName: "Legacy Verify Ltd" });
  await Organization.updateOne({ _id: legacy.organization.id }, { $set: { verificationStatus: "verified", verifiedAt: new Date() } });
  const suspend = await request(app)
    .post(`/api/v1/admin/organizations/${legacy.organization.id}/suspend`)
    .set(auth(ctx.admin.token))
    .send({ reason: "Test" });
  assert.equal(suspend.status, 409);
  assert.equal(suspend.body.code, "VERIFICATION_CASE_MISSING");
  assert.equal((await Organization.findById(legacy.organization.id)).verificationStatus, "verified");
});

// --- documents --------------------------------------------------------------------------------------

test("documents: valid PDF is stored privately; mismatched, oversized and unknown files are refused", async () => {
  const uploaded = await request(app)
    .post(`/api/v1/organizations/${ctx.gamma.orgId}/verification/documents`)
    .set(auth(ctx.gamma.token))
    .field("documentType", "incorporation_certificate")
    .attach("file", PDF_BYTES, { filename: "../../incorporation.pdf", contentType: "application/pdf" });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  assert.equal(uploaded.body.data.fileName, "incorporation.pdf", "the file name is reduced to a safe base name");
  assert.equal(uploaded.body.data.storageKey, undefined, "the storage key is never returned");
  ctx.documentId = uploaded.body.data.id;

  const mismatched = await request(app)
    .post(`/api/v1/organizations/${ctx.gamma.orgId}/verification/documents`)
    .set(auth(ctx.gamma.token))
    .field("documentType", "gst_certificate")
    .attach("file", Buffer.from("<html>not a pdf</html>"), { filename: "fake.pdf", contentType: "application/pdf" });
  assert.equal(mismatched.status, 415);

  const script = await request(app)
    .post(`/api/v1/organizations/${ctx.gamma.orgId}/verification/documents`)
    .set(auth(ctx.gamma.token))
    .field("documentType", "gst_certificate")
    .attach("file", Buffer.from("#!/bin/sh\necho hi"), { filename: "run.sh", contentType: "text/x-sh" });
  assert.equal(script.status, 415, "a script is refused, whatever its name");

  const big = Buffer.alloc(5 * 1024 * 1024 + 10);
  PDF_BYTES.copy(big, 0);
  const oversized = await request(app)
    .post(`/api/v1/organizations/${ctx.gamma.orgId}/verification/documents`)
    .set(auth(ctx.gamma.token))
    .field("documentType", "gst_certificate")
    .attach("file", big, { filename: "big.pdf", contentType: "application/pdf" });
  assert.equal(oversized.status, 413);
});

test("documents are never public: only an admin can download them, and the static path serves nothing", async () => {
  const asRecruiter = await request(app).get(`/api/v1/admin/verification/documents/${ctx.documentId}`).set(auth(ctx.gamma.token));
  assert.equal(asRecruiter.status, 404);
  const asCandidate = await request(app).get(`/api/v1/admin/verification/documents/${ctx.documentId}`).set(auth(ctx.candidate.token));
  assert.equal(asCandidate.status, 404);

  const asAdmin = await request(app)
    .get(`/api/v1/admin/verification/documents/${ctx.documentId}`)
    .set(auth(ctx.admin.token))
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.headers["content-type"], "application/pdf");
  assert.equal(asAdmin.headers["x-content-type-options"], "nosniff");
  assert.ok(Buffer.from(asAdmin.body).equals(PDF_BYTES));

  const direct = await request(app).get("/uploads/verification/anything.bin");
  assert.equal(direct.status, 404, "uploaded files are not served as static files");
});

// --- risk explanations -----------------------------------------------------------------------------

test("risk explanations: a webmail address is an explained indicator, and it blocks only the code step", async () => {
  const webmail = await registerAndLogin({ email: "owner@webmail-check.example", intent: "recruiter", organizationName: "Webmail Check Ltd" });
  const submitted = await submit(webmail.token, webmail.organization.id, companyDetails({
    businessEmail: "owner.person@gmail.com",
    website: "https://webmail-check.example",
    registrationNumber: "U72900MH2020PTC000009",
    gstin: "27AABCW1234F1Z8",
  }));
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  ctx.webmail = { ...webmail, caseId: submitted.body.data.case.id };

  const codeStep = await request(app).post(`/api/v1/organizations/${webmail.organization.id}/verification/business-email`).set(auth(webmail.token));
  assert.equal(codeStep.status, 422);
  assert.equal(codeStep.body.code, "CORPORATE_EMAIL_REQUIRED");

  const detail = await adminCase(ctx.admin.token, ctx.webmail.caseId);
  const indicator = detail.body.data.case.riskIndicators.find((item) => item.code === "FREE_WEBMAIL_DOMAIN");
  assert.ok(indicator);
  assert.match(indicator.explanation, /not proof/);
  assert.equal(detail.body.data.case.riskIndicators.every((item) => item.explanation && item.code), true);
  assert.equal(detail.body.data.case.status, "under_review", "a risk indicator never changes the status on its own");
});

test("admins see the risk summary on the company page; recruiters do not", async () => {
  const forAdmin = await request(app)
    .get(`/api/v1/admin/organizations/${ctx.webmail.organization.id}/verification`)
    .set(auth(ctx.admin.token));
  assert.equal(forAdmin.status, 200, JSON.stringify(forAdmin.body));
  assert.ok(Array.isArray(forAdmin.body.data.organization.riskFlags));
  assert.equal(typeof forAdmin.body.data.organization.riskScore, "number");
  assert.ok(forAdmin.body.data.verificationCase, "the admin view includes the current case");

  const forRecruiter = await request(app).get(`/api/v1/organizations/${ctx.webmail.organization.id}`).set(auth(ctx.webmail.token));
  assert.equal(forRecruiter.status, 200);
  assert.equal(forRecruiter.body.data.riskFlags, undefined);
  assert.equal(forRecruiter.body.data.riskScore, undefined);
});


// --- audit history -----------------------------------------------------------------------------------

test("verification audit history records reviewer, previous and new status, reason and time", async () => {
  const org = ctx.acme.orgId;
  const caseDoc = await CompanyVerificationCase.findById(ctx.acme.caseId).lean();
  const transitions = caseDoc.statusHistory.map((entry) => `${entry.from}->${entry.to}`);
  assert.ok(transitions.includes("under_review->verified"));
  assert.ok(transitions.includes("verified->suspended"));
  assert.ok(transitions.includes("suspended->verified"));
  const approval = caseDoc.statusHistory.find((entry) => entry.action === "approved");
  assert.equal(String(approval.by), ctx.admin.userId);
  assert.ok(approval.at instanceof Date);
  const suspension = caseDoc.statusHistory.find((entry) => entry.action === "suspended");
  assert.match(suspension.reason, /investigation/);

  const actions = (await AuditLog.find({ organization: org }).lean()).map((item) => item.action);
  for (const action of [
    "organization.verification_submitted",
    "organization.business_email_confirmed",
    "company_verification.registry_checked",
    "admin.organization_verified",
    "admin.organization_suspended",
    "admin.organization_reactivated",
  ]) {
    assert.ok(actions.includes(action), `audit includes ${action}`);
  }

  const registryAudit = await AuditLog.findOne({ organization: org, action: "company_verification.registry_checked" }).lean();
  assert.ok(registryAudit.actor, "the audit entry records who acted");
});

test("the Phase 1 company machine still refuses an illegal jump such as pending to verified", async () => {
  const { assertTransition } = require("../domain/stateMachines");
  assert.throws(() => assertTransition("companyVerification", "pending", "verified"));
});
