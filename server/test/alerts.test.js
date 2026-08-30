process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const { runAlertScan } = require("../services/alertScanService");
const JobAlert = require("../models/JobAlert");
const Notification = require("../models/Notification");
const SearchHistory = require("../models/SearchHistory");
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let candidateToken; let ownerToken; let organizationId; let candidateUserId;
let reactJobId; let nodeJobId;

const registerAndLogin = async ({ email, intent, organizationName }) => {
    const registration = await request(app).post("/api/v1/auth/register").send({ email, password: "StrongPassword123!", displayName: email.split("@")[0], accountIntent: intent, organizationName, termsConsent: true });
    assert.equal(registration.status, 201, JSON.stringify(registration.body));
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "StrongPassword123!" });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { token: login.body.data.accessToken, user: registration.body.data.user, organization: registration.body.data.organization };
};

test.before(async () => { await startDatabase(); });
test.after(async () => { await stopDatabase(); });

test("phase 2: seed candidate, owner and two published jobs", async () => {
    await clearDatabase();
    const owner = await registerAndLogin({ email: "owner@alerts.example", intent: "recruiter", organizationName: "Alert Co" });
    ownerToken = owner.token; organizationId = owner.organization.id;
    const candidate = await registerAndLogin({ email: "candidate@alerts.example", intent: "candidate" });
    candidateToken = candidate.token; candidateUserId = candidate.user.id;
    const react = await request(app).post(`/api/v1/organizations/${organizationId}/jobs`).set(auth(ownerToken)).send({ title: "React Frontend Engineer", company: "Alert Co", location: "Pune", compensation: { min: 1200000, max: 1800000 }, experience: "3+ years", jobType: "Full-Time", workplaceMode: "remote", description: "Build accessible React frontends with TypeScript and modern testing practices for our product.", requiredSkills: ["React", "TypeScript"] });
    assert.equal(react.status, 201, JSON.stringify(react.body));
    reactJobId = react.body.data.id;
    const node = await request(app).post(`/api/v1/organizations/${organizationId}/jobs`).set(auth(ownerToken)).send({ title: "Node.js Engineer", company: "Alert Co", location: "Pune", experience: "2+ years", jobType: "Full-Time", workplaceMode: "onsite", description: "Design reliable Node.js services with MongoDB and write thorough integration tests.", requiredSkills: ["Node.js", "MongoDB"] });
    assert.equal(node.status, 201, JSON.stringify(node.body));
    nodeJobId = node.body.data.id;
    for (const id of [reactJobId, nodeJobId]) {
        const published = await request(app).post(`/api/v1/organizations/${organizationId}/jobs/${id}/publish`).set(auth(ownerToken));
        assert.equal(published.status, 200, JSON.stringify(published.body));
    }
});

test("phase 2: creating an alert and running the scan delivers matching jobs once", async () => {
    const created = await request(app).post("/api/v1/candidates/me/alerts").set(auth(candidateToken)).send({ name: "React roles", skills: ["React"], workplaceMode: "remote", cadence: "daily" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const alertId = created.body.data.id;

    const first = await runAlertScan();
    assert.equal(first.delivered, 1, `expected exactly 1 delivered, got ${JSON.stringify(first)}`);
    const notifications = await Notification.find({ user: candidateUserId, type: "job_alert" });
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].title, /React Frontend Engineer/);

    // Force the daily window to have elapsed so the scan actually re-runs this
    // alert — the next scan must then dedupe via deliveredJobIds, not cadence.
    await JobAlert.updateOne({ _id: alertId }, { $set: { lastRunAt: new Date(Date.now() - 25 * 3600 * 1000) } });
    const second = await runAlertScan();
    assert.equal(second.delivered, 0, "same job must not be delivered twice");
    const after = await Notification.countDocuments({ type: "job_alert" });
    assert.equal(after, 1);

    const list = await request(app).get("/api/v1/candidates/me/alerts").set(auth(candidateToken));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.ok(list.body.data[0].lastRunAt, "lastRunAt must be set after a scan");

    const deactivated = await request(app).patch(`/api/v1/candidates/me/alerts/${alertId}`).set(auth(candidateToken)).send({ active: false });
    assert.equal(deactivated.status, 200);
    await request(app).post(`/api/v1/organizations/${organizationId}/jobs/${reactJobId}/close`).set(auth(ownerToken));
    const republished = await request(app).post(`/api/v1/organizations/${organizationId}/jobs`).set(auth(ownerToken)).send({ title: "React Platform Lead", company: "Alert Co", location: "Bengaluru", compensation: { min: 2000000, max: 3000000 }, experience: "6+ years", jobType: "Full-Time", workplaceMode: "remote", description: "Lead the React platform team across multiple product surfaces and mentoring loops.", requiredSkills: ["React", "TypeScript"] });
    assert.equal(republished.status, 201);
    await request(app).post(`/api/v1/organizations/${organizationId}/jobs/${republished.body.data.id}/publish`).set(auth(ownerToken));
    const whileInactive = await runAlertScan();
    assert.equal(whileInactive.delivered, 0, "inactive alerts must not deliver");
    await request(app).patch(`/api/v1/candidates/me/alerts/${alertId}`).set(auth(candidateToken)).send({ active: true });
    // Simulate the daily window having elapsed during the "inactive" period.
    await JobAlert.updateOne({ _id: alertId }, { $set: { lastRunAt: new Date(Date.now() - 25 * 3600 * 1000) } });
    const reactivated = await runAlertScan();
    assert.equal(reactivated.delivered, 1, "reactivated alert must deliver the new matching job");
});

