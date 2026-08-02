process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
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

const createRecruiter = async () => {
    await request(app).post("/api/auth/register-recruiter").send({
        name: "Recruiter One",
        email: "recruiter@example.com",
        password: "password123",
    });

    const login = await request(app).post("/api/auth/login").send({
        email: "recruiter@example.com",
        password: "password123",
    });

    return login.body.token;
};

test("create job succeeds with valid payload", async () => {
    const token = await createRecruiter();

    const response = await request(app)
        .post("/api/jobs")
        .set("Authorization", `Bearer ${token}`)
        .send({
            title: "Backend Developer",
            company: "Acme",
            location: "Remote",
            salary: 50000,
            experience: "2 years",
            jobType: "Full-Time",
            description: "Build APIs for a modern web application with REST endpoints",
            skills: ["Node.js", "MongoDB"],
        });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.job.title, "Backend Developer");
});

test("create job rejects missing required fields", async () => {
    const token = await createRecruiter();

    const response = await request(app)
        .post("/api/jobs")
        .set("Authorization", `Bearer ${token}`)
        .send({
            title: "Incomplete Job",
            company: "Acme",
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
});
