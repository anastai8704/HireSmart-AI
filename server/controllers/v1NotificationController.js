const Notification = require("../models/Notification");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { parse, applyCursor, meta } = require("../utils/pagination");
const { templateForRole, viewFor, isAlwaysOn } = require("../config/notificationTypes");
exports.list = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const filter = applyCursor({ user: req.user._id }, page.after);
  if (req.query.unread === "true") filter.readAt = null;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.category) filter.category = req.query.category;
  const items = await Notification.find(filter).sort({ _id: -1 }).limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});
exports.read = asyncHandler(async (req, res) => {
  const item = await Notification.findOneAndUpdate(
    { _id: req.params.notificationId, user: req.user._id },
    { readAt: new Date() },
    { returnDocument: "after" },
  );
  if (!item) throw new AppError("Notification not found", 404, "RESOURCE_NOT_FOUND");
  res.json({ data: item });
});
exports.markUnread = asyncHandler(async (req, res) => {
  const item = await Notification.findOneAndUpdate(
    { _id: req.params.notificationId, user: req.user._id },
    { readAt: null },
    { returnDocument: "after" },
  );
  if (!item) throw new AppError("Notification not found", 404, "RESOURCE_NOT_FOUND");
  res.json({ data: item });
});
exports.readAll = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, readAt: null },
    { readAt: new Date() },
  );
  res.json({ data: { updated: result.modifiedCount } });
});
exports.unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, readAt: null });
  res.json({ data: { count } });
});
/**
 * The role-aware notification preference template. The client renders the
 * entire notification preference UI from this — groups, events, channel
 * support, defaults and the recipient's current values all come from the
 * centralized catalog (config/notificationTypes.js).
 */
exports.preferences = asyncHandler(async (req, res) => {
  const role = ["candidate", "recruiter", "admin"].includes(req.user.role)
    ? req.user.role
    : "recruiter";
  const prefs = req.user.notificationPrefs || {};
  const stored = prefs.events || {};
  const groups = templateForRole(role).map((group) => ({
    ...group,
    events: group.events.map((event) => {
      const view = viewFor(event.key, role);
      const legacy = view?.legacyCategory ? prefs[view.legacyCategory] : null;
      const own = stored[event.key] || {};
      const current = isAlwaysOn(event.key, role)
        ? { inApp: true, email: Boolean(view?.emailDefault) }
        : {
            inApp: own.inApp ?? (legacy?.inApp ?? true),
            email: own.email ?? (legacy?.email ?? Boolean(view?.emailDefault)),
          };
      return { ...event, current };
    }),
  }));
  res.json({ data: { role, groups } });
});
