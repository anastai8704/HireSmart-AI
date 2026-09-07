process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
// TEMP-DIAG: run only the listed tests (empty = all).
const ONLY_TESTS = [
  "seed admin, two orgs and a candidate",
  "publishing is platform-wide: every published job waits for admin approval",
  "publishing notifies the org owner and platform admins",
  "approving makes the job public and notifies the org",
];
const test = (name, fn) =>
  ONLY_TESTS.length === 0 || ONLY_TESTS.includes(name) ? nodeTest(name, fn) : undefined;
test.before = nodeTest.before;
test.after = nodeTest.after;
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let adminToken;
let ownerAToken;
let ownerBToken;
let orgAId;
let orgBId;
let jobAId;
let jobIdB;
let candidateToken;

const registerAndLogin = async ({ email, intent, organizationName }) => {
  const registration = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: "StrongPassword123!",
      displayName: email.split("@")[0],
      accountIntent: intent,
      organizationName,
      termsConsent: true,
    });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "StrongPassword123!" });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return {
    token: login.body.data.accessToken,
    user: registration.body.data.user,
    organization: registration.body.data.organization,
  };
};

const publishJob = async (token, orgId, payload) => {
  const created = await request(app)
    .post(`/api/v1/organizations/${orgId}/jobs`)
    .set(auth(token))
    .send(payload);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const published = await request(app)
    .post(`/api/v1/organizations/${orgId}/jobs/${created.body.data.id}/publish`)
    .set(auth(token));
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body.data;
};

test.before(async () => {
  await startDatabase();
});
test.after(async () => {
  await stopDatabase();
});

test("seed admin, two orgs and a candidate", async () => {
  await clearDatabase();
  const admin = await registerAndLogin({ email: "admin@moderation.example", intent: "candidate" });
  await User.updateOne({ _id: admin.user.id }, { $set: { role: "admin" } });
  const adminLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "admin@moderation.example", password: "StrongPassword123!" });
  adminToken = adminLogin.body.data.accessToken;
  const ownerA = await registerAndLogin({
    email: "owner@a.example",
    intent: "recruiter",
    organizationName: "Approved Co",
  });
  ownerAToken = ownerA.token;
  orgAId = ownerA.organization.id;
  const ownerB = await registerAndLogin({
    email: "owner@b.example",
    intent: "recruiter",
    organizationName: "Open Co",
  });
  ownerBToken = ownerB.token;
  orgBId = ownerB.organization.id;
  const candidate = await registerAndLogin({
    email: "candidate@moderation.example",
    intent: "candidate",
  });
  candidateToken = candidate.token;
});

test("publishing is platform-wide: every published job waits for admin approval", async () => {
  const jobA = await publishJob(ownerAToken, orgAId, {
    title: "Moderated Role",
    company: "Approved Co",
    location: "Pune",
    experience: "2+ years",
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    description: "A role that must be approved by the platform before it goes public.",
    requiredSkills: ["Node.js"],
  });
  jobAId = jobA.id;
  assert.equal(jobA.moderation.status, "pending", "publish must always set moderation pending");

  const publicList = await request(app).get("/api/v1/jobs");
  assert.ok(
    !publicList.body.data.map((j) => j.id).includes(jobAId),
    "pending job must not appear in public search",
  );
  const companyJobs = await request(app).get("/api/v1/companies/approved-co/jobs");
  assert.ok(
    !companyJobs.body.data.map((j) => j.id).includes(jobAId),
    "pending job must not appear on the company page",
  );

  const queue = await request(app).get("/api/v1/admin/moderation/jobs").set(auth(adminToken));
  assert.equal(queue.status, 200, JSON.stringify(queue.body));
  assert.equal(queue.body.data.length, 1);
  assert.equal(queue.body.data[0].title, "Moderated Role");
  assert.equal(queue.body.data[0].moderation.status, "pending");
});

test("publishing notifies the org owner and platform admins", async () => {
  const ownerA = await User.findOne({ role: "recruiter", email: "owner@a.example" });
  const admin = await User.findOne({ role: "admin" });
  const ownerNote = await Notification.findOne({
    user: ownerA._id,
    type: "job_submitted_for_approval",
    resourceId: jobAId,
  });
  assert.ok(ownerNote, "org owner must be told the job is submitted for approval");
  assert.equal(ownerNote.category, "jobs");
  const adminNote = await Notification.findOne({
    user: admin._id,
    type: "job_submitted_for_approval",
    resourceId: jobAId,
  });
  assert.ok(adminNote, "platform admin must see the new approval request");
  assert.equal(adminNote.category, "approvals");
});

