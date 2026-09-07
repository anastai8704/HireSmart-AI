process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
const { createToken } = require("../utils/tokenHelper");
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let token;
let userId;

const registerAndLogin = async (email) => {
  const registration = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: "StrongPassword123!",
      displayName: "Account Test",
      accountIntent: "candidate",
      termsConsent: true,
    });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "StrongPassword123!" });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return login.body.data.accessToken;
};

test.before(async () => {
  await startDatabase();
});
test.after(async () => {
  await stopDatabase();
});

test("seed a candidate", async () => {
  await clearDatabase();
  token = await registerAndLogin("accounts@example.com");
  const user = await User.findOne({ email: "accounts@example.com" });
  userId = user._id;
});

test("changing the password succeeds, notifies, audits and logs a security event", async () => {
  const changed = await request(app)
    .patch("/api/v1/auth/password")
    .set(auth(token))
    .send({ currentPassword: "StrongPassword123!", newPassword: "NewStrongPassword456!" });
  assert.equal(changed.status, 200, JSON.stringify(changed.body).slice(0, 1500));
  const note = await Notification.findOne({ user: userId, type: "password_changed" });
  assert.ok(note, "a password-changed notification must exist");
  assert.equal(note.category, "security");
  assert.match(note.message, /password was changed successfully/i);
  // CI processes job runs inline, so the email may already be marked sent;
  // locally it stays queued until the worker runs.
  assert.ok(
    ["queued", "sent"].includes(note.delivery.email),
    `password change email must be queued or sent, got ${note.delivery.email}`,
  );

  const auditEntry = await AuditLog.findOne({ action: "password.changed", resourceId: String(userId) });
  assert.ok(auditEntry, "the password change must be audited");
  const event = await SecurityEvent.findOne({ user: userId, type: "password.changed" });
  assert.ok(event, "the password change must create a security event");

  // The new password works and the old one does not.
  const again = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "accounts@example.com", password: "NewStrongPassword456!" });
  assert.equal(again.status, 200);
  const stale = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "accounts@example.com", password: "StrongPassword123!" });
  assert.equal(stale.status, 401);
  token = again.body.data.accessToken;
});

test("a wrong current password fails without a success notification", async () => {
  const before = await Notification.countDocuments({ user: userId, type: "password_changed" });
  const failed = await request(app)
    .patch("/api/v1/auth/password")
    .set(auth(token))
    .send({ currentPassword: "WrongPassword123!", newPassword: "AnotherStrong789!" });
  assert.equal(failed.status, 422, JSON.stringify(failed.body));
  assert.ok(!/stack/i.test(JSON.stringify(failed.body)), "no stack traces in error bodies");
  const after = await Notification.countDocuments({ user: userId, type: "password_changed" });
  assert.equal(after, before, "failed attempts must not create success notifications");
});

test("the user can read their own security activity", async () => {
  const res = await request(app).get("/api/v1/auth/security").set(auth(token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.data.some((e) => e.type === "password.changed"));
});

test("profile update persists the extended fields", async () => {
  const updated = await request(app)
    .patch("/api/v1/users/me")
    .set(auth(token))
    .send({
      name: "Account Tester",
      phone: "+91 98765 43210",
      headline: "Full-stack developer",
      location: "Pune",
      bio: "Building thoughtful products.",
      skills: ["Node.js", "React"],
      socialLinks: { linkedin: "https://linkedin.com/in/tester", github: "https://github.com/tester" },
    });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.displayName, "Account Tester");
  assert.equal(updated.body.data.phone, "+91 98765 43210");
  assert.equal(updated.body.data.skills.length, 2);
  assert.equal(updated.body.data.socialLinks.linkedin, "https://linkedin.com/in/tester");

  const invalid = await request(app)
    .patch("/api/v1/users/me")
    .set(auth(token))
    .send({ socialLinks: { linkedin: "not-a-url" } });
  assert.equal(invalid.status, 422, "invalid URLs must be rejected");
  assert.ok(invalid.body.fieldErrors?.length > 0, "field errors must be included");
});

test("avatar upload, retrieval and removal work end to end", async () => {
  // 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const uploaded = await request(app)
    .post("/api/v1/users/me/avatar")
    .set(auth(token))
    .attach("avatar", png, "avatar.png");
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  const me = await request(app).get("/api/v1/users/me").set(auth(token));
  assert.ok(
    me.body.data.profileImage.startsWith("/api/v1/avatars/avatar-"),
    "the profile photo URL must be a public capability URL",
  );

  // The URL must work without an auth header (header-less <img> requests).
  const photo = await request(app).get(me.body.data.profileImage);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers["content-type"], "image/png");
  assert.deepEqual(photo.body, png);

  const removed = await request(app).delete("/api/v1/users/me/avatar").set(auth(token));
  assert.equal(removed.status, 200);
  const after = await request(app).get("/api/v1/users/me/avatar").set(auth(token));
  assert.equal(after.status, 404);

  const rejected = await request(app)
    .post("/api/v1/users/me/avatar")
    .set(auth(token))
    .attach("avatar", Buffer.from("not an image"), "avatar.exe");
  assert.equal(rejected.status, 415, "non-image uploads must be rejected");
});

test("notification preferences persist; security categories are not user-configurable", async () => {
  const updated = await request(app)
    .patch("/api/v1/users/me/notification-prefs")
    .set(auth(token))
    .send({ applications: { email: false } });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.notificationPrefs.applications.email, false);

  const invalid = await request(app)
    .patch("/api/v1/users/me/notification-prefs")
    .set(auth(token))
    .send({ security: { inApp: false } });
  assert.equal(invalid.status, 422, "security prefs must not be configurable by users");
});

test("email change requires confirmation on the new address", async () => {
  const requested = await request(app)
    .post("/api/v1/auth/change-email")
    .set(auth(token))
    .send({ newEmail: "new-address@example.com" });
  assert.equal(requested.status, 202, JSON.stringify(requested.body));
  const user = await User.findById(userId).select("+pendingEmail");
  assert.equal(user.pendingEmail, "new-address@example.com");
  const before = user.email;
  assert.equal(before, "accounts@example.com", "the old email stays active until confirmed");

  const badToken = await request(app)
    .post("/api/v1/auth/confirm-email-change")
    .send({ token: "0".repeat(64) });
  assert.equal(badToken.status, 400, "an invalid token must not change the email");

  // Simulate the user clicking the link in the confirmation email.
  const { token: raw, hashedToken } = createToken();
  await User.updateOne({ _id: userId }, { pendingEmailToken: hashedToken });
  const confirmed = await request(app)
    .post("/api/v1/auth/confirm-email-change")
    .send({ token: raw });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  const after = await User.findById(userId);
  assert.equal(after.email, "new-address@example.com");
  assert.equal(after.emailVerified, false, "the new address must still be verified");
  const note = await Notification.findOne({ user: userId, type: "email_changed" });
  assert.ok(note, "the email change must create a security notification");
});
