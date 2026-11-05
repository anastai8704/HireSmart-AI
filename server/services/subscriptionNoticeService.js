// Subscription expiry reminders. Runs from the background worker alongside the other periodic ticks.
// A reminder is sent only for paid subscriptions that will NOT renew automatically (cancel at period end, or
// no provider subscription), and only once per billing period (the idempotency key includes the period end).
const { Subscription } = require("../models/Subscription");
const { notifySubscriptionEvent } = require("./billingNotifications");
const logger = require("../utils/logger");

const WINDOW_MS = 7 * 24 * 3600 * 1000;
const TICK_INTERVAL_MS = 15 * 60 * 1000;

const runSubscriptionExpiryNotices = async (now = new Date()) => {
  const subs = await Subscription.find({
    status: "active",
    priceInr: { $gt: 0 },
    currentPeriodEnd: { $gt: now, $lte: new Date(now.getTime() + WINDOW_MS) },
    $or: [{ cancelAtPeriodEnd: true }, { providerSubscriptionId: { $in: [null, ""] } }],
  })
    .limit(500)
    .lean();
  let sent = 0;
  for (const sub of subs) {
    const endsOn = new Date(sub.currentPeriodEnd).toISOString().slice(0, 10);
    const results = await notifySubscriptionEvent(sub, {
      type: "subscription_expiring",
      title: "Your subscription is ending soon",
      message: `Your ${sub.planTier} plan ends on ${endsOn}. It will not renew automatically. Renew it to keep your limits.`,
      key: `subscription-expiring:${sub._id}:${endsOn}`,
    });
    sent += results.length;
  }
  if (sent) logger.info(`Subscription expiry notices sent: ${sent}`);
  return { due: subs.length, sent };
};

let lastTick = 0;
/** Throttled tick for the worker: at most one scan per 15 minutes. */
const tickSubscriptionNotices = async () => {
  const now = Date.now();
  if (now - lastTick < TICK_INTERVAL_MS) return { skipped: true };
  lastTick = now;
  return runSubscriptionExpiryNotices();
};

module.exports = { runSubscriptionExpiryNotices, tickSubscriptionNotices };
