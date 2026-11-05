const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { audit } = require("./auditService");
const { notifySubscriptionEvent } = require("./billingNotifications");

// Shared payment processing (Phase 7). Used by the HTTP verify-payment path and by the provider webhook,
// so both paths follow the same rules: one claim per order, activation only after a captured payment,
// and no state change for amounts or currencies that do not match the server-side order.

/**
 * Activates a plan from a verified payment. Only called after the transaction was claimed.
 */
const activatePlan = async (txn, plan) => {
  const periodStart = new Date();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  let sub = await Subscription.findOne({
    subscriberType: txn.subscriberType,
    subscriberId: txn.subscriberId,
  });
  if (!sub) {
    sub = await Subscription.create({
      subscriberType: txn.subscriberType,
      subscriberId: txn.subscriberId,
      planTier: txn.planTier,
      status: "active",
      priceInr: plan.priceInr,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      limits: plan.limits,
      usage: {
        activeJobsCount: 0,
        teamMembersCount: 1,
        aiAnalysesUsedThisMonth: 0,
      },
    });
  } else {
    if (sub.planTier !== txn.planTier || sub.status !== "active") {
      await audit({
        organization: txn.subscriberType === "organization" ? txn.subscriberId : null,
        action: "subscription.plan_changed",
        resourceType: "subscription",
        resourceId: sub._id,
        metadata: { from: sub.planTier, fromStatus: sub.status, to: txn.planTier, transaction: txn._id },
      });
    }
    sub.planTier = txn.planTier;
    sub.status = "active";
    sub.priceInr = plan.priceInr;
    sub.currentPeriodStart = periodStart;
    sub.currentPeriodEnd = periodEnd;
    sub.limits = plan.limits;
    sub.cancelAtPeriodEnd = false;
    await sub.save();
  }
  return sub;
};

/** True when the provider's amount (paise) and currency match the stored order. */
const amountMatches = (providerPayment, txn) =>
  Number(providerPayment.amount) === Math.round(Number(txn.amount) * 100) &&
  String(providerPayment.currency || "").toUpperCase() === String(txn.currency || "").toUpperCase();

/** Marks an initiated order failed and records why. Never moves a captured or refunded order. */
const failTransaction = async (req, txn, reason) => {
  await PaymentTransaction.updateOne({ _id: txn._id, status: "initiated" }, { $set: { status: "failed" } });
  await audit({
    req,
    organization: txn.subscriberType === "organization" ? txn.subscriberId : null,
    action: "subscription.payment_verification_failed",
    resourceType: "payment_transaction",
    resourceId: txn._id,
    metadata: { planTier: txn.planTier, reason },
  });
};

/**
 * Claims an order and activates its plan. Only one caller can move an order to captured.
 * `fromStatuses` is "initiated" for the browser path. The provider webhook also accepts failed or cancelled
 * orders, because a capture reported by the provider is the source of truth for money taken.
 * Returns { sub, txn } or null when the order was already processed.
 */
const captureTransaction = async ({
  txn,
  paymentId,
  signature = "",
  plan,
  req = null,
  source,
  fromStatuses = ["initiated"],
}) => {
  const previousStatus = txn.status;
  let claimed;
  try {
    claimed = await PaymentTransaction.findOneAndUpdate(
      { _id: txn._id, status: { $in: fromStatuses } },
      { $set: { status: "captured", gatewayPaymentId: String(paymentId), gatewaySignature: String(signature) } },
      { returnDocument: "after" },
    );
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
  if (!claimed) return null;

  let sub;
  try {
    sub = await activatePlan(claimed, plan);
  } catch (error) {
    // Roll the claim back so the order is not left captured without an active plan.
    await PaymentTransaction.updateOne(
      { _id: claimed._id, status: "captured" },
      { $set: { status: previousStatus, gatewayPaymentId: "", gatewaySignature: "" } },
    );
    throw error;
  }

  await PaymentTransaction.updateOne({ _id: claimed._id }, { $set: { subscription: sub._id } });
  const finalTxn = await PaymentTransaction.findById(claimed._id);

  await audit({
    req,
    organization: claimed.subscriberType === "organization" ? claimed.subscriberId : null,
    action: "subscription.upgrade",
    resourceType: "subscription",
    resourceId: sub._id,
    metadata: { planTier: claimed.planTier, amount: claimed.amount, invoiceNumber: claimed.invoiceNumber, source },
    newState: { planTier: claimed.planTier, status: "active", currentPeriodEnd: sub.currentPeriodEnd },
  });
  // Best effort: a notification failure must never undo a captured payment.
  notifySubscriptionEvent(sub, {
    type: "subscription_activated",
    title: "Your plan is active",
    message: `Your ${claimed.planTier} plan is now active.`,
    key: `subscription-activated:${claimed._id}`,
  }).catch(() => {});
  return { sub, txn: finalTxn };
};

module.exports = {
  activatePlan,
  amountMatches,
  failTransaction,
  captureTransaction,
};
