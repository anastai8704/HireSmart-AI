process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let adminToken; let ownerAToken; let ownerBToken; let orgAId; let orgBId; let jobAId; let jobIdB; let candidateToken;

const registerAndLogin = async ({ email, intent, organizationName }) => {
    const registration = await request(app).post("/api/v1/auth/register").send({ email, password: "StrongPassword123!", displayName: email.split("@")[0], accountIntent: intent, organizationName, termsConsent: true });
    assert.equal(registration.status, 201, JSON.stringify(registration.body));
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "StrongPassword123!" });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { token: login.body.data.accessToken, user: registration.body.data.user, organization: registration.body.data.organization };
};

const publishJob = async (token, orgId, payload) => {
    const created = await request(app).post(`/api/v1/organizations/${orgId}/jobs`).set(auth(token)).send(payload);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const published = await request(app).post(`/api/v1/organizations/${orgId}/jobs/${created.body.data.id}/publish`).set(auth(token));
    assert.equal(published.status, 200, JSON.stringify(published.body));
    return created.body.data;
};

test.before(async () => { await startDatabase(); });
test.after(async () => { await stopDatabase(); });

test("phase 3: seed admin, two orgs (one with approval required) and a candidate", async () => {
    await clearDatabase();
    const admin = await registerAndLogin({ email: "admin@moderation.example", intent: "candidate" });
    await User.updateOne({ _id: admin.user.id }, { $set: { role: "admin" } });
    const adminLogin = await request(app).post("/api/v1/auth/login").send({ email: "admin@moderation.example", password: "StrongPassword123!" });
    adminToken = adminLogin.body.data.accessToken;
    const ownerA = await registerAndLogin({ email: "owner@a.example", intent: "recruiter", organizationName: "Approved Co" });
    ownerAToken = ownerA.token; orgAId = ownerA.organization.id;
    const ownerB = await registerAndLogin({ email: "owner@b.example", intent: "recruiter", organizationName: "Open Co" });
    ownerBToken = ownerB.token; orgBId = ownerB.organization.id;
    const candidate = await registerAndLogin({ email: "candidate@moderation.example", intent: "candidate" });
    candidateToken = candidate.token;
    const settings = await request(app).put(`/api/v1/organizations/${orgAId}/settings`).set(auth(ownerAToken)).send({ requireJobApproval: true });
    assert.equal(settings.status, 200, JSON.stringify(settings.body));
    assert.equal(settings.body.data.settings.requireJobApproval, true);
});

test("phase 3: approval-required org jobs stay hidden until the platform approves", async () => {
    const jobA = await publishJob(ownerAToken, orgAId, { title: "Moderated Role", company: "Approved Co", location: "Pune", experience: "2+ years", jobType: "Full-Time", workplaceMode: "hybrid", description: "A role at an organization that requires platform approval before public exposure.", requiredSkills: ["Node.js"] });
    jobAId = jobA.id;
    assert.equal(jobA.moderation.status, "pending");

    let publicList = await request(app).get("/api/v1/jobs");
    assert.ok(!publicList.body.data.map((j) => j.id).includes(jobAId), "pending job must not appear in public search");
    let companyJobs = await request(app).get("/api/v1/companies/approved-co/jobs");
    assert.ok(!companyJobs.body.data.map((j) => j.id).includes(jobAId), "pending job must not appear on the company page");

    const queue = await request(app).get("/api/v1/admin/moderation/jobs").set(auth(adminToken));
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    assert.equal(queue.body.data.length, 1);
    assert.equal(queue.body.data[0].title, "Moderated Role");
    assert.equal(queue.body.data[0].moderation.status, "pending");

    const approved = await request(app).post(`/api/v1/admin/moderation/jobs/${jobAId}/approve`).set(auth(adminToken));
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    publicList = await request(app).get("/api/v1/jobs");
    assert.ok(publicList.body.data.map((j) => j.id).includes(jobAId), "approved job must appear in public search");
});

