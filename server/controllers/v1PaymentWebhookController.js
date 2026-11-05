const crypto = require("node:crypto");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { Subscription } = require("../models/Subscription");
const { PaymentWebhookEvent } = require("../models/PaymentWebhookEvent");
const { ALL_PLANS } = require("../config/subscriptionPlans");
const { isRazorpayEnabled, verifyRazorpayWebhookSignature } = require("../services/paymentService");
const { amountMatches, failTransaction, captureTransaction } = require("../services/paymentProcessingService");
const { audit } = require("../services/auditService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");

/**
 * Razorpay webhook receiver (Phase 7).
 *
 * - The signature is checked against the exact raw body bytes (X-Razorpay-Signature).
 * - Each delivery is recorded once by X-Razorpay-Event-Id. A redelivery of a processed event returns
 *   200 without changing state. A delivery that fails is forgotten so the provider's retry is processed.
 * - Amounts and currencies are compared with the stored order. A mismatch changes no state.
 * - Refunds: only a full refund revokes the plan it paid for. A partial refund is recorded for review.
 *   Revocation sets the subscription to expired. It never deletes jobs or other records.
 */

const orgOf = (txn) => (txn.subscriberType === "organization" ? txn.subscriberId : null);

const handlePaymentCaptured = async (payment) => {
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: String(payment.order_id) });
  if (!txn || txn.gateway !== "razorpay") return { outcome: "unknown_order" };

  if (!amountMatches(payment, txn)) {
    await audit({
      organization: orgOf(txn),
      action: "subscription.webhook_amount_mismatch",
      resourceType: "payment_transaction",
      resourceId: txn._id,
      metadata: { providerPaymentId: payment.id, planTier: txn.planTier },
    });
    return { outcome: "amount_mismatch" };
  }
  if (txn.status === "captured") {
    return { outcome: txn.gatewayPaymentId === String(payment.id) ? "already_captured" : "needs_review" };
  }
  if (txn.status === "refunded") {
    return { outcome: "needs_review" };
  }

  const plan = ALL_PLANS[txn.planTier];
  if (!plan) return { outcome: "invalid_plan" };
  const result = await captureTransaction({
    txn,
    paymentId: payment.id,
    plan,
    source: "webhook",
    fromStatuses: ["initiated", "failed", "cancelled"],
  });
  return { outcome: result ? "activated" : "already_processed" };
};

const handlePaymentFailed = async (payment) => {
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: String(payment.order_id) });
  if (!txn || txn.gateway !== "razorpay") return { outcome: "unknown_order" };
  if (txn.status !== "initiated") return { outcome: "no_change" };
  await failTransaction(null, txn, "provider_failed_webhook");
  return { outcome: "failed" };
};

const handleRefundProcessed = async (refund) => {
  const txn = await PaymentTransaction.findOne({ gatewayPaymentId: String(refund.payment_id) });
  if (!txn || txn.gateway !== "razorpay") return { outcome: "unknown_payment" };
  if (txn.status === "refunded") return { outcome: "already_refunded" };
  if (txn.status !== "captured") return { outcome: "needs_review" };

  const fullAmountPaise = Math.round(Number(txn.amount) * 100);
  if (Number(refund.amount) < fullAmountPaise) {
    await audit({
      organization: orgOf(txn),
      action: "subscription.partial_refund_review",
      resourceType: "payment_transaction",
      resourceId: txn._id,
      metadata: { providerRefundId: refund.id, refundAmountPaise: refund.amount },
    });
    return { outcome: "partial_refund_review" };
  }

  // Claim the transition so a concurrent duplicate cannot revoke twice.
  const claim = await PaymentTransaction.updateOne(
    { _id: txn._id, status: "captured" },
    { $set: { status: "refunded", "metadata.refundId": String(refund.id) } },
  );
  if (claim.modifiedCount !== 1) return { outcome: "already_refunded" };

  if (txn.subscription) {
    const revoked = await Subscription.updateOne(
      { _id: txn.subscription, planTier: txn.planTier, status: { $in: ["active", "past_due"] } },
      { $set: { status: "expired", cancelAtPeriodEnd: false } },
    );
    if (revoked.modifiedCount === 1) {
      await audit({
        organization: orgOf(txn),
        action: "subscription.refund_revoked",
        resourceType: "subscription",
        resourceId: txn.subscription,
        metadata: { planTier: txn.planTier, providerRefundId: refund.id },
      });
    }
  }
  await audit({
    organization: orgOf(txn),
    action: "subscription.refunded",
    resourceType: "payment_transaction",
    resourceId: txn._id,
    metadata: { planTier: txn.planTier, providerRefundId: refund.id, amount: txn.amount },
  });
  return { outcome: "refunded" };
};

const dispatch = async (event) => {
  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;
  switch (event.event) {
    case "payment.captured":
      return payment ? handlePaymentCaptured(payment) : { outcome: "invalid_payload" };
    case "payment.failed":
      return payment ? handlePaymentFailed(payment) : { outcome: "invalid_payload" };
    case "refund.processed":
      return refund ? handleRefundProcessed(refund) : { outcome: "invalid_payload" };
    default:
      return { outcome: "ignored" };
  }
};

exports.razorpayWebhook = asyncHandler(async (req, res) => {
  if (!isRazorpayEnabled()) {
    throw new AppError("Payments are not configured on this server", 503, "PAYMENT_NOT_CONFIGURED");
  }
  const rawBody = req.rawBody;
  if (!verifyRazorpayWebhookSignature(rawBody, req.get("x-razorpay-signature"))) {
    throw new AppError("Invalid webhook signature", 400, "INVALID_WEBHOOK_SIGNATURE");
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError("Invalid webhook payload", 400, "INVALID_WEBHOOK_PAYLOAD");
  }

  const eventId =
    req.get("x-razorpay-event-id") || crypto.createHash("sha256").update(rawBody).digest("hex");
  const entity = event.payload?.payment?.entity || event.payload?.refund?.entity || {};

  try {
    await PaymentWebhookEvent.create({
      provider: "razorpay",
      eventId,
      eventType: String(event.event || ""),
      providerOrderId: String(entity.order_id || ""),
      providerPaymentId: String(entity.payment_id || entity.id || ""),
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await PaymentWebhookEvent.findOne({ eventId }).lean();
    if (existing?.status === "processed") {
      res.json({ data: { status: "duplicate", outcome: existing.outcome } });
      return;
    }
    // Still being processed by another delivery. A non-2xx makes the provider retry later.
    throw new AppError("Webhook is already being processed", 409, "WEBHOOK_IN_PROGRESS");
  }

  let result;
  try {
    result = await dispatch(event);
  } catch (error) {
    // Forget the delivery so the provider's retry is processed. The record is a processing lock,
    // not a financial record, so it is removed explicitly.
    await PaymentWebhookEvent.deleteOne({ eventId }).setOptions({ allowHardDelete: true });
    throw error;
  }

  await PaymentWebhookEvent.updateOne(
    { eventId },
    { $set: { status: "processed", outcome: result.outcome, processedAt: new Date() } },
  );
  res.json({ data: { status: "ok", outcome: result.outcome } });
});
