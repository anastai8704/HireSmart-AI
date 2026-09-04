const bcrypt = require("bcryptjs");
const Invite = require("../models/Invite");
const User = require("../models/User");
const Consent = require("../models/Consent");
const { Membership } = require("../models/Membership");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { audit } = require("../services/auditService");

const loadPendingInvite = async (token) => {
  const invitation = await Invite.findOne({ token })
    .populate("invitedBy", "name")
    .populate("organization", "name");
  if (!invitation || invitation.status !== "pending")
    throw new AppError("This invitation is no longer valid", 404, "INVITE_INVALID");
  if (invitation.expiresAt <= new Date())
    throw new AppError(
      "This invitation has expired. Ask the person who invited you to send a new one.",
      410,
      "INVITE_EXPIRED",
    );
  return invitation;
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
 * If the email already belongs to an account, the client should sign the
 * person in and call accept-existing instead.
 */
exports.accept = asyncHandler(async (req, res) => {
  const invitation = await loadPendingInvite(req.params.token);
  const email = invitation.email;
  if (await User.exists({ email })) {
    throw new AppError(
      "An account with this email already exists. Sign in and accept the invitation instead.",
      409,
      "EMAIL_IN_USE",
    );
  }
  const user = await User.create({
    name: req.body.name,
    email,
    password: await bcrypt.hash(req.body.password, 12),
    role: "recruiter",
    accountStatus: "active",
    emailVerified: true,
  });
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
  invitation.status = "accepted";
  invitation.acceptedBy = user._id;
  invitation.acceptedAt = new Date();
  await invitation.save();
  await audit({
    req,
    organization: invitation.organization._id,
    action: "invitation.accepted",
    resourceType: "invitation",
    resourceId: invitation._id,
    metadata: { role: invitation.role },
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
 */
exports.acceptExisting = asyncHandler(async (req, res) => {
  const invitation = await loadPendingInvite(req.params.token);
  if (String(req.user.email).toLowerCase() !== invitation.email) {
    throw new AppError(
      "This invitation was sent to a different email address",
      403,
      "INVITE_EMAIL_MISMATCH",
    );
  }
  const membership = await Membership.findOneAndUpdate(
    { organization: invitation.organization._id, user: req.user._id },
    {
      role: invitation.role,
      status: "active",
      invitedBy: invitation.invitedBy,
      joinedAt: new Date(),
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );
  invitation.status = "accepted";
  invitation.acceptedBy = req.user._id;
  invitation.acceptedAt = new Date();
  await invitation.save();
  await audit({
    req,
    organization: invitation.organization._id,
    action: "invitation.accepted",
    resourceType: "invitation",
    resourceId: invitation._id,
    metadata: { role: invitation.role },
  });
  res.json({
    data: {
      organization: { id: invitation.organization._id, name: invitation.organization.name },
      role: membership.role,
    },
  });
});
