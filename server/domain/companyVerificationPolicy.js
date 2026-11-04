// Pure company-verification policy (Phase 2). No database or network access in this file, so it
// can be unit-tested without MongoDB. Persistence lives in services/companyVerificationService.js.

const path = require("node:path");
const AppError = require("../utils/AppError");
const {
  FREE_WEBMAIL_DOMAINS,
  RISK_BANDS,
  RISK_RULES,
  RISK_DISCLAIMER,
  POSTING_RULES,
  CHECK_TYPES,
  REQUIRED_CHECKS,
  DOCUMENT_LIMITS,
} = require("./verificationRules");

/** Checks whose mismatch or concern blocks a decision to verify. */
const BLOCKING_CHECKS = Object.freeze([
  "business_registration",
  "business_identity",
  "business_email",
  "recruiter_identity",
  "duplicate_review",
  "enforcement_history",
]);

/** Shown to recruiters and reviewers when no automatic source could answer. */
const MANUAL_VERIFICATION_REQUIRED = "Manual verification required";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const normalizeRegistrationNumber = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");

const normalizeGstin = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/\s/g, "");

const isValidGstin = (value) => GSTIN_REGEX.test(normalizeGstin(value));

const emailDomainOf = (email) => {
  const text = String(email || "")
    .trim()
    .toLowerCase();
  const at = text.lastIndexOf("@");
  return at >= 0 ? text.slice(at + 1) : "";
};

const isWebmailDomain = (domain) => FREE_WEBMAIL_DOMAINS.has(domain);

/** Returns the bare host of a website (no scheme, no leading "www."), or "" when invalid. */
const normalizeWebsiteHost = (value) => {
  let text = String(value || "").trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const LEGAL_SUFFIXES = new Set([
  "pvt",
  "private",
  "ltd",
  "limited",
  "llp",
  "inc",
  "llc",
  "co",
  "company",
  "corp",
  "corporation",
  "opc",
  "the",
]);

/** Lower-cases, strips punctuation and legal suffixes so "Acme Pvt. Ltd." equals "ACME". */
const normalizeCompanyName = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && !LEGAL_SUFFIXES.has(word))
    .join(" ");

const namesMatch = (a, b) => {
  const left = normalizeCompanyName(a);
  return left.length > 0 && left === normalizeCompanyName(b);
};

