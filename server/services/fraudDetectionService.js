const Job = require("../models/Job");

const FREE_WEBMAIL_DOMAINS = new Set([
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
]);

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

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

/**
 * Evaluates risk score and risk indicators for an organization.
 * Returns { riskScore, riskFlags }
 */
const evaluateOrganizationRisk = async (orgData = {}, existingOrgId = null) => {
  let score = 0;
  const flags = [];
  const now = new Date();

  // 1. Business Email Verification Check
  const email = String(orgData.businessEmail || "").trim().toLowerCase();
  if (email) {
    const domain = email.split("@")[1];
    if (domain && FREE_WEBMAIL_DOMAINS.has(domain)) {
      score += 25;
      flags.push({
        code: "FREE_WEBMAIL_DOMAIN",
        severity: "medium",
        message: `Business email (@${domain}) uses a public consumer webmail provider instead of a corporate domain.`,
        flaggedAt: now,
      });
    }
  } else {
    score += 15;
    flags.push({
      code: "NO_BUSINESS_EMAIL",
      severity: "low",
      message: "No dedicated official business email address was provided.",
      flaggedAt: now,
    });
  }

  // 2. GSTIN Format Check
  const gstin = String(orgData.gstin || "").trim().toUpperCase();
  if (gstin) {
    if (!GSTIN_REGEX.test(gstin)) {
      score += 30;
      flags.push({
        code: "INVALID_GSTIN_FORMAT",
        severity: "medium",
        message: "Provided GSTIN does not adhere to the standard 15-character Indian GST format.",
        flaggedAt: now,
      });
    }
  } else {
    score += 15;
    flags.push({
      code: "MISSING_GSTIN",
      severity: "low",
      message: "No GSTIN identification number was submitted.",
      flaggedAt: now,
    });
  }

  // 3. Documentation Completeness Check
  const docs = Array.isArray(orgData.documents) ? orgData.documents : [];
  if (!docs.length) {
    score += 20;
    flags.push({
      code: "MISSING_VERIFICATION_DOCS",
      severity: "low",
      message: "No legal incorporation certificates or government tax documents have been uploaded.",
      flaggedAt: now,
    });
  }

  // 4. Job-Related Checks (if org already exists and has jobs)
  if (existingOrgId) {
    try {
      const orgJobs = await Job.find({ organization: existingOrgId });

      if (orgJobs.length > 0) {
        // Check for duplicate job postings
        const titles = new Map();
        for (const job of orgJobs) {
          const t = job.title.trim().toLowerCase();
          titles.set(t, (titles.get(t) || 0) + 1);
        }
        const duplicateCount = Array.from(titles.values()).filter((c) => c >= 3).length;
        if (duplicateCount > 0) {
          score += 20;
          flags.push({
            code: "DUPLICATE_JOB_POSTINGS",
            severity: "medium",
            message: "Company has 3 or more job postings with identical titles submitted in close succession.",
            flaggedAt: now,
          });
        }

        // Check for suspicious payment demands in job descriptions
        let paymentDemandFound = false;
        let suspiciousKeyword = "";
        for (const job of orgJobs) {
          const desc = `${job.title} ${job.description}`.toLowerCase();
          for (const kw of SUSPICIOUS_PAYMENT_KEYWORDS) {
            if (desc.includes(kw)) {
              paymentDemandFound = true;
              suspiciousKeyword = kw;
              break;
            }
          }
          if (paymentDemandFound) break;
        }

        if (paymentDemandFound) {
          score += 50;
          flags.push({
            code: "SUSPICIOUS_PAYMENT_DEMAND",
            severity: "high",
            message: `Job description mentions suspicious upfront candidate payment terms: "${suspiciousKeyword}".`,
            flaggedAt: now,
          });
        }

        // Check for unrealistic salary claims
        const unrealisticSalary = orgJobs.some(
          (j) => (j.salary && j.salary > 10000000 && j.experience && j.experience.includes("0")) || (j.salary && j.salary > 50000000),
        );
        if (unrealisticSalary) {
          score += 15;
          flags.push({
            code: "UNREALISTIC_SALARY_CLAIMS",
            severity: "low",
            message: "One or more job listings advertise salaries exceeding 5x typical market compensation for entry requirements.",
            flaggedAt: now,
          });
        }
      }
    } catch (_err) {
      // Best-effort check
    }
  }

  return {
    riskScore: Math.min(score, 100),
    riskFlags: flags,
  };
};

module.exports = {
  evaluateOrganizationRisk,
  FREE_WEBMAIL_DOMAINS,
  GSTIN_REGEX,
  SUSPICIOUS_PAYMENT_KEYWORDS,
};
