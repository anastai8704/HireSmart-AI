// Company verification workflow (Phase 2). Owns every write to a verification case and to the
// organization's verification status. Controllers only validate input and call these functions.
//
// Consistency model: this project does not use MongoDB multi-document transactions (it runs on a
// standalone server in development and CI). Every status change is therefore a conditional update
// (the expected status is part of the filter), and the organization write is rolled back if the
// case write fails. Two concurrent decisions cannot both succeed.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { Membership } = require("../models/Membership");
const { CompanyVerificationCase, OPEN_STATUSES } = require("../models/CompanyVerificationCase");
const { JobModerationEvent } = require("../models/JobModerationEvent");
const { assertTransition } = require("../domain/stateMachines");
const policy = require("../domain/companyVerificationPolicy");
const rules = require("../domain/verificationRules");
const { RISK_DISCLAIMER } = rules;
const AppError = require("../utils/AppError");
const organizationOwner = require("../utils/organizationOwner");
const logger = require("../utils/logger");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");
const emailService = require("./emailService");
const registry = require("./registryProvider");
const fraud = require("./fraudDetectionService");
const { scan } = require("./malwareScannerService");

const CONSENT_VERSION = "2026-11-verification-v1";
const DOCUMENT_DIRECTORY = path.resolve(__dirname, "..", "uploads", "verification");

const fail = (statusCode, code, message, fieldErrors) =>
  new AppError(message, statusCode, code, fieldErrors);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sha256Hex = (value) => crypto.createHash("sha256").update(value).digest("hex");

/** Signatures let a recorded check become stale when the identifiers it was made against change. */
const identitySignature = (org) =>
  [
    policy.normalizeRegistrationNumber(org.registrationNumber),
    policy.normalizeGstin(org.gstin),
    policy.normalizeCompanyName(org.name),
  ].join("|");

const emailSignature = (org) =>
  String(org.businessEmail || "")
    .trim()
    .toLowerCase();

const candidateSignature = (candidates) =>
  candidates
    .map((candidate) => String(candidate.organization))
    .sort()
    .join(",") || "none";

const maskEmail = (email) => {
  const [local = "", domain = ""] = String(email).split("@");
  return `${local.slice(0, 1)}***@${domain}`;
};

const publicOrganization = (org) => {
  const plain = typeof org.toObject === "function" ? org.toObject() : { ...org };
  delete plain.riskScore;
  delete plain.riskFlags;
  delete plain.verificationNotes;
  delete plain.verificationSummary;
  delete plain.normalizedRegistrationNumber;
  delete plain.normalizedGstin;
  delete plain.websiteHost;
  delete plain.emailDomain;
  delete plain.verifiedBy;
  // Raw document records hold storage keys and uploader IDs; expose the safe view only.
  plain.documents = (plain.documents || []).map(documentView);
  return plain;
};

/** Document metadata safe for clients. The storage key is never included. */
const documentView = (doc) => ({
  id: String(doc._id),
  type: doc.type,
  fileName: doc.fileName,
  mimeType: doc.mimeType,
  size: doc.size,
  uploadedAt: doc.uploadedAt,
});

const notifyOwner = async (org, { title, message, type = "company_verification" }) => {
  try {
    const owner = await organizationOwner(org._id);
    if (!owner) return;
    await notify({
      user: owner.id,
      organization: org._id,
      type,
      category: "companies",
      title,
      message,
      resourceType: "organization",
      resourceId: org._id,
    });
  } catch (error) {
    logger.error(`Verification notification failed: ${error.message}`);
  }
};

const auditEvent = (req, org, action, metadata = {}) =>
  audit({
    req,
    organization: org._id,
    action,
    resourceType: "organization",
    resourceId: org._id,
    metadata,
  });

const findOpenCase = (organizationId) =>
  CompanyVerificationCase.findOne({ organization: organizationId, status: { $in: OPEN_STATUSES } });

const findCurrentCase = async (organizationId) =>
  (await findOpenCase(organizationId)) ||
  CompanyVerificationCase.findOne({ organization: organizationId }).sort({ createdAt: -1 });

const loadCase = async (caseId) => {
  if (!mongoose.isValidObjectId(caseId)) throw fail(404, "RESOURCE_NOT_FOUND", "Case not found");
  const caseDoc = await CompanyVerificationCase.findById(caseId);
  if (!caseDoc) throw fail(404, "RESOURCE_NOT_FOUND", "Case not found");
  const org = await Organization.findById(caseDoc.organization);
  if (!org) throw fail(404, "RESOURCE_NOT_FOUND", "Organization not found");
  return { caseDoc, org };
};

/** Reviewers may not decide on a company they belong to. Enforced here, not only in the UI. */
const assertIndependentReviewer = async (org, actor) => {
  const conflict = await Membership.exists({
    organization: org._id,
    user: actor._id,
    status: "active",
  });
  if (conflict) {
    throw fail(
      403,
      "REVIEWER_CONFLICT",
      "A reviewer cannot make a verification decision for a company they belong to",
    );
  }
};

// ---------------------------------------------------------------------------
// Checklist and risk refresh
// ---------------------------------------------------------------------------

/**
 * Recomputes the checklist, risk, duplicate candidates and readiness for a case, and mirrors the
 * summary onto the organization. Never changes a status.
 */
