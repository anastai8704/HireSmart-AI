// Admin Fraud & Risk Management Controller (Phase 4G)
// Comprehensive security incident, risk investigation, and fraud signal monitoring.
const mongoose = require("mongoose");
const SecurityEvent = require("../models/SecurityEvent");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const fraudDetectionService = require("../services/fraudDetectionService");
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
 * GET /admin/security/overview
 * Real platform security and fraud risk metrics across tenants.
 */
exports.getSecurityOverview = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const [
    totalEvents,
    highRiskEvents,
    openInvestigations,
    resolvedInvestigations,
    flaggedUsers,
    suspiciousOrganizations,
    jobRiskAlerts,
    severityFacet,
  ] = await Promise.all([
    SecurityEvent.countDocuments({}),
    SecurityEvent.countDocuments({ severity: { $in: ["high", "critical"] } }),
    SecurityEvent.countDocuments({
      $or: [{ status: { $in: ["open", "investigating"] } }, { resolvedAt: null }],
    }),
    SecurityEvent.countDocuments({
      $or: [{ status: { $in: ["resolved", "dismissed"] } }, { resolvedAt: { $ne: null } }],
    }),
    User.countDocuments({
      $or: [{ isFlagged: true }, { "securityFlags.0": { $exists: true } }],
    }),
    Organization.countDocuments({
      $or: [{ riskScore: { $gt: 25 } }, { verificationStatus: "suspended" }],
    }),
    Job.countDocuments({
      $or: [{ "moderation.status": "rejected" }, { "moderation.riskScore": { $gt: 50 } }],
    }),
    SecurityEvent.aggregate([
      {
        $group: {
          _id: "$severity",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const severityDistribution = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const s of severityFacet) {
    if (s._id in severityDistribution) {
      severityDistribution[s._id] = s.count;
    }
  }

  res.json({
    data: {
      metrics: {
        totalEvents,
        highRiskEvents,
        openInvestigations,
        resolvedInvestigations,
        flaggedUsers,
        suspiciousOrganizations,
        jobRiskAlerts,
      },
      severityDistribution,
    },
  });
});

/**
 * GET /admin/security-events
 * Paged list of security events with filters, search, and investigation status.
 */
exports.listSecurityEvents = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const {
    q,
    search,
    severity,
    status,
    from,
    to,
    sort = "newest",
    page = "1",
    limit = "20",
  } = req.query;

  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const match = {};

  if (severity && severity !== "all") {
    const allowed = ["info", "low", "medium", "high", "critical"];
    if (!allowed.includes(severity)) throw new AppError("Invalid severity filter", 400, "INVALID_FILTER");
    match.severity = severity;
  }

  if (status && status !== "all") {
    const allowed = ["open", "investigating", "resolved", "dismissed"];
    if (!allowed.includes(status)) throw new AppError("Invalid status filter", 400, "INVALID_FILTER");
    if (status === "open") {
      match.$or = [{ status: "open" }, { status: null, resolvedAt: null }];
    } else if (status === "resolved") {
      match.$or = [{ status: "resolved" }, { resolvedAt: { $ne: null } }];
    } else {
      match.status = status;
    }
  }

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }

  const queryTerm = (q || search || "").trim();
  if (queryTerm) {
    if (mongoose.isValidObjectId(queryTerm)) {
      const objId = new mongoose.Types.ObjectId(queryTerm);
      match.$or = [{ _id: objId }, { user: objId }, { organization: objId }];
    } else {
      const rx = new RegExp(escapeRegex(queryTerm.slice(0, 100)), "i");
      const [matchedUsers, matchedOrgs] = await Promise.all([
        User.find({ $or: [{ name: rx }, { email: rx }] }).select("_id").lean(),
        Organization.find({ name: rx }).select("_id").lean(),
      ]);

      const userIds = matchedUsers.map((u) => u._id);
      const orgIds = matchedOrgs.map((o) => o._id);

      const orConditions = [{ type: rx }];
      if (userIds.length > 0) orConditions.push({ user: { $in: userIds } });
      if (orgIds.length > 0) orConditions.push({ organization: { $in: orgIds } });
      match.$or = orConditions;
    }
  }

  const sortMap = {
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    severity: { severity: -1, createdAt: -1 },
  };
  const sortCriteria = sortMap[sort] || sortMap.newest;

  const [
    total,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    openCount,
    resolvedCount,
    rows,
    filteredTotal,
  ] = await Promise.all([
    SecurityEvent.countDocuments({}),
    SecurityEvent.countDocuments({ severity: "critical" }),
    SecurityEvent.countDocuments({ severity: "high" }),
    SecurityEvent.countDocuments({ severity: "medium" }),
    SecurityEvent.countDocuments({ severity: "low" }),
    SecurityEvent.countDocuments({
      $or: [{ status: { $in: ["open", "investigating"] } }, { resolvedAt: null }],
    }),
    SecurityEvent.countDocuments({
      $or: [{ status: { $in: ["resolved", "dismissed"] } }, { resolvedAt: { $ne: null } }],
    }),
    SecurityEvent.find(match)
      .populate("user", "name email role isFlagged")
      .populate("organization", "name slug verificationStatus riskScore")
      .populate("resolvedBy", "name email")
      .sort(sortCriteria)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    SecurityEvent.countDocuments(match),
  ]);

  const mappedRows = rows.map((ev) => ({
    id: String(ev._id),
    _id: String(ev._id),
    type: ev.type,
    severity: ev.severity,
    status: ev.status || (ev.resolvedAt ? "resolved" : "open"),
    requestId: ev.requestId || "",
    ipHashPreview: ev.ipHash ? `${ev.ipHash.slice(0, 8)}...` : "",
    details: ev.details || {},
    user: ev.user
      ? {
          id: String(ev.user._id),
          name: ev.user.name || "User",
          email: ev.user.email || "",
          role: ev.user.role || "candidate",
          isFlagged: Boolean(ev.user.isFlagged),
        }
      : null,
    organization: ev.organization
      ? {
          id: String(ev.organization._id),
          name: ev.organization.name || "Organization",
          slug: ev.organization.slug || "",
          verificationStatus: ev.organization.verificationStatus || "unverified",
          riskScore: ev.organization.riskScore ?? 0,
        }
      : null,
    investigationNotesCount: Array.isArray(ev.investigationNotes) ? ev.investigationNotes.length : 0,
    resolutionReason: ev.resolutionReason || "",
    resolvedBy: ev.resolvedBy ? ev.resolvedBy.name || ev.resolvedBy.email : null,
    resolvedAt: ev.resolvedAt,
    createdAt: ev.createdAt,
    updatedAt: ev.updatedAt,
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
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount,
        open: openCount,
        resolved: resolvedCount,
      },
    },
  });
});

