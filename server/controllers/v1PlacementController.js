const { Placement } = require("../models/Placement");
// Model modules below are required for their side effect only (registering the Mongoose models).
require("../models/Application");
require("../models/Organization");
require("../models/Job");
require("../models/User");
const { notifyCompanyLeads } = require("../services/billingNotifications");
const { audit } = require("../services/auditService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const CandidateProfile = require("../models/CandidateProfile");
const pipeline = require("../domain/candidatePipeline");
const { parse, applyCursor, meta } = require("../utils/pagination");
const mongoose = require("mongoose");
const { placementStatuses: PLACEMENT_STATUSES } = require("../models/Placement");

const requireAdmin = (req) => {
  if (req.auth.platformRole !== "platform_admin") throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
};

const objectIdOrReject = (value) => {
  if (!mongoose.isValidObjectId(value)) throw new AppError("Invalid identifier", 422, "INVALID_FILTER");
  return value;
};

// Reported and verified facts are returned side by side, never merged into one status.
const placementAdminView = (placement) => {
  const value = placement.toObject ? placement.toObject() : { ...placement };
  value.employmentFacts = {
    reported: {
      status: placement.status,
      source: placement.employmentStatusSource || "",
      updatedAt: placement.employmentStatusUpdatedAt || null,
    },
    verified: {
      isVerified: Boolean(placement.verification?.isVerified),
      verifiedAt: placement.verification?.verifiedAt || null,
      verifiedBy: placement.verification?.verifiedBy?.name || null,
    },
  };
  return value;
};

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
    data: items.map((p) => ({ ...p.toObject(), evidence: pipeline.employmentEvidence(p) })),
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
  const profiles = await CandidateProfile.find({
    user: { $in: items.map((p) => p.candidate?._id).filter(Boolean) },
  })
    .select("user privacy")
    .lean();
  const byUser = new Map(profiles.map((p) => [String(p.user), p]));

  res.json({
    data: items.map((p) => {
      const value = p.toObject();
      // The phone number is shared only when the candidate allowed it.
      const shared = pipeline.recruiterCandidateView(p.candidate, byUser.get(String(p.candidate?._id)));
      value.candidate = { id: shared.id, name: shared.name, email: shared.email, profileImage: p.candidate?.profileImage };
      if (shared.phone) value.candidate.phone = shared.phone;
      value.evidence = pipeline.employmentEvidence(p);
      return value;
    }),
    meta: meta(items, page.limit, await Placement.countDocuments({ organization: orgId })),
  });
});

/**
 * Admin: List all platform placements with filters
 */