const refreshAssessment = async (caseDoc, org, { now = new Date() } = {}) => {
  const recruiterUserId = caseDoc.openedBy || null;
  const { facts, duplicateRegistration, duplicateProfile } = await fraud.gatherRiskFacts(org, {
    recruiterUserId,
    now,
  });

  const candidates = [...duplicateRegistration.map((o) => ({ o, reason: "registration" })), ...duplicateProfile.map((o) => ({ o, reason: "profile" }))].map(
    ({ o, reason }) => ({ organization: o._id, reasons: [reason] }),
  );
  const duplicateSig = candidateSignature(candidates);

  // Stale records (made against old identifiers or candidates) do not count.
  const currentSignature = {
    business_registration: identitySignature(org),
    business_email: emailSignature(org),
    duplicate_review: duplicateSig,
  };
  const records = caseDoc.evidence
    .filter((item) => {
      const expected = currentSignature[item.type];
      return expected === undefined || item.value === expected;
    })
    .map((item) => ({
      type: item.type,
      result: item.result,
      method: item.method,
      recordedAt: item.recordedAt,
    }));

  const defaults = {
    business_email: org.businessEmailVerifiedAt
      ? { result: "match", method: "email_token" }
      : undefined,
    recruiter_identity: facts.recruiterEmailVerified
      ? { result: "match", method: "system_rule" }
      : undefined,
    duplicate_review:
      candidates.length === 0 ? { result: "match", method: "system_rule" } : undefined,
  };

  const checklist = policy.summarizeChecklist({ records, defaults });
  facts.registrationMismatch = checklist.current.business_registration.result === "mismatch";
  const risk = policy.computeRisk(facts);

  caseDoc.readiness = {
    missing: checklist.missing,
    blockers: checklist.blockers,
    computedAt: now,
  };
  caseDoc.risk = {
    score: risk.score,
    level: risk.level,
    indicators: risk.indicators,
    requiresManualReview: risk.requiresManualReview,
    computedAt: now,
  };
  caseDoc.duplicateCandidates = candidates;
  if (OPEN_STATUSES.includes(caseDoc.status)) caseDoc.assessment = checklist.assessment;
  await caseDoc.save();

  await Organization.updateOne(
    { _id: org._id },
    {
      $set: {
        riskScore: risk.score,
        riskFlags: risk.indicators.map((indicator) => ({
          code: indicator.code,
          severity: indicator.severity,
          message: indicator.explanation,
          flaggedAt: now,
        })),
        verificationSummary: {
          missingCount: checklist.missing.length,
          duplicateCount: candidates.length,
          updatedAt: now,
        },
      },
    },
  );

  return { checklist, risk, candidates };
};

/**
 * Moves the case and the organization to a new status together. Both writes are conditional on the
 * expected current status. If the second write fails, the first is rolled back.
 */
const moveStatus = async ({ caseDoc, org, to, actorId, reason = "", action, orgSet = {}, caseSet = {} }) => {
  const from = caseDoc.status;
  assertTransition("companyVerification", from, to);
  if (org.verificationStatus !== from) {
    throw fail(409, "STATUS_CHANGED", "The company status changed. Reload and try again.");
  }

  const entry = { from, to, by: actorId, reason, at: new Date(), action };
  const revertKeys = Object.keys(orgSet);
  const revert = { verificationStatus: from };
  for (const key of revertKeys) revert[key] = org.get(key) ?? null;

  caseDoc.set({ ...caseSet, status: to });
  caseDoc.statusHistory.push(entry);
  try {
    await caseDoc.validate();
  } catch (error) {
    throw fail(422, "VALIDATION_ERROR", error.message);
  }

  const orgResult = await Organization.updateOne(
    { _id: org._id, verificationStatus: from },
    { $set: { verificationStatus: to, ...orgSet } },
  );
  if (!orgResult.matchedCount) {
    throw fail(409, "STATUS_CHANGED", "The company status changed. Reload and try again.");
  }

  const caseResult = await CompanyVerificationCase.updateOne(
    { _id: caseDoc._id, status: from },
    { $set: { ...caseSet, status: to }, $push: { statusHistory: entry } },
  );
  if (!caseResult.matchedCount) {
    await Organization.updateOne({ _id: org._id, verificationStatus: to }, { $set: revert });
    throw fail(409, "STATUS_CHANGED", "The case changed. Reload and try again.");
  }
  return caseDoc;
};

/** Closes published listings of a company. Records one job event per listing, never deletes. */
const restrictActiveListings = async (org, actorId, reason) => {
  const jobs = await Job.find({ organization: org._id, status: "published" }).select("_id").lean();
  let closed = 0;
  for (const job of jobs) {
    const result = await Job.updateOne({ _id: job._id, status: "published" }, { $set: { status: "closed" } });
    if (result.modifiedCount) {
      closed += 1;
      await JobModerationEvent.create({
        job: job._id,
        organization: org._id,
        area: "lifecycle",
        fromStatus: "published",
        toStatus: "closed",
        actor: actorId,
        reason,
      });
    }
  }
  return closed;
};

// ---------------------------------------------------------------------------
// Recruiter: submission and resubmission
// ---------------------------------------------------------------------------

