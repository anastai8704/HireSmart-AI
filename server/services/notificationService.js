const Notification = require("../models/Notification");
const User = require("../models/User");
const { enqueue } = require("./jobQueueService");
const logger = require("../utils/logger");

// Security/account events must never be suppressible by user preferences.
const ALWAYS_DELIVER = new Set(["account", "security", "approvals", "platform"]);

const queueEmail = (notification, { user, organization, email, title, message }) =>
  enqueue({
    type: "notification.email",
    owner: user,
    organization,
    payload: { notificationId: notification._id, to: email, subject: title, message },
    maxAttempts: 5,
  });

/**
 * Creates an in-app notification (and optionally queues an email).
 *
 * - `category` groups notifications for page filters (applications,
 *   interviews, jobs, candidates, account, security, approvals, platform).
 * - `email` sends through the existing mail infrastructure; a mail failure
 *   never fails the business action — the queue retries and records the
 *   delivery state.
 * - `idempotencyKey` prevents duplicate notifications when the same event is
 *   processed twice.
 */
const notify = async ({
  user,
  organization = null,
  type,
  title,
  message,
  category = "account",
  resourceType = "",
  resourceId = "",
  email,
  idempotencyKey,
}) => {
  const prefs =
    (await User.findById(user).select("notificationPrefs").lean())?.notificationPrefs || {};
  const categoryPrefs = ALWAYS_DELIVER.has(category) ? { inApp: true, email: true } : prefs[category] || { inApp: true, email: false };
  if (!categoryPrefs.inApp) return null;

  let notification;
  let created = false;
  try {
    notification = await Notification.create({
      user,
      organization,
      type,
      category,
      title,
      message,
      resourceType,
      resourceId: String(resourceId || ""),
      idempotencyKey: idempotencyKey || undefined,
      delivery: { email: email && categoryPrefs.email ? "queued" : "not_requested" },
    });
    created = true;
  } catch (error) {
    if (error.code !== 11000 || !idempotencyKey) throw error;
    notification = await Notification.findOne({ user, idempotencyKey });
  }
  if (email && categoryPrefs.email && (created || notification?.delivery?.email !== "sent"))
    await queueEmail(notification, { user, organization, email, title, message });
  return Notification.findById(notification._id);
};

/** Fans a notification out to every active platform admin. */
const notifyAdmins = async ({ type, title, message, category = "platform", resourceType = "", resourceId = "", idempotencyKey }) => {
  let admins;
  try {
    admins = await User.find({ role: "admin", isActive: true }).select("_id").lean();
  } catch (error) {
    logger.error(`Admin notification lookup failed: ${error.message}`);
    return [];
  }
  const results = [];
  for (const admin of admins) {
    try {
      const notification = await notify({
        user: admin._id,
        organization: null,
        type,
        title,
        message,
        category,
        resourceType,
        resourceId,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:admin:${admin._id}` : undefined,
      });
      if (notification) results.push(notification);
    } catch (error) {
      logger.error(`Admin notification for ${admin._id} failed: ${error.message}`);
    }
  }
  return results;
};

module.exports = { notify, notifyAdmins };
