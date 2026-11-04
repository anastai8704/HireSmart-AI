// Gathers the facts behind company risk indicators (Phase 2) from authorized database records.
//
// The scoring itself is pure and lives in domain/companyVerificationPolicy.js. This module only
// reads records. It never changes a company's status: risk output is an input to manual review.

const Job = require("../models/Job");
const Organization = require("../models/Organization");
const User = require("../models/User");
const { Membership } = require("../models/Membership");
const policy = require("../domain/companyVerificationPolicy");
const { FREE_WEBMAIL_DOMAINS, POSTING_RULES } = require("../domain/verificationRules");

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Phrases that ask candidates to pay before hiring. Matching is a review prompt, not proof.
const SUSPICIOUS_PAYMENT_KEYWORDS = [
  "registration fee",
  "processing fee",
  "processing charges",
  "laptop deposit",
  "training fee",
  "security deposit",
  "pay before interview",
  "document verification charge",
  "bank account fee",
  "refundable deposit",
  "selection charge",
  "joining fee",
];

const jobSignals = async (orgId, now) => {
  const windowStart = new Date(now.getTime() - POSTING_RULES.recentWindowHours * 60 * 60 * 1000);
  const [rejectedJobCount, recentJobCount, jobs] = await Promise.all([
    Job.countDocuments({ organization: orgId, "moderation.status": "rejected" }),
    Job.countDocuments({ organization: orgId, createdAt: { $gte: windowStart } }),
    Job.find({ organization: orgId })
      .select("title description salary experience")
      .limit(500)
      .lean(),
  ]);

  const titles = new Map();
  for (const job of jobs) {
    const key = String(job.title || "").trim().toLowerCase();
    titles.set(key, (titles.get(key) || 0) + 1);
  }
  const duplicateJobTitles = [...titles.values()].some(
    (count) => count >= POSTING_RULES.duplicateTitleCount,
  );

  let paymentDemandKeyword = "";
  for (const job of jobs) {
    const text = `${job.title} ${job.description}`.toLowerCase();
    const hit = SUSPICIOUS_PAYMENT_KEYWORDS.find((keyword) => text.includes(keyword));
    if (hit) {
      paymentDemandKeyword = hit;
      break;
    }
  }

  const unrealisticSalary = jobs.some(
    (job) =>
      (job.salary > 10000000 && String(job.experience || "").includes("0")) ||
      job.salary > 50000000,
  );

  return { rejectedJobCount, recentJobCount, duplicateJobTitles, paymentDemandKeyword, unrealisticSalary };
};

/**
 * Reads the records needed for risk indicators and duplicate detection.
 * @returns {Promise<{ facts: object, duplicateRegistration: object[], duplicateProfile: object[] }>}
 */
const gatherRiskFacts = async (org, { recruiterUserId = null, now = new Date() } = {}) => {
  const businessEmail = String(org.businessEmail || "").trim().toLowerCase();
  const emailDomain = policy.emailDomainOf(businessEmail);
  const isWebmail = Boolean(emailDomain) && FREE_WEBMAIL_DOMAINS.has(emailDomain);
  const websiteHost = policy.normalizeWebsiteHost(org.website);
  const registrationNumber = policy.normalizeRegistrationNumber(org.registrationNumber);
  const gstin = policy.normalizeGstin(org.gstin);

  // Duplicate candidates: other profiles sharing an identifier. Found by identifier only.
  const identifierMatches = [];
  if (registrationNumber) identifierMatches.push({ normalizedRegistrationNumber: registrationNumber });
  if (gstin) identifierMatches.push({ normalizedGstin: gstin });
  if (websiteHost) identifierMatches.push({ websiteHost });
  if (emailDomain && !isWebmail) identifierMatches.push({ emailDomain });

  const others = identifierMatches.length
    ? await Organization.find({ _id: { $ne: org._id }, $or: identifierMatches })
        .select(
          "name verificationStatus normalizedRegistrationNumber normalizedGstin websiteHost emailDomain",
        )
        .limit(50)
        .lean()
    : [];

  const duplicateRegistration = others.filter(
    (other) =>
      (registrationNumber && other.normalizedRegistrationNumber === registrationNumber) ||
      (gstin && other.normalizedGstin === gstin),
  );
  const duplicateProfile = others.filter(
    (other) =>
      !duplicateRegistration.includes(other) &&
      ((websiteHost && other.websiteHost === websiteHost) ||
        (emailDomain && !isWebmail && other.emailDomain === emailDomain)),
  );

  // Previous enforcement: related profiles already rejected or suspended, including profiles
  // owned by the same user.
  const ownerIds = await Membership.find({ organization: org._id, role: "owner" }).distinct("user");
  const ownedElsewhere = ownerIds.length
    ? await Membership.find({
        user: { $in: ownerIds },
        role: "owner",
        organization: { $ne: org._id },
      }).distinct("organization")
    : [];
  const ownedEnforced = ownedElsewhere.length
    ? await Organization.countDocuments({
        _id: { $in: ownedElsewhere },
        verificationStatus: { $in: ["rejected", "suspended"] },
      })
    : 0;
  const identifierEnforced = others.filter((other) =>
    ["rejected", "suspended"].includes(other.verificationStatus),
  ).length;

  const signals = await jobSignals(org._id, now);
  const recruiterEmailVerified = recruiterUserId
    ? Boolean(await User.exists({ _id: recruiterUserId, emailVerified: true }))
    : false;

  const websiteEmailMismatch = Boolean(
    websiteHost &&
      emailDomain &&
      !isWebmail &&
      websiteHost !== emailDomain &&
      !websiteHost.endsWith(`.${emailDomain}`) &&
      !emailDomain.endsWith(`.${websiteHost}`),
  );

  return {
    facts: {
      businessEmail,
      emailDomain,
      isWebmail,
      businessEmailVerified: Boolean(org.businessEmailVerifiedAt),
      websiteHost,
      websiteEmailMismatch,
      gstin,
      gstinValid: policy.isValidGstin(gstin),
      registrationNumber,
      documentCount: Array.isArray(org.documents) ? org.documents.length : 0,
      duplicates: {
        registration: duplicateRegistration.length,
        profile: duplicateProfile.length,
      },
      previousEnforcementCount: identifierEnforced + ownedEnforced,
      recruiterEmailVerified,
      ...signals,
    },
    duplicateRegistration,
    duplicateProfile,
  };
};

/**
 * Compatibility wrapper: risk indicators for an organization without changing any status.
 * Prefer the verification service, which also records the result on the case.
 */
const evaluateOrganizationRisk = async (org, { recruiterUserId = null } = {}) => {
  const { facts } = await gatherRiskFacts(org, { recruiterUserId });
  const risk = policy.computeRisk(facts);
  return {
    riskScore: risk.score,
    riskLevel: risk.level,
    requiresManualReview: risk.requiresManualReview,
    riskFlags: risk.indicators.map((indicator) => ({
      code: indicator.code,
      severity: indicator.severity,
      message: indicator.explanation,
      flaggedAt: new Date(),
    })),
    indicators: risk.indicators,
    disclaimer: risk.disclaimer,
  };
};

module.exports = {
  gatherRiskFacts,
  evaluateOrganizationRisk,
  FREE_WEBMAIL_DOMAINS,
  GSTIN_REGEX,
  SUSPICIOUS_PAYMENT_KEYWORDS,
};
