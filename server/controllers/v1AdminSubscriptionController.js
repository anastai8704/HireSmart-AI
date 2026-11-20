// Admin Subscriptions Governance (Phase 4F)
// Manages platform subscriptions across candidates and organizations with strict platform_admin authorization.
const mongoose = require("mongoose");
const { Subscription, planTiers, subscriptionStatuses } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const Organization = require("../models/Organization");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { ALL_PLANS } = require("../config/subscriptionPlans");
const { audit } = require("../services/auditService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");

const requireAdmin = (req) => {
  if (req.auth?.platformRole !== "platform_admin") {
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * GET /admin/subscriptions
 * Paged list of subscriptions with KPI counts, filters, search, and plan distribution.
 */
exports.listAdminSubscriptions = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const {
    q,
    status,
    planTier,
    subscriberType,
    sort = "newest",
    page = "1",
    limit = "20",
  } = req.query;

  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const match = {};

  if (status && status !== "all") {
    if (!subscriptionStatuses.includes(status)) {
      throw new AppError("Invalid status filter", 400, "INVALID_FILTER");
    }
    match.status = status;
  }

  if (planTier && planTier !== "all") {
    if (!planTiers.includes(planTier)) {
      throw new AppError("Invalid planTier filter", 400, "INVALID_FILTER");
    }
    match.planTier = planTier;
  }

  if (subscriberType && subscriberType !== "all") {
    if (!["candidate", "organization"].includes(subscriberType)) {
      throw new AppError("Invalid subscriberType filter", 400, "INVALID_FILTER");
    }
    match.subscriberType = subscriberType;
  }

  if (q && q.trim()) {
    const rawQ = q.trim();
    if (mongoose.isValidObjectId(rawQ)) {
      const objId = new mongoose.Types.ObjectId(rawQ);
      match.$or = [{ _id: objId }, { subscriberId: objId }];
    } else {
      const rx = new RegExp(escapeRegex(rawQ.slice(0, 100)), "i");
      const [matchedOrgs, matchedUsers] = await Promise.all([
        Organization.find({ name: rx }).select("_id").lean(),
        User.find({ $or: [{ name: rx }, { email: rx }] }).select("_id").lean(),
      ]);

      const subIds = [
        ...matchedOrgs.map((o) => o._id),
        ...matchedUsers.map((u) => u._id),
      ];

      const orConditions = [
        { planTier: rx },
        { providerSubscriptionId: rx },
      ];
      if (subIds.length > 0) {
        orConditions.push({ subscriberId: { $in: subIds } });
      }
      match.$or = orConditions;
    }
  }

  const sortMap = {
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    expiry: { currentPeriodEnd: 1 },
    price: { priceInr: -1 },
  };
  const sortCriteria = sortMap[sort] || sortMap.newest;

  const [
    total,
    activePaid,
    free,
    trial,
    pastDue,
    canceled,
    expired,
    planAgg,
    rows,
    filteredTotal,
  ] = await Promise.all([
    Subscription.countDocuments({}),
    Subscription.countDocuments({ status: "active", priceInr: { $gt: 0 }, isDemo: { $ne: true } }),
    Subscription.countDocuments({
      $or: [{ priceInr: 0 }, { planTier: { $in: ["candidate_free", "recruiter_free"] } }],
    }),
    Subscription.countDocuments({ isDemo: true }),
    Subscription.countDocuments({ status: "past_due" }),
    Subscription.countDocuments({ status: "canceled" }),
    Subscription.countDocuments({ status: "expired" }),
    Subscription.aggregate([
      {
        $group: {
          _id: "$planTier",
          count: { $sum: 1 },
          activeCount: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          revenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$status", "active"] }, { $gt: ["$priceInr", 0] }] },
                "$priceInr",
                0,
              ],
            },
          },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Subscription.find(match).sort(sortCriteria).skip(skip).limit(limitNum).lean(),
    Subscription.countDocuments(match),
  ]);

  const orgIds = rows.filter((r) => r.subscriberType === "organization").map((r) => r.subscriberId);
  const userIds = rows.filter((r) => r.subscriberType === "candidate").map((r) => r.subscriberId);

  const [orgs, users] = await Promise.all([
    orgIds.length ? Organization.find({ _id: { $in: orgIds } }).select("name email slug verificationStatus").lean() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select("name email role").lean() : [],
  ]);

  const orgMap = new Map(orgs.map((o) => [String(o._id), o]));
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const mappedRows = rows.map((sub) => {
    const sid = String(sub.subscriberId);
    let subscriber = null;
    if (sub.subscriberType === "organization") {
      const org = orgMap.get(sid);
      subscriber = {
        id: sid,
        name: org?.name || "Organization",
        email: org?.email || "",
        slug: org?.slug || "",
        type: "organization",
        verificationStatus: org?.verificationStatus || "unverified",
      };
    } else {
      const usr = userMap.get(sid);
      subscriber = {
        id: sid,
        name: usr?.name || "Candidate",
        email: usr?.email || "",
        type: "candidate",
        role: usr?.role || "candidate",
      };
    }

    return {
      id: String(sub._id),
      subscriberType: sub.subscriberType,
      subscriberId: sub.subscriberId,
      subscriber,
      planTier: sub.planTier,
      planName: ALL_PLANS[sub.planTier]?.name || sub.planTier,
      status: sub.status,
      billingCycle: sub.billingCycle,
      priceInr: sub.priceInr,
      source: sub.source,
      isDemo: Boolean(sub.isDemo),
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
      providerSubscriptionId: sub.providerSubscriptionId || "",
      providerStatus: sub.providerStatus || "",
      renewalFailures: sub.renewalFailures || 0,
      pastDueSince: sub.pastDueSince,
      limits: sub.limits,
      usage: sub.usage,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  });

  const planDistribution = planAgg.map((p) => ({
    tier: p._id,
    name: ALL_PLANS[p._id]?.name || p._id,
    role: ALL_PLANS[p._id]?.role || "other",
    count: p.count,
    activeCount: p.activeCount,
    revenue: p.revenue,
  }));

  res.json({
    data: mappedRows,
    meta: {
      page: pageNum,
      limit: limitNum,
      total: filteredTotal,
      pages: Math.max(1, Math.ceil(filteredTotal / limitNum)),
      counts: {
        total,
        activePaid,
        free,
        trial,
        pastDue,
        canceled,
        expired,
      },
      planDistribution,
    },
  });
});

/**
 * GET /admin/subscriptions/:subscriptionId
 * Complete details, entitlements, usage, payment history, and audit history.
 */
exports.getAdminSubscriptionDetails = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { subscriptionId } = req.params;
  if (!mongoose.isValidObjectId(subscriptionId)) {
    throw new AppError("Invalid subscription ID", 400, "INVALID_ID");
  }

  const sub = await Subscription.findById(subscriptionId).lean();
  if (!sub) {
    throw new AppError("Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND");
  }

  const sid = String(sub.subscriberId);
  let subscriber = null;
  if (sub.subscriberType === "organization") {
    const org = await Organization.findById(sid).select("name email slug verificationStatus createdAt").lean();
    subscriber = org
      ? {
          id: sid,
          name: org.name,
          email: org.email || "",
          slug: org.slug || "",
          type: "organization",
          verificationStatus: org.verificationStatus,
          createdAt: org.createdAt,
        }
      : null;
  } else {
    const usr = await User.findById(sid).select("name email role createdAt").lean();
    subscriber = usr
      ? {
          id: sid,
          name: usr.name,
          email: usr.email || "",
          type: "candidate",
          role: usr.role,
          createdAt: usr.createdAt,
        }
      : null;
  }

  // Payment history for this subscription or subscriber
  const paymentHistory = await PaymentTransaction.find({
    $or: [{ subscription: sub._id }, { subscriberId: sub.subscriberId }],
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("transactionNumber invoiceNumber amount currency status gateway mode createdAt gatewayPaymentId")
    .lean();

  // Audit history
  const auditHistory = await AuditLog.find({
    $or: [
      { resourceId: String(sub._id) },
      ...(sub.subscriberType === "organization" ? [{ organization: sub.subscriberId }] : []),
    ],
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("action actor outcome reason metadata createdAt")
    .populate("actor", "name email")
    .lean();

  res.json({
    data: {
      subscription: {
        id: String(sub._id),
        subscriberType: sub.subscriberType,
        subscriberId: sub.subscriberId,
        planTier: sub.planTier,
        planName: ALL_PLANS[sub.planTier]?.name || sub.planTier,
        status: sub.status,
        billingCycle: sub.billingCycle,
        priceInr: sub.priceInr,
        source: sub.source,
        isDemo: Boolean(sub.isDemo),
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
        providerSubscriptionId: sub.providerSubscriptionId || "",
        providerStatus: sub.providerStatus || "",
        renewalFailures: sub.renewalFailures || 0,
        pastDueSince: sub.pastDueSince,
        limits: sub.limits,
        usage: sub.usage,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      },
      subscriber,
      plan: ALL_PLANS[sub.planTier] || null,
      paymentHistory: paymentHistory.map((p) => ({
        id: String(p._id),
        transactionNumber: p.transactionNumber,
        invoiceNumber: p.invoiceNumber || "",
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        gateway: p.gateway,
        mode: p.mode,
        gatewayPaymentId: p.gatewayPaymentId || "",
        createdAt: p.createdAt,
      })),
      auditHistory: auditHistory.map((a) => ({
        id: String(a._id),
        action: a.action,
        actorName: a.actor?.name || a.actor?.email || "Admin",
        outcome: a.outcome,
        reason: a.reason,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
    },
  });
});

/**
 * POST /admin/subscriptions/:subscriptionId/cancel
 * Administrative cancellation of a subscription with mandatory reason and audit log.
 */
exports.adminCancelSubscription = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { subscriptionId } = req.params;
  const { reason, immediate = false } = req.body || {};

  if (!mongoose.isValidObjectId(subscriptionId)) {
    throw new AppError("Invalid subscription ID", 400, "INVALID_ID");
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    throw new AppError("A cancellation reason of at least 3 characters is required", 400, "INVALID_REASON");
  }

  const sub = await Subscription.findById(subscriptionId);
  if (!sub) {
    throw new AppError("Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND");
  }

  if (sub.status === "canceled") {
    throw new AppError("Subscription is already canceled", 409, "ALREADY_CANCELED");
  }

  const previousStatus = sub.status;
  if (immediate) {
    sub.status = "canceled";
    sub.cancelAtPeriodEnd = false;
  } else {
    sub.cancelAtPeriodEnd = true;
  }
  await sub.save();

  await audit({
    req,
    organization: sub.subscriberType === "organization" ? sub.subscriberId : null,
    action: "admin.subscription_canceled",
    resourceType: "Subscription",
    resourceId: sub._id,
    reason: reason.trim(),
    metadata: {
      immediate,
      previousStatus,
      planTier: sub.planTier,
      priceInr: sub.priceInr,
    },
  });

  res.json({
    data: {
      id: String(sub._id),
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      updatedAt: sub.updatedAt,
    },
    message: immediate
      ? "Subscription canceled immediately"
      : "Subscription scheduled for cancellation at period end",
  });
});