test("phase 2: non-matching alert delivers nothing", async () => {
    const created = await request(app).post("/api/v1/candidates/me/alerts").set(auth(candidateToken)).send({ name: "Data jobs", skills: ["Data Science"], location: "Chennai" });
    assert.equal(created.status, 201);
    const before = await Notification.countDocuments({ type: "job_alert" });
    const result = await runAlertScan();
    const after = await Notification.countDocuments({ type: "job_alert" });
    assert.equal(after - before, 0);
    assert.equal(result.delivered, 0);
});

test("phase 2: authenticated public search is recorded in search history", async () => {
    await request(app).get("/api/v1/jobs?query=react&location=Pune").set(auth(candidateToken));
    const list = await request(app).get("/api/v1/candidates/me/search-history").set(auth(candidateToken));
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(list.body.data.length >= 1);
    assert.equal(list.body.data[0].query, "react");
    assert.equal(list.body.data[0].location, "Pune");
    const cleared = await request(app).delete("/api/v1/candidates/me/search-history").set(auth(candidateToken));
    assert.equal(cleared.status, 204);
    assert.equal(await SearchHistory.countDocuments({ user: candidateUserId }), 0);
});

test("phase 2: natural-language search produces structured filters (deterministic)", async () => {
    const response = await request(app).post("/api/v1/ai/nl_job_search").set(auth(candidateToken)).send({ input: { text: "remote react job 15 lpa in pune" } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const filters = response.body.data.filters;
    assert.equal(filters.workplaceMode, "remote");
    assert.ok(filters.skills.includes("react"));
    assert.equal(filters.location, "Pune");
    assert.equal(filters.minSalary, 1500000);
    assert.ok(response.body.data.metadata?.provider);
});

test("phase 2: recommendations are personalized with saved/search signals", async () => {
    const uploaded = await request(app).post("/api/v1/candidates/me/resumes").set(auth(candidateToken)).attach("resume", require("node:path").join(__dirname, "fixtures", "resume.pdf"));
    assert.equal(uploaded.status, 202, JSON.stringify(uploaded.body));
    const saved = await request(app).post(`/api/v1/candidates/me/saved-jobs/${nodeJobId}`).set(auth(candidateToken));
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    const recommendations = await request(app).get("/api/v1/candidates/me/recommendations").set(auth(candidateToken));
    assert.equal(recommendations.status, 200, JSON.stringify(recommendations.body));
    assert.ok(Array.isArray(recommendations.body.data));
    assert.equal(typeof recommendations.body.data[0].signalBoost, "number");
    assert.ok(recommendations.body.meta.signals.savedSkillCount >= 1, "saved-job skills should feed the signal");
    assert.ok(recommendations.body.data.every((item) => String(item.job.id) !== String(nodeJobId)), "saved job must not be recommended");
});
