process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");

const app = require("../app");

test("health endpoint returns the service welcome message", async () => {
    const response = await request(app).get("/");

    assert.equal(response.status, 200);
    assert.equal(response.text, "Welcome to HireSmart AI");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
});

test("private upload paths are not publicly served", async () => {
    const response = await request(app).get("/uploads/resumes/private-resume.pdf");

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
});

test("unknown API routes use the standard JSON error format", async () => {
    const response = await request(app).get("/api/not-a-route");

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {
        success: false,
        status: "fail",
        message: "Route GET /api/not-a-route was not found",
    });
});

test("malformed JSON is rejected without leaking an internal error", async () => {
    const response = await request(app)
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send("not valid json");

    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Invalid JSON request body");
});

test("the development error route reaches the global error handler", async () => {
    const response = await request(app).get("/test-error");

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
        success: false,
        status: "fail",
        message: "Testing Global Error Handler",
    });
});
