const { Placement } = require("../models/Placement");
const { Application } = require("../models/Application");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const User = require("../models/User");
const { notify } = require("../services/notificationService");
const { audit } = require("../services/auditService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { parse, applyCursor, meta } = require("../utils/pagination");

/**
 * Candidate: List their own placements
 */
exports.listCandidatePlacements = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const filter = applyCursor({ candidate: req.user._id }, page.after);

  const items = await Placement.find(filter)
    .populate("organization", "name slug logo")
    .populate("job", "title location compensation salary")
    .sort({ _id: -1 })
    .limit(page.limit);

  res.json({
    data: items,
    meta: meta(items, page.limit, await Placement.countDocuments({ candidate: req.user._id })),
  });
});

/**
 * Recruiter: List placements for their organization
 */
exports.listOrganizationPlacements = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const orgId = req.auth.organizationId;
  const filter = applyCursor({ organization: orgId }, page.after);
  if (req.query.status) filter.status = req.query.status;

  const items = await Placement.find(filter)
    .populate("candidate", "name email phone profileImage")
    .populate("job", "title location compensation")
    .sort({ _id: -1 })
    .limit(page.limit);

  res.json({
    data: items,
    meta: meta(items, page.limit, await Placement.countDocuments({ organization: orgId })),
  });
});

/**
 * Admin: List all platform placements with filters
 */
exports.listAdminPlacements = asyncHandler(async (req, res) => {
  if (req.auth.platformRole !== "platform_admin") {
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }

  const page = parse(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.organizationId) filter.organization = req.query.organizationId;

  const scoped = applyCursor(filter, page.after);
  const items = await Placement.find(scoped)
    .populate("organization", "name slug")
    .populate("candidate", "name email")
    .populate("job", "title location")
    .populate("verification.verifiedBy", "name")
    .sort({ _id: -1 })
    .limit(page.limit);

  res.json({
    data: items,
    meta: meta(items, page.limit, await Placement.countDocuments(filter)),
  });
});

/**
 * Candidate: Confirms joining acceptance and expected joining date
 */
exports.candidateConfirmJoining = asyncHandler(async (req, res) => {
  const placement = await Placement.findOne({
    _id: req.params.placementId,
    candidate: req.user._id,
  }).populate("organization", "name");

  if (!placement) {
    throw new AppError("Placement record not found", 404, "RESOURCE_NOT_FOUND");
  }

  const actualJoiningDate = req.body.actualJoiningDate ? new Date(req.body.actualJoiningDate) : new Date();
  placement.status = "joining_confirmed";
  placement.joiningConfirmation = {
    confirmedByCandidate: true,
    actualJoiningDate,
    confirmedAt: new Date(),
    candidateNotes: String(req.body.candidateNotes || "").slice(0, 2000),
  };

  await placement.save();

  // Notify recruiter
  try {
    const orgOwner = await require("../utils/organizationOwner")(placement.organization._id || placement.organization);
    if (orgOwner) {
      await notify({
        user: orgOwner.id,
        organization: placement.organization._id || placement.organization,
        type: "application_status_changed",
        category: "candidates",
        title: "Candidate Confirmed Joining",
        message: `${req.user.name} confirmed acceptance for ${placement.offerDetails?.designation || "the offered role"}. Joining Date: ${actualJoiningDate.toLocaleDateString()}.`,
        resourceType: "placement",
        resourceId: placement._id,
      });
    }
  } catch (_e) {}

  await audit({
    req,
    organization: placement.organization._id || placement.organization,
    action: "placement.joining_confirmed",
    resourceType: "placement",
    resourceId: placement._id,
    metadata: { joiningDate: actualJoiningDate },
  });

  res.json({ data: placement });
});

/**
 * Admin: Verifies placement with remarks
 */
