const User = require("../models/User");
const Organization = require("../models/Organization");
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
const AuthSession = require("../models/AuthSession");
const AIAnalysis = require("../models/AIAnalysis");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { audit } = require("../services/auditService");
const { parse, applyCursor, meta } = require("../utils/pagination");
const requireAdmin = (req) => { if (req.auth.platformRole !== "platform_admin") throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND"); };
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
exports.users = asyncHandler(async (req, res) => {
    requireAdmin(req); const page = parse(req.query); const filter = {};
    if (req.query.status) filter.accountStatus = req.query.status;
    if (req.query.role) filter.role = req.query.role;
    if (req.query.search) { const pattern = new RegExp(escapeRegex(req.query.search).slice(0, 100), "i"); filter.$or = [{ name: pattern }, { email: pattern }]; }
    const scoped = applyCursor(filter, page.after);
    const items = await User.find(scoped).select("name email role isActive accountStatus emailVerified createdAt updatedAt").sort({ _id: -1 }).limit(page.limit);
    res.json({ data: items, meta: meta(items, page.limit) });
});
exports.organizations = asyncHandler(async (req, res) => { requireAdmin(req); const page = parse(req.query); const filter = {}; if (req.query.status) filter.status = req.query.status; if (req.query.search) filter.name = new RegExp(escapeRegex(req.query.search).slice(0, 100), "i"); const items = await Organization.find(applyCursor(filter, page.after)).select("name slug industry size timezone status settings createdAt updatedAt").sort({ _id: -1 }).limit(page.limit); res.json({ data: items, meta: meta(items, page.limit) }); });
exports.audit = asyncHandler(async (req, res) => { requireAdmin(req); const page = parse(req.query); const filter = req.query.organizationId ? { organization: req.query.organizationId } : {}; const items = await AuditLog.find(applyCursor(filter, page.after)).sort({ _id: -1 }).limit(page.limit); res.json({ data: items, meta: meta(items, page.limit) }); });
exports.security = asyncHandler(async (req, res) => { requireAdmin(req); const page = parse(req.query); const filter = {}; if (req.query.severity) filter.severity = req.query.severity; const items = await SecurityEvent.find(applyCursor(filter, page.after)).sort({ _id: -1 }).limit(page.limit); res.json({ data: items, meta: meta(items, page.limit) }); });
exports.organizationAudit = asyncHandler(async (req, res) => { const page = parse(req.query); const filter = applyCursor({ organization: req.auth.organizationId }, page.after); if (req.query.action) filter.action = req.query.action; const items = await AuditLog.find(filter).sort({ _id: -1 }).limit(page.limit); res.json({ data: items, meta: meta(items, page.limit) }); });
exports.organizationSecurity = asyncHandler(async (req, res) => { const page = parse(req.query); const filter = applyCursor({ organization: req.auth.organizationId }, page.after); if (req.query.severity) filter.severity = req.query.severity; const items = await SecurityEvent.find(filter).sort({ _id: -1 }).limit(page.limit); res.json({ data: items, meta: meta(items, page.limit) }); });
exports.aiUsage = asyncHandler(async (req, res) => { requireAdmin(req); const data = await AIAnalysis.aggregate([{ $group: { _id: { organization: "$organization", feature: "$feature", provider: "$provider", model: "$model" }, runs: { $sum: 1 }, inputTokens: { $sum: "$usage.inputTokens" }, outputTokens: { $sum: "$usage.outputTokens" }, estimatedCostUsd: { $sum: "$usage.estimatedCostUsd" }, averageLatencyMs: { $avg: "$usage.latencyMs" }, fallbacks: { $sum: { $cond: ["$fallbackUsed", 1, 0] } } } }, { $sort: { runs: -1 } }, { $limit: 500 }]); res.json({ data }); });
exports.suspend = asyncHandler(async (req, res) => { requireAdmin(req); if (String(req.user._id) === req.params.userId) throw new AppError("Administrators cannot suspend themselves", 409, "SELF_SUSPEND"); const user = await User.findByIdAndUpdate(req.params.userId, { isActive: false, accountStatus: "suspended", tokenInvalidBefore: new Date() }, { new: true }).select("name email role accountStatus"); if (!user) throw new AppError("User not found", 404, "RESOURCE_NOT_FOUND"); await AuthSession.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date(), revokeReason: req.body.reason }); await audit({ req, action: "admin.user_suspended", resourceType: "user", resourceId: user._id, metadata: { reason: req.body.reason } }); res.json({ data: { id: user._id, status: user.accountStatus } }); });
exports.reactivate = asyncHandler(async (req, res) => { requireAdmin(req); const user = await User.findOneAndUpdate({ _id: req.params.userId, accountStatus: "suspended" }, { isActive: true, accountStatus: "active", tokenInvalidBefore: new Date() }, { new: true, runValidators: true }).select("name email role accountStatus"); if (!user) throw new AppError("Suspended user not found", 404, "RESOURCE_NOT_FOUND"); await audit({ req, action: "admin.user_reactivated", resourceType: "user", resourceId: user._id, metadata: { reason: req.body.reason } }); res.json({ data: { id: user._id, status: user.accountStatus } }); });
