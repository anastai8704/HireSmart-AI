process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const Invite = require("../models/Invite");
const { Membership } = require("../models/Membership");
const { permissionsByRole } = require("../models/Membership");
const auth = (token) => ({ Authorization: `Bearer ${token}` });

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

const orgOf = async (token) => {
  const res = await request(app).get("/api/v1/organizations").set(auth(token));
  assert.equal(res.status, 200);
  return res.body.data[0];
};

const invite = async (actorToken, orgId, email, role, extra = {}) =>
  request(app)
    .post(`/api/v1/organizations/${orgId}/invitations`)
    .set(auth(actorToken))
    .send({ email, role, ...extra });

const acceptExisting = (token, userToken) =>
  request(app).post(`/api/v1/invitations/${token}/accept-existing`).set(auth(userToken));

const membershipOf = async (orgId, user) =>
  Membership.findOne({ organization: orgId, user: user._id });

test.before(async () => {
  await startDatabase();
});
test.after(async () => {
  await stopDatabase();
});

test("seed a clean database for the invitation suite", async () => {
  await clearDatabase();
});

test("case 1: correct email + valid token accepts with ONLY the invited role", async () => {
  const ownerToken = await registerAndLogin("t1-owner@invite.test", "recruiter", "Invite Co 1");
  const org = await orgOf(ownerToken);
  const created = await invite(ownerToken, org.id, "t1-invitee@invite.test", "interviewer");
  assert.equal(created.status, 201, JSON.stringify(created.body).slice(0, 500));
  const token = created.body.data.invitation.token;

  const inviteeToken = await registerAndLogin("t1-invitee@invite.test");
  const invitee = await User.findOne({ email: "t1-invitee@invite.test" });

  const res = await acceptExisting(token, inviteeToken);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 500));
  assert.equal(res.body.data.role, "interviewer");
  assert.equal(res.body.data.organization.id, org.id);

  const membership = await membershipOf(org.id, invitee);
  assert.ok(membership, "an active membership must exist");
  assert.equal(membership.role, "interviewer", "membership must carry the invited role");
  assert.equal(membership.status, "active");
  assert.deepEqual(membership.permissions, []);

  const stored = await Invite.findOne({ token });
  assert.equal(stored.status, "accepted");
  assert.equal(String(stored.acceptedBy), String(invitee._id));
  assert.ok(stored.acceptedAt instanceof Date, "acceptedAt must be recorded");
});

test("case 2: wrong logged-in email + valid token is blocked, no membership created", async () => {
  const ownerToken = await registerAndLogin("t2-owner@invite.test", "recruiter", "Invite Co 2");
  const org = await orgOf(ownerToken);
  const created = await invite(ownerToken, org.id, "t2-target@invite.test", "admin");
  const token = created.body.data.invitation.token;

  const wrongToken = await registerAndLogin("t2-wrong@invite.test");
  const wrong = await User.findOne({ email: "t2-wrong@invite.test" });

  const res = await acceptExisting(token, wrongToken);
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "INVITE_EMAIL_MISMATCH");
  assert.equal(res.body.message, "This invitation was sent to a different email address.");

  assert.equal(await membershipOf(org.id, wrong), null, "no membership for the wrong account");
  const stored = await Invite.findOne({ token });
  assert.equal(stored.status, "pending", "a rejected acceptance must not consume the invitation");
});

test("case 3: expired token cannot be opened or accepted", async () => {
  const ownerToken = await registerAndLogin("t3-owner@invite.test", "recruiter", "Invite Co 3");
  const org = await orgOf(ownerToken);
  const created = await invite(ownerToken, org.id, "t3-user@invite.test", "recruiter");
  const token = created.body.data.invitation.token;
  await Invite.updateOne(
    { token },
    { $set: { expiresAt: new Date(Date.now() - 60_000) } },
  );

  const info = await request(app).get(`/api/v1/invitations/${token}`);
  assert.equal(info.status, 410);
  assert.equal(info.body.code, "INVITE_EXPIRED");

  const userToken = await registerAndLogin("t3-user@invite.test");
  const user = await User.findOne({ email: "t3-user@invite.test" });
  const res = await acceptExisting(token, userToken);
  assert.equal(res.status, 410);
  assert.equal(res.body.code, "INVITE_EXPIRED");
  assert.equal(await membershipOf(org.id, user), null);
});

