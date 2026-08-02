process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const request = require("supertest");

const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const app = require("../app");

test.before(async () => {
    await startDatabase();
});

test.after(async () => {
    await stopDatabase();
});

test.afterEach(async () => {
    await clearDatabase();
});

const candidateCredentials = {
    name: "Candidate One",
    email: "candidate1@example.com",
    password: "password123",
};

const recruiterCredentials = {
    name: "Recruiter One",
    email: "recruiter1@example.com",
    password: "password123",
};

const createCandidateWithResume = async () => {
    await request(app).post("/api/auth/register").send(candidateCredentials);
    const loginRes = await request(app).post("/api/auth/login").send({
        email: candidateCredentials.email,
        password: candidateCredentials.password,
    });
    const token = loginRes.body.token;

    const resumePath = path.join(__dirname, "fixtures", "resume.pdf");
    const uploadRes = await request(app)
        .put("/api/auth/resume")
        .set("Authorization", `Bearer ${token}`)
        .attach("resume", resumePath);

    assert.equal(uploadRes.status, 200);
    return token;
};

const createRecruiterAndJob = async (candidateToken) => {
    await request(app).post("/api/auth/register-recruiter").send(recruiterCredentials);
    const loginRes = await request(app).post("/api/auth/login").send({
        email: recruiterCredentials.email,
        password: recruiterCredentials.password,
    });
    const recruiterToken = loginRes.body.token;

    const jobRes = await request(app)
        .post("/api/jobs")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .send({
            title: "Developer",
            company: "Tech",
            location: "Remote",
            salary: 60000,
            experience: "3 years",
            jobType: "Full-Time",
            description: "Develop apps for a modern recruitment platform with REST APIs",
            skills: ["JavaScript", "Node.js"],
        });

    assert.equal(jobRes.status, 201);
    const jobId = jobRes.body.job._id;

    const applyRes = await request(app)
        .post(`/api/jobs/${jobId}/apply`)
        .set("Authorization", `Bearer ${candidateToken}`);

    assert.equal(applyRes.status, 201);
    return { recruiterToken, jobId };
};

test("candidate can upload resume and recruiter can download it", async () => {
    const candidateToken = await createCandidateWithResume();
    const { recruiterToken, jobId } = await createRecruiterAndJob(candidateToken);

    const candidate = await request(app)
        .post("/api/auth/login")
        .send(candidateCredentials);

    const candidateId = candidate.body.user.id;

    const response = await request(app)
        .get(`/api/jobs/candidate/${candidateId}/resume`)
        .set("Authorization", `Bearer ${recruiterToken}`)
        .query({ jobId });

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-disposition"].includes("attachment"), true);
});
