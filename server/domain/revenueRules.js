// Revenue rules shared by every admin revenue view and by the user billing history (Requirement 8).
// Pure functions and one aggregation match. No database access here, so the rules are unit-tested directly.
//
// Eligible revenue = a real provider-captured payment:
//   - status captured or refunded (a refunded payment was captured first),
//   - gateway razorpay (simulation/sandbox records are fabricated and are never revenue),
//   - not a complimentary or demo grant (grants have no payment record; they are excluded by construction).
// Net revenue = eligible gross created in the range − refunds processed in the range (refundedAt).
// Failed, initiated and cancelled attempts are listed for support but never counted as revenue.

const REVENUE_STATUSES = Object.freeze(["captured", "refunded"]);
const ATTEMPT_STATUSES = Object.freeze(["initiated", "captured", "failed", "cancelled", "refunded"]);
const REVENUE_GATEWAYS = Object.freeze(["razorpay"]);

// Mongo match used by every revenue aggregation. Keep this the single definition.
const REVENUE_MATCH = Object.freeze({
  status: { $in: REVENUE_STATUSES },
  gateway: { $in: REVENUE_GATEWAYS },
});

// Refunds processed in a range (Requirement 8). A refund belongs to the day it was processed (refundedAt).
// Legacy refunded rows without refundedAt fall back to updatedAt. Shared by the admin overview and the revenue report
// so both subtract the same refunds.
const refundsInRange = (range) => ({
  status: "refunded",
  gateway: { $in: REVENUE_GATEWAYS },
  $or: [
    { refundedAt: { $gte: range.start, $lt: range.end } },
    { refundedAt: null, updatedAt: { $gte: range.start, $lt: range.end } },
  ],
});

// Mode of a record. Legacy records without a stored mode are razorpay test charges (live is refused).
const revenueMode = (txn) => {
  if (!txn || txn.gateway !== "razorpay") return "simulation";
  return txn.mode === "live" ? "live" : "test";
};

const isRevenueEligible = (txn) =>
  Boolean(txn) && REVENUE_STATUSES.includes(txn.status) && REVENUE_GATEWAYS.includes(txn.gateway);

// Refund status shown in the admin and billing tables.
const refundStatusOf = (txn) => (txn && txn.status === "refunded" ? "refunded" : "none");

// Payment verification: a captured payment is verified only when the provider payment id is stored.
// Sandbox records can never be verified as real payments.
const paymentVerificationOf = (txn) => {
  if (!txn) return "not_applicable";
  if (txn.gateway !== "razorpay") return "sandbox_excluded";
  if (!REVENUE_STATUSES.includes(txn.status)) return "not_captured";
  return txn.gatewayPaymentId ? "verified" : "unverified";
};

// Round to paise-level precision (two decimals). Amounts are INR rupees in storage.
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Summarise already-aggregated totals. Refunds are subtracted once; gross is never reduced.
const summarizeRevenueTotals = ({ grossAmount = 0, refundAmount = 0, count = 0, refundCount = 0 } = {}) => ({
  grossCaptured: round2(grossAmount),
  refunds: round2(refundAmount),
  netRevenue: round2(grossAmount - refundAmount),
  successfulPayments: count,
  refundedPayments: refundCount,
});

// One object per transaction for list views. Contains no gateway secrets and no signature.
const transactionRow = (txn, { organizationName = "", subscriberName = "" } = {}) => ({
  id: String(txn._id),
  transactionNumber: txn.transactionNumber,
  subscriberType: txn.subscriberType,
  subscriberName,
  organizationName,
  planTier: txn.planTier,
  amount: round2(txn.amount),
  currency: txn.currency || "INR",
  createdAt: txn.createdAt,
  refundedAt: txn.refundedAt || null,
  status: txn.status,
  refundStatus: refundStatusOf(txn),
  mode: revenueMode(txn),
  gatewayPaymentId: txn.gatewayPaymentId || "",
  gatewayOrderId: txn.gatewayOrderId || "",
  subscriptionId: txn.subscription ? String(txn.subscription) : "",
  verification: paymentVerificationOf(txn),
  eligibleForRevenue: isRevenueEligible(txn),
});

module.exports = {
  REVENUE_STATUSES,
  ATTEMPT_STATUSES,
  REVENUE_GATEWAYS,
  REVENUE_MATCH,
  refundsInRange,
  revenueMode,
  isRevenueEligible,
  refundStatusOf,
  paymentVerificationOf,
  summarizeRevenueTotals,
  transactionRow,
};