test("case 4: revoked token cannot be accepted and carries revokedAt", async () => {
  const ownerToken = await registerAndLogin("t4-owner@invite.test", "recruiter", "Invite Co 4");
  const org = await orgOf(ownerToken);
  const created = await invite(ownerToken, org.id, "t4-user@invite.test", "recruiter");
  const invitation = created.body.data.invitation;

  const revoke = await request(app)
    .delete(`/api/v1/organizations/${org.id}/invitations/${invitation._id}`)
    .set(auth(ownerToken));
  assert.equal(revoke.status, 200, JSON.stringify(revoke.body).slice(0, 300));

  const userToken = await registerAndLogin("t4-user@invite.test");
  const user = await User.findOne({ email: "t4-user@invite.test" });
  const res = await acceptExisting(invitation.token, userToken);
  assert.equal(res.status, 410);
  assert.equal(res.body.code, "INVITE_REVOKED");
  assert.equal(await membershipOf(org.id, user), null);

  const stored = await Invite.findOne({ _id: invitation._id });
  assert.equal(stored.status, "revoked");
  assert.ok(stored.revokedAt instanceof Date, "revokedAt must be recorded");
});

test("case 5: already-accepted token is rejected on retry", async () => {
  const ownerToken = await registerAndLogin("t5-owner@invite.test", "recruiter", "Invite Co 5");
  const org = await orgOf(ownerToken);
  const created = await invite(ownerToken, org.id, "t5-user@invite.test", "recruiter");
  const token = created.body.data.invitation.token;
  const userToken = await registerAndLogin("t5-user@invite.test");
  const user = await User.findOne({ email: "t5-user@invite.test" });

  const first = await acceptExisting(token, userToken);
  assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 300));
  const retry = await acceptExisting(token, userToken);
  assert.equal(retry.status, 409);
  assert.equal(retry.body.code, "INVITE_USED");
  assert.equal(
    await Membership.countDocuments({ organization: org.id, user: user._id }),
    1,
    "exactly one membership",
  );
});

test("case 6: token reuse under a race results in exactly one acceptance", async () => {
  const ownerToken = await registerAndLogin("t6-owner@invite.test", "recruiter", "Invite Co 6");
  const org = await orgOf(ownerToken);
  const created = await invite(ownerToken, org.id, "t6-user@invite.test", "recruiter");
  const token = created.body.data.invitation.token;
  const userToken = await registerAndLogin("t6-user@invite.test");
  const user = await User.findOne({ email: "t6-user@invite.test" });

  const results = await Promise.all(
    [1, 2, 3].map(() => acceptExisting(token, userToken)),
  );
  const ok = results.filter((r) => r.status === 200);
  assert.equal(ok.length, 1, JSON.stringify(results.map((r) => r.status)));
  for (const failed of results.filter((r) => r.status !== 200)) {
    assert.equal(failed.status, 409);
  }
  assert.equal(
    await Membership.countDocuments({ organization: org.id, user: user._id }),
    1,
    "exactly one membership after the race",
  );
});

test("case 7: duplicate member cannot accept — and an invite cannot change their role", async () => {
  const ownerToken = await registerAndLogin("t7-owner@invite.test", "recruiter", "Invite Co 7");
  const org = await orgOf(ownerToken);
  // Invitation exists first (member.manage guard allows it while not a member).
  const created = await invite(ownerToken, org.id, "t7-user@invite.test", "admin");
  const token = created.body.data.invitation.token;

  // The person joins as a plain recruiter through the member API.
  await registerAndLogin("t7-user@invite.test");
  const added = await request(app)
    .post(`/api/v1/organizations/${org.id}/members`)
    .set(auth(ownerToken))
    .send({ email: "t7-user@invite.test", role: "recruiter" });
  assert.ok([200, 201].includes(added.status), JSON.stringify(added.body).slice(0, 300));

  const userToken = await (
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "t7-user@invite.test", password: "StrongPassword123!" })
  ).body.data.accessToken;
  const user = await User.findOne({ email: "t7-user@invite.test" });

  const res = await acceptExisting(token, userToken);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "ALREADY_MEMBER");

  const membership = await membershipOf(org.id, user);
  assert.equal(membership.role, "recruiter", "an invitation must never re-role an active member");
  assert.equal(
    await Membership.countDocuments({ organization: org.id, user: user._id }),
    1,
  );
});

