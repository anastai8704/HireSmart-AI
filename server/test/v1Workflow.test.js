process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const app = require("../app");
let candidateToken; let recruiterToken; let managerToken; let organizationId; let jobId; let applicationId; let resumeVersionId; let hiringManagerMembershipId;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const registerAndLogin = async ({ email, intent, organizationName }) => {
    const registration = await request(app).post("/api/v1/auth/register").send({ email, password: "StrongPassword123!", displayName: email.split("@")[0], accountIntent: intent, organizationName, termsConsent: true });
    assert.equal(registration.status, 201, JSON.stringify(registration.body));
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "StrongPassword123!" });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { token: login.body.data.accessToken, registration: registration.body.data };
};
test.before(async () => { await startDatabase(); });
test.after(async () => { await stopDatabase(); });
test.afterEach(async () => { /* workflow tests intentionally share state */ });
test("v1 candidate and recruiter can register with scoped organization", async () => {
    await clearDatabase();
    const recruiter = await registerAndLogin({ email: "owner@acme.example", intent: "recruiter", organizationName: "Acme Hiring" }); recruiterToken = recruiter.token; organizationId = recruiter.registration.organization.id;
    const candidate = await registerAndLogin({ email: "candidate@example.com", intent: "candidate" }); candidateToken = candidate.token;
    const manager = await registerAndLogin({ email: "manager@example.com", intent: "candidate" }); managerToken = manager.token;
    const orgs = await request(app).get("/api/v1/organizations").set(auth(recruiterToken)); assert.equal(orgs.status, 200); assert.equal(String(orgs.body.data[0].id), String(organizationId));
});
test("refresh sessions require CSRF and rotate successfully", async () => {
    const agent = request.agent(app); const login = await agent.post("/api/v1/auth/login").send({ email: "candidate@example.com", password: "StrongPassword123!" }); assert.equal(login.status, 200);
    const cookies = login.headers["set-cookie"] || []; const csrfCookie = cookies.find((value) => value.startsWith("hiresmart_csrf=")); const csrf = csrfCookie.split(";")[0].split("=")[1];
    const denied = await agent.post("/api/v1/auth/token"); assert.equal(denied.status, 403);
    const refreshed = await agent.post("/api/v1/auth/token").set("X-CSRF-Token", csrf); assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body)); assert.ok(refreshed.body.data.accessToken);
    const replayLogin = await request(app).post("/api/v1/auth/login").send({ email: "candidate@example.com", password: "StrongPassword123!" }); const oldCookies = replayLogin.headers["set-cookie"].map((value) => value.split(";")[0]); const oldCsrf = oldCookies.find((value) => value.startsWith("hiresmart_csrf=")).split("=")[1];
    const rotation = await request(app).post("/api/v1/auth/token").set("Cookie", oldCookies).set("X-CSRF-Token", oldCsrf); assert.equal(rotation.status, 200);
    const replay = await request(app).post("/api/v1/auth/token").set("Cookie", oldCookies).set("X-CSRF-Token", oldCsrf); assert.equal(replay.status, 401); assert.equal(replay.body.code, "SESSION_REUSE_DETECTED");
});
test("candidate securely uploads and processes a versioned resume", async () => {
    const response = await request(app).post("/api/v1/candidates/me/resumes").set(auth(candidateToken)).attach("resume", path.join(__dirname, "fixtures", "resume.pdf"));
    assert.equal(response.status, 202, JSON.stringify(response.body)); assert.equal(response.body.data.resumeVersion.processingStatus, "ready"); resumeVersionId = response.body.data.resumeVersion.id;
    const detail = await request(app).get(`/api/v1/candidates/me/resumes/versions/${resumeVersionId}`).set(auth(candidateToken)); assert.equal(detail.status, 200); assert.ok(detail.body.data.parsedResume);
});
test("recruiter creates and publishes a tenant-owned structured job", async () => {
    const created = await request(app).post(`/api/v1/organizations/${organizationId}/jobs`).set(auth(recruiterToken)).send({ title: "Backend Engineer", company: "Acme", location: "Ahmedabad", compensation: { min: 1000000, max: 1800000, currency: "INR", period: "year" }, experience: "3+ years", jobType: "Full-Time", workplaceMode: "hybrid", description: "Build secure Node.js APIs and production MongoDB services for our recruitment platform.", requiredSkills: ["Node.js", "MongoDB"], preferredSkills: ["Docker"] });
    assert.equal(created.status, 201, JSON.stringify(created.body)); jobId = created.body.data.id;
    const published = await request(app).post(`/api/v1/organizations/${organizationId}/jobs/${jobId}/publish`).set(auth(recruiterToken)); assert.equal(published.status, 200); assert.equal(published.body.data.status, "published");
});
test("owner can assign a hiring manager and assigned access is scoped", async () => {
    const members = await request(app).get(`/api/v1/organizations/${organizationId}/members`).set(auth(recruiterToken)); assert.equal(members.status, 200);
    const ownerMembershipId = members.body.data.find((item) => item.role === "owner")._id;
    const added = await request(app).post(`/api/v1/organizations/${organizationId}/members`).set(auth(recruiterToken)).send({ email: "manager@example.com", role: "hiring_manager" }); assert.equal(added.status, 201); hiringManagerMembershipId = added.body.data._id;
    const team = await request(app).put(`/api/v1/organizations/${organizationId}/jobs/${jobId}/hiring-team`).set(auth(recruiterToken)).send({ memberIds: [ownerMembershipId, hiringManagerMembershipId] }); assert.equal(team.status, 200);
    const assigned = await request(app).get(`/api/v1/organizations/${organizationId}/assigned-jobs`).set(auth(managerToken)); assert.equal(assigned.status, 200); assert.equal(assigned.body.data.length, 1);
});
test("candidate can save the published job", async () => {
    const saved = await request(app).post(`/api/v1/candidates/me/saved-jobs/${jobId}`).set(auth(candidateToken)); assert.equal(saved.status, 201);
    const list = await request(app).get("/api/v1/candidates/me/saved-jobs").set(auth(candidateToken)); assert.equal(list.status, 200); assert.equal(list.body.data.length, 1);
});
test("candidate gets explainable fit and submits immutable application", async () => {
    const fit = await request(app).post(`/api/v1/jobs/${jobId}/fit`).set(auth(candidateToken)).send({ resumeVersionId }); assert.equal(fit.status, 200, JSON.stringify(fit.body)); assert.ok(fit.body.data.componentScores.requiredSkills); assert.ok(Array.isArray(fit.body.data.missingRequiredSkills));
    const tailored = await request(app).post(`/api/v1/candidates/me/resumes/versions/${resumeVersionId}/tailor`).set(auth(candidateToken)).send({ jobId }); assert.equal(tailored.status, 200); assert.ok(tailored.body.data.improvement.suggestions);
    const applied = await request(app).post(`/api/v1/jobs/${jobId}/applications`).set(auth(candidateToken)).set("Idempotency-Key", "application-test-1").send({ resumeVersionId, source: "direct" }); assert.equal(applied.status, 201, JSON.stringify(applied.body)); applicationId = applied.body.data.id; assert.equal(applied.body.data.status, "submitted");
    const replay = await request(app).post(`/api/v1/jobs/${jobId}/applications`).set(auth(candidateToken)).set("Idempotency-Key", "application-test-1").send({ resumeVersionId, source: "direct" }); assert.equal(replay.status, 201); assert.equal(String(replay.body.data.id), String(applicationId));
    const duplicate = await request(app).post(`/api/v1/jobs/${jobId}/applications`).set(auth(candidateToken)).send({ resumeVersionId }); assert.equal(duplicate.status, 409);
});
test("recruiter calculates match, shortlists, contacts and schedules interview", async () => {
    const managerReview = await request(app).get(`/api/v1/organizations/${organizationId}/applications/${applicationId}`).set(auth(managerToken)); assert.equal(managerReview.status, 200);
    const managerDecision = await request(app).post(`/api/v1/organizations/${organizationId}/applications/${applicationId}/transitions`).set(auth(managerToken)).send({ toStatus: "under_review", note: "Hiring manager review started" }); assert.equal(managerDecision.status, 200);
    const match = await request(app).get(`/api/v1/organizations/${organizationId}/applications/${applicationId}/match`).set(auth(recruiterToken)); assert.equal(match.status, 200, JSON.stringify(match.body)); assert.ok(match.body.data.overallScore >= 0); assert.ok(match.body.data.confidence > 0);
    const shortlist = await request(app).post(`/api/v1/organizations/${organizationId}/applications/${applicationId}/shortlist`).set(auth(recruiterToken)).send({ note: "Evidence reviewed" }); assert.equal(shortlist.status, 200, JSON.stringify(shortlist.body)); assert.equal(shortlist.body.data.status, "shortlisted");
    const message = await request(app).post(`/api/v1/organizations/${organizationId}/applications/${applicationId}/messages`).set(auth(recruiterToken)).set("Idempotency-Key", "candidate-message-1").send({ subject: "Next steps", message: "We would like to schedule an interview." }); assert.equal(message.status, 202);
    const scheduledStart = new Date(Date.now() + 86400000); const interviewPayload = { applicationId, title: "Technical interview", type: "technical", scheduledStart, scheduledEnd: new Date(scheduledStart.getTime() + 3600000), timezone: "Asia/Kolkata" }; const interviewResponse = await request(app).post(`/api/v1/organizations/${organizationId}/interviews`).set(auth(recruiterToken)).set("Idempotency-Key", "interview-test-1").send(interviewPayload); assert.equal(interviewResponse.status, 201, JSON.stringify(interviewResponse.body)); const interviewId = interviewResponse.body.data._id;
    const interviewReplay = await request(app).post(`/api/v1/organizations/${organizationId}/interviews`).set(auth(recruiterToken)).set("Idempotency-Key", "interview-test-1").send(interviewPayload); assert.equal(interviewReplay.status, 201); assert.equal(String(interviewReplay.body.data._id), String(interviewId));
    const mine = await request(app).get("/api/v1/candidates/me/interviews").set(auth(candidateToken)); assert.equal(mine.status, 200); assert.equal(mine.body.data.length, 1);
    const assigned = await request(app).get(`/api/v1/organizations/${organizationId}/assigned-jobs`).set(auth(recruiterToken)); assert.equal(assigned.status, 200); assert.equal(assigned.body.data.length, 1);
    const confirmed = await request(app).post(`/api/v1/interviews/${interviewId}/confirm`).set(auth(candidateToken)); assert.equal(confirmed.status, 200); assert.equal(confirmed.body.data.status, "confirmed");
    const feedback = await request(app).post(`/api/v1/organizations/${organizationId}/interviews/${interviewId}/feedback`).set(auth(recruiterToken)).send({ ratings: [{ criterion: "Backend design", score: 4, evidence: "Explained API trade-offs" }], recommendation: "yes", summary: "Proceed" }); assert.equal(feedback.status, 201, JSON.stringify(feedback.body));
});
test("platform admin listings minimize PII and support account lifecycle", async () => {
    const password = await bcrypt.hash("StrongPassword123!", 12); const admin = await User.create({ name: "Platform Admin", email: "admin@platform.example", password, role: "admin", emailVerified: true, accountStatus: "active", resumeText: "PRIVATE RESUME TEXT MUST NOT LEAK" });
    const login = await request(app).post("/api/v1/auth/login").send({ email: admin.email, password: "StrongPassword123!" }); const token = login.body.data.accessToken;
    const listed = await request(app).get("/api/v1/admin/users").set(auth(token)); assert.equal(listed.status, 200); assert.equal(JSON.stringify(listed.body).includes("PRIVATE RESUME TEXT"), false); assert.equal(Object.hasOwn(listed.body.data[0], "password"), false);
    const suspended = await request(app).post(`/api/v1/admin/users/${managerToken ? (await User.findOne({ email: "manager@example.com" }))._id : ""}/suspend`).set(auth(token)).send({ reason: "Security review" }); assert.equal(suspended.status, 200);
    const reactivated = await request(app).post(`/api/v1/admin/users/${suspended.body.data.id}/reactivate`).set(auth(token)).send({ reason: "Review completed" }); assert.equal(reactivated.status, 200);
});
test("another organization cannot access the first tenant application", async () => {
    const other = await registerAndLogin({ email: "owner@other.example", intent: "recruiter", organizationName: "Other Org" });
    const response = await request(app).get(`/api/v1/organizations/${other.registration.organization.id}/applications/${applicationId}`).set(auth(other.token)); assert.equal(response.status, 404);
});
