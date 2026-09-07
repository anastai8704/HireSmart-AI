process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { notify } = require("../services/notificationService");
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let candidateToken;
let adminToken;
let candidateId;
let deliveredId;

const registerAndLogin = async (email, intent = "candidate", organizationName) => {
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
  assert.equal(registration.status, 201, JSON.stringify(registration.body).slice(0, 800));
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "StrongPassword123!" });
  assert.equal(login.status, 200, JSON.stringify(login.body).slice(0, 800));
  return login.body.data.accessToken;
};

test.before(async () => {
  await startDatabase();
});
test.after(async () => {
  await stopDatabase();
});

test("seed a candidate and an admin", async () => {
  await clearDatabase();
  candidateToken = await registerAndLogin("notif-candidate@example.com");
  adminToken = await registerAndLogin("notif-admin@example.com");
  const candidate = await User.findOne({ email: "notif-candidate@example.com" });
  const admin = await User.findOne({ email: "notif-admin@example.com" });
  await User.updateOne({ _id: admin._id }, { $set: { role: "admin" } });
  candidateId = candidate._id;
});

test("the preference template is role aware", async () => {
  const candidate = await request(app)
    .get("/api/v1/notifications/preferences")
    .set(auth(candidateToken));
  assert.equal(candidate.status, 200);
  const candidateKeys = candidate.body.data.groups.map((g) => g.key);
  for (const key of ["applications", "interviews", "jobs", "ai_career", "security"])
    assert.ok(candidateKeys.includes(key), `candidate should see ${key}`);
  for (const key of ["team", "approvals", "companies"])
    assert.ok(!candidateKeys.includes(key), `candidate must not see ${key}`);

  const admin = await request(app)
    .get("/api/v1/notifications/preferences")
    .set(auth(adminToken));
  const adminKeys = admin.body.data.groups.map((g) => g.key);
  for (const key of ["approvals", "companies", "users", "security"])
    assert.ok(adminKeys.includes(key), `admin should see ${key}`);
  for (const key of ["team", "candidates", "interviews"])
    assert.ok(!adminKeys.includes(key), `admin must not see ${key}`);

  // Security events are flagged always-on; approval events are toggleable.
  const security = admin.body.data.groups.find((g) => g.key === "security");
  assert.equal(security.alwaysOn, true);
  assert.ok(security.events.every((e) => e.alwaysOn === true));
  const approvals = admin.body.data.groups.find((g) => g.key === "approvals");
  assert.ok(approvals.events.some((e) => e.key === "job_submitted_for_approval"));
  assert.ok(approvals.events.every((e) => e.alwaysOn === false));
});

test("event preferences persist and unknown keys are ignored", async () => {
  const updated = await request(app)
    .patch("/api/v1/users/me/notification-prefs")
    .set(auth(candidateToken))
    .send({
      events: {
        application_acknowledged: { inApp: false },
        not_a_real_event: { inApp: false },
      },
    });
  assert.equal(updated.status, 200, JSON.stringify(updated.body).slice(0, 800));
  const user = await User.findById(candidateId).lean();
  assert.equal(user.notificationPrefs.events.application_acknowledged.inApp, false);
  assert.equal(user.notificationPrefs.events.not_a_real_event, undefined);

  // Security events can never be stored as off.
  const sec = await request(app)
    .patch("/api/v1/users/me/notification-prefs")
    .set(auth(candidateToken))
    .send({ events: { password_changed: { inApp: false } } });
  assert.equal(sec.status, 200);
  const after = await User.findById(candidateId).lean();
  assert.notEqual(after.notificationPrefs.events.password_changed?.inApp, false);
});

test("notify() honors event preferences", async () => {
  // inApp is off for application_acknowledged -> nothing is stored.
  const suppressed = await notify({
    user: candidateId,
    type: "application_acknowledged",
    title: "Application received",
    message: "Your application was received.",
    resourceType: "application",
    resourceId: "507f1f77bcf86cd799439011",
    idempotencyKey: "test:suppressed",
  });
  assert.equal(suppressed, null, "a suppressed event must not create a notification");
  assert.equal(
    await Notification.countDocuments({ user: candidateId, idempotencyKey: "test:suppressed" }),
    0,
  );

  // Re-enable and verify the catalog-derived category + recipient role.
  await request(app)
    .patch("/api/v1/users/me/notification-prefs")
    .set(auth(candidateToken))
    .send({ events: { application_acknowledged: { inApp: true } } });
  const delivered = await notify({
    user: candidateId,
    type: "application_acknowledged",
    title: "Application received",
    message: "Your application was received.",
    resourceType: "application",
    resourceId: "507f1f77bcf86cd799439011",
    idempotencyKey: "test:delivered",
  });
  assert.ok(delivered, "the re-enabled event must be delivered");
  deliveredId = delivered._id;
  assert.equal(delivered.category, "applications");
  assert.equal(delivered.recipientRole, "candidate");
  assert.equal(delivered.resourceType, "application");
});