test("case 8: unauthorized invite attempts are rejected", async () => {
  const ownerToken = await registerAndLogin("t8-owner@invite.test", "recruiter", "Invite Co 8");
  const org = await orgOf(ownerToken);
  await registerAndLogin("t8-recruiter@invite.test");
  const added = await request(app)
    .post(`/api/v1/organizations/${org.id}/members`)
    .set(auth(ownerToken))
    .send({ email: "t8-recruiter@invite.test", role: "recruiter" });
  assert.ok([200, 201].includes(added.status));
  const recruiterToken = await (
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "t8-recruiter@invite.test", password: "StrongPassword123!" })
  ).body.data.accessToken;

  const asRecruiter = await invite(recruiterToken, org.id, "t8-x@invite.test", "recruiter");
  assert.equal(asRecruiter.status, 404, "a member without member.manage cannot invite");

  const asOutsider = await invite(await registerAndLogin("t8-outsider@invite.test"), org.id, "t8-x@invite.test", "recruiter");
  assert.equal(asOutsider.status, 404, "a non-member cannot invite");

  assert.equal(
    await Invite.countDocuments({ organization: org.id }),
    0,
    "no invitation may have been created",
  );
});

test("case 9: unauthorized role change is rejected; authorized owner change works", async () => {
  const ownerToken = await registerAndLogin("t9-owner@invite.test", "recruiter", "Invite Co 9");
  const org = await orgOf(ownerToken);
  await registerAndLogin("t9-admin@invite.test");
  await registerAndLogin("t9-recruiter@invite.test");
  const adminAdded = await request(app)
    .post(`/api/v1/organizations/${org.id}/members`)
    .set(auth(ownerToken))
    .send({ email: "t9-admin@invite.test", role: "admin" });
  assert.ok([200, 201].includes(adminAdded.status));
  await request(app)
    .post(`/api/v1/organizations/${org.id}/members`)
    .set(auth(ownerToken))
    .send({ email: "t9-recruiter@invite.test", role: "recruiter" });

  const admin = await User.findOne({ email: "t9-admin@invite.test" });
  const recruiter = await User.findOne({ email: "t9-recruiter@invite.test" });
  const adminToken = (
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "t9-admin@invite.test", password: "StrongPassword123!" })
  ).body.data.accessToken;
  const targetMembership = await Membership.findOne({ organization: org.id, user: recruiter._id });

  // An admin cannot promote a member to the admin rank.
  const blocked = await request(app)
    .patch(`/api/v1/organizations/${org.id}/members/${targetMembership._id}`)
    .set(auth(adminToken))
    .send({ role: "admin" });
  assert.equal(blocked.status, 403);
  const after = await Membership.findById(targetMembership._id);
  assert.equal(after.role, "recruiter", "the role must be unchanged");

  // The owner can promote the same member.
  const allowed = await request(app)
    .patch(`/api/v1/organizations/${org.id}/members/${targetMembership._id}`)
    .set(auth(ownerToken))
    .send({ role: "admin" });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body).slice(0, 300));
  assert.equal((await Membership.findById(targetMembership._id)).role, "admin");
  assert.ok(admin, "fixture sanity");
});

