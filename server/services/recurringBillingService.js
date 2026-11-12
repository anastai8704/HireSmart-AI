// Recurring billing (Razorpay Subscriptions, Phase 7b).
//
// Flow:
//   1. checkout: a Razorpay plan is found or created for (plan, cycle, amount); a Razorpay subscription is
//      created for it; an initiated PaymentTransaction records the attempt.
//   2. The browser authorises the subscription with Razorpay Checkout (mandate / first charge).
//   3. Charges are recorded from verified provider data only: the verify-subscription call (after a
//      signature check and a provider fetch) or a signed webhook. Both use recordCharge, which is idempotent
//      on the provider payment id.
//   4. Renewals arrive as subscription.charged and extend the internal period.
//   5. Failures (subscription.pending, subscription.halted) move the subscription to past_due. Grace and
//      expiry then follow domain/subscriptionRules.js. Notifications are sent to the user who started the
//      purchase.
//   6. Cancellation is at cycle end, so the paid period is kept. The internal record is updated when the
//      provider confirms the cancellation.
const crypto = require("node:crypto");
const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { RazorpayPlan } = require("../models/RazorpayPlan");
const { ALL_PLANS } = require("../config/subscriptionPlans");
const { RECURRING } = require("../config/recurringBilling");
const payments = require("./paymentService");
const { audit } = require("./auditService");
const { getOrCreateOrgSubscription, getOrCreateCandidateSubscription } = require("../middleware/subscriptionCheck");
const { notify } = require("./notificationService");
const AppError = require("../utils/AppError");

