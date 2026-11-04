// HTTP layer for company verification (Phase 2). Business rules live in
// services/companyVerificationService.js. Handlers here only check roles, parse input and shape output.

const { z } = require("zod");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const Organization = require("../models/Organization");
const service = require("../services/companyVerificationService");

/** Platform-only endpoints answer 404 to everyone else, as the rest of the admin API does. */
const requirePlatformAdmin = (req) => {
  if (req.auth?.platformRole !== "platform_admin") {
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }
};

const queueQuery = z
  .object({
    status: z.enum(["all", "pending", "under_review", "verified", "rejected", "suspended"]).optional(),
    risk: z.enum(["all", "elevated"]).optional(),
    missingEvidence: z.enum(["true", "false"]).optional(),
    duplicateReview: z.enum(["true", "false"]).optional(),
    page: z.coerce.number().int().min(1).max(10000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const parseQuery = (query) => {
  const parsed = queueQuery.safeParse(query || {});
  if (!parsed.success) {
    throw new AppError(
      "Request validation failed",
      422,
      "VALIDATION_ERROR",
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })),
    );
  }
  return parsed.data;
};

// ---------------------------------------------------------------------------
// Recruiter (organization members with organization.manage)
// ---------------------------------------------------------------------------

const loadOrganization = async (req) => {
  const org = await Organization.findById(req.auth.organizationId);
  if (!org) throw new AppError("Organization not found", 404, "RESOURCE_NOT_FOUND");
  return org;
};

exports.getVerification = asyncHandler(async (req, res) => {
  const org = await loadOrganization(req);
  res.json({ data: await service.recruiterView(org) });
});

exports.submitVerification = asyncHandler(async (req, res) => {
  const org = await loadOrganization(req);
  const result = await service.submitVerification({ org, body: req.body, actor: req.user, req });
  res.json({
    data: await service.recruiterView(result.org),
    message: "Verification details submitted. Our team is reviewing your company.",
  });
});

exports.sendBusinessEmailCode = asyncHandler(async (req, res) => {
  const org = await loadOrganization(req);
  const result = await service.sendBusinessEmailCode({ org, actor: req.user, req });
  res.json({ data: result, message: "A confirmation code was sent to the business email address." });
});

exports.confirmBusinessEmailCode = asyncHandler(async (req, res) => {
  const org = await loadOrganization(req);
  const result = await service.confirmBusinessEmailCode({ org, actor: req.user, req, code: req.body.code });
  res.json({ data: result, message: "Business email confirmed." });
});

exports.uploadDocument = asyncHandler(async (req, res) => {
  const org = await loadOrganization(req);
  const document = await service.addDocument({
    org,
    actor: req.user,
    req,
    file: req.file,
    documentType: req.body.documentType,
  });
  res.status(201).json({ data: document });
});

// ---------------------------------------------------------------------------
// Platform administrators
// ---------------------------------------------------------------------------

exports.adminListCases = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const query = parseQuery(req.query);
  const result = await service.listCases({
    status: query.status,
    risk: query.risk,
    missingEvidence: query.missingEvidence === "true",
    duplicateReview: query.duplicateReview === "true",
    page: query.page,
    limit: query.limit,
  });
  res.json({ data: result.items, meta: result.meta });
});

exports.adminCaseDetail = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  res.json({ data: await service.caseDetail(req.params.caseId) });
});

exports.adminRecordCheck = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const result = await service.recordManualCheck({
    caseId: req.params.caseId,
    actor: req.user,
    req,
    body: req.body,
  });
  res.json({ data: result });
});

exports.adminRegistryCheck = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const result = await service.runRegistryCheck({ caseId: req.params.caseId, actor: req.user, req });
  res.json({ data: result });
});

exports.adminRequestChanges = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const items = req.body.items?.length ? req.body.items : [req.body.notes].filter(Boolean);
  const result = await service.requestChanges({ caseId: req.params.caseId, actor: req.user, req, items });
  res.json({ data: result });
});

exports.adminApprove = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const result = await service.approveCase({
    caseId: req.params.caseId,
    actor: req.user,
    req,
    notes: req.body?.notes,
  });
  res.json({ data: result });
});

exports.adminReject = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const result = await service.rejectCase({
    caseId: req.params.caseId,
    actor: req.user,
    req,
    reason: req.body?.reason,
  });
  res.json({ data: result });
});

exports.adminSuspend = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const result = await service.suspendCase({
    caseId: req.params.caseId,
    actor: req.user,
    req,
    reason: req.body?.reason,
  });
  res.json({ data: result });
});

exports.adminRestore = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const result = await service.restoreCase({
    caseId: req.params.caseId,
    actor: req.user,
    req,
    reason: req.body?.reason,
  });
  res.json({ data: result });
});

exports.adminDownloadDocument = asyncHandler(async (req, res) => {
  requirePlatformAdmin(req);
  const { buffer, mimeType, fileName } = await service.readDocument(req.params.documentId);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.end(buffer);
});

