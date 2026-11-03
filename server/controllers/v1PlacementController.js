const { Placement } = require("../models/Placement");
const { Application } = require("../models/Application");
const CandidateProfile = require("../models/CandidateProfile");
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
 * Recruiter or Candidate: Update employment status (currently_working or employment_ended)
 */
exports.updateEmploymentStatus = asyncHandler(async (req, res) => {
  const { status, startDate, endDate, exitReason } = req.body;
  if (!["currently_working", "employment_ended"].includes(status)) {
    throw new AppError("Invalid employment status. Expected 'currently_working' or 'employment_ended'", 400, "INVALID_STATUS");
  }

  const query = { _id: req.params.placementId };
  // Check authorization
  if (req.auth.platformRole !== "platform_admin") {
    if (req.user.role === "candidate") {
      query.candidate = req.user._id;
    } else if (req.auth.organizationId) {
      query.organization = req.auth.organizationId;
    }
  }

  const placement = await Placement.findOne(query)
    .populate("organization", "name")
    .populate("candidate", "name email")
    .populate("job", "title");

  if (!placement) {
    throw new AppError("Placement record not found", 404, "RESOURCE_NOT_FOUND");
  }

  const companyName = placement.organization?.name || "Company";
  const positionTitle = placement.offerDetails?.designation || placement.job?.title || "Software Engineer";

  if (status === "currently_working") {
    placement.status = "currently_working";
    placement.employmentPeriod.startDate = startDate ? new Date(startDate) : new Date();
    await placement.save();

    // Automatically update or add to CandidateProfile.experience
    const profile = await CandidateProfile.findOne({ user: placement.candidate._id || placement.candidate });
    if (profile) {
      const existingExp = profile.experience.find(
        (exp) => exp.company.toLowerCase() === companyName.toLowerCase(),
      );
      if (existingExp) {
        existingExp.currentlyWorking = true;
        existingExp.startDate = placement.employmentPeriod.startDate;
        existingExp.position = positionTitle;
      } else {
        profile.experience.unshift({
          company: companyName,
          position: positionTitle,
          description: `Employed through HireSmart-AI verified placement.`,
          startDate: placement.employmentPeriod.startDate,
          currentlyWorking: true,
        });
      }
      await profile.save();
    }
  } else if (status === "employment_ended") {
    placement.status = "employment_ended";
    placement.employmentPeriod.endDate = endDate ? new Date(endDate) : new Date();
    placement.employmentPeriod.exitReason = String(exitReason || "").slice(0, 2000);
    await placement.save();

    // Update CandidateProfile.experience
    const profile = await CandidateProfile.findOne({ user: placement.candidate._id || placement.candidate });
    if (profile) {
      const existingExp = profile.experience.find(
        (exp) => exp.company.toLowerCase() === companyName.toLowerCase() && exp.currentlyWorking,
      );
      if (existingExp) {
        existingExp.currentlyWorking = false;
        existingExp.endDate = placement.employmentPeriod.endDate;
        await profile.save();
      }
    }
  }

  await audit({
    req,
    organization: placement.organization?._id || placement.organization,
    action: `placement.status_${status}`,
    resourceType: "placement",
    resourceId: placement._id,
    metadata: { status },
  });

  res.json({ data: placement });
});