test("approving makes the job public and notifies the org", async () => {
  const approved = await request(app)
    .post(`/api/v1/admin/moderation/jobs/${jobAId}/approve`)
    .set(auth(adminToken));
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const publicList = await request(app).get("/api/v1/jobs");
  assert.ok(
    publicList.body.data.map((j) => j.id).includes(jobAId),
    "approved job must appear in public search",
  );
  const ownerA = await User.findOne({ role: "recruiter", email: "owner@a.example" });
  const note = await Notification.findOne({
    user: ownerA._id,
    type: "job_moderation",
    resourceId: jobAId,
  });
  assert.ok(note, "org must be notified about the approval");
  assert.match(note.message, /approved/i);
});

test("editing a published job stages changes without touching the live version", async () => {
  const updated = await request(app)
    .patch(`/api/v1/organizations/${orgAId}/jobs/${jobAId}`)
    .set(auth(ownerAToken))
    .send({
      description:
        "An updated description that changes the public-facing requirements of this role.",
      location: "Bengaluru",
    });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  // The live job stays approved and public; only the proposal is pending.
  assert.equal(updated.body.data.moderation.status, "approved");
  assert.equal(updated.body.data.pendingChanges?.status, "pending");
  assert.equal(updated.body.data.pendingChanges?.fields?.location, "Bengaluru");
  assert.notEqual(
    updated.body.data.description,
    "An updated description that changes the public-facing requirements of this role.",
    "live description must not be mutated while changes await review",
  );

  const publicList = await request(app).get("/api/v1/jobs");
  const live = publicList.body.data.find((j) => j.id === jobAId);
  assert.ok(live, "job with pending changes must remain visible to candidates");
  assert.notEqual(live.location, "Bengaluru", "proposed location must not leak into the live job");

  const admin = await User.findOne({ role: "admin" });
  const adminNote = await Notification.findOne({
    user: admin._id,
    type: "job_changes_submitted",
    resourceId: jobAId,
  });
  assert.ok(adminNote, "admins must be notified about the pending changes");
  assert.equal(adminNote.category, "approvals");
});

test("the pending-change review appears in the admin queue", async () => {
  const queue = await request(app).get("/api/v1/admin/moderation/jobs").set(auth(adminToken));
  assert.equal(queue.status, 200, JSON.stringify(queue.body));
  const entry = queue.body.data.find((j) => j.id === jobAId);
  assert.ok(entry, "job with pending changes must appear in the approval queue");
  assert.equal(entry.changeReview?.status, "pending");
  assert.equal(entry.changeReview?.fields?.location, "Bengaluru");
});

test("approving the changes applies them, bumps the version and keeps the job public", async () => {
  const versionBefore = (
    await request(app)
      .get(`/api/v1/organizations/${orgAId}/jobs/${jobAId}`)
      .set(auth(ownerAToken))
  ).body.data.version;
  const approved = await request(app)
    .post(`/api/v1/admin/moderation/jobs/${jobAId}/approve`)
    .set(auth(adminToken));
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.data.changeReview?.status, "approved");
  assert.equal(approved.body.data.location, "Bengaluru", "approved changes must be applied");
  const ownerA = await User.findOne({ role: "recruiter", email: "owner@a.example" });
  const note = await Notification.findOne({
    user: ownerA._id,
    type: "job_moderation",
    resourceId: jobAId,
  })
    .sort({ createdAt: -1 })
    .lean();
  assert.ok(note);
  assert.match(note.message, /changes.*approved/i);
  const publicList = await request(app).get("/api/v1/jobs");
  const live = publicList.body.data.find((j) => j.id === jobAId);
  assert.ok(live, "job must remain public after its changes are approved");
  assert.equal(live.location, "Bengaluru");
  assert.ok(live.version > versionBefore, "applying changes must bump the job version");
});

test("rejecting changes keeps the previous approved version live", async () => {
  await request(app)
    .patch(`/api/v1/organizations/${orgAId}/jobs/${jobAId}`)
    .set(auth(ownerAToken))
    .send({ location: "Mumbai" });
  const rejected = await request(app)
    .post(`/api/v1/admin/moderation/jobs/${jobAId}/reject`)
    .set(auth(adminToken))
    .send({ reason: "Location does not match the contract." });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejected.body.data.changeReview?.status, "rejected");
  assert.equal(rejected.body.data.moderation.status, "approved");
  const publicList = await request(app).get("/api/v1/jobs");
  const live = publicList.body.data.find((j) => j.id === jobAId);
  assert.ok(live, "rejecting changes must not unpublish the job");
  assert.equal(live.location, "Bengaluru", "live content must remain the last approved version");
  const ownerA = await User.findOne({ role: "recruiter", email: "owner@a.example" });
  const note = await Notification.findOne({
    user: ownerA._id,
    type: "job_moderation",
    resourceId: jobAId,
  })
    .sort({ createdAt: -1 })
    .lean();
  assert.match(note.message, /changes were rejected/i);
  assert.match(note.message, /Location does not match/);
});