const paiseOf = (rupees) => Math.round(Number(rupees) * 100);
const toDate = (unixSeconds) => (unixSeconds ? new Date(Number(unixSeconds) * 1000) : null);
const orgOf = (subscriberType, subscriberId) => (subscriberType === "organization" ? subscriberId : null);
const transactionNumber = () => `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

/** Price in rupees for a plan and cycle. Yearly is refused until the business sets a yearly price. */
const priceFor = (plan, billingCycle) => {
  if (billingCycle === "monthly") return plan.priceInr;
  if (billingCycle === "yearly") {
    if (!Number.isFinite(plan.yearlyPriceInr) || plan.yearlyPriceInr <= 0) {
      throw new AppError("This plan is not available yearly yet.", 400, "YEARLY_PRICE_NOT_CONFIGURED");
    }
    return plan.yearlyPriceInr;
  }
  throw new AppError("Invalid billing cycle", 400, "INVALID_BILLING_CYCLE");
};

/** Finds or creates the provider plan for (plan, cycle, amount). A price change creates a new plan. */
const ensureProviderPlan = async (plan, billingCycle) => {
  const amountPaise = paiseOf(priceFor(plan, billingCycle));
  const key = { planTier: plan.tier, billingCycle, amountPaise, currency: "INR" };
  const existing = await RazorpayPlan.findOne(key).lean();
  if (existing) return existing;
  const created = await payments.createProviderPlan({
    period: RECURRING[billingCycle].period,
    interval: RECURRING[billingCycle].interval,
    name: `HireSmart ${plan.name} (${billingCycle})`,
    amountPaise,
    notes: { planTier: plan.tier, billingCycle },
  });
  try {
    return await RazorpayPlan.create({ ...key, razorpayPlanId: created.id });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    // Another request created the same plan first. Use its row.
    return RazorpayPlan.findOne(key).lean();
  }
};

/** Starts a recurring purchase. Returns what the browser needs to open Checkout. */
const startSubscriptionCheckout = async ({ req, subscriber, plan, billingCycle }) => {
  // The record must exist before the provider subscription is created, so the first charge can always be applied.
  await ensureSubscriber(subscriber.subscriberType, subscriber.subscriberId);
  const providerPlan = await ensureProviderPlan(plan, billingCycle);
  const providerSub = await payments.createProviderSubscription({
    planId: providerPlan.razorpayPlanId,
    totalCount: RECURRING[billingCycle].totalCount,
    notes: {
      planTier: plan.tier,
      billingCycle,
      subscriberType: subscriber.subscriberType,
      subscriberId: String(subscriber.subscriberId),
    },
  });
  const amount = priceFor(plan, billingCycle);
  const txn = await PaymentTransaction.create({
    transactionNumber: transactionNumber(),
    subscriberType: subscriber.subscriberType,
    subscriberId: subscriber.subscriberId,
    planTier: plan.tier,
    amount,
    currency: "INR",
    status: "initiated",
    gateway: "razorpay",
    providerSubscriptionId: providerSub.id,
    invoiceNumber: payments.generateInvoiceNumber(),
    metadata: {
      planName: plan.name,
      billingCycle,
      razorpayPlanId: providerPlan.razorpayPlanId,
      initiatedBy: String(req.user._id),
    },
  });
  await audit({
    req,
    organization: orgOf(subscriber.subscriberType, subscriber.subscriberId),
    action: "subscription.checkout_created",
    resourceType: "payment_transaction",
    resourceId: txn._id,
    metadata: { planTier: plan.tier, billingCycle, amount, providerSubscriptionId: providerSub.id },
  });
  return {
    subscriptionId: providerSub.id,
    keyId: payments.readPaymentConfig().razorpayKeyId,
    amount,
    currency: "INR",
    billingCycle,
    transaction: txn,
  };
};

/**
 * The internal subscription record for a subscriber. Created with the Free plan if it does not exist yet, so
 * a first paid charge can always be applied. Before this, a subscriber without a record failed as
 * unknown_subscription and the purchase was marked failed although the provider had charged the customer.
 */
const ensureSubscriber = (subscriberType, subscriberId) =>
  subscriberType === "organization" ? getOrCreateOrgSubscription(subscriberId) : getOrCreateCandidateSubscription(subscriberId);

/** The internal subscription linked to a provider subscription id (set on first charge). */
const linkedSubscription = async (providerSubscriptionId) => {
  const linked = await Subscription.findOne({ providerSubscriptionId });
  if (linked) return linked;
  const txn = await PaymentTransaction.findOne({ providerSubscriptionId }).sort({ createdAt: -1 }).lean();
  if (!txn) return null;
  return ensureSubscriber(txn.subscriberType, txn.subscriberId);
};

/** The provider plan row for the plan_id on a provider subscription. Ties a charge to our plan. */
const planForProviderSubscription = (providerPlanId) => RazorpayPlan.findOne({ razorpayPlanId: String(providerPlanId) }).lean();

const notifyInitiator = async (providerSubscriptionId, { type, title, message, eventKey }) => {
  const txn = await PaymentTransaction.findOne({ providerSubscriptionId }).sort({ createdAt: -1 }).lean();
  const userId = txn?.metadata?.initiatedBy;
  if (!userId) return;
  await notify({
    user: userId,
    organization: orgOf(txn.subscriberType, txn.subscriberId),
    type,
    title,
    message,
    category: "account",
    email: true,
    idempotencyKey: `${type}:${eventKey}`,
  });
};

/**
 * Records a successful charge for a provider subscription. Idempotent on the provider payment id.
 * Returns an outcome string; never throws for a duplicate.
 */
const recordCharge = async ({ providerSub, payment, eventKey, req = null }) => {
  if (!payment || String(payment.status || "captured") !== "captured") return { outcome: "not_captured" };

  const existing = await PaymentTransaction.findOne({ gatewayPaymentId: String(payment.id) }).lean();
  if (existing) return { outcome: existing.status === "captured" ? "already_recorded" : "needs_review" };

  const sub = await linkedSubscription(providerSub.id);
  if (!sub) return { outcome: "unknown_subscription" };

  const rp = await planForProviderSubscription(providerSub.plan_id);
  const plan = rp ? ALL_PLANS[rp.planTier] : null;
  if (!rp || !plan) return { outcome: "unknown_plan" };
  if (Number(payment.amount) !== rp.amountPaise || String(payment.currency || "").toUpperCase() !== rp.currency) {
    await audit({
      organization: orgOf(sub.subscriberType, sub.subscriberId),
      action: "subscription.webhook_amount_mismatch",
      resourceType: "subscription",
      resourceId: sub._id,
      metadata: { providerSubscriptionId: providerSub.id, providerPaymentId: payment.id },
    });
    return { outcome: "amount_mismatch" };
  }

  const periodEnd = toDate(providerSub.current_end);
  if (!periodEnd) return { outcome: "missing_period" };
  // Out-of-order guard: never move the period backwards.
  if (sub.providerSubscriptionId === providerSub.id && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > periodEnd) {
    return { outcome: "stale" };
  }

  // Subscription first: the update is idempotent, so a retry after a later failure repeats it safely.
  await Subscription.updateOne(
    { _id: sub._id },
    {
      $set: {
        planTier: plan.tier,
        billingCycle: rp.billingCycle,
        priceInr: rp.amountPaise / 100,
        status: "active",
        currentPeriodStart: toDate(providerSub.current_start) || new Date(),
        currentPeriodEnd: periodEnd,
        limits: { ...plan.limits },
        providerSubscriptionId: providerSub.id,
        providerStatus: String(providerSub.status || "active"),
        renewalFailures: 0,
        pastDueSince: null,
        cancelAtPeriodEnd: false,
      },
    },
  );

  // The first charge completes the initiating attempt; later charges are new transactions.
  let txn = null;
  const initiated = await PaymentTransaction.findOne({ providerSubscriptionId: providerSub.id, status: "initiated" }).sort({ createdAt: -1 });
  if (initiated) {
    txn = await PaymentTransaction.findOneAndUpdate(
      { _id: initiated._id, status: "initiated" },
      { $set: { status: "captured", gatewayPaymentId: String(payment.id), subscription: sub._id } },
      { returnDocument: "after" },
    );
  }
  const isFirst = Boolean(txn);
  if (!txn) {
    try {
      txn = await PaymentTransaction.create({
        transactionNumber: transactionNumber(),
        subscriberType: sub.subscriberType,
        subscriberId: sub.subscriberId,
        subscription: sub._id,
        planTier: plan.tier,
        amount: rp.amountPaise / 100,
        currency: rp.currency,
        status: "captured",
        gateway: "razorpay",
        gatewayPaymentId: String(payment.id),
        providerSubscriptionId: providerSub.id,
        invoiceNumber: payments.generateInvoiceNumber(),
        metadata: { planName: plan.name, billingCycle: rp.billingCycle, razorpayPlanId: rp.razorpayPlanId },
      });
    } catch (error) {
      if (error?.code === 11000) return { outcome: "already_recorded" };
      throw error;
    }
  }


  await audit({
    req,
    organization: orgOf(sub.subscriberType, sub.subscriberId),
    action: isFirst ? "subscription.upgrade" : "subscription.renewed",
    resourceType: "subscription",
    resourceId: sub._id,
    metadata: {
      planTier: plan.tier,
      billingCycle: rp.billingCycle,
      amount: rp.amountPaise / 100,
      invoiceNumber: txn.invoiceNumber,
      providerSubscriptionId: providerSub.id,
      providerPaymentId: String(payment.id),
      source: req ? "verify" : "webhook",
    },
  });
  if (!isFirst) {
    await notifyInitiator(providerSub.id, {
      type: "subscription_renewed",
      title: "Your subscription renewed",
      message: `Your ${plan.name} plan renewed. Your next billing date is ${periodEnd.toDateString()}.`,
      eventKey,
    });
  }
  return { outcome: isFirst ? "activated" : "renewed" };
};

/** Keeps a failed charge attempt in the history. Idempotent on the provider payment id. */
const recordFailedCharge = async ({ providerSubscriptionId, payment }) => {
  if (!payment?.id) return { outcome: "invalid_payload" };
  const exists = await PaymentTransaction.exists({ gatewayPaymentId: String(payment.id) });
  if (exists) return { outcome: "already_recorded" };
  const sub = await linkedSubscription(providerSubscriptionId);
  if (!sub) return { outcome: "unknown_subscription" };
  try {
    await PaymentTransaction.create({
      transactionNumber: transactionNumber(),
      subscriberType: sub.subscriberType,
      subscriberId: sub.subscriberId,
      subscription: sub._id,
      planTier: sub.planTier,
      amount: Number(payment.amount || 0) / 100,
      currency: String(payment.currency || "INR").toUpperCase(),
      status: "failed",
      gateway: "razorpay",
      gatewayPaymentId: String(payment.id),
      providerSubscriptionId,
      invoiceNumber: payments.generateInvoiceNumber(),
      metadata: { billingCycle: sub.billingCycle, failureReason: String(payment.error_description || "") },
    });
  } catch (error) {
    if (error?.code === 11000) return { outcome: "already_recorded" };
    throw error;
  }
  return { outcome: "failure_recorded" };
};

/**
 * Applies a provider subscription status change that does not carry a charge. The provider is the source
 * of truth for status; the internal status is derived from it here.
 */
const applyStatusEvent = async ({ eventType, providerSub, eventKey }) => {
  const sub = await linkedSubscription(providerSub.id);
  if (!sub) return { outcome: "unknown_subscription" };
  const providerStatus = String(providerSub.status || "");
  const base = { providerStatus };
  const orgId = orgOf(sub.subscriberType, sub.subscriberId);

  switch (eventType) {
    case "subscription.authenticated":
    case "subscription.updated":
    case "subscription.paused":
    case "subscription.resumed":
      await Subscription.updateOne({ _id: sub._id }, { $set: { ...base, providerSubscriptionId: providerSub.id } });
      return { outcome: "recorded" };

    case "subscription.activated": {
      const set = { ...base, providerSubscriptionId: providerSub.id };
      // A subscription that recovered by itself: the charge events set the period; this only clears the failure state.
      if (Number(providerSub.paid_count || 0) >= 1 && sub.status === "past_due") {
        Object.assign(set, { status: "active", renewalFailures: 0, pastDueSince: null });
      }
      await Subscription.updateOne({ _id: sub._id }, { $set: set });
      return { outcome: "recorded" };
    }

    case "subscription.pending": {
      await Subscription.updateOne(
        { _id: sub._id },
        {
          $set: { ...base, status: "past_due", pastDueSince: sub.pastDueSince || new Date() },
          $inc: { renewalFailures: 1 },
        },
      );
      await audit({
        organization: orgId,
        action: "subscription.payment_failed",
        resourceType: "subscription",
        resourceId: sub._id,
        metadata: { providerSubscriptionId: providerSub.id, providerStatus, eventKey },
      });
      await notifyInitiator(providerSub.id, {
        type: "subscription_payment_failed",
        title: "A subscription payment failed",
        message: "We could not collect your subscription payment. We will retry automatically. Update your payment method if it keeps failing.",
        eventKey,
      });
      return { outcome: "past_due" };
    }

    case "subscription.halted": {
      await Subscription.updateOne(
        { _id: sub._id },
        { $set: { ...base, status: "past_due", pastDueSince: sub.pastDueSince || new Date() } },
      );
      await audit({
        organization: orgId,
        action: "subscription.halted",
        resourceType: "subscription",
        resourceId: sub._id,
        metadata: { providerSubscriptionId: providerSub.id, eventKey },
      });
      await notifyInitiator(providerSub.id, {
        type: "subscription_halted",
        title: "Your subscription payments have stopped",
        message: "All automatic retries failed. Your plan stays available through the grace period. Authorise a new payment method to continue.",
        eventKey,
      });
      return { outcome: "halted" };
    }

    case "subscription.cancelled": {
      const endedNow = providerSub.ended_at && Number(providerSub.ended_at) * 1000 <= Date.now();
      await Subscription.updateOne(
        { _id: sub._id },
        { $set: { ...base, cancelAtPeriodEnd: !endedNow, ...(endedNow ? { status: "canceled" } : {}) } },
      );
      await audit({
        organization: orgId,
        action: "subscription.cancelled",
        resourceType: "subscription",
        resourceId: sub._id,
        metadata: { providerSubscriptionId: providerSub.id, endedNow: Boolean(endedNow), eventKey },
      });
      await notifyInitiator(providerSub.id, {
        type: "subscription_cancelled",
        title: "Your subscription was cancelled",
        message: endedNow
          ? "Your subscription has ended."
          : "Your subscription is cancelled. Your plan stays active until the end of the current billing period.",
        eventKey,
      });
      return { outcome: "cancelled" };
    }

    case "subscription.completed":
      await Subscription.updateOne({ _id: sub._id }, { $set: { ...base, cancelAtPeriodEnd: true } });
      return { outcome: "completed" };

    default:
      return { outcome: "ignored" };
  }
};

/** Cancels the provider subscription at cycle end. The internal record changes when the provider confirms. */
const requestCancellation = async (sub) => {
  if (!sub.providerSubscriptionId) return null;
  return payments.cancelProviderSubscription(sub.providerSubscriptionId);
};

module.exports = {
  priceFor,
  ensureProviderPlan,
  ensureSubscriber,
  linkedSubscription,
  startSubscriptionCheckout,
  recordCharge,
  applyStatusEvent,
  recordFailedCharge,
  requestCancellation,
  fetchProviderSubscription: payments.fetchProviderSubscription,
  verifyRazorpaySubscriptionSignature: payments.verifyRazorpaySubscriptionSignature,
};