const applyCompanyDetails = (org, body, now) => {
  const set = {};
  const email = String(body.businessEmail || "").trim().toLowerCase();
  if (email !== org.businessEmail) {
    // A new address must be confirmed again; the old confirmation no longer applies.
    set.businessEmailVerifiedAt = null;
    set.businessEmailTokenHash = "";
    set.businessEmailTokenExpiresAt = null;
    set.businessEmailTokenAttempts = 0;
  }
  set.businessEmail = email;
  set.emailDomain = policy.emailDomainOf(email);
  set.website = String(body.website || "").trim();
  set.websiteHost = policy.normalizeWebsiteHost(body.website);
  set.phone = String(body.phone || "").trim();
  set.businessType = body.businessType;
  set.address = {
    street: String(body.address?.street || "").trim(),
    city: String(body.address?.city || "").trim(),
    state: String(body.address?.state || "").trim(),
    pincode: String(body.address?.pincode || "").trim(),
    country: String(body.address?.country || "").trim(),
  };
  set.registrationNumber = String(body.registrationNumber || "").trim();
  set.normalizedRegistrationNumber = policy.normalizeRegistrationNumber(body.registrationNumber);
  set.gstin = policy.normalizeGstin(body.gstin);
  set.normalizedGstin = policy.normalizeGstin(body.gstin);
  set.authorizedRepresentative = {
    name: String(body.authorizedRepresentative?.name || "").trim(),
    designation: String(body.authorizedRepresentative?.designation || "").trim(),
  };
  set.consent = { acceptedAt: now, version: CONSENT_VERSION };
  return set;
};

/**
 * Recruiter submits or resubmits company details. Allowed from pending or rejected, or while
 * changes are requested. Duplicate submissions while under review are refused.
 */
/** Tells platform admins that a company's verification needs review. Best effort; never blocks the submission. */
const notifySubmission = (org, caseId, now, { resubmitted = false } = {}) =>
  notifyAdmins({
    type: "company_verification_submitted",
    category: "companies",
    title: `${resubmitted ? "Resubmitted" : "New"} company verification: ${org.name}`,
    message: `${org.name} ${resubmitted ? "resubmitted" : "submitted"} its verification details for review.`,
    resourceType: "organization",
    resourceId: org._id,
    idempotencyKey: `verification-submitted:${caseId}:${now.toISOString()}`,
  }).catch(() => {});

const submitVerification = async ({ org, body, actor, req, now = new Date() }) => {
  if (org.verificationStatus === "verified") {
    throw fail(409, "ALREADY_VERIFIED", "This company is already verified");
  }
  if (org.verificationStatus === "suspended") {
    throw fail(409, "COMPANY_SUSPENDED", "This company is suspended. Platform review is required before resubmitting.");
  }

  const open = await findOpenCase(org._id);
  const before = org.businessEmail;
  const details = applyCompanyDetails(org, body, now);
  const emailChanged = details.businessEmail !== before;

  if (open && open.status === "under_review") {
    if (!open.changeRequest?.active) {
      throw fail(409, "ALREADY_UNDER_REVIEW", "This company is already under review");
    }
    // Resubmission after a request for changes.
    await Organization.updateOne({ _id: org._id, verificationStatus: "under_review" }, { $set: details });
    open.changeRequest = { active: false, items: [], requestedBy: null, requestedAt: null };
    open.statusHistory.push({
      from: "under_review",
      to: "under_review",
      by: actor._id,
      reason: "",
      action: "resubmitted",
      at: now,
    });
    if (emailChanged) {
      open.evidence.push({
        type: "business_email",
        value: emailSignature({ businessEmail: details.businessEmail }),
        source: "resubmission",
        method: "system_rule",
        result: "not_checked",
        note: "Business email changed on resubmission. Confirm the new address.",
        verified: false,
        recordedBy: actor._id,
        recordedAt: now,
      });
    }
    await open.save();
    const freshOrg = await Organization.findById(org._id);
    const { checklist } = await refreshAssessment(open, freshOrg, { now });
    await auditEvent(req, org, "organization.verification_resubmitted", {
      caseId: String(open._id),
      missing: checklist.missing,
    });
    await notifySubmission(org, open._id, now, { resubmitted: true });
    return { case: open, org: freshOrg };
  }

  if (open && open.status !== "under_review") {
    throw fail(409, "ALREADY_UNDER_REVIEW", "This company already has an open verification case");
  }

  // New case. Legacy under_review companies without a case get one that matches their status.
  if (org.verificationStatus === "under_review") {
    await Organization.updateOne({ _id: org._id, verificationStatus: "under_review" }, { $set: details });
    const legacy = new CompanyVerificationCase({
      organization: org._id,
      status: "under_review",
      openedBy: actor._id,
      statusHistory: [{ from: "under_review", to: "under_review", by: actor._id, action: "legacy_import", at: now }],
    });
    await legacy.save();
    const freshOrg = await Organization.findById(org._id);
    await refreshAssessment(legacy, freshOrg, { now });
    await auditEvent(req, org, "organization.verification_submitted", { caseId: String(legacy._id) });
    await notifySubmission(org, legacy._id, now);
    return { case: legacy, org: freshOrg };
  }

  // pending or rejected -> under_review. Organization first (conditional), then the new case.
  assertTransition("companyVerification", org.verificationStatus, "under_review");
  const from = org.verificationStatus;
  const orgResult = await Organization.updateOne(
    { _id: org._id, verificationStatus: from },
    { $set: { ...details, verificationStatus: "under_review" } },
  );
  if (!orgResult.matchedCount) {
    throw fail(409, "STATUS_CHANGED", "The company status changed. Reload and try again.");
  }

  const caseDoc = new CompanyVerificationCase({
    organization: org._id,
    status: "under_review",
    openedBy: actor._id,
    statusHistory: [{ from, to: "under_review", by: actor._id, action: "submitted", at: now }],
  });
  try {
    await caseDoc.save();
  } catch (error) {
    await Organization.updateOne(
      { _id: org._id, verificationStatus: "under_review" },
      { $set: { verificationStatus: from } },
    );
    if (error.code === 11000) {
      throw fail(409, "ALREADY_UNDER_REVIEW", "This company already has an open verification case");
    }
    throw error;
  }

  const freshOrg = await Organization.findById(org._id);
  await refreshAssessment(caseDoc, freshOrg, { now });
  await auditEvent(req, org, "organization.verification_submitted", {
    caseId: String(caseDoc._id),
    previousStatus: from,
  });
  await notifySubmission(org, caseDoc._id, now);
  return { case: caseDoc, org: freshOrg };
};

