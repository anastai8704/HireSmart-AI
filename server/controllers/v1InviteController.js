const bcrypt = require("bcryptjs");
const Invite = require("../models/Invite");
const User = require("../models/User");
const Consent = require("../models/Consent");
const { Membership } = require("../models/Membership");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { audit } = require("../services/auditService");
const { notify } = require("../services/notificationService");
const organizationOwner = require("../utils/organizationOwner");
const logger = require("../utils/logger");

const INVITE_EXPIRED_MSG =
  "This invitation has expired. Ask the person who invited you to send a new one.";

const notifyOwnerOfJoin = async ({ organizationId, orgName, joinerName, joinerId, invitationId }) => {
  try {
    const owner = await organizationOwner(organizationId);
    if (!owner || String(owner.id) === String(joinerId)) return;
    await notify({
      user: owner.id,
      organization: organizationId,
      type: "invitation_accepted",
      title: `Invitation accepted: ${joinerName}`,
      message: `${joinerName} joined ${orgName}.`,
      resourceType: "organization",
      resourceId: organizationId,
      idempotencyKey: `org:${organizationId}:invite-accepted:${invitationId}`,
    });
  } catch (error) {
    logger.error(`Invitation acceptance notification failed: ${error.message}`);
  }
};

/**
 * Maps a found invitation to the exact error it represents. An invitation
 * that is not (or no longer) pending cannot be used.
 */
const inviteStatusError = (invitation) => {
  if (!invitation)
    return new AppError(
      "This invitation link is no longer valid. Ask the person who invited you to send a new one.",
      404,
      "INVITE_INVALID",
    );
  if (invitation.status === "revoked")
    return new AppError(
      "This invitation was revoked by the organization. Ask the person who invited you to send a new one.",
      410,
      "INVITE_REVOKED",
    );
  if (invitation.status === "accepted")
    return new AppError(
      "This invitation has already been used.",
      409,
      "INVITE_USED",
    );
  return new AppError(INVITE_EXPIRED_MSG, 410, "INVITE_EXPIRED");
};

/** Read path: load a pending, unexpired invitation (used by info + pre-checks). */
const loadPendingInvite = async (token) => {
  const invitation = await Invite.findOne({ token })
    .populate("invitedBy", "name")
    .populate("organization", "name");
  if (!invitation || invitation.status !== "pending") throw inviteStatusError(invitation);
  if (invitation.expiresAt <= new Date())
    throw new AppError(INVITE_EXPIRED_MSG, 410, "INVITE_EXPIRED");
  return invitation;
};

/**
 * Single-use claim: atomically flips pending -> accepted. Only one concurrent
 * caller can win the claim, which makes the token single-use even under a
 * race (double-click, two tabs, parallel requests).
 */
const claimInvite = async (token) => {
  const now = new Date();
  const claimed = await Invite.findOneAndUpdate(
    { token, status: "pending", expiresAt: { $gt: now } },
    { $set: { status: "accepted", acceptedAt: now } },
    { new: true },
  )
    .populate("invitedBy", "name")
    .populate("organization", "name");
  if (claimed) return claimed;
  throw inviteStatusError(await Invite.findOne({ token }));
};

/**
 * Returns a consumed invitation to pending. Used only when acceptance fails
 * for a business reason AFTER the claim (e.g. the email suddenly has an
 * account), so the organization's pending invitation is not silently lost.
 */
const releaseInvite = async (invitationId) => {
  await Invite.updateOne(
    { _id: invitationId, status: "accepted" },
    { $set: { status: "pending" }, $unset: { acceptedAt: 1, acceptedBy: 1 } },
  );
};

/**
 * Public: what does this invitation link represent?
 */
exports.info = asyncHandler(async (req, res) => {
  const invitation = await loadPendingInvite(req.params.token);
  const accountExists = await User.exists({ email: invitation.email });
  res.json({
    data: {
      email: invitation.email,
      role: invitation.role,
      organization: { id: invitation.organization._id, name: invitation.organization.name },
      invitedByName: invitation.invitedBy?.name || "A team member",
      expiresAt: invitation.expiresAt,
      accountExists,
    },
  });
});

/**
 * Public: a brand-new person accepts by creating their account.
 * The account is ALWAYS created with the invited email — the caller cannot
 * choose a different identity. If the email already belongs to an account,
 * the client should sign the person in and call accept-existing instead.
 */
