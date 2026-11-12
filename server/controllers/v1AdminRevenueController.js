// Admin Revenue & Plans (Requirement 8). One source of truth: services/revenueService.js over PaymentTransaction.
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { Subscription } = require("../models/Subscription");
const { ALL_PLANS } = require("../config/subscriptionPlans");
const { REVENUE_MATCH } = require("../domain/revenueRules");
const { resolveRange, AnalyticsRangeError } = require("../domain/analyticsDefinitions");
const { revenueSummary, listRevenueTransactions } = require("../services/revenueService");
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

