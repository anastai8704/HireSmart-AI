process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const { createToken } = require("../utils/tokenHelper");
const User = require("../models/User");

const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const app = require("../app");

test.before(async () => {
    await startDatabase();
});

test.beforeEach(async () => {
    await clearDatabase();
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

test("change password succeeds when current password is correct", async () => {
    await request(app)
        .post("/api/auth/register")
        .send({
            name: "Test Candidate",
            email: "candidate@example.com",
            password: "password123",
        });

    const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
            email: "candidate@example.com",
            password: "password123",
        });

    const token = loginResponse.body.token;

    const response = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({
            currentPassword: "password123",
            newPassword: "newPassword456",
        });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.message, "Password changed successfully");
});

test("change password rejects an incorrect current password", async () => {
    await request(app)
        .post("/api/auth/register")
        .send({
            name: "Test Candidate",
            email: "candidate@example.com",
            password: "password123",
        });

    const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
            email: "candidate@example.com",
            password: "password123",
        });

    const token = loginResponse.body.token;

    const response = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({
            currentPassword: "wrongPassword",
            newPassword: "newPassword456",
        });

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, "Current password is incorrect");
});

test("verify email succeeds with valid token", async () => {
    await request(app).post("/api/auth/register").send({
        name: "Test Candidate",
        email: "candidate@example.com",
        password: "password123",
    });

    const user = await User.findOne({ email: "candidate@example.com" });
    const { token, hashedToken } = createToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationTokenExpires = new Date(Date.now() + 3600000);
    await user.save({ validateBeforeSave: false });

    const response = await request(app)
        .post("/api/auth/verify-email")
        .send({ token });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const refreshedUser = await User.findById(user._id);
    assert.equal(refreshedUser.emailVerified, true);
});

test("forgot password stores a reset token", async () => {
    await request(app).post("/api/auth/register").send({
        name: "Test Candidate",
        email: "candidate@example.com",
        password: "password123",
    });

    const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "candidate@example.com" });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const user = await User.findOne({ email: "candidate@example.com" }).select(
        "+resetPasswordToken"
    );
    assert.ok(user.resetPasswordToken);
    assert.ok(user.resetPasswordTokenExpires > new Date());
});

test("reset password succeeds with a valid token", async () => {
    await request(app).post("/api/auth/register").send({
        name: "Test Candidate",
        email: "candidate@example.com",
        password: "password123",
    });

    const user = await User.findOne({ email: "candidate@example.com" });
    const { token, hashedToken } = createToken();
    user.resetPasswordToken = hashedToken;
    user.resetPasswordTokenExpires = new Date(Date.now() + 3600000);
    await user.save({ validateBeforeSave: false });

    const response = await request(app)
        .post("/api/auth/reset-password")
        .send({ token, password: "newpassword123" });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
            email: "candidate@example.com",
            password: "newpassword123",
        });

    assert.equal(loginResponse.status, 200);
    assert.ok(loginResponse.body.token);
});
