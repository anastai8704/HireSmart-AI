const Notification = require("../models/Notification");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { parse, applyCursor, meta } = require("../utils/pagination");
exports.list = asyncHandler(async (req, res) => { const page = parse(req.query); const filter = applyCursor({ user: req.user._id }, page.after); if (req.query.unread === "true") filter.readAt = null; if (req.query.type) filter.type = req.query.type; const items = await Notification.find(filter).sort({ _id: -1 }).limit(page.limit); res.json({ data: items, meta: meta(items, page.limit) }); });
exports.read = asyncHandler(async (req, res) => { const item = await Notification.findOneAndUpdate({ _id: req.params.notificationId, user: req.user._id }, { readAt: new Date() }, { new: true }); if (!item) throw new AppError("Notification not found", 404, "RESOURCE_NOT_FOUND"); res.json({ data: item }); });
exports.readAll = asyncHandler(async (req, res) => { const result = await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() }); res.json({ data: { updated: result.modifiedCount } }); });