test("rejection of a new job hides it and notifies the org with the reason", async () => {
  const job2 = await publishJob(ownerAToken, orgAId, {
    title: "Borderline Role",
    company: "Approved Co",
    location: "Pune",
    experience: "1+ years",
    jobType: "Full-Time",
    workplaceMode: "onsite",
    description:
      "A role listing that the platform rejects for missing verification details in the description.",
    requiredSkills: ["Java"],
  });
  const ownerA = await User.findOne({ role: "recruiter", email: "owner@a.example" });
  const rejected = await request(app)
    .post(`/api/v1/admin/moderation/jobs/${job2.id}/reject`)
    .set(auth(adminToken))
    .send({ reason: "Salary band contradicts the experience requirement." });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  const publicList = await request(app).get("/api/v1/jobs");
  assert.ok(
    !publicList.body.data.map((j) => j.id).includes(job2.id),
    "rejected job must stay hidden",
  );
  const note = await Notification.findOne({
    user: ownerA._id,
    type: "job_moderation",
    resourceId: job2.id,
  });
  assert.ok(note, "org owner must be notified about the rejection");
  assert.match(note.message, /Salary band contradicts/);
  const companyJobs = await request(app).get("/api/v1/companies/approved-co/jobs");
  assert.ok(!companyJobs.body.data.map((j) => j.id).includes(job2.id));
});

test("candidates cannot apply to a job that is still pending approval", async () => {
  const jobC = await publishJob(ownerBToken, orgBId, {
    title: "Unapproved Role",
    company: "Open Co",
    location: "Delhi",
    experience: "2+ years",
    jobType: "Full-Time",
    workplaceMode: "remote",
    description: "A role that has not been approved by the platform yet.",
    requiredSkills: ["React"],
  });
  const publicList = await request(app).get("/api/v1/jobs");
  assert.ok(
    !publicList.body.data.map((j) => j.id).includes(jobC.id),
    "pending job must not be visible to candidates",
  );
  const application = await request(app)
    .post(`/api/v1/jobs/${jobC.id}/applications`)
    .set(auth(candidateToken))
    .send({ resumeVersionId: "0123456789abcdef01234567" });
  assert.equal(application.status, 404, "applying to an unapproved job must fail");
});

test("jobs published before platform-wide review stay visible (legacy data safe)", async () => {
  const { Job } = require("../models/Job");
  const legacy = await Job.create({
    organization: orgBId,
    title: "Legacy Role",
    company: "Open Co",
    location: "Delhi",
    experience: "3+ years",
    jobType: "Full-Time",
    workplaceMode: "remote",
    description: "A job published before approval became mandatory.",
    requiredSkills: ["Go"],
    status: "published",
    moderation: { status: "none" },
  });
  const publicList = await request(app).get("/api/v1/jobs");
  assert.ok(
    publicList.body.data.map((j) => j.id).includes(String(legacy._id)),
    "legacy 'none' jobs must remain visible without a migration",
  );
});

test("platform override — admin can reject a job from any org", async () => {
  const jobB = await publishJob(ownerBToken, orgBId, {
    title: "Open Role",
    company: "Open Co",
    location: "Delhi",
    experience: "2+ years",
    jobType: "Full-Time",
    workplaceMode: "remote",
    description: "A role at an organization that publishes under platform review.",
    requiredSkills: ["React"],
  });
  jobIdB = jobB.id;
  const approved = await request(app)
    .post(`/api/v1/admin/moderation/jobs/${jobIdB}/approve`)
    .set(auth(adminToken));
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const rejected = await request(app)
    .post(`/api/v1/admin/moderation/jobs/${jobIdB}/reject`)
    .set(auth(adminToken))
    .send({ reason: "Duplicate listing." });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  const publicList = await request(app).get("/api/v1/jobs");
  assert.ok(
    !publicList.body.data.map((j) => j.id).includes(jobIdB),
    "platform-rejected job must be hidden",
  );
});

test("moderation endpoints are admin-only", async () => {
  const denied = await request(app).get("/api/v1/admin/moderation/jobs").set(auth(candidateToken));
  assert.equal(denied.status, 404, "non-admin must not even learn the endpoint exists");
  const recruiterDenied = await request(app)
    .post(`/api/v1/admin/moderation/jobs/${jobAId}/approve`)
    .set(auth(ownerAToken));
  assert.equal(recruiterDenied.status, 404, "recruiters cannot approve their own jobs");
});