/**
 * GET /admin/security-events/:eventId
 * Complete event details, contributing risk signals, historical incidents, and audit trail.
 */
exports.getSecurityEventDetails = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { eventId } = req.params;
  if (!mongoose.isValidObjectId(eventId)) {
    throw new AppError("Invalid event ID", 400, "INVALID_ID");
  }

  const ev = await SecurityEvent.findById(eventId)
    .populate("user", "name email role isFlagged createdAt")
    .populate("organization", "name slug verificationStatus riskScore gstin businessEmail website createdAt")
    .populate("resolvedBy", "name email")
    .lean();

  if (!ev) {
    throw new AppError("Security event not found", 404, "EVENT_NOT_FOUND");
  }

  // 1. Gather historical security events for this user or organization
  const historyConditions = [];
  if (ev.user?._id) historyConditions.push({ user: ev.user._id });
  if (ev.organization?._id) historyConditions.push({ organization: ev.organization._id });

  const relatedHistory = historyConditions.length
    ? await SecurityEvent.find({ _id: { $ne: ev._id }, $or: historyConditions })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("type severity status resolutionReason createdAt")
        .lean()
    : [];

  // 2. Real fraud detection signals
  let riskSignals = [];
  if (ev.organization?._id) {
    try {
      const orgDoc = await Organization.findById(ev.organization._id);
      if (orgDoc) {
        const riskEvaluation = await fraudDetectionService.evaluateOrganizationRisk(orgDoc);
        riskSignals = riskEvaluation.riskFlags || [];
      }
    } catch {
      // Risk evaluation fallback
    }
  }

  // If the event itself carried signals in details
  if (Array.isArray(ev.details?.signals)) {
    riskSignals.push(...ev.details.signals);
  }

  // 3. Audit trail for this event or resource
  const auditTrail = await AuditLog.find({
    $or: [
      { resourceId: String(ev._id) },
      ...(ev.organization?._id ? [{ organization: ev.organization._id }] : []),
    ],
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("actor", "name email")
    .select("action actor outcome reason metadata createdAt")
    .lean();

  res.json({
    data: {
      event: {
        id: String(ev._id),
        type: ev.type,
        severity: ev.severity,
        status: ev.status || (ev.resolvedAt ? "resolved" : "open"),
        requestId: ev.requestId || "",
        ipHashPreview: ev.ipHash ? `${ev.ipHash.slice(0, 10)}...[masked]` : "",
        details: ev.details || {},
        user: ev.user
          ? {
              id: String(ev.user._id),
              name: ev.user.name || "User",
              email: ev.user.email || "",
              role: ev.user.role || "candidate",
              isFlagged: Boolean(ev.user.isFlagged),
              createdAt: ev.user.createdAt,
            }
          : null,
        organization: ev.organization
          ? {
              id: String(ev.organization._id),
              name: ev.organization.name || "Organization",
              slug: ev.organization.slug || "",
              verificationStatus: ev.organization.verificationStatus || "unverified",
              riskScore: ev.organization.riskScore ?? 0,
              gstin: ev.organization.gstin || "",
              businessEmail: ev.organization.businessEmail || "",
              createdAt: ev.organization.createdAt,
            }
          : null,
        investigationNotes: Array.isArray(ev.investigationNotes) ? ev.investigationNotes : [],
        resolutionReason: ev.resolutionReason || "",
        resolvedBy: ev.resolvedBy ? ev.resolvedBy.name || ev.resolvedBy.email : null,
        resolvedAt: ev.resolvedAt,
        createdAt: ev.createdAt,
        updatedAt: ev.updatedAt,
      },
      relatedHistory: relatedHistory.map((h) => ({
        id: String(h._id),
        type: h.type,
        severity: h.severity,
        status: h.status || "open",
        resolutionReason: h.resolutionReason || "",
        createdAt: h.createdAt,
      })),
      riskSignals,
      auditTrail: auditTrail.map((a) => ({
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
 * POST /admin/security-events/:eventId/notes
 * Adds an administrative investigation note to the security event.
 */
exports.addInvestigationNote = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { eventId } = req.params;
  const { note } = req.body || {};

  if (!mongoose.isValidObjectId(eventId)) {
    throw new AppError("Invalid event ID", 400, "INVALID_ID");
  }

  if (!note || typeof note !== "string" || note.trim().length < 3) {
    throw new AppError("Investigation note must be at least 3 characters", 400, "INVALID_NOTE");
  }

  const ev = await SecurityEvent.findById(eventId);
  if (!ev) {
    throw new AppError("Security event not found", 404, "EVENT_NOT_FOUND");
  }

  const newNote = {
    note: note.trim().slice(0, 2000),
    author: req.user._id,
    authorName: req.user.name || req.user.email || "Platform Admin",
    createdAt: new Date(),
  };

  ev.investigationNotes.push(newNote);
  if (ev.status === "open") {
    ev.status = "investigating";
  }
  await ev.save();

  await audit({
    req,
    organization: ev.organization || null,
    action: "admin.security_event_note_added",
    resourceType: "SecurityEvent",
    resourceId: ev._id,
    reason: note.trim().slice(0, 200),
  });

  res.json({
    data: {
      id: String(ev._id),
      status: ev.status,
      investigationNotes: ev.investigationNotes,
    },
    message: "Investigation note recorded successfully",
  });
});

/**
 * POST /admin/security-events/:eventId/resolve
 * Resolves or dismisses a security event with mandatory reason and audit log.
 */
exports.resolveSecurityEvent = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { eventId } = req.params;
  const { resolution = "resolved", reason } = req.body || {};

  if (!mongoose.isValidObjectId(eventId)) {
    throw new AppError("Invalid event ID", 400, "INVALID_ID");
  }

  const allowedResolutions = ["resolved", "dismissed"];
  if (!allowedResolutions.includes(resolution)) {
    throw new AppError("Resolution must be 'resolved' or 'dismissed'", 400, "INVALID_RESOLUTION");
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    throw new AppError("A resolution reason of at least 3 characters is required", 400, "INVALID_REASON");
  }

  const ev = await SecurityEvent.findById(eventId);
  if (!ev) {
    throw new AppError("Security event not found", 404, "EVENT_NOT_FOUND");
  }

  ev.status = resolution;
  ev.resolutionReason = reason.trim().slice(0, 1000);
  ev.resolvedBy = req.user._id;
  ev.resolvedAt = new Date();
  await ev.save();

  await audit({
    req,
    organization: ev.organization || null,
    action: resolution === "resolved" ? "admin.security_event_resolved" : "admin.security_event_dismissed",
    resourceType: "SecurityEvent",
    resourceId: ev._id,
    reason: reason.trim().slice(0, 500),
    metadata: {
      resolution,
      previousStatus: ev.status,
      severity: ev.severity,
    },
  });

  res.json({
    data: {
      id: String(ev._id),
      status: ev.status,
      resolutionReason: ev.resolutionReason,
      resolvedAt: ev.resolvedAt,
    },
    message: `Security event marked as ${resolution}`,
  });
});

/**
 * POST /admin/security-events/:eventId/flag
 * Flags a user or organization related to this security event for elevated manual review.
 */
exports.flagEntity = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { eventId } = req.params;
  const { targetType, reason } = req.body || {};

  if (!mongoose.isValidObjectId(eventId)) {
    throw new AppError("Invalid event ID", 400, "INVALID_ID");
  }

  if (!["user", "organization"].includes(targetType)) {
    throw new AppError("targetType must be 'user' or 'organization'", 400, "INVALID_TARGET");
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    throw new AppError("A flagging reason of at least 3 characters is required", 400, "INVALID_REASON");
  }

  const ev = await SecurityEvent.findById(eventId);
  if (!ev) {
    throw new AppError("Security event not found", 404, "EVENT_NOT_FOUND");
  }

  if (targetType === "user") {
    if (!ev.user) throw new AppError("No user associated with this event", 400, "NO_USER");
    const user = await User.findById(ev.user);
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    user.isFlagged = true;
    await user.save();

    await SecurityEvent.create({
      user: user._id,
      type: "suspicious_activity_flagged",
      severity: "medium",
      status: "open",
      details: {
        reason: reason.trim().slice(0, 500),
        flaggedBy: req.user._id,
        sourceEventId: ev._id,
      },
    });

    await audit({
      req,
      action: "admin.user_flagged_suspicious",
      resourceType: "User",
      resourceId: user._id,
      reason: reason.trim().slice(0, 500),
      metadata: { sourceEventId: String(ev._id) },
    });

    return res.json({ message: "User flagged for security review" });
  }

  if (targetType === "organization") {
    if (!ev.organization) throw new AppError("No organization associated with this event", 400, "NO_ORGANIZATION");
    const org = await Organization.findById(ev.organization);
    if (!org) throw new AppError("Organization not found", 404, "ORG_NOT_FOUND");

    await SecurityEvent.create({
      organization: org._id,
      type: "suspicious_organization_flagged",
      severity: "high",
      status: "open",
      details: {
        reason: reason.trim().slice(0, 500),
        flaggedBy: req.user._id,
        sourceEventId: ev._id,
      },
    });

    await audit({
      req,
      organization: org._id,
      action: "admin.organization_flagged_suspicious",
      resourceType: "Organization",
      resourceId: org._id,
      reason: reason.trim().slice(0, 500),
      metadata: { sourceEventId: String(ev._id) },
    });

    return res.json({ message: "Organization flagged for security review" });
  }
});