exports.listAdminPlacements = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const page = parse(req.query);
  const filter = {};
  if (req.query.status) {
    if (!PLACEMENT_STATUSES.includes(req.query.status)) throw new AppError("Unknown placement status", 422, "INVALID_FILTER");
    filter.status = req.query.status;
  }
  if (req.query.organizationId) filter.organization = objectIdOrReject(req.query.organizationId);
  if (req.query.jobId) filter.job = objectIdOrReject(req.query.jobId);
  if (req.query.verified === "true") filter["verification.isVerified"] = true;
  if (req.query.verified === "false") filter["verification.isVerified"] = { $ne: true };

  const scoped = applyCursor(filter, page.after);
  const items = await Placement.find(scoped)
    .populate("organization", "name slug")
    .populate("candidate", "name email")
    .populate("job", "title location")
    .populate("verification.verifiedBy", "name")
    .sort({ _id: -1 })
    .limit(page.limit);

  res.json({
    data: items.map((p) => placementAdminView(p)),
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
  // Candidate confirmation is recorded separately from employment status. It must not move a
  // placement that already has an employment status back to joining_confirmed.
  const statusBeforeConfirmation = placement.status;
  if (!["currently_working", "employment_ended"].includes(placement.status)) {
    placement.status = "joining_confirmed";
  }
  placement.joiningConfirmation = {
    confirmedByCandidate: true,
    actualJoiningDate,
    confirmedAt: new Date(),
    candidateNotes: String(req.body.candidateNotes || "").slice(0, 2000),
  };
  placement.employmentHistory.push({
    event: "joining_confirmed",
    fromStatus: statusBeforeConfirmation,
    toStatus: placement.status,
    source: "candidate_reported",
    actor: req.user._id,
    at: new Date(),
    startDate: actualJoiningDate,
  });

  await placement.save();

  // Notify the company's owners and admins (best effort; the confirmation itself is already saved).
  const organizationId = placement.organization._id || placement.organization;
  notifyCompanyLeads(organizationId, {
    type: "joining_status_updated",
    title: "Candidate confirmed joining",
    message: `${req.user.name} confirmed acceptance for ${placement.offerDetails?.designation || "the offered role"}. Joining date: ${actualJoiningDate.toLocaleDateString()}.`,
    resourceType: "placement",
    resourceId: placement._id,
    key: `joining:${placement._id}:confirmed`,
  }).catch(() => {});

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

  // Verification is a separate fact from employment status. Keep an organization-reported
  // employment status (currently_working / employment_ended) intact; only pre-employment
  // placements move to placement_verified.
  const statusBeforeVerification = placement.status;
  if (!["currently_working", "employment_ended"].includes(placement.status)) {
    placement.status = "placement_verified";
  }
  placement.verification = {
    isVerified: true,
    verifiedBy: req.user._id,
    verifiedAt: new Date(),
    proofDocumentUrl: String(req.body.proofDocumentUrl || "").slice(0, 2048),
    adminRemarks: String(req.body.adminRemarks || "").slice(0, 2000),
  };
  placement.employmentHistory.push({
    event: "placement_verified",
    fromStatus: statusBeforeVerification,
    toStatus: placement.status,
    source: "platform_reported",
    actor: req.user._id,
    at: new Date(),
    note: String(req.body.adminRemarks || "").slice(0, 2000),
  });

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
  // Reported change, kept as history. The verified fact is a separate event (placement_verified).
  placement.employmentHistory.push({
    event: "employment_reported",
    fromStatus: previousStatus,
    toStatus: placement.status,
    source: placement.employmentStatusSource,
    actor: req.user._id,
    at: placement.employmentStatusUpdatedAt,
    startDate: placement.employmentPeriod.startDate,
    endDate: placement.employmentPeriod.endDate,
    note: placement.employmentPeriod.exitReason || "",
  });
  await placement.save();

  await audit({
    req,
    organization: placement.organization,
    action: `placement.status_${status}`,
    resourceType: "placement",
    resourceId: placement._id,
    previousState: { employmentStatus: previousStatus },
    newState: { employmentStatus: placement.status },
    metadata: {
      previousStatus,
      newStatus: placement.status,
      source: placement.employmentStatusSource,
    },
  });

  // A change the candidate reported is shown to the company. Recruiter-entered changes are not echoed back to them.
  if (isCandidate) {
    notifyCompanyLeads(placement.organization._id || placement.organization, {
      type: "joining_status_updated",
      title: "Candidate reported an employment update",
      message: `A candidate reported that their employment status for ${placement.offerDetails?.designation || "a placement"} changed to "${placement.status.replace(/_/g, " ")}". Source: candidate-reported.`,
      resourceType: "placement",
      resourceId: placement._id,
      key: `employment:${placement._id}:${placement.employmentStatusUpdatedAt.toISOString()}`,
    }).catch(() => {});
  }

  // Candidate-facing response: keep recruiter/candidate contact details out of employment updates.
  const response = placement.toObject();
  delete response.verification?.adminRemarks;
  res.json({ data: response });
});

/**
 * Admin: companies with placements, and their counts (reported and verified facts kept separate).
 * Company → jobs → placements is the navigation; no candidate personal data is returned here.
 */
exports.adminPlacementCompanies = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const counts = await Placement.aggregate([
    {
      $group: {
        _id: "$organization",
        total: { $sum: 1 },
        hired: { $sum: { $cond: [{ $eq: ["$status", "hired"] }, 1, 0] } },
        currentlyWorking: { $sum: { $cond: [{ $eq: ["$status", "currently_working"] }, 1, 0] } },
        employmentEnded: { $sum: { $cond: [{ $eq: ["$status", "employment_ended"] }, 1, 0] } },
        verified: { $sum: { $cond: [{ $eq: ["$verification.isVerified", true] }, 1, 0] } },
        lastChangeAt: { $max: "$updatedAt" },
      },
    },
    { $sort: { total: -1, _id: 1 } },
    { $limit: 200 },
  ]);
  const Organization = require("../models/Organization");
  const orgs = await Organization.find({ _id: { $in: counts.map((c) => c._id) } })
    .select("name slug")
    .lean();
  const byId = new Map(orgs.map((o) => [String(o._id), o]));
  res.json({
    data: counts.map((c) => ({
      organization: { id: String(c._id), name: byId.get(String(c._id))?.name || "", slug: byId.get(String(c._id))?.slug || "" },
      counts: {
        total: c.total,
        hired: c.hired,
        currentlyWorking: c.currentlyWorking,
        employmentEnded: c.employmentEnded,
        verified: c.verified,
        reportedNotVerified: c.total - c.verified,
      },
      lastChangeAt: c.lastChangeAt,
    })),
  });
});

