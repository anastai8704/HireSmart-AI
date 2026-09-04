const Notification = require("../models/Notification");
const { enqueue } = require("./jobQueueService");
const queueEmail = (notification, { user, organization, email, title, message }) =>
  enqueue({
    type: "notification.email",
    owner: user,
    organization,
    payload: { notificationId: notification._id, to: email, subject: title, message },
    maxAttempts: 5,
  });
const notify = async ({
  user,
  organization = null,
  type,
  title,
  message,
  resourceType = "",
  resourceId = "",
  email,
  idempotencyKey,
}) => {
  let notification;
  let created = false;
  try {
    notification = await Notification.create({
      user,
      organization,
      type,
      title,
      message,
      resourceType,
      resourceId: String(resourceId || ""),
      idempotencyKey: idempotencyKey || undefined,
      delivery: { email: email ? "queued" : "not_requested" },
    });
    created = true;
  } catch (error) {
    if (error.code !== 11000 || !idempotencyKey) throw error;
    notification = await Notification.findOne({ user, idempotencyKey });
  }
  if (email && (created || notification?.delivery?.email !== "sent"))
    await queueEmail(notification, { user, organization, email, title, message });
  return Notification.findById(notification._id);
};
module.exports = { notify };
