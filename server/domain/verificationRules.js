// Configurable rules for company verification and risk indicators (Phase 2).
//
// Every number here is a policy choice, not a statistical fact. Risk weights are rule-based
// indicator weights for ordering manual review. They are NOT a probability of fraud.
// A high score never causes an automatic rejection, suspension or ban.

/** Webmail domains are not evidence of a company. Never treated as proof either way. */
const FREE_WEBMAIL_DOMAINS = Object.freeze(
  new Set([
    "gmail.com",
    "yahoo.com",
    "yahoo.co.in",
    "hotmail.com",
    "outlook.com",
    "rediffmail.com",
    "proton.me",
    "protonmail.com",
    "mail.com",
    "aol.com",
    "icloud.com",
    "zoho.com",
  ]),
);

/** Score bands. A score is an ordering aid for reviewers only. */
const RISK_BANDS = Object.freeze({ mediumFrom: 25, highFrom: 60 });

/**
 * Indicator weights and severities. Missing registration identifiers are informational only
 * (weight 0): not every business has a CIN, LLPIN or GSTIN.
 */
const RISK_RULES = Object.freeze({
  FREE_WEBMAIL_DOMAIN: { weight: 20, severity: "medium" },
  NO_BUSINESS_EMAIL: { weight: 15, severity: "low" },
  BUSINESS_EMAIL_NOT_VERIFIED: { weight: 10, severity: "low" },
  WEBSITE_DOMAIN_MISMATCH: { weight: 15, severity: "medium" },
  MISSING_WEBSITE: { weight: 0, severity: "low" },
  INVALID_GSTIN_FORMAT: { weight: 30, severity: "medium" },
  MISSING_REGISTRATION_IDENTIFIER: { weight: 0, severity: "low" },
  MISSING_VERIFICATION_DOCS: { weight: 0, severity: "low" },
  DUPLICATE_REGISTRATION: { weight: 40, severity: "high" },
  DUPLICATE_PROFILE_OVERLAP: { weight: 25, severity: "medium" },
  REGISTRATION_MISMATCH: { weight: 40, severity: "high" },
  RECRUITER_IDENTITY_PENDING: { weight: 10, severity: "low" },
  PREVIOUS_ENFORCEMENT: { weight: 30, severity: "high" },
  REPEATED_JOB_POLICY_REJECTIONS: { weight: 20, severity: "medium" },
  SUSPICIOUS_PAYMENT_DEMAND: { weight: 50, severity: "high" },
  DUPLICATE_JOB_POSTINGS: { weight: 20, severity: "medium" },
  UNREALISTIC_SALARY_CLAIMS: { weight: 15, severity: "low" },
  UNUSUAL_POSTING_VOLUME: { weight: 15, severity: "medium" },
});

const RISK_DISCLAIMER =
  "Risk indicators are rule-based signals to prioritise manual review. They are not proof of fraud " +
  "and do not, on their own, cause any restriction.";

/** Job-posting thresholds used by the posting-pattern indicators. */
const POSTING_RULES = Object.freeze({
  recentWindowHours: 24,
  maxJobsInWindow: 10,
  repeatedRejectionsFrom: 2,
  duplicateTitleCount: 3,
});

/** Checklist items (Master Prompt Requirement 1, section B). */
const CHECK_TYPES = Object.freeze([
  "business_registration",
  "business_identity",
  "recruiter_identity",
  "business_email",
  "website_consistency",
  "address_consistency",
  "duplicate_review",
  "job_policy_review",
  "enforcement_history",
  "document_review",
]);

/** Checks that must all be "match" before a company can be verified. */
const REQUIRED_CHECKS = Object.freeze([
  "business_registration",
  "business_email",
  "recruiter_identity",
  "duplicate_review",
]);

const CHECK_RESULTS = Object.freeze(["match", "mismatch", "concern", "unavailable", "not_checked"]);

/**
 * How a result was obtained. "system_rule" is automatic and never proves registration.
 * "external_registry" is only recorded when a real provider answered.
 */
const CHECK_METHODS = Object.freeze([
  "email_token",
  "external_registry",
  "manual_review",
  "system_rule",
]);

const BUSINESS_TYPES = Object.freeze([
  "private_limited",
  "public_limited",
  "llp",
  "partnership",
  "sole_proprietorship",
  "ngo",
  "government",
  "other",
  "unspecified",
]);

const DOCUMENT_TYPES = Object.freeze([
  "incorporation_certificate",
  "gst_certificate",
  "authorization_letter",
  "other",
]);

const DOCUMENT_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxPerOrganization: 10,
  maxFileNameLength: 120,
});

const BUSINESS_EMAIL_TOKEN = Object.freeze({
  ttlMinutes: 30,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
});

module.exports = {
  FREE_WEBMAIL_DOMAINS,
  RISK_BANDS,
  RISK_RULES,
  RISK_DISCLAIMER,
  POSTING_RULES,
  CHECK_TYPES,
  REQUIRED_CHECKS,
  CHECK_RESULTS,
  CHECK_METHODS,
  BUSINESS_TYPES,
  DOCUMENT_TYPES,
  DOCUMENT_LIMITS,
  BUSINESS_EMAIL_TOKEN,
};
