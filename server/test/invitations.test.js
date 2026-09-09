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
const { Membership, permissionsByRole } = require("../models/Membership");
const { createSession } = require("../services/sessionService");

// NOTE: the route-level credential limiters (authLimit: 20/15min per IP) are
// ACTIVE in the test environment — productionCore.test.js relies on that.
// Every supertest request in this process shares one IP, so this suite
// registers each user over HTTP exactly once and mints session tokens
// in-process (createSession) instead of calling /auth/login per user.
const fakeReq = { get: () => "test", ip: "127.0.0.1" };
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const registerUser = async (email, intent = "candidate", organizationName) => {
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
  const user = await User.findOne({ email });
  const issued = await createSession(user, fakeReq);
  return {
    token: issued.accessToken,
    user,
    orgId: registration.body.data.organization?.id || null,
  };
};

const createOrg = async (ownerToken, name) => {
  const res = await request(app)
    .post("/api/v1/organizations")
    .set(auth(ownerToken))
    .send({ name });
  assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 300));
  return res.body.data;
};

const invite = async (actorToken, orgId, email, role, extra = {}) =>
  request(app)
    .post(`/api/v1/organizations/${orgId}/invitations`)
    .set(auth(actorToken))
    .send({ email, role, ...extra });

const addMember = async (actorToken, orgId, email, role) => {
  const res = await request(app)
    .post(`/api/v1/organizations/${orgId}/members`)
    .set(auth(actorToken))
    .send({ email, role });
  assert.ok([200, 201].includes(res.status), JSON.stringify(res.body).slice(0, 300));
  return res;
};

const patchMember = (actorToken, orgId, membershipId, body) =>
  request(app)
    .patch(`/api/v1/organizations/${orgId}/members/${membershipId}`)
    .set(auth(actorToken))
    .send(body);

const acceptExisting = (token, userToken) =>
  request(app).post(`/api/v1/invitations/${token}/accept-existing`).set(auth(userToken));

const membershipOf = async (orgId, user) =>
  Membership.findOne({ organization: orgId, user: user._id });

let ownerToken;

test.before(async () => {
  await startDatabase();
});
test.after(async () => {
  await stopDatabase();
});

test("seed a clean database and one shared owner", async () => {
  await clearDatabase();
  const created = await registerUser("t-owner@invite.test", "recruiter", "Invite HQ");
  ownerToken = created.token;
});

test("case 1: correct email + valid token accepts with ONLY the invited role", async () => {
  const org = await createOrg(ownerToken, "Invite Co 1");
  const created = await invite(ownerToken, org._id, "t1-invitee@invite.test", "interviewer");
  assert.equal(created.status, 201, JSON.stringify(created.body).slice(0, 500));
  const token = created.body.data.invitation.token;

  const invitee = await registerUser("t1-invitee@invite.test");

  const res = await acceptExisting(token, invitee.token);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 500));
  assert.equal(res.body.data.role, "interviewer");
  assert.equal(res.body.data.organization.id, org._id);

  const membership = await membershipOf(org._id, invitee.user);
  assert.ok(membership, "an active membership must exist");
  assert.equal(membership.role, "interviewer", "membership must carry the invited role");
  assert.equal(membership.status, "active");
  assert.deepEqual(membership.permissions, []);

  const stored = await Invite.findOne({ token });
  assert.equal(stored.status, "accepted");
  assert.equal(String(stored.acceptedBy), String(invitee.user._id));
  assert.ok(stored.acceptedAt instanceof Date, "acceptedAt must be recorded");
});

test("case 2: wrong logged-in email + valid token is blocked, no membership created", async () => {
  const org = await createOrg(ownerToken, "Invite Co 2");
  const created = await invite(ownerToken, org._id, "t2-target@invite.test", "admin");
  const token = created.body.data.invitation.token;

  const wrong = await registerUser("t2-wrong@invite.test");

  const res = await acceptExisting(token, wrong.token);
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "INVITE_EMAIL_MISMATCH");
  assert.equal(res.body.message, "This invitation was sent to a different email address.");

  assert.equal(await membershipOf(org._id, wrong.user), null, "no membership for the wrong account");
  const stored = await Invite.findOne({ token });
  assert.equal(stored.status, "pending", "a rejected acceptance must not consume the invitation");
});