test("phase 3: editing a published job at an approval org sends it back to review", async () => {
    const updated = await request(app).patch(`/api/v1/organizations/${orgAId}/jobs/${jobAId}`).set(auth(ownerAToken)).send({ description: "An updated description that changes the public-facing requirements of this moderated role." });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.moderation.status, "pending");
    const publicList = await request(app).get("/api/v1/jobs");
    assert.ok(!publicList.body.data.map((j) => j.id).includes(jobAId), "edited job must be hidden again until re-approved");
    const reapproved = await request(app).post(`/api/v1/admin/moderation/jobs/${jobAId}/approve`).set(auth(adminToken));
    assert.equal(reapproved.status, 200);
});

test("phase 3: rejection hides the job and notifies the org owner", async () => {
    const job2 = await publishJob(ownerAToken, orgAId, { title: "Borderline Role", company: "Approved Co", location: "Pune", experience: "1+ years", jobType: "Full-Time", workplaceMode: "onsite", description: "A role listing that the platform rejects for missing verification details in the description.", requiredSkills: ["Java"] });
    const ownerA = await User.findOne({ role: "recruiter", email: "owner@a.example" });
    const rejected = await request(app).post(`/api/v1/admin/moderation/jobs/${job2.id}/reject`).set(auth(adminToken)).send({ reason: "Salary band contradicts the experience requirement." });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    const publicList = await request(app).get("/api/v1/jobs");
    assert.ok(!publicList.body.data.map((j) => j.id).includes(job2.id), "rejected job must stay hidden");
    const note = await Notification.findOne({ user: ownerA._id, type: "job_moderation" });
    assert.ok(note, "org owner must be notified about the rejection");
    assert.match(note.message, /Salary band contradicts/);
    const companyJobs = await request(app).get("/api/v1/companies/approved-co/jobs");
    assert.ok(!companyJobs.body.data.map((j) => j.id).includes(job2.id));
});

test("phase 3: orgs without approval publish immediately (no behavior change)", async () => {
    const jobB = await publishJob(ownerBToken, orgBId, { title: "Open Role", company: "Open Co", location: "Delhi", experience: "2+ years", jobType: "Full-Time", workplaceMode: "remote", description: "A role at an organization that does not require platform approval for job listings.", requiredSkills: ["React"] });
    jobIdB = jobB.id;
    assert.equal(jobB.moderation.status, "none");
    const publicList = await request(app).get("/api/v1/jobs");
    assert.ok(publicList.body.data.map((j) => j.id).includes(jobIdB));
});

test("phase 3: platform override — admin can reject a job from any org", async () => {
    const rejected = await request(app).post(`/api/v1/admin/moderation/jobs/${jobIdB}/reject`).set(auth(adminToken)).send({ reason: "Duplicate listing." });
    assert.equal(rejected.status, 200);
    const publicList = await request(app).get("/api/v1/jobs");
    assert.ok(!publicList.body.data.map((j) => j.id).includes(jobIdB), "platform-rejected job must be hidden even without org approval");
});

test("phase 3: moderation endpoints are admin-only and members cannot set the approval flag", async () => {
    const denied = await request(app).get("/api/v1/admin/moderation/jobs").set(auth(candidateToken));
    assert.equal(denied.status, 404, "non-admin must not even learn the endpoint exists");
    const ownerSettings = await request(app).put(`/api/v1/organizations/${orgBId}/settings`).set(auth(candidateToken)).send({ requireJobApproval: true });
    assert.notEqual(ownerSettings.status, 200);
    const settings = await request(app).put(`/api/v1/organizations/${orgBId}/settings`).set(auth(ownerBToken)).send({ requireJobApproval: true });
    assert.equal(settings.status, 200);
    await request(app).put(`/api/v1/organizations/${orgBId}/settings`).set(auth(ownerBToken)).send({ requireJobApproval: false });
});
