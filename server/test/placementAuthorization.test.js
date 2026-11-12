// Phase 0.5 regression coverage: placement employment-status authorization, transition guards,
// and the guarantee that employment updates never write to candidate profiles.
// Runs against the test database (CI service container).
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const { Placement } = require("../models/Placement");
const { Membership } = require("../models/Membership");
const CandidateProfile = require("../models/CandidateProfile");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");

const PASSWORD = "StrongPassword123!";
const API = "/api/v1";
const auth = (token) => ({ Authorization: `Bearer ${token}` });

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
    userId: String(reg.body.data.user.id || reg.body.data.user._id),
    orgId: reg.body.data.organization ? String(reg.body.data.organization.id) : null,
  };
};

// Default employment: offer accepted and verified (the state a hired candidate starts from).
const newPlacement = (fields) =>
  Placement.create({
    application: new mongoose.Types.ObjectId(),
    job: new mongoose.Types.ObjectId(),
    employment: { status: "offer_accepted", lastVerifiedStatus: "offer_accepted" },
    ...fields,
  });

const changeStatus = (actor, placementId, body, orgId) => {
  const req = request(app)
    .patch(`${API}/placements/${placementId}/employment-status`)
    .set(auth(actor.token));
  if (orgId) req.set("X-Organization-Id", orgId);
  return req.send(body);
};

let orgOwnerX; // recruiter owning organization X (the employer)
let orgOwnerY; // recruiter owning unrelated organization Y
let candidate; // the placed candidate
let otherCandidate;
let orgXMember; // recruiter with the "recruiter" role inside organization X

test.before(async () => {
  await startDatabase();
});

test.after(async () => {
  await stopDatabase();
});

test("seed organizations, members and candidates", async () => {
  await clearDatabase();
  orgOwnerX = await register({
    email: "pl-owner-x@example.test",
    intent: "recruiter",
    organizationName: "Placement Org X",
  });
  orgOwnerY = await register({
    email: "pl-owner-y@example.test",
    intent: "recruiter",
    organizationName: "Placement Org Y",
  });
  candidate = await register({ email: "pl-candidate@example.test", intent: "candidate" });
  otherCandidate = await register({ email: "pl-other@example.test", intent: "candidate" });

  orgXMember = await register({
    email: "pl-member@example.test",
    intent: "recruiter",
    organizationName: "Member Company",
  });
  await Membership.create({
    organization: orgOwnerX.orgId,
    user: orgXMember.userId,
    role: "recruiter",
    status: "active",
  });
});

test("a recruiter from an unrelated company cannot change another company's placement", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });

  const noContext = await changeStatus(orgOwnerY, placement._id, { status: "joined_pending_verification" });
  assert.equal(noContext.status, 400);
  assert.equal(noContext.body.code, "ORGANIZATION_REQUIRED");

  const ownOrgHeader = await changeStatus(
    orgOwnerY,
    placement._id,
    { status: "joined_pending_verification" },
    orgOwnerY.orgId,
  );
  assert.equal(ownOrgHeader.status, 404, "placement of another organization is not found");

  const spoofedOrgHeader = await changeStatus(
    orgOwnerY,
    placement._id,
    { status: "joined_pending_verification" },
    orgOwnerX.orgId,
  );
  assert.equal(spoofedOrgHeader.status, 404, "a header naming org X does not grant membership");

  const unchanged = await Placement.findById(placement._id);
  assert.equal(unchanged.status, "hired");
});

test("a candidate cannot change a placement that belongs to someone else", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  const res = await changeStatus(otherCandidate, placement._id, { status: "joined_pending_verification" });
  assert.equal(res.status, 404);
  assert.equal((await Placement.findById(placement._id)).status, "hired");
});

test("the owning company updates status; the source is recorded and no profile is written", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  await CandidateProfile.updateOne(
    { user: candidate.userId },
    { $set: { user: candidate.userId, headline: "Engineer", experience: [{ title: "Manual entry" }] } },
    { upsert: true },
  );
  const profileBefore = await CandidateProfile.findOne({ user: candidate.userId }).lean();

  const res = await changeStatus(
    orgOwnerX,
    placement._id,
    { status: "joined_pending_verification", startDate: "2026-10-01" },
    orgOwnerX.orgId,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.employment.status, "joined_pending_verification", "reported, not verified");
  assert.equal(res.body.data.status, "hired", "placement lifecycle is unchanged");

  const stored = await Placement.findById(placement._id);
  assert.equal(stored.employmentStatusSource, "organization_reported");
  assert.equal(String(stored.employmentStatusUpdatedBy), orgOwnerX.userId);
  assert.ok(stored.employmentStatusUpdatedAt instanceof Date);
  assert.equal(stored.verification.isVerified, false, "reporting does not verify the placement");

  const profileAfter = await CandidateProfile.findOne({ user: candidate.userId }).lean();
  assert.deepEqual(profileAfter, profileBefore, "candidate profile is never written by this flow");

  const audit = await AuditLog.findOne({
    resourceId: placement._id,
    action: "placement.employment_reported",
  });
  assert.ok(audit, "status change is audited");
  assert.equal(audit.previousState.employmentStatus, "offer_accepted");
  assert.equal(audit.newState.employmentStatus, "joined_pending_verification");
});

