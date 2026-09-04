const Organization = require("../models/Organization");
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const openRolesCondition = () => ({
  status: "published",
  $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }],
});

/**
 * Moderation gate for every public surface:
 * - orgs with settings.requireJobApproval expose only approved jobs
 * - platform-rejected jobs are hidden everywhere
 */
const moderationGate = async () => {
  const approvalOrgIds = await Organization.distinct("_id", {
    "settings.requireJobApproval": true,
    status: "active",
  });
  return {
    $or: [
      { organization: { $in: approvalOrgIds }, "moderation.status": "approved" },
      { organization: { $nin: approvalOrgIds }, "moderation.status": { $ne: "rejected" } },
    ],
  };
};

/**
 * Shared filter builder for every public job surface (search, alerts,
 * company pages) so behaviour stays identical. Accepts a plain object of
 * query params and returns a { filter, sort } pair for Mongoose.
 */
const buildPublicJobFilter = async (query = {}) => {
  const filter = { ...openRolesCondition() };
  const and = [await moderationGate()];
  if (query.location) filter.location = new RegExp(escapeRegex(query.location), "i");
  if (query.workplaceMode) filter.workplaceMode = String(query.workplaceMode).slice(0, 20);
  if (query.jobType) filter.jobType = String(query.jobType).slice(0, 50);
  if (query.industry) filter.industry = new RegExp(`^${escapeRegex(query.industry)}$`, "i");
  const minSalary = num(query.minSalary);
  const maxSalary = num(query.maxSalary);
  if (minSalary)
    and.push({
      $or: [
        { "compensation.max": { $gte: minSalary } },
        { "compensation.max": { $lt: 1 }, salary: { $gte: minSalary } },
      ],
    });
  if (maxSalary)
    and.push({
      $or: [
        { "compensation.min": { $lte: maxSalary } },
        { "compensation.min": { $lt: 1 }, salary: { $lte: maxSalary } },
      ],
    });
  const maxExp = num(query.maxExp);
  const minExp = num(query.minExp);
  if (maxExp) and.push({ minExpYears: { $lte: maxExp } });
  if (minExp) and.push({ $or: [{ maxExpYears: { $gte: minExp } }, { maxExpYears: { $lt: 1 } }] });
  const skillList = String(query.skills || query.skill || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (skillList.length)
    and.push({
      $or: skillList.map((s) => ({
        $or: [{ requiredSkills: s }, { preferredSkills: s }, { skills: s }],
      })),
    });
  const posted = String(query.postedWithin || "").toLowerCase();
  if (["d", "w", "m"].includes(posted)) {
    const hours = posted === "d" ? 24 : posted === "w" ? 24 * 7 : 24 * 30;
    filter.createdAt = { $gte: new Date(Date.now() - hours * 3600 * 1000) };
  }
  if (and.length) filter.$and = and;
  if (query.query) filter.$text = { $search: String(query.query).slice(0, 100) };
  const sortKey = String(query.sort || "date").toLowerCase();
  const sort =
    sortKey === "salary"
      ? { "compensation.min": -1, _id: -1 }
      : sortKey === "relevance" && query.query
        ? { score: "DESC", _id: -1 }
        : { _id: -1 };
  return { filter, sort };
};

module.exports = { escapeRegex, num, buildPublicJobFilter, openRolesCondition, moderationGate };
