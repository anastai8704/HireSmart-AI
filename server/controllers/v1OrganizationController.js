const Organization = require("../models/Organization");
const User = require("../models/User");
const { Membership } = require("../models/Membership");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
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
exports.update = asyncHandler(async (req, res) => { const org = await Organization.findOneAndUpdate({ _id: req.auth.organizationId }, req.body, { new: true, runValidators: true }); await audit({ req, organization: org._id, action: "organization.updated", resourceType: "organization", resourceId: org._id }); res.json({ data: org }); });
exports.members = asyncHandler(async (req, res) => { const page = parse(req.query); const filter = applyCursor({ organization: req.auth.organizationId }, page.after); if (req.query.role) filter.role = req.query.role; const items = await Membership.find(filter).populate("user", "name email isActive").sort({ _id: -1 }).limit(page.limit); res.json({ data: items, meta: meta(items, page.limit) }); });
exports.addMember = asyncHandler(async (req, res) => { const user = await User.findOne({ email: req.body.email.toLowerCase() }); if (!user) throw new AppError("User must register before being added", 404, "USER_NOT_FOUND"); const membership = await Membership.findOneAndUpdate({ organization: req.auth.organizationId, user: user._id }, { role: req.body.role, status: "active", invitedBy: req.user._id, joinedAt: new Date() }, { upsert: true, new: true, runValidators: true }); await audit({ req, organization: req.auth.organizationId, action: "membership.upserted", resourceType: "membership", resourceId: membership._id, metadata: { role: membership.role } }); res.status(201).json({ data: membership }); });
exports.updateMember = asyncHandler(async (req, res) => { const membership = await Membership.findOne({ _id: req.params.membershipId, organization: req.auth.organizationId }); if (!membership) throw new AppError("Member not found", 404, "RESOURCE_NOT_FOUND"); if (membership.role === "owner" && req.body.status === "revoked" && await Membership.countDocuments({ organization: req.auth.organizationId, role: "owner", status: "active" }) <= 1) throw new AppError("The last active owner cannot be removed", 409, "LAST_OWNER"); Object.assign(membership, req.body); await membership.save(); res.json({ data: membership }); });
