// Admin Revenue & Plans (Requirement 8). One source of truth: services/revenueService.js over PaymentTransaction.
const mongoose = require("mongoose");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { Subscription } = require("../models/Subscription");
const Organization = require("../models/Organization");
const User = require("../models/User");
const { ALL_PLANS } = require("../config/subscriptionPlans");
const { REVENUE_MATCH } = require("../domain/revenueRules");
const { resolveRange, AnalyticsRangeError } = require("../domain/analyticsDefinitions");
const { revenueSummary, listRevenueTransactions } = require("../services/revenueService");
const { toCsv } = require("../services/reportService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");

const requireAdmin = (req) => {
  if (req.auth.platformRole !== "platform_admin") throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
};

const parseRange = (query) => {
  try {
    return resolveRange({ range: query.range || "30d", from: query.from, to: query.to });
  } catch (error) {
    if (error instanceof AnalyticsRangeError) throw new AppError(error.message, 400, error.code);
    throw error;
  }
};

const ALL_TIME = () => ({ start: new Date(0), end: new Date(Date.now() + 24 * 60 * 60 * 1000) });

/** GET /admin/revenue — summary for the selected range plus one page of eligible payment records. */
exports.adminRevenuePage = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const range = parseRange(req.query);
  const filters = {
    mode: req.query.mode,
    status: req.query.status,
    refund: req.query.refund,
    q: req.query.q,
  };
  const allowedMode = [undefined, "", "all", "test", "live"];
  if (!allowedMode.includes(filters.mode)) throw new AppError("mode must be all, test or live", 400, "INVALID_FILTER");
  const allowedRefund = [undefined, "", "all", "refunded", "none"];
  if (!allowedRefund.includes(filters.refund)) throw new AppError("refund must be all, refunded or none", 400, "INVALID_FILTER");
  const allowedStatus = [undefined, "", "all", "captured", "refunded", "failed", "initiated", "cancelled"];
  if (!allowedStatus.includes(filters.status)) throw new AppError("Unknown status filter", 400, "INVALID_FILTER");

  const [summary, list] = await Promise.all([
    revenueSummary(range),
    listRevenueTransactions({ range, filters, pageQuery: req.query }),
  ]);

  res.json({
    data: {
      range: { preset: range.preset, fromDay: range.fromDay, toDay: range.toDay, timezone: range.timezone },
      summary,
      transactions: list.data,
    },
    meta: list.meta,
  });
});

