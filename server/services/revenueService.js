// Admin revenue reporting over PaymentTransaction (Requirement 8). Used by the Revenue & Plans page and by
// the revenue analytics endpoint so both report the same numbers from the same records.
const { PaymentTransaction } = require("../models/PaymentTransaction");
const Organization = require("../models/Organization");
const User = require("../models/User");
const {
  REVENUE_MATCH,
  REVENUE_STATUSES,
  summarizeRevenueTotals,
  transactionRow,
} = require("../domain/revenueRules");

const inRange = (field, range) => ({ [field]: { $gte: range.start, $lt: range.end } });

// Test and live are split by stored mode. Legacy records without a mode are test charges.
const MODE_IS_LIVE = { $eq: ["$mode", "live"] };

// Gross captured (by created date) and refunds processed (by refund date), split by mode.
const totalsPipeline = (range) => [
  {
    $facet: {
      captured: [
        { $match: { ...REVENUE_MATCH, ...inRange("createdAt", range) } },
        {
          $group: {
            _id: { $cond: [MODE_IS_LIVE, "live", "test"] },
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ],
      refunds: [
        {
          $match: {
            ...REVENUE_MATCH,
            status: "refunded",
            refundedAt: { $gte: range.start, $lt: range.end },
          },
        },
        {
          $group: {
            _id: { $cond: [MODE_IS_LIVE, "live", "test"] },
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ],
      attempts: [
        { $match: { gateway: "razorpay", status: { $in: ["failed", "initiated", "cancelled"] }, ...inRange("createdAt", range) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ],
    },
  },
];

const sumModes = (rows, mode, field) => (rows.find((r) => r._id === mode) || {})[field] || 0;

/** Summary for a range: gross, refunds, net and counts, total and per mode. */
async function revenueSummary(range) {
  const [facet] = await PaymentTransaction.aggregate(totalsPipeline(range));
  const captured = facet?.captured || [];
  const refunds = facet?.refunds || [];
  const attempts = facet?.attempts || [];

  const byMode = (mode) =>
    summarizeRevenueTotals({
      grossAmount: sumModes(captured, mode, "amount"),
      refundAmount: sumModes(refunds, mode, "amount"),
      count: sumModes(captured, mode, "count"),
      refundCount: sumModes(refunds, mode, "count"),
    });

  const total = summarizeRevenueTotals({
    grossAmount: captured.reduce((a, r) => a + r.amount, 0),
    refundAmount: refunds.reduce((a, r) => a + r.amount, 0),
    count: captured.reduce((a, r) => a + r.count, 0),
    refundCount: refunds.reduce((a, r) => a + r.count, 0),
  });

  return {
    total,
    test: byMode("test"),
    live: byMode("live"),
    failedPayments: attempts.find((a) => a._id === "failed")?.count || 0,
    pendingAttempts: attempts.find((a) => a._id === "initiated")?.count || 0,
    rule:
      "Net = captured Razorpay payments created in range minus refunds processed in range. Failed, pending and sandbox records are excluded.",
  };
}

const parsePage = (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Paged transaction list for the Revenue & Plans table. Sandbox (simulation) records are never listed here.
 * Filters: mode (test|live|all), status (captured|refunded|failed|initiated|cancelled|all),
 * refund (refunded|none|all), q (transaction, payment, order or subscription id; plan tier).
 */
async function listRevenueTransactions({ range, filters = {}, pageQuery = {} }) {
  const { page, limit, skip } = parsePage(pageQuery);
  const match = { gateway: "razorpay", ...inRange("createdAt", range) };

  // Conditions on status are combined with $and so the status and refund filters never overwrite each other.
  const and = [];
  if (filters.status && filters.status !== "all") {
    const allowed = ["captured", "refunded", "failed", "initiated", "cancelled"];
    if (!allowed.includes(filters.status)) throw new Error("INVALID_STATUS");
    and.push({ status: filters.status });
  }
  if (filters.refund === "refunded") and.push({ status: "refunded" });
  if (filters.refund === "none") and.push({ status: { $ne: "refunded" } });
  if (and.length) match.$and = and;
  if (filters.mode === "live") match.mode = "live";
  if (filters.mode === "test") match.mode = { $ne: "live" };
  if (filters.q) {
    const rx = new RegExp(escapeRegex(filters.q.trim().slice(0, 100)), "i");
    match.$or = [
      { transactionNumber: rx },
      { gatewayPaymentId: rx },
      { gatewayOrderId: rx },
      { planTier: rx },
      { providerSubscriptionId: rx },
    ];
  }

  const [rows, total] = await Promise.all([
    PaymentTransaction.find(match).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    PaymentTransaction.countDocuments(match),
  ]);

  // Names for the subscriber column. Candidate subscribers are users; organization subscribers are companies.
  const orgIds = rows.filter((r) => r.subscriberType === "organization").map((r) => r.subscriberId);
  const userIds = rows.filter((r) => r.subscriberType === "candidate").map((r) => r.subscriberId);
  const [orgs, users] = await Promise.all([
    orgIds.length ? Organization.find({ _id: { $in: orgIds } }).select("name").lean() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select("name email").lean() : [],
  ]);
  const orgName = new Map(orgs.map((o) => [String(o._id), o.name]));
  const userName = new Map(users.map((u) => [String(u._id), u.name || u.email]));

  const data = rows.map((r) => {
    const sid = String(r.subscriberId);
    return transactionRow(r, {
      organizationName: r.subscriberType === "organization" ? orgName.get(sid) || "" : "",
      subscriberName: r.subscriberType === "organization" ? orgName.get(sid) || "" : userName.get(sid) || "",
    });
  });

  return {
    data,
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

module.exports = { revenueSummary, listRevenueTransactions, parsePage, REVENUE_STATUSES };