test("case 3: expired token cannot be opened or accepted", async () => {
  const org = await createOrg(ownerToken, "Invite Co 3");
  const created = await invite(ownerToken, org._id, "t3-user@invite.test", "recruiter");
  const token = created.body.data.invitation.token;
  await Invite.updateOne({ token }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });

  const info = await request(app).get(`/api/v1/invitations/${token}`);
  assert.equal(info.status, 410);
  assert.equal(info.body.code, "INVITE_EXPIRED");

  const user = await registerUser("t3-user@invite.test");
  const res = await acceptExisting(token, user.token);
  assert.equal(res.status, 410);
  assert.equal(res.body.code, "INVITE_EXPIRED");
  assert.equal(await membershipOf(org._id, user.user), null);
});

test("case 4: revoked token cannot be accepted and carries revokedAt", async () => {
  const org = await createOrg(ownerToken, "Invite Co 4");
  const created = await invite(ownerToken, org._id, "t4-user@invite.test", "recruiter");
  const invitation = created.body.data.invitation;

  const revoke = await request(app)
    .delete(`/api/v1/organizations/${org._id}/invitations/${invitation._id}`)
    .set(auth(ownerToken));
  assert.equal(revoke.status, 200, JSON.stringify(revoke.body).slice(0, 300));

  const user = await registerUser("t4-user@invite.test");
  const res = await acceptExisting(invitation.token, user.token);
  assert.equal(res.status, 410);
  assert.equal(res.body.code, "INVITE_REVOKED");
  assert.equal(await membershipOf(org._id, user.user), null);

  const stored = await Invite.findOne({ _id: invitation._id });
  assert.equal(stored.status, "revoked");
  assert.ok(stored.revokedAt instanceof Date, "revokedAt must be recorded");
});

test("case 5: already-accepted token is rejected on retry", async () => {
  const org = await createOrg(ownerToken, "Invite Co 5");
  const created = await invite(ownerToken, org._id, "t5-user@invite.test", "recruiter");
  const token = created.body.data.invitation.token;
  const user = await registerUser("t5-user@invite.test");

  const first = await acceptExisting(token, user.token);
  assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 300));
  const retry = await acceptExisting(token, user.token);
  assert.equal(retry.status, 409);
  assert.equal(retry.body.code, "INVITE_USED");
  assert.equal(
    await Membership.countDocuments({ organization: org._id, user: user.user._id }),
    1,
    "exactly one membership",
  );
});

test("case 6: token reuse under a race results in exactly one acceptance", async () => {
  const org = await createOrg(ownerToken, "Invite Co 6");
  const created = await invite(ownerToken, org._id, "t6-user@invite.test", "recruiter");
  const token = created.body.data.invitation.token;
  const user = await registerUser("t6-user@invite.test");

  const results = await Promise.all([1, 2, 3].map(() => acceptExisting(token, user.token)));
  const ok = results.filter((r) => r.status === 200);
  assert.equal(ok.length, 1, JSON.stringify(results.map((r) => r.status)));
  for (const failed of results.filter((r) => r.status !== 200)) {
    assert.equal(failed.status, 409);
  }
  assert.equal(
    await Membership.countDocuments({ organization: org._id, user: user.user._id }),
    1,
    "exactly one membership after the race",
  );
});

test("case 7: duplicate member cannot accept — and an invite cannot change their role", async () => {
  const org = await createOrg(ownerToken, "Invite Co 7");
  // Invitation exists first (allowed while the person is not a member).
  const created = await invite(ownerToken, org._id, "t7-user@invite.test", "admin");
  const token = created.body.data.invitation.token;

  const user = await registerUser("t7-user@invite.test");
  // The person joins as a plain recruiter through the member API.
  await addMember(ownerToken, org._id, "t7-user@invite.test", "recruiter");

  const res = await acceptExisting(token, user.token);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "ALREADY_MEMBER");

  const membership = await membershipOf(org._id, user.user);
  assert.equal(membership.role, "recruiter", "an invitation must never re-role an active member");
  assert.equal(await Membership.countDocuments({ organization: org._id, user: user.user._id }), 1);
});

