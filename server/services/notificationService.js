const Notification = require("../models/Notification");
const User = require("../models/User");
const { enqueue } = require("./jobQueueService");
const logger = require("../utils/logger");
const { viewFor, categoryFor, isAlwaysOn } = require("../config/notificationTypes");

const queueEmail = (notification, { user, organization, email, title, message, context }) =>
  enqueue({
    type: "notification.email",
    owner: user,
    organization,
    payload: {
      notificationId: notification._id,
      to: email,
      subject: title,
      message,
      context: context || undefined,
    },
    maxAttempts: 5,
  });

/**
 * Resolves the recipient's channels for an event:
 *   1. event-level preference  (notificationPrefs.events[type])
 *   2. legacy category preference (notificationPrefs[legacyCategory])
 *   3. catalog defaults (in-app on; email per the event's emailDefault)
 * Security & account events are always on and ignore preferences.
 * Events without a catalog view for the recipient role keep the
 * historical behavior (legacy category prefs; in-app on; email off
 * unless the call requested one).
 */
const resolveChannels = (
  type,
  role,
  prefs,
  { fallbackCategory = "account", fallbackEmail = false } = {},
) => {
  const view = viewFor(type, role);
  if (!view) {
    const legacy = prefs?.[fallbackCategory];
    return { inApp: legacy?.inApp ?? true, email: legacy?.email ?? fallbackEmail };
  }
  if (isAlwaysOn(type, role)) return { inApp: true, email: true };
  const eventPref = prefs?.events?.[type];
  const legacyPref = view.legacyCategory ? prefs?.[view.legacyCategory] : null;
  return {
    inApp:
      eventPref?.inApp ??
      (legacyPref?.inApp ?? true),
    email:
      eventPref?.email ??
      (legacyPref?.email ?? Boolean(view.emailDefault)),
  };
};

/**
 * Creates an in-app notification (and optionally queues an email).
 *
 * - The recipient's channels are resolved from the centralized event
 *   catalog (config/notificationTypes.js) and their stored preferences.
 * - `category` is taken from the catalog for known events (the storage
 *   group for this recipient role); call-site categories apply to
 *   unregistered events only.
 * - `email` sends through the existing mail infrastructure; a mail
 *   failure never fails the business action — the queue retries and
 *   records the delivery state.
 * - `emailContext` carries structured data (company, job, interview,
 *   role, ...) that the email renderer turns into the full premium
 *   email; `recipientName` personalises the greeting.
 * - `idempotencyKey` prevents duplicate notifications when the same
 *   event is processed twice.
 */
const notify = async ({
  user,
  organization = null,
  type,
  title,
  message,
  category,
  resourceType = "",
  resourceId = "",
  email,
  idempotencyKey,
  emailContext = null,
  recipientName = "",
}) => {
  const userDoc = await User.findById(user).select("notificationPrefs role").lean();
  const role = userDoc?.role || "candidate";
  const prefs = userDoc?.notificationPrefs || {};
  const storedCategory = categoryFor(type, role) || category || "account";
  const channels = resolveChannels(type, role, prefs, {
    fallbackCategory: category || "account",
    fallbackEmail: Boolean(email),
  });
  if (!channels.inApp) return null;

  let notification;
  let created = false;
  try {
    notification = await Notification.create({
      user,
      organization,
      type,
      category: storedCategory,
      recipientRole: role,
      title,
      message,
      resourceType,
      resourceId: String(resourceId || ""),
      idempotencyKey: idempotencyKey || undefined,
      delivery: { email: email && channels.email ? "queued" : "not_requested" },
    });
    created = true;
  } catch (error) {
    if (error.code !== 11000 || !idempotencyKey) throw error;
    notification = await Notification.findOne({ user, idempotencyKey });
  }
  if (email && channels.email && (created || notification?.delivery?.email !== "sent"))
    await queueEmail(notification, {
      user,
      organization,
      email,
      title,
      message,
      context:
        emailContext || recipientName
          ? { ...(emailContext || {}), name: recipientName }
          : undefined,
    });
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

module.exports = { notify, notifyAdmins, resolveChannels };