test("case 10: unauthorized member removal is rejected; owner removal works", async () => {
  const ownerToken = await registerAndLogin("t10-owner@invite.test", "recruiter", "Invite Co 10");
  const org = await orgOf(ownerToken);
  await registerAndLogin("t10-admin-a@invite.test");
  await registerAndLogin("t10-admin-b@invite.test");
  for (const email of ["t10-admin-a@invite.test", "t10-admin-b@invite.test"]) {
    const res = await request(app)
      .post(`/api/v1/organizations/${org.id}/members`)
      .set(auth(ownerToken))
      .send({ email, role: "admin" });
    assert.ok([200, 201].includes(res.status));
  }
  const adminA = await User.findOne({ email: "t10-admin-a@invite.test" });
  const adminB = await User.findOne({ email: "t10-admin-b@invite.test" });
  const adminAToken = (
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "t10-admin-a@invite.test", password: "StrongPassword123!" })
  ).body.data.accessToken;
  const adminBMembership = await Membership.findOne({ organization: org.id, user: adminB._id });

  // An admin cannot remove a same-rank admin.
  const blocked = await request(app)
    .patch(`/api/v1/organizations/${org.id}/members/${adminBMembership._id}`)
    .set(auth(adminAToken))
    .send({ status: "revoked" });
  assert.equal(blocked.status, 403);
  assert.equal((await Membership.findById(adminBMembership._id)).status, "active");

  // An admin cannot remove or re-role themselves.
  const adminAMembership = await Membership.findOne({ organization: org.id, user: adminA._id });
  const selfBlock = await request(app)
    .patch(`/api/v1/organizations/${org.id}/members/${adminAMembership._id}`)
    .set(auth(adminAToken))
    .send({ status: "revoked" });
  assert.equal(selfBlock.status, 403);

  // The owner can remove an admin.
  const allowed = await request(app)
    .patch(`/api/v1/organizations/${org.id}/members/${adminBMembership._id}`)
    .set(auth(ownerToken))
    .send({ status: "revoked" });
  assert.equal(allowed.status, 200);
  assert.equal((await Membership.findById(adminBMembership._id)).status, "revoked");
});

test("case 11: invalid company IDs are rejected on team endpoints", async () => {
  const ownerToken = await registerAndLogin("t11-owner@invite.test", "recruiter", "Invite Co 11");
  await orgOf(ownerToken);
  const foreignOrgId = new mongoose.Types.ObjectId();

  const res = await invite(ownerToken, String(foreignOrgId), "t11-x@invite.test", "recruiter");
  assert.equal(res.status, 404, "a user cannot act on a company they are not a member of");

  const members = await request(app)
    .get(`/api/v1/organizations/${String(foreignOrgId)}/members`)
    .set(auth(ownerToken));
  assert.equal(members.status, 404);

  const link = await request(app)
    .get(`/api/v1/organizations/${String(foreignOrgId)}/invitations/${String(foreignOrgId)}/link`)
    .set(auth(ownerToken));
  assert.equal(link.status, 404);
});

test("case 12: invalid roles are rejected everywhere roles are accepted", async () => {
  const ownerToken = await registerAndLogin("t12-owner@invite.test", "recruiter", "Invite Co 12");
  const org = await orgOf(ownerToken);
  await registerAndLogin("t12-member@invite.test");

  // owner is never an assignable role...
  const asOwner = await invite(ownerToken, org.id, "t12-member@invite.test", "owner");
  assert.equal(asOwner.status, 422, JSON.stringify(asOwner.body).slice(0, 300));
  const addAsOwner = await request(app)
    .post(`/api/v1/organizations/${org.id}/members`)
    .set(auth(ownerToken))
    .send({ email: "t12-member@invite.test", role: "owner" });
  assert.equal(addAsOwner.status, 422);

  // ...and nonsense roles are rejected by the schemas.
  const asNonsense = await invite(ownerToken, org.id, "t12-member@invite.test", "superuser");
  assert.equal(asNonsense.status, 422);

  const member = await User.findOne({ email: "t12-member@invite.test" });
  const added = await request(app)
    .post(`/api/v1/organizations/${org.id}/members`)
    .set(auth(ownerToken))
    .send({ email: "t12-member@invite.test", role: "recruiter" });
  assert.ok([200, 201].includes(added.status));
  const membership = await Membership.findOne({ organization: org.id, user: member._id });
  const patchOwner = await request(app)
    .patch(`/api/v1/organizations/${org.id}/members/${membership._id}`)
    .set(auth(ownerToken))
    .send({ role: "owner" });
  assert.equal(patchOwner.status, 422);
  assert.equal((await Membership.findById(membership._id)).role, "recruiter");
});