/** Admin: jobs within one company that have placements, with counts. */
exports.adminPlacementCompanyJobs = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const organization = objectIdOrReject(req.params.organizationId);
  const rows = await Placement.aggregate([
    { $match: { organization: new mongoose.Types.ObjectId(organization) } },
    {
      $group: {
        _id: "$job",
        total: { $sum: 1 },
        verified: { $sum: { $cond: [{ $eq: ["$verification.isVerified", true] }, 1, 0] } },
        currentlyWorking: { $sum: { $cond: [{ $eq: ["$status", "currently_working"] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 200 },
  ]);
  const Job = require("../models/Job");
  const jobs = await Job.find({ _id: { $in: rows.map((r) => r._id) } })
    .select("title location")
    .lean();
  const byId = new Map(jobs.map((j) => [String(j._id), j]));
  res.json({
    data: rows.map((r) => ({
      job: { id: String(r._id), title: byId.get(String(r._id))?.title || "Job removed", location: byId.get(String(r._id))?.location || "" },
      counts: { total: r.total, verified: r.verified, currentlyWorking: r.currentlyWorking },
    })),
  });
});

/**
 * Admin: one placement with its employment history (append-only) and the originating application.
 * Shows reported and verified facts separately.
 */
exports.adminPlacementDetail = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const placement = await Placement.findById(objectIdOrReject(req.params.placementId))
    .populate("organization", "name slug")
    .populate("candidate", "name email")
    .populate("job", "title location")
    .populate("verification.verifiedBy", "name")
    .populate("employmentHistory.actor", "name");
  if (!placement) throw new AppError("Placement record not found", 404, "RESOURCE_NOT_FOUND");

  const { Application } = require("../models/Application");
  const application = await Application.findById(placement.application)
    .select("status appliedAt statusHistory offer jobSnapshot job")
    .lean();

  const value = placementAdminView(placement);
  value.employmentHistory = [...(placement.employmentHistory || [])]
    .map((h) => ({ ...(h.toObject ? h.toObject() : h), actor: h.actor?.name || null }))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  res.json({
    data: {
      placement: value,
      application: application
        ? {
            id: String(application._id),
            status: application.status,
            appliedAt: application.appliedAt,
            jobTitle: application.jobSnapshot?.title || "",
            statusHistory: (application.statusHistory || []).map((h) => ({ status: h.status, changedAt: h.changedAt })),
          }
        : null,
    },
  });
});

/**
 * Admin: a candidate's professional profile for a placement. Sensitive: every read is audited, and contact,
 * address, gender and social details are never included. Resume file download stays with the candidate route.
 */
exports.adminCandidateProfileForPlacement = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const placement = await Placement.findById(objectIdOrReject(req.params.placementId)).populate("job", "title");
  if (!placement) throw new AppError("Placement record not found", 404, "RESOURCE_NOT_FOUND");

  const candidateId = placement.candidate;
  // Record the access before reading any candidate data. If the audit cannot be written, nothing is returned.
  await audit({
    req,
    organization: placement.organization,
    action: "admin.candidate_profile_viewed",
    resourceType: "candidate_profile",
    resourceId: candidateId,
    metadata: { placementId: String(placement._id) },
  });

  const { ParsedResume } = require("../models/Resume");
  const { Application } = require("../models/Application");
  const User = require("../models/User");
  const [user, profile, parsed, applications] = await Promise.all([
    User.findById(candidateId).select("name email").lean(),
    CandidateProfile.findOne({ user: candidateId })
      .select("education experience projects certifications languages currentEmployment employmentStatus jobPreferences.preferredRoles")
      .lean(),
    ParsedResume.findOne({ candidate: candidateId }).sort({ _id: -1 }).select("skills education experiences experienceYears").lean(),
    Application.find({ candidate: candidateId })
      .select("status appliedAt job jobSnapshot organization")
      .populate("organization", "name")
      .sort({ appliedAt: -1 })
      .limit(100)
      .lean(),
  ]);

  res.json({
    data: {
      candidate: { id: String(candidateId), name: user?.name || "", email: user?.email || "" },
      placement: {
        id: String(placement._id),
        status: placement.status,
        jobTitle: placement.job?.title || "",
      },
      profile: profile
        ? {
            education: profile.education || [],
            experience: profile.experience || [],
            projects: profile.projects || [],
            certifications: profile.certifications || [],
            languages: profile.languages || [],
            currentEmployment: profile.currentEmployment || null,
            employmentStatus: profile.employmentStatus || "",
          }
        : null,
      skills: (parsed?.skills || []).map((s) => (typeof s === "string" ? s : s?.name || s?.skill || "")).filter(Boolean),
      parsedEducation: parsed?.education || [],
      parsedExperiences: parsed?.experiences || [],
      applicationHistory: applications.map((a) => ({
        id: String(a._id),
        status: a.status,
        appliedAt: a.appliedAt,
        jobTitle: a.jobSnapshot?.title || "",
        organizationName: a.organization?.name || "",
      })),
    },
  });
});