exports.adminVerifyPlacement = asyncHandler(async (req, res) => {
  if (req.auth.platformRole !== "platform_admin") {
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }

  const placement = await Placement.findById(req.params.placementId)
    .populate("organization", "name")
    .populate("candidate", "name email")
    .populate("job", "title");

  if (!placement) {
    throw new AppError("Placement record not found", 404, "RESOURCE_NOT_FOUND");
  }

  placement.status = "placement_verified";
  placement.verification = {
    isVerified: true,
    verifiedBy: req.user._id,
    verifiedAt: new Date(),
    proofDocumentUrl: String(req.body.proofDocumentUrl || "").slice(0, 2048),
    adminRemarks: String(req.body.adminRemarks || "").slice(0, 2000),
  };

  await placement.save();

  await audit({
    req,
    organization: placement.organization?._id || placement.organization,
    action: "admin.placement_verified",
    resourceType: "placement",
    resourceId: placement._id,
    metadata: { verifiedBy: req.user.name },
  });

  res.json({ data: placement });
});

/**
 * Candidate, organization member or platform admin: record an employment status change.
 *
 * - Candidates may only change their own placements.
 * - Organization members may only change placements that belong to their organization
 *   (the route enforces an active `application.manage` membership).
 * - Every change records its source. Nothing here writes to the candidate's profile:
 *   employment is never inferred or copied into experience automatically.
 * - Transitions are validated: currently_working only from hired-stage statuses;
 *   employment_ended only from currently_working.
 */
const EMPLOYMENT_SOURCE_BY_ROLE = Object.freeze({
  candidate: "candidate_reported",
  organization: "organization_reported",
  platform_admin: "platform_reported",
});
const CURRENTLY_WORKING_FROM = Object.freeze(["hired", "joining_confirmed", "placement_verified"]);

exports.updateEmploymentStatus = asyncHandler(async (req, res) => {
  const { status, startDate, endDate, exitReason } = req.body;
  if (!["currently_working", "employment_ended"].includes(status)) {
    throw new AppError(
      "Invalid employment status. Expected 'currently_working' or 'employment_ended'",
      400,
      "INVALID_STATUS",
    );
  }

  const isPlatformAdmin = req.auth.platformRole === "platform_admin";
  const isCandidate = !isPlatformAdmin && req.user.role === "candidate";
  const query = { _id: req.params.placementId };
  if (isCandidate) {
    query.candidate = req.user._id;
  } else if (!isPlatformAdmin) {
    if (!req.auth.organizationId) {
      throw new AppError("Organization context is required", 400, "ORGANIZATION_REQUIRED");
    }
    query.organization = req.auth.organizationId;
  }

  const placement = await Placement.findOne(query).populate("job", "title");
  if (!placement) {
    throw new AppError("Placement record not found", 404, "RESOURCE_NOT_FOUND");
  }

  const previousStatus = placement.status;
  if (status === "currently_working") {
    if (!CURRENTLY_WORKING_FROM.includes(previousStatus)) {
      throw new AppError(
        `Cannot change employment status from ${previousStatus} to ${status}`,
        409,
        "INVALID_TRANSITION",
      );
    }
    placement.status = "currently_working";
    placement.employmentPeriod.startDate = startDate ? new Date(startDate) : new Date();
  } else {
    if (previousStatus !== "currently_working") {
      throw new AppError(
        `Cannot change employment status from ${previousStatus} to ${status}`,
        409,
        "INVALID_TRANSITION",
      );
    }
    placement.status = "employment_ended";
    placement.employmentPeriod.endDate = endDate ? new Date(endDate) : new Date();
    placement.employmentPeriod.exitReason = String(exitReason || "").slice(0, 2000);
  }

  placement.employmentStatusSource = isPlatformAdmin
    ? EMPLOYMENT_SOURCE_BY_ROLE.platform_admin
    : isCandidate
      ? EMPLOYMENT_SOURCE_BY_ROLE.candidate
      : EMPLOYMENT_SOURCE_BY_ROLE.organization;
  placement.employmentStatusUpdatedBy = req.user._id;
  placement.employmentStatusUpdatedAt = new Date();
  await placement.save();

  await audit({
    req,
    organization: placement.organization,
    action: `placement.status_${status}`,
    resourceType: "placement",
    resourceId: placement._id,
    metadata: {
      previousStatus,
      newStatus: placement.status,
      source: placement.employmentStatusSource,
    },
  });

  // Candidate-facing response: keep recruiter/candidate contact details out of employment updates.
  const response = placement.toObject();
  delete response.verification?.adminRemarks;
  res.json({ data: response });
});