/** Re-derives the open case (if any) after the organization's details changed. Never decides. */
const refreshOpenCase = async (org) => {
  const open = await findOpenCase(org._id);
  if (!open) return null;
  return refreshAssessment(open, await Organization.findById(org._id));
};

/** Ensures there is a case to act on for an organization (used by the legacy admin endpoints). */
const ensureCurrentCase = async (org, actor) => {
  const current = await findCurrentCase(org._id);
  if (current) return current;
  if (org.verificationStatus === "verified") {
    // A verified case must carry passing evidence. Companies verified before cases existed have none,
    // so no case is invented for them. Their status changes wait for the backfill decision.
    throw fail(
      409,
      "VERIFICATION_CASE_MISSING",
      "This company was verified before verification records existed. Run the verification backfill before changing its status.",
    );
  }
  const status = ["pending", "under_review", "rejected", "suspended"].includes(org.verificationStatus)
    ? org.verificationStatus
    : "pending";
  const reason = org.rejectionReason || "Imported from the previous verification records";
  const caseDoc = new CompanyVerificationCase({
    organization: org._id,
    status,
    openedBy: actor?._id || null,
    statusHistory: [{ from: status, to: status, by: actor?._id || null, action: "legacy_import", at: new Date() }],
    ...(status === "rejected" || status === "suspended" ? { decision: { by: null, at: new Date(), reason } } : {}),
  });
  await caseDoc.save();
  return caseDoc;
};

// ---------------------------------------------------------------------------
// Recruiter: one-time code for the business email, and documents
// ---------------------------------------------------------------------------

const sendBusinessEmailCode = async ({ org, actor, req, now = new Date() }) => {
  if (!org.businessEmail) {
    throw fail(422, "BUSINESS_EMAIL_REQUIRED", "Add a business email address first");
  }
  const domain = policy.emailDomainOf(org.businessEmail);
  if (rules.FREE_WEBMAIL_DOMAINS.has(domain)) {
    throw fail(422, "CORPORATE_EMAIL_REQUIRED", "Use an email address on the company's own domain");
  }
  if (org.businessEmailVerifiedAt) {
    throw fail(409, "ALREADY_VERIFIED", "The business email is already confirmed");
  }
  const current = await Organization.findById(org._id).select("+businessEmailTokenSentAt").lean();
  const cooldownMs = rules.BUSINESS_EMAIL_TOKEN.resendCooldownSeconds * 1000;
  if (current?.businessEmailTokenSentAt && now - current.businessEmailTokenSentAt < cooldownMs) {
    throw fail(429, "TOO_SOON", "Wait a minute before requesting another code");
  }

  // The code is random, shown once in the email, and only its hash is stored.
  const code = crypto.randomBytes(18).toString("base64url");
  const expiresAt = new Date(now.getTime() + rules.BUSINESS_EMAIL_TOKEN.ttlMinutes * 60 * 1000);
  await Organization.updateOne(
    { _id: org._id },
    {
      $set: {
        businessEmailTokenHash: sha256Hex(code),
        businessEmailTokenExpiresAt: expiresAt,
        businessEmailTokenAttempts: 0,
        businessEmailTokenSentAt: now,
      },
    },
  );
  await emailService.sendMail({
    to: org.businessEmail,
    subject: "Confirm your company email for HireSmart",
    text:
      `Your confirmation code is: ${code}\n\n` +
      `It expires in ${rules.BUSINESS_EMAIL_TOKEN.ttlMinutes} minutes. ` +
      "If you did not ask for this, you can ignore this email.",
  });
  await auditEvent(req, org, "organization.business_email_code_sent", {
    recipient: maskEmail(org.businessEmail),
    actor: String(actor._id),
  });
  return { sentTo: maskEmail(org.businessEmail), expiresAt };
};

