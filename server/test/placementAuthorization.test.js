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

const newPlacement = (fields) =>
  Placement.create({
    application: new mongoose.Types.ObjectId(),
    job: new mongoose.Types.ObjectId(),
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

  const noContext = await changeStatus(orgOwnerY, placement._id, { status: "currently_working" });
  assert.equal(noContext.status, 400);
  assert.equal(noContext.body.code, "ORGANIZATION_REQUIRED");

  const ownOrgHeader = await changeStatus(
    orgOwnerY,
    placement._id,
    { status: "currently_working" },
    orgOwnerY.orgId,
  );
  assert.equal(ownOrgHeader.status, 404, "placement of another organization is not found");

  const spoofedOrgHeader = await changeStatus(
    orgOwnerY,
    placement._id,
    { status: "currently_working" },
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
  const res = await changeStatus(otherCandidate, placement._id, { status: "currently_working" });
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
    { status: "currently_working", startDate: "2026-10-01" },
    orgOwnerX.orgId,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.status, "currently_working");

  const stored = await Placement.findById(placement._id);
  assert.equal(stored.employmentStatusSource, "organization_reported");
  assert.equal(String(stored.employmentStatusUpdatedBy), orgOwnerX.userId);
  assert.ok(stored.employmentStatusUpdatedAt instanceof Date);
  assert.equal(stored.verification.isVerified, false, "reporting does not verify the placement");

  const profileAfter = await CandidateProfile.findOne({ user: candidate.userId }).lean();
  assert.deepEqual(profileAfter, profileBefore, "candidate profile is never written by this flow");

  const audit = await AuditLog.findOne({
    resourceId: placement._id,
    action: "placement.status_currently_working",
  });
  assert.ok(audit, "status change is audited");
  assert.equal(audit.metadata.previousStatus, "hired");
  assert.equal(audit.metadata.newStatus, "currently_working");
});

test("a same-company recruiter with the application permission may update the placement", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  const res = await changeStatus(orgXMember, placement._id, { status: "currently_working" }, orgOwnerX.orgId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test("a candidate can self-report for their own placement, recorded as candidate-reported", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "joining_confirmed",
  });
  const res = await changeStatus(candidate, placement._id, { status: "currently_working" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = await Placement.findById(placement._id);
  assert.equal(stored.employmentStatusSource, "candidate_reported");
  assert.equal(stored.verification.isVerified, false);
});

test("illegal transitions are rejected", async () => {
  const hired = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "selected",
  });
  const fromSelected = await changeStatus(orgOwnerX, hired._id, { status: "currently_working" }, orgOwnerX.orgId);
  assert.equal(fromSelected.status, 409);
  assert.equal(fromSelected.body.code, "INVALID_TRANSITION");

  const notWorking = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "hired",
  });
  const endWithoutStart = await changeStatus(orgOwnerX, notWorking._id, { status: "employment_ended" }, orgOwnerX.orgId);
  assert.equal(endWithoutStart.status, 409);
  assert.equal(endWithoutStart.body.code, "INVALID_TRANSITION");

  const invalid = await changeStatus(orgOwnerX, notWorking._id, { status: "placement_verified" }, orgOwnerX.orgId);
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
});

test("ending employment requires currently_working and records the end date and reason", async () => {
  const placement = await newPlacement({
    organization: orgOwnerX.orgId,
    candidate: candidate.userId,
    status: "currently_working",
  });
  const res = await changeStatus(
    orgOwnerX,
    placement._id,
    { status: "employment_ended", endDate: "2026-10-31", exitReason: "Contract finished" },
    orgOwnerX.orgId,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = await Placement.findById(placement._id);
  assert.equal(stored.status, "employment_ended");
  assert.equal(stored.employmentPeriod.exitReason, "Contract finished");
  assert.equal(stored.employmentStatusSource, "organization_reported");

  const again = await changeStatus(orgOwnerX, placement._id, { status: "employment_ended" }, orgOwnerX.orgId);
  assert.equal(again.status, 409, "a finished placement cannot end twice");
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
    { status: "currently_working", experience: [{ title: "Injected" }] },
    orgOwnerX.orgId,
  );
  assert.equal(extra.status, 422, JSON.stringify(extra.body));
  assert.equal((await Placement.findById(placement._id)).status, "hired");
});