exports.accept = asyncHandler(async (req, res) => {
  const token = req.params.token;
  const pre = await Invite.findOne({ token });
  if (!pre || pre.status !== "pending") throw inviteStatusError(pre);
  if (pre.expiresAt <= new Date()) throw new AppError(INVITE_EXPIRED_MSG, 410, "INVITE_EXPIRED");
  if (await User.exists({ email: pre.email })) {
    throw new AppError(
      "An account with this email already exists. Sign in and accept the invitation instead.",
      409,
      "EMAIL_IN_USE",
    );
  }

  const invitation = await claimInvite(token);
  let user;
  try {
    user = await User.create({
      name: req.body.name,
      email: invitation.email,
      password: await bcrypt.hash(req.body.password, 12),
      role: "recruiter",
      accountStatus: "active",
      emailVerified: true,
    });
  } catch (error) {
    // Unique email raced in between the check and the insert.
    if (error?.code === 11000) {
      await releaseInvite(invitation._id);
      throw new AppError(
        "An account with this email already exists. Sign in and accept the invitation instead.",
        409,
        "EMAIL_IN_USE",
      );
    }
    throw error;
  }
  await Promise.all(
    ["terms", "privacy", "ai_processing"].map((purpose) =>
      Consent.create({ user: user._id, purpose, policyVersion: "2026-08", source: "registration" }),
    ),
  );
  const membership = await Membership.create({
    organization: invitation.organization._id,
    user: user._id,
    role: invitation.role,
    status: "active",
    invitedBy: invitation.invitedBy,
    joinedAt: new Date(),
  });
  invitation.acceptedBy = user._id;
  await invitation.save();
  await audit({
    req,
    organization: invitation.organization._id,
    action: "invitation.accepted",
    resourceType: "invitation",
    resourceId: invitation._id,
    metadata: { role: invitation.role },
  });
  await notifyOwnerOfJoin({
    organizationId: invitation.organization._id,
    orgName: invitation.organization.name,
    joinerName: user.name,
    joinerId: user._id,
    invitationId: invitation._id,
  });
  res.status(201).json({
    data: {
      organization: { id: invitation.organization._id, name: invitation.organization.name },
      role: membership.role,
    },
  });
});

/**
 * Authenticated: an existing account holder accepts an invitation addressed
 * to their email.
 *
 * Identity is enforced server-side: the authenticated email must equal the
 * invited email, otherwise no membership is created and the request is
 * rejected. An invitation can never change the role of an existing active
 * membership (that is a role-escalation vector) — such users get a conflict
 * instead.
 */
exports.acceptExisting = asyncHandler(async (req, res) => {
  const token = req.params.token;
  const pre = await Invite.findOne({ token });
  if (!pre || pre.status !== "pending") throw inviteStatusError(pre);
  if (pre.expiresAt <= new Date()) throw new AppError(INVITE_EXPIRED_MSG, 410, "INVITE_EXPIRED");
  if (String(req.user.email).toLowerCase() !== pre.email) {
    throw new AppError(
      "This invitation was sent to a different email address.",
      403,
      "INVITE_EMAIL_MISMATCH",
    );
  }
  const existingMembership = await Membership.findOne({
    organization: pre.organization,
    user: req.user._id,
    status: "active",
  });
  if (existingMembership) {
    throw new AppError(
      "You are already a member of this company.",
      409,
      "ALREADY_MEMBER",
    );
  }

  const invitation = await claimInvite(token);
  const membership = await Membership.findOneAndUpdate(
    { organization: invitation.organization._id, user: req.user._id },
    {
      role: invitation.role,
      status: "active",
      permissions: [],
      invitedBy: invitation.invitedBy,
      joinedAt: new Date(),
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );
  invitation.acceptedBy = req.user._id;
  await invitation.save();
  await audit({
    req,
    organization: invitation.organization._id,
    action: "invitation.accepted",
    resourceType: "invitation",
    resourceId: invitation._id,
    metadata: { role: invitation.role },
  });
  await notifyOwnerOfJoin({
    organizationId: invitation.organization._id,
    orgName: invitation.organization.name,
    joinerName: req.user.name,
    joinerId: req.user._id,
    invitationId: invitation._id,
  });
  res.json({
    data: {
      organization: { id: invitation.organization._id, name: invitation.organization.name },
      role: membership.role,
    },
  });
});