const confirmBusinessEmailCode = async ({ org, actor, req, code, now = new Date() }) => {
  if (org.businessEmailVerifiedAt) return { alreadyVerified: true, verifiedAt: org.businessEmailVerifiedAt };
  const current = await Organization.findById(org._id)
    .select("+businessEmailTokenHash +businessEmailTokenExpiresAt +businessEmailTokenAttempts")
    .lean();
  if (!current?.businessEmailTokenHash || !current.businessEmailTokenExpiresAt || current.businessEmailTokenExpiresAt < now) {
    throw fail(409, "CODE_EXPIRED", "No valid code. Request a new one.");
  }
  if ((current.businessEmailTokenAttempts || 0) >= rules.BUSINESS_EMAIL_TOKEN.maxAttempts) {
    throw fail(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes. Request a new one.");
  }

  const expected = Buffer.from(current.businessEmailTokenHash, "hex");
  const given = Buffer.from(sha256Hex(String(code)), "hex");
  const matches = expected.length === given.length && crypto.timingSafeEqual(expected, given);
  if (!matches) {
    await Organization.updateOne({ _id: org._id }, { $inc: { businessEmailTokenAttempts: 1 } });
    throw fail(422, "INVALID_CODE", "The code is not correct");
  }

  // Single use: only the request holding the stored hash can consume it.
  const consumed = await Organization.updateOne(
    { _id: org._id, businessEmailTokenHash: current.businessEmailTokenHash, businessEmailVerifiedAt: null },
    {
      $set: { businessEmailVerifiedAt: now },
      $unset: { businessEmailTokenHash: "", businessEmailTokenExpiresAt: "", businessEmailTokenAttempts: "", businessEmailTokenSentAt: "" },
    },
  );
  if (!consumed.matchedCount) {
    throw fail(409, "CODE_EXPIRED", "No valid code. Request a new one.");
  }

  const open = await findOpenCase(org._id);
  if (open) {
    open.evidence.push({
      type: "business_email",
      value: emailSignature(org),
      source: "one-time code",
      method: "email_token",
      result: "match",
      note: "The address owner confirmed the one-time code.",
      verified: true,
      recordedBy: actor._id,
      recordedAt: now,
    });
    await open.save();
    await refreshAssessment(open, await Organization.findById(org._id), { now });
  }
  await auditEvent(req, org, "organization.business_email_confirmed", { actor: String(actor._id) });
  return { verifiedAt: now };
};

const addDocument = async ({ org, actor, req, file, documentType, now = new Date() }) => {
  if (!rules.DOCUMENT_TYPES.includes(documentType)) {
    throw fail(422, "VALIDATION_ERROR", "Choose a valid document type");
  }
  if (org.documents.length >= rules.DOCUMENT_LIMITS.maxPerOrganization) {
    throw fail(409, "DOCUMENT_LIMIT", "This company already has the maximum number of documents");
  }
  const { mime } = policy.validateDocumentContent(file.buffer, file.mimetype);
  await scan(file.buffer);

  const storageKey = `${crypto.randomUUID()}.bin`;
  fs.mkdirSync(DOCUMENT_DIRECTORY, { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(path.join(DOCUMENT_DIRECTORY, storageKey), file.buffer, { mode: 0o600 });

  const _id = new mongoose.Types.ObjectId();
  const doc = {
    _id,
    type: documentType,
    fileName: policy.sanitizeFileName(file.originalname),
    mimeType: mime,
    size: file.buffer.length,
    sha256: sha256Hex(file.buffer),
    storageKey,
    uploadedBy: actor._id,
    uploadedAt: now,
  };
  const pushed = await Organization.updateOne(
    {
      _id: org._id,
      $expr: { $lt: [{ $size: { $ifNull: ["$documents", []] } }, rules.DOCUMENT_LIMITS.maxPerOrganization] },
    },
    { $push: { documents: doc } },
  );
  if (!pushed.matchedCount) {
    await fs.promises.unlink(path.join(DOCUMENT_DIRECTORY, storageKey)).catch(() => {});
    throw fail(409, "DOCUMENT_LIMIT", "This company already has the maximum number of documents");
  }
  await auditEvent(req, org, "organization.document_uploaded", {
    documentId: String(_id),
    type: documentType,
    size: doc.size,
    mimeType: mime,
  });
  return documentView(doc);
};

/** Admin-only read of a stored document. Verifies the stored hash before returning bytes. */
const readDocument = async (documentId) => {
  if (!mongoose.isValidObjectId(documentId)) throw fail(404, "RESOURCE_NOT_FOUND", "Document not found");
  const org = await Organization.findOne({ "documents._id": documentId }, { documents: 1 }).lean();
  const doc = org?.documents?.find((item) => String(item._id) === String(documentId));
  if (!doc || !doc.storageKey) throw fail(404, "RESOURCE_NOT_FOUND", "Document not found");
  const buffer = await fs.promises.readFile(path.join(DOCUMENT_DIRECTORY, path.basename(doc.storageKey)));
  if (sha256Hex(buffer) !== doc.sha256) {
    throw fail(500, "DOCUMENT_INTEGRITY_FAILED", "The stored document failed its integrity check");
  }
  return { buffer, mimeType: doc.mimeType, fileName: doc.fileName };
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** What a recruiter may see: their own status and reasons, never internal evidence or risk. */
const recruiterView = async (org) => {
  const current = await findCurrentCase(org._id);
  return {
    organization: publicOrganization(org),
    businessEmailVerified: Boolean(org.businessEmailVerifiedAt),
    documents: (org.documents || []).map(documentView),
    case: current
      ? {
          id: String(current._id),
          status: current.status,
          submittedAt: current.createdAt,
          changeRequest: current.changeRequest?.active
            ? { items: current.changeRequest.items, requestedAt: current.changeRequest.requestedAt }
            : null,
          decisionReason:
            ["rejected", "suspended"].includes(current.status) ? current.decision?.reason || "" : "",
          pendingChecks: current.readiness?.missing || [],
          manualVerificationRequired: (current.readiness?.missing || []).length > 0,
        }
      : null,
  };
};

const caseSummary = (caseDoc) => ({
  id: String(caseDoc._id),
  status: caseDoc.status,
  assessment: caseDoc.assessment,
  submittedAt: caseDoc.createdAt,
  updatedAt: caseDoc.updatedAt,
  risk: {
    level: caseDoc.risk?.level || "low",
    score: caseDoc.risk?.score || 0,
    requiresManualReview: Boolean(caseDoc.risk?.requiresManualReview),
  },
  missing: caseDoc.readiness?.missing || [],
  blockers: caseDoc.readiness?.blockers || [],
  duplicateCount: caseDoc.duplicateCandidates?.length || 0,
  changeRequestActive: Boolean(caseDoc.changeRequest?.active),
});

/** Admin: the list for the review queue. Filters are applied on stored, refreshed fields. */
const listCases = async ({ status, risk, missingEvidence, duplicateReview, page = 1, limit = 25 }) => {
  const filter = {};
  if (status && status !== "all") filter.status = status;
  if (risk === "elevated") filter["risk.level"] = { $in: ["medium", "high"] };
  if (missingEvidence) filter["readiness.missing.0"] = { $exists: true };
  if (duplicateReview) filter["duplicateCandidates.0"] = { $exists: true };
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const [items, total] = await Promise.all([
    CompanyVerificationCase.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("organization", "name verificationStatus businessType")
      .lean(),
    CompanyVerificationCase.countDocuments(filter),
  ]);
  return {
    items: items.map((item) => ({
      ...caseSummary(item),
      organization: item.organization
        ? {
            id: String(item.organization._id),
            name: item.organization.name,
            verificationStatus: item.organization.verificationStatus,
            businessType: item.organization.businessType,
          }
        : null,
    })),
    meta: { page: safePage, limit: safeLimit, total },
  };
};

/** Admin: the full case for review. Includes evidence, risk explanations and related records. */
const caseDetail = async (caseId) => {
  const { caseDoc, org } = await loadCase(caseId);
  const [jobs, jobEvents, duplicates] = await Promise.all([
    Job.find({ organization: org._id }).select("title status moderation.status createdAt").sort({ createdAt: -1 }).limit(50).lean(),
    JobModerationEvent.find({ organization: org._id }).sort({ createdAt: -1 }).limit(50).lean(),
    Organization.find({ _id: { $in: caseDoc.duplicateCandidates.map((c) => c.organization) } })
      .select("name verificationStatus")
      .lean(),
  ]);
  const duplicateById = new Map(duplicates.map((d) => [String(d._id), d]));
  return {
    case: {
      ...caseSummary(caseDoc),
      decision: caseDoc.decision,
      changeRequest: caseDoc.changeRequest,
      recommendedNextAction: policy.recommendNextAction({
        caseStatus: caseDoc.status,
        checklist: { blockers: caseDoc.readiness?.blockers || [], missing: caseDoc.readiness?.missing || [] },
        risk: { requiresManualReview: Boolean(caseDoc.risk?.requiresManualReview) },
      }),
      manualVerificationRequired: (caseDoc.readiness?.missing || []).length > 0,
      riskDisclaimer: RISK_DISCLAIMER,
      riskIndicators: caseDoc.risk?.indicators || [],
      evidence: caseDoc.evidence,
      statusHistory: caseDoc.statusHistory,
      duplicateCandidates: caseDoc.duplicateCandidates.map((c) => {
        const other = duplicateById.get(String(c.organization));
        return {
          organization: { id: String(c.organization), name: other?.name || "", verificationStatus: other?.verificationStatus || "" },
          reasons: c.reasons,
        };
      }),
    },
    organization: publicOrganization(org),
    documents: (org.documents || []).map(documentView),
    jobs: {
      counts: jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {}),
      items: jobs.slice(0, 50).map((job) => ({
        id: String(job._id),
        title: job.title,
        status: job.status,
        moderationStatus: job.moderation?.status || "none",
        createdAt: job.createdAt,
      })),
    },
    moderationHistory: jobEvents.map((event) => ({
      job: String(event.job),
      area: event.area,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reason: event.reason,
      createdAt: event.createdAt,
    })),
  };
};

// ---------------------------------------------------------------------------
// Admin: checks and decisions
// ---------------------------------------------------------------------------

const requireOpenCase = (caseDoc) => {
  if (!OPEN_STATUSES.includes(caseDoc.status)) {
    throw fail(409, "CASE_CLOSED", "This case is closed. Checks can only be recorded on open cases.");
  }
};

const recordManualCheck = async ({ caseId, actor, req, body, now = new Date() }) => {
  const { caseDoc, org } = await loadCase(caseId);
  requireOpenCase(caseDoc);
  await assertIndependentReviewer(org, actor);
  if (body.type === "business_email") {
    throw fail(422, "CHECK_NOT_MANUAL", "Business email is confirmed only with the company's one-time code");
  }
  const note = String(body.note || "").trim();
  if (note.length < 10) {
    throw fail(422, "MISSING_NOTE", "Describe what you checked (at least 10 characters)");
  }

  let value = "";
  if (body.type === "business_registration") value = identitySignature(org);
  if (body.type === "duplicate_review") {
    const { duplicateRegistration, duplicateProfile } = await fraud.gatherRiskFacts(org, { now });
    value = candidateSignature([...duplicateRegistration, ...duplicateProfile].map((o) => ({ organization: o._id })));
  }

  caseDoc.evidence.push({
    type: body.type,
    value,
    source: "manual review",
    method: "manual_review",
    result: body.result,
    note,
    verified: body.result === "match",
    recordedBy: actor._id,
    recordedAt: now,
  });
  await caseDoc.save();
  const { checklist } = await refreshAssessment(caseDoc, org, { now });
  await auditEvent(req, org, "company_verification.check_recorded", {
    caseId: String(caseDoc._id),
    type: body.type,
    result: body.result,
    method: "manual_review",
  });
  return { missing: checklist.missing, blockers: checklist.blockers, assessment: checklist.assessment };
};

/** Runs the configured registry lookup. An unconfigured or failed lookup is recorded as unavailable. */
const runRegistryCheck = async ({ caseId, actor, req, now = new Date() }) => {
  const { caseDoc, org } = await loadCase(caseId);
  requireOpenCase(caseDoc);
  await assertIndependentReviewer(org, actor);
  const registrationNumber = policy.normalizeRegistrationNumber(org.registrationNumber);
  const gstin = policy.normalizeGstin(org.gstin);
  if (!registrationNumber && !gstin) {
    throw fail(
      422,
      "NO_REGISTRATION_IDENTIFIER",
      "This company has no registration number or GSTIN. Record a manual review of the uploaded documents instead.",
    );
  }

  const answer = await registry.lookupRegistry({
    registrationNumber,
    gstin,
    legalName: org.name,
    country: org.address?.country || "",
  });

  let result;
  let note;
  if (answer.status === "found") {
    result = policy.namesMatch(answer.legalName, org.name) ? "match" : "mismatch";
    note = result === "match" ? "Registry legal name matches the submitted name." : "Registry legal name differs from the submitted name.";
  } else if (answer.status === "not_found") {
    result = "mismatch";
    note = "The registry did not find the submitted identifier.";
  } else {
    result = "unavailable";
    note = `${policy.MANUAL_VERIFICATION_REQUIRED}. ${answer.reason || "The registry is unavailable."}`;
  }

  caseDoc.evidence.push({
    type: "business_registration",
    value: identitySignature(org),
    source: answer.status === "unavailable" ? "registry (unavailable)" : "external registry",
    method: answer.status === "unavailable" ? "system_rule" : "external_registry",
    result,
    note,
    verified: result === "match",
    recordedBy: actor._id,
    recordedAt: now,
  });
  await caseDoc.save();
  const { checklist } = await refreshAssessment(caseDoc, org, { now });
  await auditEvent(req, org, "company_verification.registry_checked", {
    caseId: String(caseDoc._id),
    result,
    registryStatus: answer.status,
  });
  return { result, registryStatus: answer.status, note, missing: checklist.missing };
};

const requestChanges = async ({ caseId, actor, req, items, now = new Date() }) => {
  const { caseDoc, org } = await loadCase(caseId);
  if (caseDoc.status !== "under_review") {
    throw fail(409, "INVALID_TRANSITION", "Changes can only be requested while the company is under review");
  }
  const cleaned = (items || []).map((item) => String(item).trim()).filter(Boolean);
  if (!cleaned.length) throw fail(422, "MISSING_NOTES", "List at least one change the company must make");
  await assertIndependentReviewer(org, actor);

  caseDoc.changeRequest = { active: true, items: cleaned, requestedBy: actor._id, requestedAt: now };
  caseDoc.statusHistory.push({
    from: "under_review",
    to: "under_review",
    by: actor._id,
    reason: cleaned.join("; ").slice(0, 1000),
    action: "changes_requested",
    at: now,
  });
  await caseDoc.save();
  await Organization.updateOne({ _id: org._id, verificationStatus: "under_review" }, { $set: { verificationNotes: cleaned.join("\n").slice(0, 5000) } });
  await notifyOwner(org, {
    title: "Additional information required for verification",
    message: `The verification team requested changes: ${cleaned.join("; ")}`,
  });
  await auditEvent(req, org, "admin.organization_more_info_requested", {
    caseId: String(caseDoc._id),
    items: cleaned,
  });
  return { status: caseDoc.status, changeRequest: caseDoc.changeRequest };
};

const approveCase = async ({ caseId, actor, req, notes = "", now = new Date() }) => {
  const { caseDoc, org } = await loadCase(caseId);
  if (org.verificationStatus === "verified") throw fail(409, "ALREADY_VERIFIED", "This company is already verified");
  await assertIndependentReviewer(org, actor);
  if (caseDoc.changeRequest?.active) {
    throw fail(409, "CHANGES_PENDING", "The company has been asked for changes and has not resubmitted yet");
  }
  if (caseDoc.status === "pending") {
    // Pending cases are reviewed before any decision. The state machine has no pending -> verified step.
    await moveStatus({
      caseDoc,
      org,
      to: "under_review",
      actorId: actor._id,
      reason: "Review started",
      action: "review_started",
    });
  }
  const freshCase = await CompanyVerificationCase.findById(caseDoc._id);
  const { checklist } = await refreshAssessment(freshCase, await Organization.findById(org._id), { now });
  if (checklist.blockers.length || checklist.missing.length) {
    throw fail(409, "VERIFICATION_REQUIREMENTS_NOT_MET", "Required evidence is missing or blocking", [
      ...checklist.blockers.map((type) => ({ path: type, code: "blocking", message: `${type} is ${checklist.current[type].result}` })),
      ...checklist.missing
        .filter((type) => !checklist.blockers.includes(type))
        .map((type) => ({ path: type, code: "missing", message: `${type} has no passing record yet` })),
    ]);
  }

  const reviewNotes = String(notes || "").trim().slice(0, 5000);
  await moveStatus({
    caseDoc: await CompanyVerificationCase.findById(caseDoc._id),
    org: await Organization.findById(org._id),
    to: "verified",
    actorId: actor._id,
    reason: reviewNotes,
    action: "approved",
    caseSet: {
      assessment: "verified_evidence",
      decision: { by: actor._id, at: now, reason: reviewNotes },
    },
    orgSet: { verifiedAt: now, verifiedBy: actor._id, verificationNotes: reviewNotes, rejectionReason: "" },
  });
  await notifyOwner(org, {
    title: "Company verified",
    message: `${org.name} has been verified by platform administrators. You can now publish jobs and receive applications.`,
  });
  await auditEvent(req, org, "admin.organization_verified", { caseId: String(caseId), notes: reviewNotes });
  return { status: "verified" };
};

const rejectCase = async ({ caseId, actor, req, reason, now = new Date() }) => {
  const text = String(reason || "").trim().slice(0, 2000);
  if (!text) throw fail(422, "MISSING_REASON", "A rejection reason is required");
  const { caseDoc, org } = await loadCase(caseId);
  await assertIndependentReviewer(org, actor);
  await moveStatus({
    caseDoc,
    org,
    to: "rejected",
    actorId: actor._id,
    reason: text,
    action: "rejected",
    caseSet: { decision: { by: actor._id, at: now, reason: text }, changeRequest: { active: false, items: [], requestedBy: null, requestedAt: null } },
    orgSet: { rejectionReason: text },
  });
  const closed = await restrictActiveListings(org, actor._id, "company_rejected");
  await notifyOwner(org, {
    title: "Company verification not approved",
    message: `Your company verification was not approved. Reason: ${text}. You can update your details and resubmit.`,
  });
  await auditEvent(req, org, "admin.organization_rejected", { caseId: String(caseId), reason: text, listingsClosed: closed });
  return { status: "rejected", listingsClosed: closed };
};

const suspendCase = async ({ caseId, actor, req, reason, now = new Date() }) => {
  const text = String(reason || "").trim().slice(0, 2000) || "Suspended by platform administrator";
  const { caseDoc, org } = await loadCase(caseId);
  await assertIndependentReviewer(org, actor);
  await moveStatus({
    caseDoc,
    org,
    to: "suspended",
    actorId: actor._id,
    reason: text,
    action: "suspended",
    caseSet: { decision: { by: actor._id, at: now, reason: text } },
    orgSet: { rejectionReason: text },
  });
  const closed = await restrictActiveListings(org, actor._id, "company_suspended");
  await notifyOwner(org, {
    title: "Company suspended",
    message: `${org.name} has been suspended and its live job postings were closed. Reason: ${text}.`,
  });
  await auditEvent(req, org, "admin.organization_suspended", { caseId: String(caseId), reason: text, listingsClosed: closed });
  return { status: "suspended", listingsClosed: closed };
};

const restoreCase = async ({ caseId, actor, req, reason, now = new Date() }) => {
  const text = String(reason || "").trim().slice(0, 2000) || "Reinstated after review";
  const { caseDoc, org } = await loadCase(caseId);
  await assertIndependentReviewer(org, actor);
  const { checklist } = await refreshAssessment(caseDoc, org, { now });
  if (checklist.blockers.length || checklist.missing.length) {
    throw fail(409, "VERIFICATION_REQUIREMENTS_NOT_MET", "Restoring requires every required check to pass again", [
      ...checklist.blockers.map((type) => ({ path: type, code: "blocking", message: `${type} is ${checklist.current[type].result}` })),
      ...checklist.missing.map((type) => ({ path: type, code: "missing", message: `${type} has no passing record` })),
    ]);
  }
  await moveStatus({
    caseDoc: await CompanyVerificationCase.findById(caseDoc._id),
    org: await Organization.findById(org._id),
    to: "verified",
    actorId: actor._id,
    reason: text,
    action: "restored",
    caseSet: { assessment: "verified_evidence", decision: { by: actor._id, at: now, reason: text } },
    orgSet: { verifiedAt: now, verifiedBy: actor._id, rejectionReason: "" },
  });
  // Closed listings are not reopened automatically. Each one needs a new decision.
  const stillClosed = await Job.countDocuments({ organization: org._id, status: "closed" });
  await notifyOwner(org, {
    title: "Company reinstated",
    message: `${org.name} has been reinstated after review. Closed job postings must be published again.`,
  });
  await auditEvent(req, org, "admin.organization_reactivated", { caseId: String(caseId), reason: text, listingsStillClosed: stillClosed });
  return { status: "verified", listingsStillClosed: stillClosed };
};

module.exports = {
  CONSENT_VERSION,
  publicOrganization,
  documentView,
  findCurrentCase,
  ensureCurrentCase,
  refreshOpenCase,
  normalizeWebsiteHost: policy.normalizeWebsiteHost,
  submitVerification,
  sendBusinessEmailCode,
  confirmBusinessEmailCode,
  addDocument,
  readDocument,
  recruiterView,
  listCases,
  caseDetail,
  recordManualCheck,
  runRegistryCheck,
  requestChanges,
  approveCase,
  rejectCase,
  suspendCase,
  restoreCase,
  loadCase,
  refreshAssessment,
};
