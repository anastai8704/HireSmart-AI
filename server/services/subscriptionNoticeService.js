// Subscription lifecycle notices and lapse processing. Runs from the background worker alongside the other ticks.
//
// Reminders (7 days and 1 day before expiry) and the expiry notice are sent only for paid subscriptions that will
// NOT renew automatically (cancelled at period end, or no provider subscription). Auto-renewing subscriptions are
// not "expiring": they renew, or they enter the payment grace period handled by domain/subscriptionRules.
//
// Idempotency: every notice has the key `${type}:${subscriptionId}:${billingPeriodEnd}` (per recipient, via
// notifyUsers), so a notice is sent once per subscription, billing period and notice type, however often the
// worker runs.
//
// Decision logic is pure (remindersDue, lapseDue) so it is unit-tested without a database.
const { Subscription } = require("../models/Subscription");
const { notifySubscriptionEvent } = require("./billingNotifications");
const { audit } = require("./auditService");
const { PAYMENT_GRACE_DAYS } = require("../domain/subscriptionRules");
const logger = require("../utils/logger");const { formatIstDate } = require("../utils/istTime");


const DAY_MS = 24 * 3600 * 1000;
const TICK_INTERVAL_MS = 15 * 60 * 1000;

const REMINDER_7D = "subscription_expiring_7d";
const REMINDER_1D = "subscription_expiring_1d";
const EXPIRED = "subscription_expired";

/** A paid subscription that will not renew by itself. Only these get expiry reminders. */
const isNonRenewingPaid = (sub) =>
  Number(sub?.priceInr || 0) > 0 && (Boolean(sub.cancelAtPeriodEnd) || !sub.providerSubscriptionId);

/**
 * Reminder types that are due at `now`. Both windows are returned when both apply (for example after a worker outage),
 * and each is still sent at most once because of its idempotency key.
 */
const remindersDue = (sub, now = new Date()) => {
  if (!sub || sub.status !== "active" || !isNonRenewingPaid(sub) || !sub.currentPeriodEnd) return [];
  const remaining = new Date(sub.currentPeriodEnd).getTime() - now.getTime();
  if (remaining <= 0) return [];
  const due = [];
  if (remaining <= 7 * DAY_MS) due.push(REMINDER_7D);
  if (remaining <= DAY_MS) due.push(REMINDER_1D);
  return due;
};

/**
 * Whether a subscription must now be expired. Non-renewing paid plans expire at the end of their period.
 * A provider-managed plan whose renewal failed expires only after the payment grace period has passed.
 */
const lapseDue = (sub, now = new Date()) => {
  if (!sub || !sub.currentPeriodEnd) return false;
  const end = new Date(sub.currentPeriodEnd).getTime();
  if (sub.status === "active" && isNonRenewingPaid(sub)) return end <= now.getTime();
  if (sub.status === "past_due" && Number(sub.priceInr || 0) > 0) {
    return end + PAYMENT_GRACE_DAYS * DAY_MS <= now.getTime();
  }
  return false;
};

const endKey = (sub) => new Date(sub.currentPeriodEnd).toISOString();
const endsOn = (sub) => formatIstDate(sub.currentPeriodEnd);

const REMINDER_COPY = {
  [REMINDER_7D]: {
    title: "Your subscription expires in 7 days",
    message: (sub) =>
      `Your ${sub.planTier} plan is scheduled to expire on ${endsOn(sub)}. It will not renew automatically. Renew your plan to continue using your premium features.`,
  },
  [REMINDER_1D]: {
    title: "Your subscription expires tomorrow",
    message: (sub) =>
      `Your ${sub.planTier} plan expires on ${endsOn(sub)}. Renew now to avoid losing access to premium features.`,
  },
};

/** Sends due reminders. Returns the number of notifications delivered (duplicates are not counted). */
const sendReminders = async (sub, now) => {
  let sent = 0;
  for (const type of remindersDue(sub, now)) {
    const copy = REMINDER_COPY[type];
    const results = await notifySubscriptionEvent(sub, {
      type,
      title: copy.title,
      message: copy.message(sub),
      key: `${type}:${sub._id}:${endKey(sub)}`,
    });
    sent += results.length;
  }
  return sent;
};

/**
 * Expires lapsed subscriptions and tells the subscriber. The record is claimed with a conditional update, so two
 * workers never expire (or notify) the same subscription twice. Nothing else is deleted: jobs, applications,
 * interviews and resumes stay, and the subscriber falls back to the Free plan automatically.
 */
const expireLapsed = async (sub) => {
  const claimed = await Subscription.updateOne(
    { _id: sub._id, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd },
    { $set: { status: "expired", cancelAtPeriodEnd: false } },
  );
  if (claimed.modifiedCount !== 1) return 0;
  await audit({
    organization: sub.subscriberType === "organization" ? sub.subscriberId : null,
    action: "subscription.expired",
    resourceType: "subscription",
    resourceId: sub._id,
    metadata: { planTier: sub.planTier, periodEnd: sub.currentPeriodEnd, previousStatus: sub.status },
  });
  const results = await notifySubscriptionEvent(sub, {
    type: EXPIRED,
    title: "Your paid subscription has expired",
    message:
      "Your account has now moved to the Free Plan. Your existing jobs, applications and records are kept. You can upgrade again at any time.",
    key: `${EXPIRED}:${sub._id}:${endKey(sub)}`,
  });
  return results.length;
};

const runSubscriptionExpiryNotices = async (now = new Date()) => {
  const horizon = new Date(now.getTime() + 7 * DAY_MS);
  const candidates = await Subscription.find({
    priceInr: { $gt: 0 },
    $or: [
      // Non-renewing active plans: reminders in the window, then expiry at the period end.
      { status: "active", currentPeriodEnd: { $lte: horizon } },
      // Renewal failures: expire after the grace period.
      { status: "past_due", currentPeriodEnd: { $lte: new Date(now.getTime() - PAYMENT_GRACE_DAYS * DAY_MS) } },
    ],
  })
    .limit(500)
    .lean();

  let sent = 0;
  let expired = 0;
  for (const sub of candidates) {
    if (lapseDue(sub, now)) {
      expired += 1;
      sent += await expireLapsed(sub);
      continue;
    }
    sent += await sendReminders(sub, now);
  }
  if (sent || expired) logger.info(`Subscription notices sent: ${sent}; subscriptions expired: ${expired}`);
  return { due: candidates.length, sent, expired };
};

let lastTick = 0;
/** Throttled tick for the worker: at most one scan per 15 minutes. */
const tickSubscriptionNotices = async () => {
  const now = Date.now();
  if (now - lastTick < TICK_INTERVAL_MS) return { skipped: true };
  lastTick = now;
  return runSubscriptionExpiryNotices();
};

module.exports = {
  remindersDue,
  lapseDue,
  runSubscriptionExpiryNotices,
  tickSubscriptionNotices,
  REMINDER_7D,
  REMINDER_1D,
  EXPIRED,
};
