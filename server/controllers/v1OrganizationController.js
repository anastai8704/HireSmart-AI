const crypto = require("node:crypto");
const Organization = require("../models/Organization");
const User = require("../models/User");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { Placement } = require("../models/Placement");
const { Membership } = require("../models/Membership");
const Invite = require("../models/Invite");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { config } = require("../config/env");
const { sendInviteEmail } = require("../services/emailService");
const { audit } = require("../services/auditService");
const { notify } = require("../services/notificationService");
const organizationOwner = require("../utils/organizationOwner");
const logger = require("../utils/logger");
const { parse, applyCursor, meta } = require("../utils/pagination");
const verificationService = require("../services/companyVerificationService");
const { getOrCreateOrgSubscription } = require("../middleware/subscriptionCheck");
const { ALL_PLANS, RECRUITER_PLANS } = require("../config/subscriptionPlans");
const { needsReviewQuery } = require("../domain/jobModerationPolicy");

const slugify = (v) =>
  String(v)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ROLE_RANK = Object.freeze({
  owner: 100,
  admin: 80,
  recruiter: 50,
  hiring_manager: 50,
  interviewer: 30,
  viewer: 30,
});

exports.create = asyncHandler(async (req, res) => {
  let slug = slugify(req.body.slug || req.body.name);
  const base = slug;
  for (let i = 1; await Organization.exists({ slug }); i += 1) slug = `${base}-${i}`;

  // Risk indicators are computed when verification details are submitted, never here.
  const organization = await Organization.create({
    ...req.body,
    slug,
    verificationStatus: "pending",
    riskScore: 0,
    riskFlags: [],
    websiteHost: verificationService.normalizeWebsiteHost(req.body.website),
  });

  await Membership.create({ organization: organization._id, user: req.user._id, role: "owner" });
  await getOrCreateOrgSubscription(organization._id);

  await audit({
    req,
    organization: organization._id,
    action: "organization.created",
    resourceType: "organization",
    resourceId: organization._id,
  });

  res.status(201).json({ data: organization });
});

exports.mine = asyncHandler(async (req, res) => {
  const memberships = await Membership.find({ user: req.user._id, status: "active" }).populate(
    "organization",
  );
  res.json({
    data: memberships
      .filter((m) => m.organization)
      .map((m) => ({
        id: m.organization._id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
        permissions: m.permissions,
        verificationStatus: m.organization.verificationStatus || "pending",
      })),
  });
});

exports.get = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.auth.organizationId);
  if (!org) throw new AppError("Organization not found", 404, "RESOURCE_NOT_FOUND");
  // Risk indicators and admin notes are internal to the platform.
  res.json({ data: verificationService.publicOrganization(org) });
});

exports.update = asyncHandler(async (req, res) => {
  // Only display fields here. Verification identifiers (registration number, GSTIN, business email,
  // address, documents) change only through the verification workflow, so evidence cannot drift.
  const allowed = ["name", "industry", "size", "website", "logo", "about", "timezone"];
  const update = {};
  for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];

  if (!Object.keys(update).length)
    throw new AppError("No valid organization fields to update", 422, "INVALID_PAYLOAD");

  const org = await Organization.findById(req.auth.organizationId);
  if (!org) throw new AppError("Organization not found", 404, "RESOURCE_NOT_FOUND");

  Object.assign(org, update);
  if (update.website !== undefined) org.websiteHost = verificationService.normalizeWebsiteHost(update.website);
  await org.save();
  // A changed name or website changes the identity the open case was built on.
  await verificationService.refreshOpenCase(org);

  await audit({
    req,
    organization: org._id,
    action: "organization.updated",
    resourceType: "organization",
    resourceId: org._id,
  });

  res.json({ data: org });
});

/**
 * Recruiter: Submit/Update Company Verification Details & Documents
 */
/**
 * Admin: Get complete organization details with owner, jobs, and verification details
 */
