const Notification = require("../models/Notification");
const { enqueue } = require("./jobQueueService");
const notify = async ({ user, organization = null, type, title, message, resourceType = "", resourceId = "", email, idempotencyKey }) => {
    let notification;
    try { notification = await Notification.create({ user, organization, type, title, message, resourceType, resourceId: String(resourceId || ""), idempotencyKey: idempotencyKey || undefined, delivery: { email: email ? "queued" : "not_requested" } }); }
    catch (error) { if (error.code === 11000 && idempotencyKey) return Notification.findOne({ user, idempotencyKey }); throw error; }
    if (email) await enqueue({ type: "notification.email", owner: user, organization, payload: { notificationId: notification._id, to: email, subject: title, message }, maxAttempts: 5 });
    return Notification.findById(notification._id);
};
module.exports = { notify };