test("a same-company recruiter with the application permission may update the placement", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  const res = await changeStatus(orgXMember, placement._id, { status: "joined_pending_verification" }, orgOwnerX.orgId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test("a candidate can self-report for their own placement, recorded as candidate-reported", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "joining_confirmed",
  });
  const res = await changeStatus(candidate, placement._id, { status: "joined_pending_verification" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = await Placement.findById(placement._id);
  assert.equal(stored.employmentStatusSource, "candidate_reported");
  assert.equal(stored.verification.isVerified, false);
  assert.equal(stored.employment.status, "joined_pending_verification");
});

test("illegal transitions are rejected", async () => {
  const hired = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "selected",
    employment: { status: "status_unconfirmed", lastVerifiedStatus: "" },
  });
  const fromSelected = await changeStatus(orgOwnerX, hired._id, { status: "joined_pending_verification" }, orgOwnerX.orgId);
  assert.equal(fromSelected.status, 409);
  assert.equal(fromSelected.body.code, "INVALID_TRANSITION");

  const notWorking = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  const endWithoutStart = await changeStatus(
    orgOwnerX,
    notWorking._id,
    { status: "employment_end_pending_verification" },
    orgOwnerX.orgId,
  );
  assert.equal(endWithoutStart.status, 409);
  assert.equal(endWithoutStart.body.code, "INVALID_TRANSITION");

  const invalid = await changeStatus(orgOwnerX, notWorking._id, { status: "placement_verified" }, orgOwnerX.orgId);
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
});

test("an exit is reported as pending from an active verified job; the last verified status stays until verified", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
    employment: { status: "active_verified", lastVerifiedStatus: "active_verified" },
  });
  const res = await changeStatus(
    orgOwnerX,
    placement._id,
    { status: "employment_end_pending_verification", endDate: "2026-10-31", exitReason: "Contract finished" },
    orgOwnerX.orgId,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = await Placement.findById(placement._id);
  assert.equal(stored.employment.status, "employment_end_pending_verification");
  assert.equal(stored.employment.lastVerifiedStatus, "active_verified", "not verified yet");
  assert.equal(stored.employmentPeriod.exitReason, "Contract finished");
  assert.equal(stored.employmentStatusSource, "organization_reported");

  const again = await changeStatus(orgOwnerX, placement._id, { status: "employment_end_pending_verification" }, orgOwnerX.orgId);
  assert.equal(again.status, 409, "a second change cannot be reported while one is pending");
  assert.equal(again.body.code, "CHANGE_ALREADY_PENDING");
});

test("unknown fields and statuses are rejected before any lookup", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  const extra = await changeStatus(
    orgOwnerX,
    placement._id,
    { status: "joined_pending_verification", experience: [{ title: "Injected" }] },
    orgOwnerX.orgId,
  );
  assert.equal(extra.status, 422, JSON.stringify(extra.body));
  assert.equal((await Placement.findById(placement._id)).status, "hired");
});

test("organization-reported employment is not platform-verified; admin verification is separate", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  const reported = await changeStatus(orgOwnerX, placement._id, { status: "joined_pending_verification" }, orgOwnerX.orgId);
  assert.equal(reported.status, 200);
  let stored = await Placement.findById(placement._id);
  assert.equal(stored.verification.isVerified, false, "organization report is not verification");
  assert.equal(stored.verification.verifiedBy, null);

  // A platform admin is a user with role "admin"; promote a test account directly in the database.
  const adminEmail = "pl-platform-admin@example.test";
  await register({ email: adminEmail, intent: "candidate" });
  await User.updateOne({ email: adminEmail }, { $set: { role: "admin" } });
  const login = await request(app).post(`${API}/auth/login`).send({ email: adminEmail, password: PASSWORD });
  const admin = { token: login.body.data.accessToken };

  const verify = await request(app)
    .post(`${API}/admin/placements/${placement._id}/verify`)
    .set(auth(admin.token))
    .send({ adminRemarks: "Checked offer letter" });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));

  stored = await Placement.findById(placement._id);
  assert.equal(stored.verification.isVerified, true);
  assert.ok(stored.verification.verifiedBy);
  assert.equal(stored.employment.status, "joined_pending_verification", "placement verification does not verify employment");
  assert.equal(stored.employmentStatusSource, "organization_reported", "source is not rewritten by verification");
});

test("admin verification of a pre-employment placement still moves it to placement_verified", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  const login = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: "pl-platform-admin@example.test", password: PASSWORD });
  const res = await request(app)
    .post(`${API}/admin/placements/${placement._id}/verify`)
    .set(auth(login.body.data.accessToken))
    .send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = await Placement.findById(placement._id);
  assert.equal(stored.status, "placement_verified");
  assert.equal(stored.verification.isVerified, true);
});