exports.adminGetOrgDetails = asyncHandler(async (req, res) => {
  if (req.auth.platformRole !== "platform_admin") {
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }

  const org = await Organization.findById(req.params.organizationId).populate("verifiedBy", "name email");
  if (!org) throw new AppError("Organization not found", 404, "RESOURCE_NOT_FOUND");

  const [
    ownerMembership,
    totalJobs,
    pendingJobs,
    approvedJobs,
    rejectedJobs,
    totalApplications,
    shortlistedCount,
    interviewCount,
    hiredCount,
    confirmedJoinings,
    verifiedEmployees,
  ] = await Promise.all([
    Membership.findOne({ organization: org._id, role: "owner" }).populate("user", "name email phone"),
    Job.countDocuments({ organization: org._id }),
    Job.countDocuments({ organization: org._id, ...needsReviewQuery() }),
    Job.countDocuments({ organization: org._id, "moderation.status": "approved" }),
    Job.countDocuments({ organization: org._id, "moderation.status": "rejected" }),
    Application.countDocuments({ organization: org._id }),
    Application.countDocuments({ organization: org._id, status: { $in: ["shortlisted", "Shortlisted"] } }),
    Application.countDocuments({ organization: org._id, status: { $in: ["interview", "Interview"] } }),
    Application.countDocuments({ organization: org._id, status: { $in: ["hired", "Selected"] } }),
    Placement.countDocuments({
      organization: org._id,
      status: { $in: ["joining_confirmed", "placement_verified", "verified_placement", "currently_working"] },
    }),
    Placement.countDocuments({
      organization: org._id,
      "verification.isVerified": true,
    }),
  ]);

  const currentCase = await verificationService.findCurrentCase(org._id);
  const verificationCase = currentCase ? await verificationService.caseDetail(currentCase._id) : null;

  res.json({
    data: {
      // Platform admins see the internal risk summary; recruiters never do (see publicOrganization).
      organization: {
        ...verificationService.publicOrganization(org),
        riskScore: org.riskScore,
        riskFlags: org.riskFlags,
        verificationNotes: org.verificationNotes,
      },
      verificationCase,
      owner: ownerMembership?.user || null,
      stats: {
        activeJobsCount: approvedJobs,
        applicationsCount: totalApplications,
      },
      hiringStats: {
        totalJobs,
        pendingJobs,
        approvedJobs,
        rejectedJobs,
        totalApplications,
        shortlistedCount,
        interviewCount,
        hiredCount,
        confirmedJoinings,
        verifiedEmployees,
      },
    },
  });
});

const requirePlatformAdmin = (req) => {
  if (req.auth.platformRole !== "platform_admin") {
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }
};

const loadOrgForAdmin = async (organizationId) => {
  const org = await Organization.findById(organizationId);
  if (!org) throw new AppError("Organization not found", 404, "RESOURCE_NOT_FOUND");
  return org;
};

/**
 * Admin: Approve and Verify Organization.
 * Delegates to the verification workflow: approval needs passing evidence (see
 * companyVerificationService.approveCase). Responses keep their previous shape.
 */
exports.adminVerifyOrg = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const org = await loadOrgForAdmin(req.params.organizationId);
  const caseDoc = await verificationService.ensureCurrentCase(org, req.user);
  await verificationService.approveCase({
    caseId: caseDoc._id,
    actor: req.user,
    req,
    notes: String(req.body?.notes || ""),
  });
  res.json({ data: await Organization.findById(org._id) });
});

/** Admin: Reject Organization Verification (reason required). */
exports.adminRejectOrg = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const reason = String(req.body?.reason || "").trim().slice(0, 2000);
  if (!reason) throw new AppError("Rejection reason is required", 422, "MISSING_REASON");
  const org = await loadOrgForAdmin(req.params.organizationId);
  const caseDoc = await verificationService.ensureCurrentCase(org, req.user);
  await verificationService.rejectCase({ caseId: caseDoc._id, actor: req.user, req, reason });
  res.json({ data: await Organization.findById(org._id) });
});

/** Admin: Request More Info from Organization (creates a request for changes). */
exports.adminRequestMoreInfoOrg = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const notes = String(req.body?.notes || "").trim().slice(0, 5000);
  if (!notes) throw new AppError("Notes explaining required information are required", 422, "MISSING_NOTES");
  const org = await loadOrgForAdmin(req.params.organizationId);
  const caseDoc = await verificationService.ensureCurrentCase(org, req.user);
  await verificationService.requestChanges({ caseId: caseDoc._id, actor: req.user, req, items: [notes] });
  res.json({ data: await Organization.findById(org._id) });
});