test("case 8: unauthorized invite attempts are rejected", async () => {
  const org = await createOrg(ownerToken, "Invite Co 8");
  const recruiter = await registerUser("t8-recruiter@invite.test");
  await addMember(ownerToken, org._id, "t8-recruiter@invite.test", "recruiter");

  const asRecruiter = await invite(recruiter.token, org._id, "t8-x@invite.test", "recruiter");
  assert.equal(asRecruiter.status, 404, "a member without member.manage cannot invite");

  const outsider = await registerUser("t8-outsider@invite.test");
  const asOutsider = await invite(outsider.token, org._id, "t8-x@invite.test", "recruiter");
  assert.equal(asOutsider.status, 404, "a non-member cannot invite");

  assert.equal(await Invite.countDocuments({ organization: org._id }), 0, "nothing was created");
});

test("case 9: unauthorized role change is rejected; authorized owner change works", async () => {
  const org = await createOrg(ownerToken, "Invite Co 9");
  const admin = await registerUser("t9-admin@invite.test");
  const recruiter = await registerUser("t9-recruiter@invite.test");
  await addMember(ownerToken, org._id, "t9-admin@invite.test", "admin");
  await addMember(ownerToken, org._id, "t9-recruiter@invite.test", "recruiter");
  const targetMembership = await Membership.findOne({ organization: org._id, user: recruiter.user._id });

  // An admin cannot promote a member to the admin rank.
  const blocked = await patchMember(admin.token, org._id, targetMembership._id, { role: "admin" });
  assert.equal(blocked.status, 403);
  assert.equal(
    (await Membership.findById(targetMembership._id)).role,
    "recruiter",
    "the role must be unchanged",
  );

  // The owner can promote the same member.
  const allowed = await patchMember(ownerToken, org._id, targetMembership._id, { role: "admin" });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body).slice(0, 300));
  assert.equal((await Membership.findById(targetMembership._id)).role, "admin");
});

test("case 10: unauthorized member removal is rejected; owner removal works", async () => {
  const org = await createOrg(ownerToken, "Invite Co 10");
  const adminA = await registerUser("t10-admin-a@invite.test");
  const adminB = await registerUser("t10-admin-b@invite.test");
  await addMember(ownerToken, org._id, "t10-admin-a@invite.test", "admin");
  await addMember(ownerToken, org._id, "t10-admin-b@invite.test", "admin");
  const adminAMembership = await Membership.findOne({ organization: org._id, user: adminA.user._id });
  const adminBMembership = await Membership.findOne({ organization: org._id, user: adminB.user._id });

  // An admin cannot remove a same-rank admin.
  const blocked = await patchMember(adminA.token, org._id, adminBMembership._id, { status: "revoked" });
  assert.equal(blocked.status, 403);
  assert.equal((await Membership.findById(adminBMembership._id)).status, "active");

  // An admin cannot remove or re-role themselves.
  const selfBlock = await patchMember(adminA.token, org._id, adminAMembership._id, { status: "revoked" });
  assert.equal(selfBlock.status, 403);
  assert.equal((await Membership.findById(adminAMembership._id)).status, "active");

  // The owner can remove an admin.
  const allowed = await patchMember(ownerToken, org._id, adminBMembership._id, { status: "revoked" });
  assert.equal(allowed.status, 200);
  assert.equal((await Membership.findById(adminBMembership._id)).status, "revoked");
});

test("case 11: invalid company IDs are rejected on team endpoints", async () => {
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
  const org = await createOrg(ownerToken, "Invite Co 12");
  const member = await registerUser("t12-member@invite.test");

  // owner is never an assignable role...
  const asOwner = await invite(ownerToken, org._id, "t12-member@invite.test", "owner");
  assert.equal(asOwner.status, 422, JSON.stringify(asOwner.body).slice(0, 300));
  const addAsOwner = await request(app)
    .post(`/api/v1/organizations/${org._id}/members`)
    .set(auth(ownerToken))
    .send({ email: "t12-member@invite.test", role: "owner" });
  assert.equal(addAsOwner.status, 422);

  // ...and nonsense roles are rejected by the schemas.
  const asNonsense = await invite(ownerToken, org._id, "t12-member@invite.test", "superuser");
  assert.equal(asNonsense.status, 422);

  await addMember(ownerToken, org._id, "t12-member@invite.test", "recruiter");
  const membership = await Membership.findOne({ organization: org._id, user: member.user._id });
  const patchOwner = await patchMember(ownerToken, org._id, membership._id, { role: "owner" });
  assert.equal(patchOwner.status, 422);
  assert.equal((await Membership.findById(membership._id)).role, "recruiter");
});