/** GET /admin/analytics/revenue — all-time revenue metrics and plan breakdown, from the same records. */
exports.adminRevenueAnalytics = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const all = ALL_TIME();
  const [summary, monthly, activePaidSubs, planDist, recentList] = await Promise.all([
    revenueSummary(all),
    PaymentTransaction.aggregate([
      { $match: { ...REVENUE_MATCH, status: "captured" } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, revenue: { $sum: "$amount" }, transactionsCount: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Subscription.find({ status: "active", priceInr: { $gt: 0 }, isDemo: { $ne: true } }).lean(),
    Subscription.aggregate([
      { $match: { status: "active", priceInr: { $gt: 0 }, isDemo: { $ne: true } } },
      { $group: { _id: "$planTier", count: { $sum: 1 }, revenue: { $sum: "$priceInr" } } },
      { $sort: { count: -1 } },
    ]),
    listRevenueTransactions({ range: all, filters: {}, pageQuery: { limit: 20 } }),
  ]);

  const activePaidCandidates = activePaidSubs.filter((s) => s.subscriberType === "candidate").length;
  const activePaidOrganizations = activePaidSubs.filter((s) => s.subscriberType === "organization").length;

  res.json({
    data: {
      metrics: {
        totalGrossRevenue: summary.total.grossCaptured,
        monthlyRecurringRevenue: activePaidSubs.reduce((acc, s) => acc + (s.priceInr || 0), 0),
        totalRefunds: summary.total.refunds,
        netRevenue: summary.total.netRevenue,
        testNetRevenue: summary.test.netRevenue,
        liveNetRevenue: summary.live.netRevenue,
        totalCapturedTransactions: summary.total.successfulPayments,
        failedPaymentsCount: summary.failedPayments,
        activePaidSubscribers: activePaidSubs.length,
        activePaidCandidates,
        activePaidRecruiters: activePaidOrganizations,
      },
      monthlyTrends: monthly.map((m) => ({ yearMonth: m._id, revenue: m.revenue, transactions: m.transactionsCount })),
      planDistribution: planDist.map((p) => ({
        tier: p._id,
        name: ALL_PLANS[p._id]?.name || p._id,
        role: ALL_PLANS[p._id]?.role || "other",
        count: p.count,
        revenue: p.revenue,
      })),
      recentTransactions: recentList.data,
      rule: summary.rule,
    },
  });
});

/** GET /admin/revenue/transactions/:transactionId — inspection of single payment transaction without secrets. */
exports.adminGetTransactionDetails = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const { transactionId } = req.params;

  let txn = null;
  if (mongoose.isValidObjectId(transactionId)) {
    txn = await PaymentTransaction.findById(transactionId).lean();
  }
  if (!txn) {
    txn = await PaymentTransaction.findOne({
      $or: [
        { transactionNumber: transactionId },
        { gatewayPaymentId: transactionId },
        { gatewayOrderId: transactionId },
      ],
    }).lean();
  }
  if (!txn) {
    throw new AppError("Transaction not found", 404, "TRANSACTION_NOT_FOUND");
  }

  let subscriber = null;
  if (txn.subscriberType === "organization") {
    const org = await Organization.findById(txn.subscriberId).select("name email slug verificationStatus createdAt").lean();
    if (org) {
      subscriber = {
        id: String(org._id),
        name: org.name,
        email: org.email || "",
        slug: org.slug || "",
        type: "organization",
        verificationStatus: org.verificationStatus,
      };
    }
  } else if (txn.subscriberType === "candidate") {
    const usr = await User.findById(txn.subscriberId).select("name email role createdAt").lean();
    if (usr) {
      subscriber = {
        id: String(usr._id),
        name: usr.name,
        email: usr.email || "",
        type: "candidate",
        role: usr.role,
      };
    }
  }

  res.json({
    data: {
      id: String(txn._id),
      transactionNumber: txn.transactionNumber,
      invoiceNumber: txn.invoiceNumber || "",
      subscriberType: txn.subscriberType,
      subscriberId: txn.subscriberId,
      subscriber,
      planTier: txn.planTier,
      planName: ALL_PLANS[txn.planTier]?.name || txn.planTier,
      amount: txn.amount,
      currency: txn.currency || "INR",
      status: txn.status,
      gateway: txn.gateway,
      gatewayOrderId: txn.gatewayOrderId || "",
      gatewayPaymentId: txn.gatewayPaymentId || "",
      mode: txn.mode || "simulation",
      refundedAt: txn.refundedAt,
      providerSubscriptionId: txn.providerSubscriptionId || "",
      metadata: txn.metadata || {},
      createdAt: txn.createdAt,
      updatedAt: txn.updatedAt,
    },
  });
});

/** GET /admin/revenue/export — CSV export matching currently filtered range and criteria. */
exports.adminExportRevenueCsv = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const range = parseRange(req.query);
  const filters = {
    mode: req.query.mode,
    status: req.query.status,
    refund: req.query.refund,
    q: req.query.q,
  };

  const list = await listRevenueTransactions({ range, filters, pageQuery: { page: 1, limit: 5000 } });

  const columns = [
    { key: "transactionNumber", label: "Transaction Number" },
    { key: "invoiceNumber", label: "Invoice Number" },
    { key: "subscriberName", label: "Subscriber Name" },
    { key: "subscriberType", label: "Subscriber Type" },
    { key: "planTier", label: "Plan Tier" },
    { key: "amount", label: "Amount (INR)" },
    { key: "currency", label: "Currency" },
    { key: "status", label: "Payment Status" },
    { key: "refundStatus", label: "Refund Status" },
    { key: "mode", label: "Mode" },
    { key: "verification", label: "Verification" },
    { key: "gatewayPaymentId", label: "Gateway Payment ID" },
    { key: "gatewayOrderId", label: "Gateway Order ID" },
    { key: "subscriptionId", label: "Subscription ID" },
    { key: "createdAt", label: "Created At (IST)" },
  ];

  const rows = list.data.map((r) => ({
    transactionNumber: r.transactionNumber || "",
    invoiceNumber: r.invoiceNumber || "",
    subscriberName: r.subscriberName || r.organizationName || "",
    subscriberType: r.subscriberType || "",
    planTier: r.planTier || "",
    amount: r.amount || 0,
    currency: r.currency || "INR",
    status: r.status || "",
    refundStatus: r.refundStatus || "none",
    mode: r.mode || "simulation",
    verification: r.verification || "",
    gatewayPaymentId: r.gatewayPaymentId || "",
    gatewayOrderId: r.gatewayOrderId || "",
    subscriptionId: r.subscriptionId || "",
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
  }));

  const csv = toCsv(columns, rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="revenue-export-${range.preset || "transactions"}.csv"`);
  res.send(csv);
});