/** Admin: Suspend Organization. Closes live listings and records each change. */
exports.adminSuspendOrg = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const org = await loadOrgForAdmin(req.params.organizationId);
  const caseDoc = await verificationService.ensureCurrentCase(org, req.user);
  await verificationService.suspendCase({
    caseId: caseDoc._id,
    actor: req.user,
    req,
    reason: req.body?.reason,
  });
  res.json({ data: await Organization.findById(org._id) });
});

/** Admin: Reinstate a suspended organization after review (evidence is checked again). */
exports.adminReactivateOrg = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const org = await loadOrgForAdmin(req.params.organizationId);
  const caseDoc = await verificationService.ensureCurrentCase(org, req.user);
  await verificationService.restoreCase({
    caseId: caseDoc._id,
    actor: req.user,
    req,
    reason: req.body?.reason,
  });
  res.json({ data: await Organization.findById(org._id), message: "Organization reactivated successfully" });
});

exports.settings = asyncHandler(async (req, res) => {
  const org = await Organization.findOne({ _id: req.auth.organizationId });
  if (!org) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  if (typeof req.body.requireJobApproval === "boolean")
    org.settings.requireJobApproval = req.body.requireJobApproval;
  await org.save();
  await audit({
    req,
    organization: org._id,
    action: "organization.settings.updated",
    resourceType: "organization",
    resourceId: org._id,
    metadata: { requireJobApproval: org.settings.requireJobApproval },
  });
  res.json({ data: { id: org._id, name: org.name, slug: org.slug, settings: org.settings } });
});

exports.members = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const filter = applyCursor({ organization: req.auth.organizationId }, page.after);
  if (req.query.role) filter.role = req.query.role;
  const items = await Membership.find(filter)
    .populate("user", "name email isActive")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});

exports.addMember = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (!user) throw new AppError("User must register before being added", 404, "USER_NOT_FOUND");
  if (
    await Membership.findOne({
      organization: req.auth.organizationId,
      user: user._id,
      status: "active",
    })
  )
    throw new AppError("This person is already a member of the company", 409, "ALREADY_MEMBER");

  // Check Subscription Team Limit
  const sub = await getOrCreateOrgSubscription(req.auth.organizationId);
  const activeMembersCount = await Membership.countDocuments({
    organization: req.auth.organizationId,
    status: "active",
  });
  if (activeMembersCount >= (sub.limits?.teamMembers || 2)) {
    const plan = ALL_PLANS[sub.planTier] || RECRUITER_PLANS.recruiter_starter;
    throw new AppError(
      `Your current ${plan.name} plan allows up to ${sub.limits.teamMembers} team members. Upgrade your plan to invite more teammates.`,
      403,
      "UPGRADE_REQUIRED",
    );
  }

  const actorIsOwner =
    req.auth.platformRole === "platform_admin" || req.membership?.role === "owner";
  if (req.body.role === "owner")
    throw new AppError(
      "The owner role cannot be assigned. Ownership is set when the company is created.",
      422,
      "INVALID_ROLE",
    );
  if (req.body.role === "admin" && !actorIsOwner)
    throw new AppError("Only the company owner can add an admin.", 403, "FORBIDDEN");

  const membership = await Membership.findOneAndUpdate(
    { organization: req.auth.organizationId, user: user._id },
    { role: req.body.role, status: "active", permissions: [], invitedBy: req.user._id, joinedAt: new Date() },
    { upsert: true, returnDocument: "after", runValidators: true },
  );

  sub.usage.teamMembersCount = activeMembersCount + 1;
  await sub.save();

  await audit({
    req,
    organization: req.auth.organizationId,
    action: "membership.upserted",
    resourceType: "membership",
    resourceId: membership._id,
    metadata: { role: membership.role },
  });
  res.status(201).json({ data: membership });
});

