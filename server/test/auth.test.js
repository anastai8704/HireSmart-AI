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

test("register returns success for a valid candidate", async () => {
    const response = await request(app)
        .post("/api/auth/register")
        .send({
            name: "Test Candidate",
            email: "candidate@example.com",
            password: "password123",
        });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.user.email, "candidate@example.com");
});

test("login returns token for valid credentials", async () => {
    await request(app).post("/api/auth/register").send({
        name: "Test Candidate",
        email: "candidate@example.com",
        password: "password123",
    });

    const response = await request(app)
        .post("/api/auth/login")
        .send({
            email: "candidate@example.com",
            password: "password123",
        });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(response.body.token);
});

test("register rejects invalid email", async () => {
    const response = await request(app)
        .post("/api/auth/register")
        .send({
            name: "Test Candidate",
            email: "invalid-email",
            password: "password123",
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
});
