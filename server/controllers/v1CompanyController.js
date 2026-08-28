const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { jobDto } = require("./v1RecruitmentController");
const { parse, applyCursor, meta } = require("../utils/pagination");
const { moderationGate } = require("../utils/jobFilters");

const openRolesFilter = (organization) => ({ organization, status: "published", $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }] });
const companyDto = (org, openRoles) => ({ id: org._id, name: org.name, slug: org.slug, industry: org.industry, size: org.size, website: org.website, logo: org.logo, about: org.about, openRoles, createdAt: org.createdAt });

exports.companies = asyncHandler(async (req, res) => {
    const approvalOrgIds = await Organization.distinct("_id", { "settings.requireJobApproval": true, status: "active" });
    const grouped = await Job.aggregate([
        { $match: { status: "published", organization: { $ne: null }, $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }], $and: [{ $or: [{ organization: { $in: approvalOrgIds }, "moderation.status": "approved" }, { organization: { $nin: approvalOrgIds }, "moderation.status": { $ne: "rejected" } }] }] } },
        { $group: { _id: "$organization", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 },
    ]);
    const orgs = await Organization.find({ _id: { $in: grouped.map((g) => g._id) }, status: "active" });
    const byId = new Map(orgs.map((o) => [String(o._id), o]));
    const data = grouped.filter((g) => byId.has(String(g._id))).map((g) => companyDto(byId.get(String(g._id)), g.count));
    res.json({ data, meta: { count: data.length } });
});

exports.company = asyncHandler(async (req, res) => {
    const org = await Organization.findOne({ slug: String(req.params.slug).slice(0, 100), status: "active" });
    if (!org) throw new AppError("Company not found", 404, "RESOURCE_NOT_FOUND");
    const gate = await moderationGate();
    const openRoles = await Job.countDocuments({ ...openRolesFilter(org._id), ...gate });
    res.json({ data: companyDto(org, openRoles) });
});

exports.companyJobs = asyncHandler(async (req, res) => {
    const org = await Organization.findOne({ slug: String(req.params.slug).slice(0, 100), status: "active" });
    if (!org) throw new AppError("Company not found", 404, "RESOURCE_NOT_FOUND");
    const page = parse(req.query);
    const filter = applyCursor({ ...openRolesFilter(org._id), ...(await moderationGate()) }, page.after);
    const items = await Job.find(filter).sort({ _id: -1 }).limit(page.limit);
    res.json({ data: items.map(jobDto), meta: meta(items, page.limit) });
});
