const { Subscription } = require("../models/Subscription");
const { REVENUE_STATUSES, refundStatusOf, revenueMode, isRevenueEligible } = require("../domain/revenueRules");
const { billingStateFrom } = require("../domain/billingState");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { ALL_PLANS, CANDIDATE_PLANS, RECRUITER_PLANS } = require("../config/subscriptionPlans");
const {
  createOrder,
  verifyPaymentSignature,
  fetchProviderPayment,
  generateInvoiceNumber,
  generateSimulationPaymentId,
  generateSimulationSignature,
  getPaymentMode,
  PAYMENT_MODE_RAZORPAY_TEST,
} = require("../services/paymentService");
const {
  startSubscriptionCheckout,
  recordCharge,
  requestCancellation,
  fetchProviderSubscription,
  verifyRazorpaySubscriptionSignature,
  paymentBelongsToSubscription,
} = require("../services/recurringBillingService");
const { failTransaction, captureTransaction } = require("../services/paymentProcessingService");
const {
  getOrCreateCandidateSubscription,
  getOrCreateOrgSubscription,
  getEffectiveSubscription,
} = require("../middleware/subscriptionCheck");
const { findActiveMembership } = require("../middleware/v1Auth");
const Job = require("../models/Job");
const { Membership } = require("../models/Membership");
const { audit } = require("../services/auditService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { parse, applyCursor, meta } = require("../utils/pagination");

const ORGANIZATION_PERMISSION = "organization.manage";

/** Removes server-only fields before a transaction is returned to a client. */
const publicTransaction = (txn) => {
  const data = typeof txn.toObject === "function" ? txn.toObject() : { ...txn };
  if (data.metadata) {
    const { expectedPaymentId: _omit, ...rest } = data.metadata;
    data.metadata = rest;
  }
  return data;
};

/**
 * Resolves who a billing request acts for.
 * - Candidates act for themselves.
 * - Everyone else must supply X-Organization-Id with an active membership. If `permission`
 *   is given, the membership must carry it. Non-members get 404 (no existence leak).
 */
const resolveBillingSubscriber = async (req, { permission = null } = {}) => {
  if (req.user.role === "candidate") {
    return { subscriberType: "candidate", subscriberId: req.user._id };
  }
  const orgHeader = req.get("x-organization-id");
  if (!orgHeader) {
    throw new AppError("Organization context is required", 400, "ORGANIZATION_REQUIRED");
  }
  if (!mongoose.isValidObjectId(orgHeader)) {
    throw new AppError("Invalid organization context", 400, "INVALID_ORGANIZATION");
  }
  const membership = await findActiveMembership(req.user._id, orgHeader, permission);
  if (!membership) {
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }
  return { subscriberType: "organization", subscriberId: membership.organization };
};

/** Confirms the caller may act on an existing transaction. Mismatches look like "not found". */
const assertTransactionAccess = async (req, txn) => {
  const notFound = () => new AppError("Payment order not found", 404, "PAYMENT_ORDER_NOT_FOUND");
  if (txn.subscriberType === "candidate") {
    if (req.user.role !== "candidate" || String(txn.subscriberId) !== String(req.user._id)) {
      throw notFound();
    }
    return;
  }
  const membership = await findActiveMembership(
    req.user._id,
    txn.subscriberId,
    ORGANIZATION_PERMISSION,
  );
  if (!membership) throw notFound();
};

/** Candidate plans are bought by candidates; organization plans by recruiters. */
const assertRoleForPlan = (req, plan) => {
  const expectedRole = plan.role === "candidate" ? "candidate" : "recruiter";
  if (req.user.role !== expectedRole) {
    throw new AppError("You are not permitted to purchase this plan", 403, "FORBIDDEN");
  }
};

/**
 * Public/Protected: List all plan configurations & pricing
 */
exports.getPlans = asyncHandler(async (_req, res) => {
  res.json({
    data: {
      candidate: Object.values(CANDIDATE_PLANS),
      recruiter: Object.values(RECRUITER_PLANS),
      all: ALL_PLANS,
    },
  });
});

/**
 * Candidate or Recruiter: Get current active plan & quota usage
 */
// Whether a checkout is in progress or the last payment failed. Used only for the plan badge wording.
const billingStateFor = async (subscriber) => {
  const base = { subscriberType: subscriber.subscriberType, subscriberId: subscriber.subscriberId };
  const [initiated, failed, captured] = await Promise.all([
    PaymentTransaction.findOne({ ...base, status: "initiated" }).sort({ _id: -1 }).select("createdAt").lean(),
    PaymentTransaction.findOne({ ...base, status: "failed" }).sort({ _id: -1 }).select("_id").lean(),
    PaymentTransaction.findOne({ ...base, status: { $in: REVENUE_STATUSES } }).sort({ _id: -1 }).select("_id").lean(),
  ]);
  return billingStateFrom({
    initiatedAt: initiated?.createdAt || null,
    failedId: failed?._id || null,
    capturedId: captured?._id || null,
    now: new Date(),
  });
};

exports.getCurrentSubscription = asyncHandler(async (req, res) => {
  const subscriber = await resolveBillingSubscriber(req);
  let sub;
  if (subscriber.subscriberType === "candidate") {
    sub = await getOrCreateCandidateSubscription(req.user._id);
  } else {
    sub = await getOrCreateOrgSubscription(subscriber.subscriberId);
    // Refresh live usage numbers
    const activeJobs = await Job.countDocuments({
      organization: subscriber.subscriberId,
      status: "published",
    });
    const teamMembers = await Membership.countDocuments({
      organization: subscriber.subscriberId,
      status: "active",
    });
    sub.usage.activeJobsCount = activeJobs;
    sub.usage.teamMembersCount = teamMembers;
    await sub.save();
  }

  const planDetails = ALL_PLANS[sub.planTier] || ALL_PLANS.candidate_free;
  // What is in force right now (expired or unpaid plans fall back to the free limits).
  const entitlement = await getEffectiveSubscription(subscriber.subscriberType, subscriber.subscriberId);
  const billingState = await billingStateFor(subscriber);
  res.json({
    data: {
      subscription: sub,
      plan: planDetails,
      entitlement,
      billingState,
    },
  });
});

/**
 * Starts a purchase. The price always comes from the server-side plan definition.
 * - razorpay_test: a recurring Razorpay subscription. Yearly is offered only when the plan has a yearly price.
 * - simulation: a one-time sandbox order (development and tests only, never a recurring charge).
 */
exports.checkout = asyncHandler(async (req, res) => {
  const { planTier, billingCycle = "monthly" } = req.body;
  const targetPlan = ALL_PLANS[planTier];
  if (!targetPlan) {
    throw new AppError("Invalid subscription plan tier", 400, "INVALID_PLAN");
  }
  if (!targetPlan.priceInr) {
    throw new AppError("This plan is not available for purchase", 400, "PLAN_NOT_PURCHASABLE");
  }
  assertRoleForPlan(req, targetPlan);

  const subscriber = await resolveBillingSubscriber(req, {
    permission: targetPlan.role === "candidate" ? null : ORGANIZATION_PERMISSION,
  });

  if (getPaymentMode() === PAYMENT_MODE_RAZORPAY_TEST) {
    await assertNoRecurringSubscription(subscriber);
    const started = await startSubscriptionCheckout({ req, subscriber, plan: targetPlan, billingCycle });
    res.json({
      data: {
        subscription: {
          mode: "razorpay_subscription",
          subscriptionId: started.subscriptionId,
          keyId: started.keyId,
          amount: started.amount,
          currency: started.currency,
          billingCycle: started.billingCycle,
        },
        transaction: publicTransaction(started.transaction),
        plan: targetPlan,
        simulationHelper: null,
      },
    });
    return;
  }

  // Simulation: one-time sandbox order. Recurring billing needs the Razorpay test mode.
  if (billingCycle !== "monthly") {
    throw new AppError("Yearly billing is not available in the sandbox.", 400, "BILLING_CYCLE_NOT_AVAILABLE");
  }
  const amount = targetPlan.priceInr;
  const order = await createOrder({
    amount,
    currency: "INR",
    receipt: `order_${subscriber.subscriberType}_${Date.now()}`,
  });
  const expectedPaymentId = order.mode === "simulation" ? generateSimulationPaymentId() : null;

  const transaction = await PaymentTransaction.create({
    transactionNumber: `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    subscriberType: subscriber.subscriberType,
    subscriberId: subscriber.subscriberId,
    planTier,
    amount,
    currency: "INR",
    status: "initiated",
    gateway: "simulation",
    gatewayOrderId: order.orderId,
    invoiceNumber: generateInvoiceNumber(),
    metadata: {
      planName: targetPlan.name,
      billingCycle,
      expectedPaymentId,
    },
  });

  await audit({
    req,
    organization: subscriber.subscriberType === "organization" ? subscriber.subscriberId : null,
    action: "subscription.checkout_created",
    resourceType: "payment_transaction",
    resourceId: transaction._id,
    metadata: { planTier, amount, gatewayOrderId: order.orderId, mode: order.mode },
  });

  res.json({
    data: {
      order,
      transaction: publicTransaction(transaction),
      plan: targetPlan,
      // Sandbox only: the server issues the payment id and signs it. The client echoes both back.
      simulationHelper: expectedPaymentId
        ? {
            orderId: order.orderId,
            paymentId: expectedPaymentId,
            signature: generateSimulationSignature(order.orderId, expectedPaymentId),
          }
        : null,
    },
  });
});

/** A subscriber may hold one recurring subscription at a time. Plan changes are a cancel and a new purchase. */
const assertNoRecurringSubscription = async (subscriber) => {
  const existing = await Subscription.findOne({
    subscriberType: subscriber.subscriberType,
    subscriberId: subscriber.subscriberId,
  }).lean();
  if (
    existing?.providerSubscriptionId &&
    ["active", "past_due"].includes(existing.status) &&
    !existing.cancelAtPeriodEnd
  ) {
    throw new AppError(
      "This account already has an active recurring subscription. Cancel it before choosing another plan.",
      409,
      "ALREADY_SUBSCRIBED",
    );
  }
};

const PENDING_MESSAGE = "We received your payment and are confirming it. Your plan activates automatically once it is confirmed.";

/**
 * The provider captured a payment, but this request could not apply it (for example the internal record is not
 * linked yet). The order stays initiated so the webhook or a retry can complete it. Nothing is granted here.
 */
const deferForReconciliation = async (req, txn, reason, providerPaymentId) => {
  await audit({
    req,
    organization: txn.subscriberType === "organization" ? txn.subscriberId : null,
    action: "subscription.verification_deferred",
    resourceType: "payment_transaction",
    resourceId: txn._id,
    metadata: { planTier: txn.planTier, reason, providerPaymentId: String(providerPaymentId) },
  });
};

const invalidVerification = () =>
  new AppError("Payment verification failed. Invalid transaction signature.", 400, "PAYMENT_VERIFICATION_FAILED");

/**
 * Verify Payment & Activate Plan (sandbox only). Razorpay test mode uses verify-subscription.
 */
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { orderId, paymentId, signature, planTier } = req.body;

  const txn = await PaymentTransaction.findOne({ gatewayOrderId: orderId });
  if (!txn) {
    throw new AppError("Payment order not found", 404, "PAYMENT_ORDER_NOT_FOUND");
  }
  await assertTransactionAccess(req, txn);

  if (planTier && planTier !== txn.planTier) {
    throw new AppError("Plan does not match the payment order", 400, "PLAN_MISMATCH");
  }
  if (txn.status !== "initiated") {
    // Replays of a captured order, or orders already failed, cancelled or refunded, never change state.
    throw new AppError("Payment has already been processed", 409, "PAYMENT_ALREADY_PROCESSED");
  }

  const plan = ALL_PLANS[txn.planTier];
  if (!plan) {
    throw new AppError("Invalid subscription plan tier", 400, "INVALID_PLAN");
  }

  const expectedPaymentId = txn.metadata?.expectedPaymentId;
  const isValid =
    txn.gateway === "simulation" &&
    Boolean(expectedPaymentId) &&
    String(paymentId) === expectedPaymentId &&
    verifyPaymentSignature({ orderId, paymentId, signature });
  if (!isValid) {
    await failTransaction(req, txn, "invalid_signature");
    throw invalidVerification();
  }

  const outcome = await captureTransaction({ txn, paymentId, signature, plan, req, source: "verify" });
  if (!outcome) {
    throw new AppError("Payment has already been processed", 409, "PAYMENT_ALREADY_PROCESSED");
  }
  res.json({
    data: {
      subscription: outcome.sub,
      transaction: publicTransaction(outcome.txn),
      plan,
      message: `Successfully upgraded to ${plan.name} plan!`,
    },
  });
});

/**
 * Verify a recurring Razorpay subscription after Checkout (Phase 7b).
 * 1. The Checkout signature is checked (HMAC of payment_id|subscription_id).
 * 2. The subscription and the payment are fetched from Razorpay. Their status, plan, amount and currency are checked.
 * 3. The charge is recorded through the same idempotent path the webhook uses.
 * A payment or subscription that is not yet active returns 202 pending. Webhooks complete it later.
 */
exports.verifySubscription = asyncHandler(async (req, res) => {
  const { subscriptionId, paymentId, signature, planTier } = req.body;

  const txn = await PaymentTransaction.findOne({ providerSubscriptionId: subscriptionId }).sort({ createdAt: -1 });
  if (!txn) {
    throw new AppError("Payment order not found", 404, "PAYMENT_ORDER_NOT_FOUND");
  }
  await assertTransactionAccess(req, txn);
  if (planTier && planTier !== txn.planTier) {
    throw new AppError("Plan does not match the payment order", 400, "PLAN_MISMATCH");
  }
  if (txn.status !== "initiated") {
    throw new AppError("Payment has already been processed", 409, "PAYMENT_ALREADY_PROCESSED");
  }
  if (!verifyRazorpaySubscriptionSignature({ subscriptionId, paymentId, signature })) {
    await failTransaction(req, txn, "invalid_signature");
    throw invalidVerification();
  }

  const providerSub = await fetchProviderSubscription(subscriptionId);
  if (!["active", "authenticated"].includes(String(providerSub.status)) || Number(providerSub.paid_count || 0) < 1) {
    res.status(202).json({ data: { status: "pending", message: "Your subscription is being set up. Your plan will activate once the first payment is confirmed." } });
    return;
  }

  const payment = await fetchProviderPayment(paymentId);
  if (!paymentBelongsToSubscription(payment, subscriptionId)) {
    // The provider data disagrees with this order. The payment is not failed on our side: the order stays open for reconciliation.
    await deferForReconciliation(req, txn, "subscription_mismatch", paymentId);
    res.status(202).json({ data: { status: "pending", message: PENDING_MESSAGE } });
    return;
  }
  if (payment.status === "failed") {
    await failTransaction(req, txn, "provider_failed");
    throw new AppError("The payment was not successful. You can try again.", 400, "PAYMENT_FAILED");
  }
  if (payment.status !== "captured") {
    res.status(202).json({ data: { status: "pending", message: "Your payment is awaiting confirmation." } });
    return;
  }

  const result = await recordCharge({ providerSub, payment, eventKey: `verify:${paymentId}`, req });
  if (result.outcome === "already_recorded") {
    throw new AppError("Payment has already been processed", 409, "PAYMENT_ALREADY_PROCESSED");
  }
  if (!["activated", "renewed"].includes(result.outcome)) {
    // A captured payment the provider reports is not a customer failure. Defer to reconciliation; never grant or revoke here.
    await deferForReconciliation(req, txn, result.outcome, paymentId);
    res.status(202).json({ data: { status: "pending", message: PENDING_MESSAGE } });
    return;
  }

  const sub = await Subscription.findOne({ providerSubscriptionId: subscriptionId }).lean();
  const plan = ALL_PLANS[txn.planTier];
  const finalTxn = await PaymentTransaction.findById(txn._id).lean();
  res.json({
    data: {
      subscription: sub,
      transaction: publicTransaction(finalTxn),
      plan,
      message: `Your ${plan.name} plan is active. It renews automatically each billing period.`,
    },
  });
});

/**
 * The payer closed or abandoned Checkout. Only an initiated order can be cancelled; nothing is charged.
 * Accepts the order id (sandbox) or the subscription id (Razorpay).
 */
exports.cancelCheckout = asyncHandler(async (req, res) => {
  const { orderId, subscriptionId } = req.body;
  const txn = orderId
    ? await PaymentTransaction.findOne({ gatewayOrderId: orderId })
    : await PaymentTransaction.findOne({ providerSubscriptionId: subscriptionId }).sort({ createdAt: -1 });
  if (!txn) {
    throw new AppError("Payment order not found", 404, "PAYMENT_ORDER_NOT_FOUND");
  }
  await assertTransactionAccess(req, txn);

  const result = await PaymentTransaction.updateOne({ _id: txn._id, status: "initiated" }, { $set: { status: "cancelled" } });
  if (result.modifiedCount === 1) {
    await audit({
      req,
      organization: txn.subscriberType === "organization" ? txn.subscriberId : null,
      action: "subscription.checkout_cancelled",
      resourceType: "payment_transaction",
      resourceId: txn._id,
      metadata: { planTier: txn.planTier },
    });
  }
  const fresh = await PaymentTransaction.findById(txn._id);
  res.json({ data: { transaction: publicTransaction(fresh) } });
});

/**
 * Cancel renewal. For a Razorpay subscription the provider cancels at the end of the billing period first;
 * if the provider refuses, nothing changes locally.
 */
exports.cancelSubscription = asyncHandler(async (req, res) => {
  const subscriber = await resolveBillingSubscriber(req, { permission: ORGANIZATION_PERMISSION });
  const isCandidate = subscriber.subscriberType === "candidate";

  const sub = await Subscription.findOne({
    subscriberType: subscriber.subscriberType,
    subscriberId: subscriber.subscriberId,
  });
  if (!sub) {
    throw new AppError("No active subscription found", 404, "RESOURCE_NOT_FOUND");
  }

  const managed = Boolean(sub.providerSubscriptionId) && ["active", "past_due"].includes(sub.status);
  if (managed) {
    await requestCancellation(sub);
  }
  sub.cancelAtPeriodEnd = true;
  await sub.save();

  await audit({
    req,
    organization: isCandidate ? null : subscriber.subscriberId,
    action: "subscription.cancel",
    resourceType: "subscription",
    resourceId: sub._id,
    metadata: { providerCancelled: managed },
  });

  res.json({
    data: sub,
    message: managed
      ? "Your subscription is cancelled. It will not renew after the current billing period."
      : "Subscription will not renew after current billing period.",
  });
});

/**
 * List Payment Transactions / Invoices for Candidate or Recruiter
 */
exports.getInvoices = asyncHandler(async (req, res) => {
  const subscriber = await resolveBillingSubscriber(req, { permission: ORGANIZATION_PERMISSION });
  const { subscriberType, subscriberId } = subscriber;

  const page = parse(req.query);
  // Same transaction records the admin Revenue & Plans page reads (domain/revenueRules.js). Sandbox captures are
  // shown but labelled mode "simulation" and eligibleForRevenue false, so they can never be mistaken for real payments.
  const base = { subscriberType, subscriberId, status: { $in: REVENUE_STATUSES } };
  const filter = applyCursor(base, page.after);

  const items = await PaymentTransaction.find(filter).sort({ _id: -1 }).limit(page.limit);

  res.json({
    data: items.map((txn) => ({
      ...publicTransaction(txn),
      refundStatus: refundStatusOf(txn),
      mode: revenueMode(txn),
      eligibleForRevenue: isRevenueEligible(txn),
    })),
    meta: meta(items, page.limit, await PaymentTransaction.countDocuments(base)),
  });
});

