// Recipients and delivery for billing and workforce notifications.
// Recipients come from real records only: the subscriber user, or the active owners of the subscribing company.
const Membership = require("../models/Membership");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { notify } = require("./notificationService");
const logger = require("../utils/logger");

/** Active users with one of `roles` in an organisation. */
const activeMemberIds = async (organizationId, roles) =>
  Membership.find({ organization: organizationId, role: { $in: roles }, status: "active" }).distinct("user");

/** Who should hear about a subscription: the candidate, or the company's active owners. */
const subscriptionRecipients = async ({ subscriberType, subscriberId }) => {
  if (subscriberType === "candidate") return [subscriberId];
  if (subscriberType === "organization") return activeMemberIds(subscriberId, ["owner"]);
  return [];
};

/**
 * Sends one notification per recipient. Each recipient gets their own idempotency key, so a
 * replayed webhook or worker tick never duplicates the in-app item or the email.
 */
const notifyUsers = async (userIds, { type, title, message, organization = null, resourceType, resourceId, key }) => {
  const users = await User.find({ _id: { $in: userIds } }).select("email name").lean();
  const results = [];
  for (const user of users) {
    try {
      const idempotencyKey = `${key}:${user._id}`;
      // A replay is not a new notification: skip it so it is neither counted nor re-sent.
      if (await Notification.exists({ user: user._id, idempotencyKey })) continue;
      const saved = await notify({
        user: user._id,
        organization,
        type,
        title,
        message,
        resourceType,
        resourceId,
        email: user.email,
        recipientName: user.name,
        idempotencyKey,
      });
      if (saved) results.push(saved);
    } catch (error) {
      logger.error(`Notification ${type} for ${user._id} failed: ${error.code || error.message}`);
    }
  }
  return results;
};

/** `subscriber` is a subscription or a payment transaction: both carry subscriberType and subscriberId. */
const notifySubscriptionEvent = async (
  subscriber,
  { type, title, message, key, resourceType = "subscription", resourceId = subscriber._id },
) => {
  const recipients = await subscriptionRecipients(subscriber);
  return notifyUsers(recipients, {
    type,
    title,
    message,
    organization: subscriber.subscriberType === "organization" ? subscriber.subscriberId : null,
    resourceType,
    resourceId: String(resourceId || ""),
    key,
  });
};

/** Joining and employment updates go to the company's owners and admins. */
const notifyCompanyLeads = async (organizationId, { type, title, message, resourceType, resourceId, key }) =>
  notifyUsers(await activeMemberIds(organizationId, ["owner", "admin"]), {
    type,
    title,
    message,
    organization: organizationId,
    resourceType,
    resourceId,
    key,
  });

module.exports = { subscriptionRecipients, notifyUsers, notifySubscriptionEvent, notifyCompanyLeads };