test("candidate joining confirmation does not regress an employment status", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "employment_ended",
  });
  const res = await request(app)
    .post(`${API}/candidates/me/placements/${placement._id}/confirm-joining`)
    .set(auth(candidate.token))
    .send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = await Placement.findById(placement._id);
  assert.equal(stored.status, "employment_ended");
  assert.equal(stored.employment.status, "joined_pending_verification", "joining is a pending employment change");
  assert.equal(stored.joiningConfirmation.confirmedByCandidate, true, "candidate confirmation is still recorded");
  assert.equal(stored.verification.isVerified, false, "candidate confirmation is not platform verification");
});

const employmentAction = (token, placementId, action, body, orgId) => {
  const req = request(app).post(`${API}/placements/${placementId}/employment/${action}`).set(auth(token));
  if (orgId) req.set("X-Organization-Id", orgId);
  return req.send(body);
};

const makePlatformAdmin = async (email) => {
  await register({ email, intent: "candidate" });
  await User.updateOne({ email }, { $set: { role: "admin" } });
  const login = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });
  return login.body.data.accessToken;
};

test("an employer verifies a candidate's joining; the reporter cannot verify their own change", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  const reported = await changeStatus(candidate, placement._id, { status: "joined_pending_verification" });
  assert.equal(reported.status, 200, JSON.stringify(reported.body));

  // The candidate may never verify, even for their own placement.
  const byCandidate = await employmentAction(candidate.token, placement._id, "verify", {});
  assert.equal(byCandidate.status, 404);

  const verified = await employmentAction(orgOwnerX.token, placement._id, "verify", { note: "Joined on the 1st" }, orgOwnerX.orgId);
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  const stored = await Placement.findById(placement._id);
  assert.equal(stored.employment.status, "active_verified");
  assert.equal(stored.employment.lastVerifiedStatus, "active_verified");
  assert.equal(String(stored.employment.verifiedBy), orgOwnerX.userId);
  const events = stored.employmentHistory.map((e) => e.event);
  assert.ok(events.includes("employment_reported"));
  assert.ok(events.includes("employment_verified"), "verification is a separate history event");
});

test("a recruiter cannot verify a change they reported themselves", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  await changeStatus(orgXMember, placement._id, { status: "joined_pending_verification" }, orgOwnerX.orgId);
  const self = await employmentAction(orgXMember.token, placement._id, "verify", {}, orgOwnerX.orgId);
  assert.equal(self.status, 409);
  assert.equal(self.body.code, "SELF_VERIFICATION_NOT_ALLOWED");
  assert.equal((await Placement.findById(placement._id)).employment.status, "joined_pending_verification");
});

test("a recruiter from another company cannot verify, and nothing is verified", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  await changeStatus(candidate, placement._id, { status: "joined_pending_verification" });
  const outsider = await employmentAction(orgOwnerY.token, placement._id, "verify", {}, orgOwnerY.orgId);
  assert.equal(outsider.status, 404);
  assert.equal((await Placement.findById(placement._id)).employment.status, "joined_pending_verification");
});

test("rejecting a pending exit returns to the last verified status, and the rejection is kept in history", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
    employment: { status: "active_verified", lastVerifiedStatus: "active_verified" },
  });
  await changeStatus(candidate, placement._id, { status: "employment_end_pending_verification" });
  const noReason = await employmentAction(orgOwnerX.token, placement._id, "reject", {}, orgOwnerX.orgId);
  assert.equal(noReason.status, 422);

  const rejected = await employmentAction(orgOwnerX.token, placement._id, "reject", { reason: "Still employed" }, orgOwnerX.orgId);
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  const stored = await Placement.findById(placement._id);
  assert.equal(stored.employment.status, "active_verified");
  assert.ok(stored.employmentHistory.some((e) => e.event === "employment_rejected" && e.note === "Still employed"));
});

test("an unconfirmed legacy record is resolved only by an administrator, with a note", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
    employment: { status: "status_unconfirmed", lastVerifiedStatus: "" },
  });
  const adminToken = await makePlatformAdmin("pl-resolve-admin@example.test");

  const byRecruiter = await request(app)
    .post(`${API}/admin/placements/${placement._id}/employment/resolve`)
    .set(auth(orgOwnerX.token))
    .send({ status: "active_verified", note: "checked" });
  assert.equal(byRecruiter.status, 404);

  const noNote = await request(app)
    .post(`${API}/admin/placements/${placement._id}/employment/resolve`)
    .set(auth(adminToken))
    .send({ status: "active_verified" });
  assert.equal(noNote.status, 422);

  const resolved = await request(app)
    .post(`${API}/admin/placements/${placement._id}/employment/resolve`)
    .set(auth(adminToken))
    .send({ status: "active_verified", note: "Confirmed from offer letter and payslip" });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  const stored = await Placement.findById(placement._id);
  assert.equal(stored.employment.status, "active_verified");
  assert.ok(stored.employmentHistory.some((e) => e.event === "employment_resolved"));
});