test("the invitation list never leaks tokens; the link endpoint is the only source", async () => {
  const ownerToken = await registerAndLogin("t13-owner@invite.test", "recruiter", "Invite Co 13");
  const org = await orgOf(ownerToken);
  const created = await invite(ownerToken, org.id, "t13-user@invite.test", "recruiter");
  const invitation = created.body.data.invitation;
  const realToken = invitation.token;

  const list = await request(app)
    .get(`/api/v1/organizations/${org.id}/invitations`)
    .set(auth(ownerToken));
  assert.equal(list.status, 200);
  const item = list.body.data.find((i) => i._id === invitation._id);
  assert.ok(item, "the pending invitation appears in the list");
  assert.equal(item.email, "t13-user@invite.test");
  assert.ok(item.invitedBy, "invited-by is populated");
  assert.ok(item.createdAt && item.expiresAt, "created + expiration are present");
  assert.equal(item.expired, false);
  assert.equal(item.token, undefined, "the token field must not be in the list payload");
  assert.ok(!JSON.stringify(list.body).includes(realToken), "no list field carries the raw token");

  const link = await request(app)
    .get(`/api/v1/organizations/${org.id}/invitations/${invitation._id}/link`)
    .set(auth(ownerToken));
  assert.equal(link.status, 200);
  assert.ok(link.body.data.link.includes(`token=${realToken}`));

  // A member without member.manage cannot fetch the link either.
  await registerAndLogin("t13-viewer@invite.test");
  await request(app)
    .post(`/api/v1/organizations/${org.id}/members`)
    .set(auth(ownerToken))
    .send({ email: "t13-viewer@invite.test", role: "viewer" });
  const viewerToken = (
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "t13-viewer@invite.test", password: "StrongPassword123!" })
  ).body.data.accessToken;
  const viewerLink = await request(app)
    .get(`/api/v1/organizations/${org.id}/invitations/${invitation._id}/link`)
    .set(auth(viewerToken));
  assert.equal(viewerLink.status, 404);
});

test("resend re-issues an expired invitation with a fresh 7-day window", async () => {
  const ownerToken = await registerAndLogin("t14-owner@invite.test", "recruiter", "Invite Co 14");
  const org = await orgOf(ownerToken);
  const created = await invite(ownerToken, org.id, "t14-user@invite.test", "recruiter");
  const invitation = created.body.data.invitation;
  await Invite.updateOne(
    { _id: invitation._id },
    { $set: { expiresAt: new Date(Date.now() - 60_000) } },
  );

  const resent = await invite(ownerToken, org.id, "t14-user@invite.test", "recruiter", { resend: true });
  assert.equal(resent.status, 200, JSON.stringify(resent.body).slice(0, 400));
  const after = resent.body.data.invitation;
  assert.equal(String(after._id), String(invitation._id), "resend keeps the same invitation");
  assert.equal(after.token, invitation.token, "resend keeps the same token");
  assert.ok(new Date(after.expiresAt) > new Date(), "resend refreshes the expiry");

  const userToken = await registerAndLogin("t14-user@invite.test");
  const accepted = await acceptExisting(invitation.token, userToken);
  assert.equal(accepted.status, 200, "the re-sent link works again");
});

test("an invitation's role matches the invited role even for the highest assignable rank", async () => {
  const ownerToken = await registerAndLogin("t15-owner@invite.test", "recruiter", "Invite Co 15");
  const org = await orgOf(ownerToken);
  const created = await invite(ownerToken, org.id, "t15-admin@invite.test", "admin");
  assert.equal(created.status, 201);
  const userToken = await registerAndLogin("t15-admin@invite.test");
  const user = await User.findOne({ email: "t15-admin@invite.test" });
  const res = await acceptExisting(created.body.data.invitation.token, userToken);
  assert.equal(res.status, 200);
  const membership = await membershipOf(org.id, user);
  assert.equal(membership.role, "admin");
  // An admin joined by invitation is still below the owner on the ladder.
  assert.ok(permissionsByRole.admin.every((p) => permissionsByRole.owner.includes(p)));
});