exports.updateMember = asyncHandler(async (req, res) => {
  const membership = await Membership.findOne({
    _id: req.params.membershipId,
    organization: req.auth.organizationId,
  }).populate({ path: "user", select: "name _id" });
  if (!membership) throw new AppError("Member not found", 404, "RESOURCE_NOT_FOUND");

  const actorIsPlatformAdmin = req.auth.platformRole === "platform_admin";
  const actorRank = ROLE_RANK[req.membership?.role] ?? 0;
  const targetRank = ROLE_RANK[membership.role] ?? 0;
  if (!actorIsPlatformAdmin && String(membership.user?._id) === String(req.user._id))
    throw new AppError("You cannot change your own role or status.", 403, "FORBIDDEN");
  if (!actorIsPlatformAdmin && actorRank <= targetRank)
    throw new AppError(
      "You can only manage members with a role below your own.",
      403,
      "FORBIDDEN",
    );

  const { role, status } = req.body;
  if (role === "owner")
    throw new AppError(
      "The owner role cannot be assigned. Ownership is set when the company is created.",
      422,
      "INVALID_ROLE",
    );
  if (!actorIsPlatformAdmin && role && (ROLE_RANK[role] ?? 0) >= actorRank)
    throw new AppError(
      "You can only assign roles below your own.",
      403,
      "FORBIDDEN",
    );
  if (
    membership.role === "owner" &&
    ((status && status !== "active") || role) &&
    (await Membership.countDocuments({
      organization: req.auth.organizationId,
      role: "owner",
      status: "active",
    })) <= 1
  )
    throw new AppError(
      role
        ? "The last active owner's role cannot be changed."
        : "The last active owner cannot be removed",
      409,
      "LAST_OWNER",
    );

  const before = { role: membership.role, status: membership.status };
  if (role) membership.role = role;
  if (status) membership.status = status;
  await membership.save();
  await audit({
    req,
    organization: req.auth.organizationId,
    action: "membership.updated",
    resourceType: "membership",
    resourceId: membership._id,
    metadata: { before, after: { role: membership.role, status: membership.status } },
  });
  try {
    const owner = await organizationOwner(req.auth.organizationId);
    if (owner && String(owner.id) !== String(req.user._id)) {
      if (req.body.status === "revoked" && before.status !== "revoked")
        await notify({
          user: owner.id,
          organization: req.auth.organizationId,
          type: "member_removed",
          title: `Team member removed: ${membership.user?.name || "member"}`,
          message: `${req.user.name} removed ${membership.user?.name || "a member"} from the company.`,
          resourceType: "organization",
          resourceId: req.auth.organizationId,
          idempotencyKey: `org:${req.auth.organizationId}:member-removed:${membership._id}:${before.status}`,
        });
      else if (req.body.role && req.body.role !== before.role)
        await notify({
          user: owner.id,
          organization: req.auth.organizationId,
          type: "member_role_changed",
          title: `Team role changed: ${membership.user?.name || "member"}`,
          message: `${req.user.name} changed ${membership.user?.name || "a member"} from ${before.role} to ${membership.role}.`,
          resourceType: "organization",
          resourceId: req.auth.organizationId,
          idempotencyKey: `org:${req.auth.organizationId}:member-role:${membership._id}:${membership.role}`,
        });
    }
  } catch (error) {
    logger.error(`Team change notification failed: ${error.message}`);
  }
  res.json({ data: membership });
});

exports.invitations = asyncHandler(async (req, res) => {
  const now = new Date();
  const items = await Invite.find({ organization: req.auth.organizationId, status: "pending" })
    .populate("invitedBy", "name")
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({
    data: items.map((item) => ({
      ...item.toObject(),
      token: undefined,
      expired: item.expiresAt <= now,
    })),
  });
});

exports.invitationLink = asyncHandler(async (req, res) => {
  const invitation = await Invite.findOne({
    _id: req.params.invitationId,
    organization: req.auth.organizationId,
    status: "pending",
  });
  if (!invitation) throw new AppError("Invitation not found", 404, "INVITE_NOT_FOUND");
  if (invitation.expiresAt <= new Date())
    throw new AppError(
      "This invitation has expired. Ask the person who invited you to send a new one.",
      410,
      "INVITE_EXPIRED",
    );
  res.json({
    data: {
      link: `${config.clientUrl}/accept-invite?token=${invitation.token}`,
      expiresAt: invitation.expiresAt,
    },
  });
});