test("security notifications are always delivered", async () => {
  // Force the stored preference off at the database level; delivery must survive.
  await User.updateOne(
    { _id: candidateId },
    { $set: { "notificationPrefs.events.password_changed": { inApp: false } } },
  );
  const delivered = await notify({
    user: candidateId,
    type: "password_changed",
    title: "Password changed",
    message: "Your password was changed successfully.",
    resourceType: "user",
    resourceId: candidateId,
    idempotencyKey: "test:always-on",
  });
  assert.ok(delivered, "security events must ignore user preferences");
  assert.equal(delivered.category, "security");
  await User.updateOne(
    { _id: candidateId },
    { $unset: { "notificationPrefs.events.password_changed": 1 } },
  );
});

test("unread count, read and unread state round-trip", async () => {
  const unreadCount = async () => {
    const count = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set(auth(candidateToken));
    assert.equal(count.status, 200);
    return count.body.data.count;
  };
  const before = await unreadCount();
  assert.ok(before >= 1, "earlier fixtures should be unread");

  const second = await notify({
    user: candidateId,
    type: "interview_invitation",
    title: "Interview invitation",
    message: "You have been invited to an interview.",
    resourceType: "interview",
    resourceId: "507f1f77bcf86cd799439012",
    idempotencyKey: "test:second",
  });
  assert.ok(second, "the interview invitation must be delivered");
  assert.equal(await unreadCount(), before + 1);

  const read = await request(app)
    .post(`/api/v1/notifications/${deliveredId}/read`)
    .set(auth(candidateToken));
  assert.equal(read.status, 200);
  assert.ok(read.body.data.readAt);
  assert.equal(await unreadCount(), before, "marking one notification read lowers the count");

  const markUnread = await request(app)
    .post(`/api/v1/notifications/${deliveredId}/unread`)
    .set(auth(candidateToken));
  assert.equal(markUnread.status, 200);
  assert.equal(markUnread.body.data.readAt, null, "marking unread clears the read state");
  assert.equal(await unreadCount(), before + 1);

  const readAll = await request(app)
    .post("/api/v1/notifications/read-all")
    .set(auth(candidateToken));
  assert.equal(readAll.status, 200);
  assert.equal(await unreadCount(), 0, "mark all read clears every unread notification");
});

test("team events notify the organization owner", async () => {
  // Owner A creates a company; B joins as company admin; B invites C.
  const ownerAToken = await registerAndLogin("team-a@example.com", "recruiter", "Team Co A");
  const ownerBToken = await registerAndLogin("team-b@example.com", "recruiter", "Team Co B");
  const ownerA = await User.findOne({ email: "team-a@example.com" }).lean();
  const orgA = (await request(app).get("/api/v1/organizations/me").set(auth(ownerAToken))).body
    .data[0];

  const addMember = await request(app)
    .post(`/api/v1/organizations/${orgA.id}/members`)
    .set(auth(ownerAToken))
    .send({ email: "team-b@example.com", role: "admin" });
  assert.equal(addMember.status, 200, JSON.stringify(addMember.body).slice(0, 500));

  const invite = await request(app)
    .post(`/api/v1/organizations/${orgA.id}/invitations`)
    .set(auth(ownerBToken))
    .send({ email: "team-c@example.com", role: "recruiter" });
  assert.equal(invite.status, 201, JSON.stringify(invite.body).slice(0, 500));
  const invited = await Notification.findOne({
    user: ownerA._id,
    type: "member_invited",
  });
  assert.ok(invited, "the owner must be notified when a member is invited");
  assert.equal(invited.category, "team");
  assert.equal(String(invited.organization), String(orgA.id));

  const accepted = await request(app)
    .post("/api/v1/invitations/" + invite.body.data.invitation.token + "/accept")
    .send({ name: "Team C", password: "StrongPassword123!" });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body).slice(0, 500));
  const join = await Notification.findOne({ user: ownerA._id, type: "invitation_accepted" });
  assert.ok(join, "the owner must be notified when an invitation is accepted");
  assert.equal(join.category, "team");
});
