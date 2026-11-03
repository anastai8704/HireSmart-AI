const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { ALL_PLANS, CANDIDATE_PLANS, RECRUITER_PLANS } = require("../config/subscriptionPlans");
const {
  createOrder,
  verifyPaymentSignature,
  generateInvoiceNumber,
  generateSimulationSignature,
} = require("../services/paymentService");
const {
  getOrCreateCandidateSubscription,
  getOrCreateOrgSubscription,
} = require("../middleware/subscriptionCheck");
const Job = require("../models/Job");
const { Membership } = require("../models/Membership");
const { audit } = require("../services/auditService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const crypto = require("node:crypto");
const { parse, applyCursor, meta } = require("../utils/pagination");

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
  let sub;
  if (req.user.role === "candidate") {
    sub = await getOrCreateCandidateSubscription(req.user._id);
  } else if (req.auth?.organizationId) {
    sub = await getOrCreateOrgSubscription(req.auth.organizationId);
    // Refresh live usage numbers
    const activeJobs = await Job.countDocuments({
      organization: req.auth.organizationId,
      status: "published",
    });
    const teamMembers = await Membership.countDocuments({
      organization: req.auth.organizationId,
      status: "active",
    });
    sub.usage.activeJobsCount = activeJobs;
    sub.usage.teamMembersCount = teamMembers;
    await sub.save();
  } else {
    throw new AppError("No active subscription context found", 400, "BAD_REQUEST");
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
 * Initiate Checkout Order
 */
exports.checkout = asyncHandler(async (req, res) => {
  const { planTier, billingCycle = "monthly" } = req.body;
  const targetPlan = ALL_PLANS[planTier];
  if (!targetPlan) {
    throw new AppError("Invalid subscription plan tier", 400, "INVALID_PLAN");
  }

  const isCandidate = targetPlan.role === "candidate";
  const subscriberType = isCandidate ? "candidate" : "organization";
  const subscriberId = isCandidate ? req.user._id : req.auth.organizationId;

  if (!subscriberId) {
    throw new AppError("Organization or user context is required for checkout", 400, "BAD_REQUEST");
  }

  const amount = targetPlan.priceInr;
  const order = await createOrder({
    amount,
    currency: "INR",
    receipt: `order_${subscriberType}_${Date.now()}`,
    notes: {
      planTier,
      subscriberType,
      subscriberId: String(subscriberId),
    },
  });

  // Create initial transaction record
  const transactionNumber = `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const transaction = await PaymentTransaction.create({
    transactionNumber,
    subscriberType,
    subscriberId,
    planTier,
    amount,
    currency: "INR",
    status: "initiated",
    gateway: order.mode === "live" ? "razorpay" : "simulation",
    gatewayOrderId: order.orderId,
    invoiceNumber: generateInvoiceNumber(),
    metadata: {
      planName: targetPlan.name,
      billingCycle,
    },
  });

  res.json({
    data: {
      order,
      transaction,
      plan: targetPlan,
      // Provide simulation payload helper if in simulation mode for zero-friction UI testing
      simulationHelper:
        order.mode === "simulation"
          ? {
              orderId: order.orderId,
              paymentId: `pay_sim_${crypto.randomBytes(6).toString("hex")}`,
              signature: generateSimulationSignature(order.orderId, `pay_sim_preview`),
            }
          : null,
    },
  });
});

/**
 * Verify Payment & Activate Plan
 */
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { orderId, paymentId, signature, planTier } = req.body;
  const targetPlan = ALL_PLANS[planTier];
  if (!targetPlan) {
    throw new AppError("Invalid subscription plan tier", 400, "INVALID_PLAN");
  }

  const isCandidate = targetPlan.role === "candidate";
  const subscriberType = isCandidate ? "candidate" : "organization";
  const subscriberId = isCandidate ? req.user._id : req.auth.organizationId;

  if (!subscriberId) {
    throw new AppError("Subscription subscriber context not found", 400, "BAD_REQUEST");
  }

  const isValid = verifyPaymentSignature({ orderId, paymentId, signature });
  if (!isValid) {
    // Record failed transaction
    await PaymentTransaction.findOneAndUpdate(
      { gatewayOrderId: orderId },
      { status: "failed", gatewayPaymentId: paymentId, gatewaySignature: signature },
    );
    throw new AppError("Payment verification failed. Invalid transaction signature.", 400, "PAYMENT_VERIFICATION_FAILED");
  }

  // Update or create active subscription
  let sub = await Subscription.findOne({ subscriberType, subscriberId });
  const periodStart = new Date();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  if (!sub) {
    sub = await Subscription.create({
      subscriberType,
      subscriberId,
      planTier,
      status: "active",
      priceInr: targetPlan.priceInr,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      limits: targetPlan.limits,
      usage: {
        activeJobsCount: 0,
        teamMembersCount: 1,
        aiAnalysesUsedThisMonth: 0,
      },
    });
  } else {
    sub.planTier = planTier;
    sub.status = "active";
    sub.priceInr = targetPlan.priceInr;
    sub.currentPeriodStart = periodStart;
    sub.currentPeriodEnd = periodEnd;
    sub.limits = targetPlan.limits;
    sub.cancelAtPeriodEnd = false;
    await sub.save();
  }

  const invoiceNumber = generateInvoiceNumber();

  // Update transaction to captured
  let txn = await PaymentTransaction.findOne({ gatewayOrderId: orderId });
  if (txn) {
    txn.status = "captured";
    txn.gatewayPaymentId = paymentId;
    txn.gatewaySignature = signature;
    txn.subscription = sub._id;
    if (!txn.invoiceNumber) txn.invoiceNumber = invoiceNumber;
    await txn.save();
  } else {
    txn = await PaymentTransaction.create({
      transactionNumber: `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      subscriberType,
      subscriberId,
      subscription: sub._id,
      planTier,
      amount: targetPlan.priceInr,
      currency: "INR",
      status: "captured",
      gateway: orderId.startsWith("order_sim_") ? "simulation" : "razorpay",
      gatewayOrderId: orderId,
      gatewayPaymentId: paymentId,
      gatewaySignature: signature,
      invoiceNumber,
    });
  }

  await audit({
    req,
    organization: isCandidate ? null : subscriberId,
    action: "subscription.upgrade",
    resourceType: "subscription",
    resourceId: sub._id,
    metadata: { planTier, amount: targetPlan.priceInr, invoiceNumber },
  });

  res.json({
    data: {
      subscription: sub,
      transaction: txn,
      plan: targetPlan,
      message: `Successfully upgraded to ${targetPlan.name} plan!`,
    },
  });
});

/**
 * Cancel subscription renewal
 */
exports.cancelSubscription = asyncHandler(async (req, res) => {
  const isCandidate = req.user.role === "candidate";
  const subscriberType = isCandidate ? "candidate" : "organization";
  const subscriberId = isCandidate ? req.user._id : req.auth.organizationId;

  const sub = await Subscription.findOne({ subscriberType, subscriberId });
  if (!sub) {
    throw new AppError("No active subscription found", 404, "RESOURCE_NOT_FOUND");
  }

  sub.cancelAtPeriodEnd = true;
  await sub.save();

  await audit({
    req,
    organization: isCandidate ? null : subscriberId,
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
  const isCandidate = req.user.role === "candidate";
  const subscriberType = isCandidate ? "candidate" : "organization";
  const subscriberId = isCandidate ? req.user._id : req.auth?.organizationId;

  const page = parse(req.query);
  const filter = applyCursor({ subscriberType, subscriberId, status: "captured" }, page.after);

  const items = await PaymentTransaction.find(filter).sort({ _id: -1 }).limit(page.limit);

  res.json({
    data: items,
    meta: meta(items, page.limit, await PaymentTransaction.countDocuments({ subscriberType, subscriberId, status: "captured" })),
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