exports.createInvitation = asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const org = await Organization.findById(req.auth.organizationId);

  // Check Subscription Team Limit
  const sub = await getOrCreateOrgSubscription(req.auth.organizationId);
  const activeMembersCount = await Membership.countDocuments({
    organization: req.auth.organizationId,
    status: "active",
  });
  if (activeMembersCount >= (sub.limits?.teamMembers || 2)) {
    const plan = ALL_PLANS[sub.planTier] || RECRUITER_PLANS.recruiter_starter;
    throw new AppError(
      `Your current ${plan.name} plan allows up to ${sub.limits.teamMembers} team members. Upgrade your plan to invite more teammates.`,
      403,
      "UPGRADE_REQUIRED",
    );
  }

  const actorIsOwner =
    req.auth.platformRole === "platform_admin" || req.membership?.role === "owner";
  if (req.body.role === "owner")
    throw new AppError(
      "The owner role cannot be assigned. Ownership is set when the company is created.",
      422,
      "INVALID_ROLE",
    );
  if (req.body.role === "admin" && !actorIsOwner)
    throw new AppError("Only the company owner can invite an admin.", 403, "FORBIDDEN");

  const existingUser = await User.findOne({ email }).select("_id");
  if (
    existingUser &&
    (await Membership.findOne({ organization: org._id, user: existingUser._id, status: "active" }))
  )
    throw new AppError(
      "This person is already an active member of the organization",
      409,
      "ALREADY_MEMBER",
    );

  let invitation = await Invite.findOne({ organization: org._id, email, status: "pending" }).populate(
    "invitedBy",
    "name",
  );
  if (invitation) {
    const roleChanged = invitation.role !== req.body.role;
    const resending = Boolean(req.body.resend);
    if (roleChanged) invitation.role = req.body.role;
    if (roleChanged || resending) {
      invitation.expiresAt = new Date(Date.now() + 7 * 86400000);
      await invitation.save();
    }
    if (resending) {
      const resendDate = new Date();
      try {
        await sendInviteEmail({
          to: email,
          orgName: org.name,
          role: invitation.role,
          link: `${config.clientUrl}/accept-invite?token=${invitation.token}`,
          inviterName: invitation.invitedBy?.name || req.user.name,
          expiresAt: invitation.expiresAt,
        });
      } catch (_error) {
        /* email delivery is best-effort */
      }
      await audit({
        req,
        organization: org._id,
        action: "invitation.resent",
        resourceType: "invitation",
        resourceId: invitation._id,
        metadata: { email, resentAt: resendDate },
      });
    }
    return res.json({
      data: { invitation, link: `${config.clientUrl}/accept-invite?token=${invitation.token}` },
    });
  }

  invitation = await Invite.create({
    organization: org._id,
    email,
    role: req.body.role,
    token: crypto.randomBytes(24).toString("hex"),
    invitedBy: req.user._id,
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });

  const link = `${config.clientUrl}/accept-invite?token=${invitation.token}`;
  try {
    await sendInviteEmail({
      to: email,
      orgName: org.name,
      role: invitation.role,
      link,
      inviterName: req.user.name,
      expiresAt: invitation.expiresAt,
    });
  } catch (_error) {
    /* email delivery is best-effort */
  }

  await audit({
    req,
    organization: org._id,
    action: "invitation.created",
    resourceType: "invitation",
    resourceId: invitation._id,
    metadata: { role: invitation.role, email },
  });

  try {
    const owner = await organizationOwner(org._id);
    if (owner && String(owner.id) !== String(req.user._id))
      await notify({
        user: owner.id,
        organization: org._id,
        type: "member_invited",
        title: `Team member invited: ${email}`,
        message: `${req.user.name} invited ${email} as ${invitation.role}.`,
        resourceType: "organization",
        resourceId: org._id,
        idempotencyKey: `org:${org._id}:invite:${invitation._id}`,
      });
  } catch (error) {
    logger.error(`Team invitation notification failed: ${error.message}`);
  }

  res.status(201).json({ data: { invitation, link } });
});

exports.revokeInvitation = asyncHandler(async (req, res) => {
  const invitation = await Invite.findOne({
    _id: req.params.invitationId,
    organization: req.auth.organizationId,
    status: "pending",
  });
  if (!invitation) throw new AppError("Invitation not found", 404, "INVITE_NOT_FOUND");
  invitation.status = "revoked";
  invitation.revokedAt = new Date();
  await invitation.save();
  await audit({
    req,
    organization: invitation.organization,
    action: "invitation.revoked",
    resourceType: "invitation",
    resourceId: invitation._id,
    metadata: { email: invitation.email },
  });
  res.json({ data: { revoked: true } });
});
