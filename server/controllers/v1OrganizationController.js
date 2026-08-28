const crypto = require("node:crypto");
const Organization = require("../models/Organization");
const User = require("../models/User");
const { Membership } = require("../models/Membership");
const Invite = require("../models/Invite");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { config } = require("../config/env");
const { sendInviteEmail } = require("../services/emailService");
const { audit } = require("../services/auditService");
const { parse, applyCursor, meta } = require("../utils/pagination");
const slugify = (v) => String(v).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
exports.create = asyncHandler(async (req, res) => {
    let slug = slugify(req.body.slug || req.body.name); const base = slug; for (let i = 1; await Organization.exists({ slug }); i += 1) slug = `${base}-${i}`;
    const organization = await Organization.create({ ...req.body, slug }); await Membership.create({ organization: organization._id, user: req.user._id, role: "owner" });
    await audit({ req, organization: organization._id, action: "organization.created", resourceType: "organization", resourceId: organization._id }); res.status(201).json({ data: organization });
});
exports.mine = asyncHandler(async (req, res) => { const memberships = await Membership.find({ user: req.user._id, status: "active" }).populate("organization"); res.json({ data: memberships.filter((m) => m.organization).map((m) => ({ id: m.organization._id, name: m.organization.name, slug: m.organization.slug, role: m.role, permissions: m.permissions })) }); });
exports.get = asyncHandler(async (req, res) => { const org = await Organization.findById(req.auth.organizationId); if (!org) throw new AppError("Organization not found", 404, "RESOURCE_NOT_FOUND"); res.json({ data: org }); });
exports.update = asyncHandler(async (req, res) => { const allowed = ["name", "industry", "size", "website", "logo", "about", "timezone"]; const update = {}; for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key]; if (!Object.keys(update).length) throw new AppError("No valid organization fields to update", 422, "INVALID_PAYLOAD"); const org = await Organization.findOneAndUpdate({ _id: req.auth.organizationId }, update, { new: true, runValidators: true }); await audit({ req, organization: org._id, action: "organization.updated", resourceType: "organization", resourceId: org._id }); res.json({ data: org }); });
exports.members = asyncHandler(async (req, res) => { const page = parse(req.query); const filter = applyCursor({ organization: req.auth.organizationId }, page.after); if (req.query.role) filter.role = req.query.role; const items = await Membership.find(filter).populate("user", "name email isActive").sort({ _id: -1 }).limit(page.limit); res.json({ data: items, meta: meta(items, page.limit) }); });
exports.addMember = asyncHandler(async (req, res) => { const user = await User.findOne({ email: req.body.email.toLowerCase() }); if (!user) throw new AppError("User must register before being added", 404, "USER_NOT_FOUND"); const membership = await Membership.findOneAndUpdate({ organization: req.auth.organizationId, user: user._id }, { role: req.body.role, status: "active", invitedBy: req.user._id, joinedAt: new Date() }, { upsert: true, new: true, runValidators: true }); await audit({ req, organization: req.auth.organizationId, action: "membership.upserted", resourceType: "membership", resourceId: membership._id, metadata: { role: membership.role } }); res.status(201).json({ data: membership }); });
exports.updateMember = asyncHandler(async (req, res) => { const membership = await Membership.findOne({ _id: req.params.membershipId, organization: req.auth.organizationId }); if (!membership) throw new AppError("Member not found", 404, "RESOURCE_NOT_FOUND"); if (membership.role === "owner" && req.body.status === "revoked" && await Membership.countDocuments({ organization: req.auth.organizationId, role: "owner", status: "active" }) <= 1) throw new AppError("The last active owner cannot be removed", 409, "LAST_OWNER"); Object.assign(membership, req.body); await membership.save(); res.json({ data: membership }); });
exports.invitations = asyncHandler(async (req, res) => { const items = await Invite.find({ organization: req.auth.organizationId, status: "pending" }).populate("invitedBy", "name").sort({ createdAt: -1 }); res.json({ data: items }); });
exports.createInvitation = asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase();
    const org = await Organization.findById(req.auth.organizationId);
    const existingUser = await User.findOne({ email }).select("_id");
    if (existingUser && (await Membership.findOne({ organization: org._id, user: existingUser._id, status: "active" }))) throw new AppError("This person is already an active member of the organization", 409, "ALREADY_MEMBER");
    let invitation = await Invite.findOne({ organization: org._id, email, status: "pending" });
    if (invitation) {
        if (invitation.role !== req.body.role) { invitation.role = req.body.role; invitation.expiresAt = new Date(Date.now() + 7 * 86400000); await invitation.save(); }
        return res.json({ data: { invitation, link: `${config.clientUrl}/accept-invite?token=${invitation.token}` } });
    }
    invitation = await Invite.create({ organization: org._id, email, role: req.body.role, token: crypto.randomBytes(24).toString("hex"), invitedBy: req.user._id, status: "pending", expiresAt: new Date(Date.now() + 7 * 86400000) });
    const link = `${config.clientUrl}/accept-invite?token=${invitation.token}`;
    try { await sendInviteEmail({ to: email, orgName: org.name, role: invitation.role, link }); } catch (_error) { /* email delivery is best-effort; the link is returned in the response */ }
    await audit({ req, organization: org._id, action: "invitation.created", resourceType: "invitation", resourceId: invitation._id, metadata: { role: invitation.role, email } });
    res.status(201).json({ data: { invitation, link } });
});
exports.revokeInvitation = asyncHandler(async (req, res) => { const invitation = await Invite.findOne({ _id: req.params.invitationId, organization: req.auth.organizationId, status: "pending" }); if (!invitation) throw new AppError("Invitation not found", 404, "INVITE_NOT_FOUND"); invitation.status = "revoked"; await invitation.save(); await audit({ req, organization: invitation.organization, action: "invitation.revoked", resourceType: "invitation", resourceId: invitation._id, metadata: { email: invitation.email } }); res.json({ data: { revoked: true } }); });