test("the invitation list never leaks tokens; the link endpoint is the only source", async () => {
  const org = await createOrg(ownerToken, "Invite Co 13");
  const lowMember = await registerUser("t13-low@invite.test");
  await addMember(ownerToken, org._id, "t13-low@invite.test", "viewer");
  const created = await invite(ownerToken, org._id, "t13-user@invite.test", "recruiter");
  const invitation = created.body.data.invitation;
  const realToken = invitation.token;

  const list = await request(app)
    .get(`/api/v1/organizations/${org._id}/invitations`)
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
    .get(`/api/v1/organizations/${org._id}/invitations/${invitation._id}/link`)
    .set(auth(ownerToken));
  assert.equal(link.status, 200);
  assert.ok(link.body.data.link.includes(`token=${realToken}`));

  // A member without member.manage cannot fetch the link either.
  const viewerLink = await request(app)
    .get(`/api/v1/organizations/${org._id}/invitations/${invitation._id}/link`)
    .set(auth(lowMember.token));
  assert.equal(viewerLink.status, 404);
});

test("resend re-issues an expired invitation with a fresh 7-day window", async () => {
  const org = await createOrg(ownerToken, "Invite Co 14");
  const created = await invite(ownerToken, org._id, "t14-user@invite.test", "recruiter");
  const invitation = created.body.data.invitation;
  await Invite.updateOne(
    { _id: invitation._id },
    { $set: { expiresAt: new Date(Date.now() - 60_000) } },
  );

  const resent = await invite(ownerToken, org._id, "t14-user@invite.test", "recruiter", { resend: true });
  assert.equal(resent.status, 200, JSON.stringify(resent.body).slice(0, 400));
  const after = resent.body.data.invitation;
  assert.equal(String(after._id), String(invitation._id), "resend keeps the same invitation");
  assert.equal(after.token, invitation.token, "resend keeps the same token");
  assert.ok(new Date(after.expiresAt) > new Date(), "resend refreshes the expiry");

  const user = await registerUser("t14-user@invite.test");
  const accepted = await acceptExisting(invitation.token, user.token);
  assert.equal(accepted.status, 200, "the re-sent link works again");
});

test("an invitation's role matches the invited role even for the highest assignable rank", async () => {
  const org = await createOrg(ownerToken, "Invite Co 15");
  const created = await invite(ownerToken, org._id, "t15-admin@invite.test", "admin");
  assert.equal(created.status, 201);
  const user = await registerUser("t15-admin@invite.test");
  const res = await acceptExisting(created.body.data.invitation.token, user.token);
  assert.equal(res.status, 200);
  const membership = await membershipOf(org._id, user.user);
  assert.equal(membership.role, "admin");
  // An admin joined by invitation is still below the owner on the ladder.
  assert.ok(permissionsByRole.admin.every((p) => permissionsByRole.owner.includes(p)));
});

test("case 16: admin cannot invite another admin; only owner can invite admin", async () => {
  const org = await createOrg(ownerToken, "Invite Co 16");
  const admin = await registerUser("t16-admin@invite.test");
  await addMember(ownerToken, org._id, "t16-admin@invite.test", "admin");

  // Admin trying to invite admin should be rejected with 403
  const blocked = await invite(admin.token, org._id, "t16-another-admin@invite.test", "admin");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.message, "Only the company owner can invite an admin.");

  // Admin can invite a recruiter
  const allowed = await invite(admin.token, org._id, "t16-recruiter@invite.test", "recruiter");
  assert.equal(allowed.status, 201);
});
