const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { ALL_PLANS, CANDIDATE_PLANS, RECRUITER_PLANS } = require("../config/subscriptionPlans");
const {
  createOrder,
  verifyPaymentSignature,
  generateInvoiceNumber,
  generateSimulationPaymentId,
  generateSimulationSignature,
} = require("../services/paymentService");
const {
  getOrCreateCandidateSubscription,
  getOrCreateOrgSubscription,
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
  res.json({
    data: {
      subscription: sub,
      plan: planDetails,
    },
  });
});

/**
 * Initiate Checkout Order. The price always comes from the server-side plan definition.
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

/**
 * Verify Payment & Activate Plan
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
    // Replays of a captured order, or orders already failed/refunded, never change state.
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
    await PaymentTransaction.updateOne(
      { _id: txn._id, status: "initiated" },
      { $set: { status: "failed" } },
    );
    await audit({
      req,
      organization: txn.subscriberType === "organization" ? txn.subscriberId : null,
      action: "subscription.payment_verification_failed",
      resourceType: "payment_transaction",
      resourceId: txn._id,
      metadata: { planTier: txn.planTier },
    });
    throw new AppError(
      "Payment verification failed. Invalid transaction signature.",
      400,
      "PAYMENT_VERIFICATION_FAILED",
    );
  }

  // Atomically claim the order. Only one concurrent request can move initiated -> captured.
  let claimed;
  try {
    claimed = await PaymentTransaction.findOneAndUpdate(
      { _id: txn._id, status: "initiated" },
      { $set: { status: "captured", gatewayPaymentId: String(paymentId), gatewaySignature: String(signature) } },
      { new: true },
    );
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError("Payment has already been processed", 409, "PAYMENT_ALREADY_PROCESSED");
    }
    throw error;
  }
  if (!claimed) {
    throw new AppError("Payment has already been processed", 409, "PAYMENT_ALREADY_PROCESSED");
  }

  let sub;
  try {
    sub = await activatePlan(claimed, plan);
  } catch (error) {
    // Roll the claim back so the order is not left captured without an active plan.
    await PaymentTransaction.updateOne(
      { _id: claimed._id, status: "captured" },
      { $set: { status: "initiated", gatewayPaymentId: "", gatewaySignature: "" } },
    );
    throw error;
  }

  await PaymentTransaction.updateOne({ _id: claimed._id }, { $set: { subscription: sub._id } });
  const finalTxn = await PaymentTransaction.findById(claimed._id);

  await audit({
    req,
    organization: txn.subscriberType === "organization" ? txn.subscriberId : null,
    action: "subscription.upgrade",
    resourceType: "subscription",
    resourceId: sub._id,
    metadata: { planTier: txn.planTier, amount: txn.amount, invoiceNumber: txn.invoiceNumber },
  });

  res.json({
    data: {
      subscription: sub,
      transaction: publicTransaction(finalTxn),
      plan,
      message: `Successfully upgraded to ${plan.name} plan!`,
    },
  });
});

/**
 * Cancel subscription renewal
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

  sub.cancelAtPeriodEnd = true;
  await sub.save();

  await audit({
    req,
    organization: isCandidate ? null : subscriber.subscriberId,
    action: "subscription.cancel",
    resourceType: "subscription",
    resourceId: sub._id,
  });

  res.json({ data: sub, message: "Subscription will not renew after current billing period." });
});

/**
 * List Payment Transactions / Invoices for Candidate or Recruiter
 */
exports.getInvoices = asyncHandler(async (req, res) => {
  const subscriber = await resolveBillingSubscriber(req, { permission: ORGANIZATION_PERMISSION });
  const { subscriberType, subscriberId } = subscriber;

  const page = parse(req.query);
  const filter = applyCursor({ subscriberType, subscriberId, status: "captured" }, page.after);

  const items = await PaymentTransaction.find(filter).sort({ _id: -1 }).limit(page.limit);

  res.json({
    data: items.map(publicTransaction),
    meta: meta(
      items,
      page.limit,
      await PaymentTransaction.countDocuments({ subscriberType, subscriberId, status: "captured" }),
    ),
  });
});

/**
 * Platform Admin: Revenue, MRR, Profit & Billing Analytics
 */
exports.adminRevenueAnalytics = asyncHandler(async (req, res) => {
  if (req.auth.platformRole !== "platform_admin") {
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }

  const [
    capturedTxns,
    activePaidSubs,
    failedTxnsCount,
    monthlyRevenueAgg,
    planDistAgg,
    recentTransactions,
  ] = await Promise.all([
    PaymentTransaction.aggregate([
      { $match: { status: "captured" } },
      { $group: { _id: null, totalGross: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Subscription.find({ status: "active", priceInr: { $gt: 0 } }),
    PaymentTransaction.countDocuments({ status: "failed" }),
    PaymentTransaction.aggregate([
      { $match: { status: "captured" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          revenue: { $sum: "$amount" },
          transactionsCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Subscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$planTier", count: { $sum: 1 }, revenue: { $sum: "$priceInr" } } },
      { $sort: { count: -1 } },
    ]),
    PaymentTransaction.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const totalGross = capturedTxns[0]?.totalGross || 0;
  const totalCapturedCount = capturedTxns[0]?.count || 0;

  // Monthly Recurring Revenue (sum of active monthly fees)
  const mrr = activePaidSubs.reduce((acc, sub) => acc + (sub.priceInr || 0), 0);

  // Active Paid Candidate vs Recruiter breakdown
  const activePaidCandidates = activePaidSubs.filter((s) => s.subscriberType === "candidate").length;
  const activePaidRecruiters = activePaidSubs.filter((s) => s.subscriberType === "organization").length;

  // Estimated Net Profit (Gross - 2% Payment Gateway Fee - ₹1500 Hosting estimation)
  const gatewayFees = totalGross * 0.02;
  const hostingEstimate = Math.min(totalGross * 0.05, 3000);
  const estimatedNetProfit = Math.max(0, totalGross - gatewayFees - hostingEstimate);

  res.json({
    data: {
      metrics: {
        totalGrossRevenue: totalGross,
        monthlyRecurringRevenue: mrr,
        estimatedNetProfit: Math.round(estimatedNetProfit),
        totalCapturedTransactions: totalCapturedCount,
        failedPaymentsCount: failedTxnsCount,
        activePaidSubscribers: activePaidSubs.length,
        activePaidCandidates,
        activePaidRecruiters,
        gatewayFeeRate: "2.0%",
      },
      monthlyTrends: monthlyRevenueAgg.map((m) => ({
        yearMonth: m._id,
        revenue: m.revenue,
        transactions: m.transactionsCount,
      })),
      planDistribution: planDistAgg.map((p) => ({
        tier: p._id,
        name: ALL_PLANS[p._id]?.name || p._id,
        role: ALL_PLANS[p._id]?.role || "other",
        count: p.count,
        revenue: p.revenue,
      })),
      recentTransactions,
    },
  });
});