/** Sanitises an uploaded file name for storage metadata and download headers. */
const sanitizeFileName = (name) => {
  const base = path
    .basename(String(name || ""))
    .replace(/[\u0000-\u001f\u007f"\\;]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DOCUMENT_LIMITS.maxFileNameLength);
  return base || "document";
};

// ---------------------------------------------------------------------------
// Checklist (Requirement 1, section B). Latest recorded result per check type wins.
// System defaults fill checks that have no recorded result. They never override a record.
// ---------------------------------------------------------------------------

/**
 * @param {{ records?: Array<{type,result,method,recordedAt}>, defaults?: Object }} input
 */
const summarizeChecklist = ({ records = [], defaults = {} } = {}) => {
  const ordered = [...records].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  const latest = new Map();
  for (const record of ordered) latest.set(record.type, record);

  const current = {};
  for (const type of CHECK_TYPES) {
    const record = latest.get(type);
    if (record) {
      current[type] = { result: record.result, method: record.method, source: "recorded" };
    } else if (defaults[type]) {
      current[type] = { ...defaults[type], source: "system" };
    } else {
      current[type] = { result: "not_checked", method: null, source: "none" };
    }
  }

  const missing = REQUIRED_CHECKS.filter((type) => current[type].result !== "match");
  const blockers = BLOCKING_CHECKS.filter((type) =>
    ["mismatch", "concern"].includes(current[type].result),
  );

  let assessment;
  if (blockers.some((type) => current[type].result === "mismatch")) assessment = "mismatch";
  else if (blockers.length) assessment = "suspicious_indicators";
  else if (missing.length === 0) assessment = "verified_evidence";
  else if (missing.some((type) => current[type].result === "unavailable"))
    assessment = "unavailable_evidence";
  else assessment = "manual_review";

  return { current, missing, blockers, assessment };
};

// ---------------------------------------------------------------------------
// Risk indicators (Requirement 1, section D). Explainable, configurable, never proof.
// ---------------------------------------------------------------------------

const scoreToLevel = (score) => {
  if (score >= RISK_BANDS.highFrom) return "high";
  if (score >= RISK_BANDS.mediumFrom) return "medium";
  return "low";
};

const EXPLANATIONS = Object.freeze({
  NO_BUSINESS_EMAIL: () => "No business email address was provided.",
  FREE_WEBMAIL_DOMAIN: (f) =>
    `The business email uses a public webmail domain (${f.emailDomain}). This is a common indicator, not proof either way.`,
  BUSINESS_EMAIL_NOT_VERIFIED: () =>
    "The business email address has not been confirmed by a one-time code yet.",
  WEBSITE_DOMAIN_MISMATCH: (f) =>
    `The website (${f.websiteHost}) does not match the business email domain (${f.emailDomain}). Check whether they belong to the same company.`,
  MISSING_WEBSITE: () =>
    "No website was provided. Many legitimate companies have no website, so this is informational only.",
  INVALID_GSTIN_FORMAT: () =>
    "The GSTIN does not match the standard 15-character format. Confirm the number against the source document.",
  MISSING_REGISTRATION_IDENTIFIER: () =>
    "No GSTIN or registration number was provided. Not every business has one, so this is informational only.",
  MISSING_VERIFICATION_DOCS: () => "No supporting documents have been uploaded yet.",
  DUPLICATE_REGISTRATION: (f) =>
    `${f.duplicates.registration} other company profile(s) share this registration identifier. Review before deciding.`,
  DUPLICATE_PROFILE_OVERLAP: (f) =>
    `${f.duplicates.profile} other company profile(s) share the website or business email domain. This may be legitimate (for example, group companies).`,
  REGISTRATION_MISMATCH: () =>
    "The registry lookup did not match the submitted company name or registration number.",
  RECRUITER_IDENTITY_PENDING: () =>
    "The recruiter's account email has not been verified yet.",
  PREVIOUS_ENFORCEMENT: (f) =>
    `${f.previousEnforcementCount} related company profile(s) were previously rejected or suspended. Review the reasons.`,
  REPEATED_JOB_POLICY_REJECTIONS: (f) =>
    `${f.rejectedJobCount} job postings were rejected by moderation.`,
  SUSPICIOUS_PAYMENT_DEMAND: (f) =>
    `A job description mentions an upfront candidate payment (“${f.paymentDemandKeyword}”). Review the posting.`,
  DUPLICATE_JOB_POSTINGS: () =>
    "Several job postings share the same title. This may be legitimate hiring.",
  UNREALISTIC_SALARY_CLAIMS: () =>
    "One or more postings advertise a salary far above typical levels for their stated experience.",
  UNUSUAL_POSTING_VOLUME: (f) =>
    `${f.recentJobCount} job postings were created in the last ${POSTING_RULES.recentWindowHours} hours.`,
});

/**
 * Computes explainable indicators from already-gathered facts.
 * @param {object} facts See the field list in companyVerificationService.gatherRiskFacts.
 */
const computeRisk = (facts) => {
  const indicators = [];
  const add = (code, when) => {
    if (!when) return;
    const rule = RISK_RULES[code];
    indicators.push({
      code,
      severity: rule.severity,
      weight: rule.weight,
      explanation: EXPLANATIONS[code](facts),
    });
  };

  add("NO_BUSINESS_EMAIL", !facts.businessEmail);
  add("FREE_WEBMAIL_DOMAIN", Boolean(facts.businessEmail) && facts.isWebmail);
  add(
    "BUSINESS_EMAIL_NOT_VERIFIED",
    Boolean(facts.businessEmail) && !facts.businessEmailVerified,
  );
  add("WEBSITE_DOMAIN_MISMATCH", Boolean(facts.websiteEmailMismatch));
  add("MISSING_WEBSITE", !facts.websiteHost);
  add("INVALID_GSTIN_FORMAT", Boolean(facts.gstin) && !facts.gstinValid);
  add("MISSING_REGISTRATION_IDENTIFIER", !facts.gstin && !facts.registrationNumber);
  add("MISSING_VERIFICATION_DOCS", facts.documentCount === 0);
  add("DUPLICATE_REGISTRATION", facts.duplicates.registration > 0);
  add("DUPLICATE_PROFILE_OVERLAP", facts.duplicates.profile > 0);
  add("REGISTRATION_MISMATCH", Boolean(facts.registrationMismatch));
  add("RECRUITER_IDENTITY_PENDING", !facts.recruiterEmailVerified);
  add("PREVIOUS_ENFORCEMENT", facts.previousEnforcementCount > 0);
  add(
    "REPEATED_JOB_POLICY_REJECTIONS",
    facts.rejectedJobCount >= POSTING_RULES.repeatedRejectionsFrom,
  );
  add("SUSPICIOUS_PAYMENT_DEMAND", Boolean(facts.paymentDemandKeyword));
  add("DUPLICATE_JOB_POSTINGS", Boolean(facts.duplicateJobTitles));
  add("UNREALISTIC_SALARY_CLAIMS", Boolean(facts.unrealisticSalary));
  add("UNUSUAL_POSTING_VOLUME", facts.recentJobCount > POSTING_RULES.maxJobsInWindow);

  const score = Math.min(
    100,
    indicators.reduce((sum, indicator) => sum + indicator.weight, 0),
  );
  const level = scoreToLevel(score);
  return {
    score,
    level,
    indicators,
    // Elevated risk or any high-severity indicator sends the case to manual review.
    // Nothing in this function restricts or bans a company.
    requiresManualReview: level !== "low" || indicators.some((i) => i.severity === "high"),
    disclaimer: RISK_DISCLAIMER,
  };
};

/** Human-readable next step for the admin dashboard. Never a decision on its own. */
const recommendNextAction = ({ caseStatus, checklist, risk }) => {
  if (caseStatus === "suspended")
    return "Review the suspension reason and the evidence before any restore decision.";
  if (checklist.blockers.length)
    return `Resolve blocking checks before any decision: ${checklist.blockers.join(", ")}.`;
  if (checklist.missing.length)
    return `Record the outstanding checks (${checklist.missing.join(", ")}). Until then the status reads: ${MANUAL_VERIFICATION_REQUIRED}.`;
  if (risk.requiresManualReview)
    return "All required checks passed. Review the elevated-risk indicators manually before approving.";
  return "All required checks passed. An authorized reviewer may approve.";
};

// ---------------------------------------------------------------------------
// Documents (Requirement 1, "Protect uploaded documents"). Content is checked, not just the name.
// ---------------------------------------------------------------------------

const SIGNATURES = Object.freeze([
  {
    mime: "application/pdf",
    extension: ".pdf",
    matches: (b) => b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-",
  },
  {
    mime: "image/png",
    extension: ".png",
    matches: (b) =>
      b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/jpeg",
    extension: ".jpg",
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
]);

const ACTIVE_PDF_MARKERS = ["/JavaScript", "/Launch"];

/**
 * Confirms the real file type from its bytes, that it matches the declared type, and that a PDF
 * carries no active-content markers (a heuristic check, documented as such).
 * @returns {{ mime: string, extension: string }}
 */
const validateDocumentContent = (buffer, declaredMime) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError("The uploaded file is empty", 422, "EMPTY_FILE");
  }
  if (buffer.length > DOCUMENT_LIMITS.maxBytes) {
    throw new AppError("The uploaded file is too large", 413, "FILE_TOO_LARGE");
  }
  const detected = SIGNATURES.find((signature) => signature.matches(buffer));
  if (!detected) {
    throw new AppError(
      "Only PDF, JPEG and PNG documents are accepted",
      415,
      "UNSUPPORTED_FILE_TYPE",
    );
  }
  if (declaredMime !== detected.mime) {
    throw new AppError(
      "The file content does not match its declared type",
      415,
      "FILE_TYPE_MISMATCH",
    );
  }
  if (detected.mime === "application/pdf") {
    const head = buffer.toString("latin1");
    if (ACTIVE_PDF_MARKERS.some((marker) => head.includes(marker))) {
      throw new AppError(
        "PDF files containing active content are not accepted",
        422,
        "ACTIVE_CONTENT_DETECTED",
      );
    }
  }
  return { mime: detected.mime, extension: detected.extension };
};

module.exports = {
  BLOCKING_CHECKS,
  MANUAL_VERIFICATION_REQUIRED,
  normalizeRegistrationNumber,
  normalizeGstin,
  isValidGstin,
  emailDomainOf,
  isWebmailDomain,
  normalizeWebsiteHost,
  normalizeCompanyName,
  namesMatch,
  sanitizeFileName,
  summarizeChecklist,
  scoreToLevel,
  computeRisk,
  recommendNextAction,
  validateDocumentContent,
};
