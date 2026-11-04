// Backfill for company verification (Phase 2).
//
//   node scripts/backfill-company-verification.js            # dry run: prints what would change
//   node scripts/backfill-company-verification.js --apply    # writes the changes
//
// What it does, per organization:
//  1. Fills the normalized identity fields (registration number, GSTIN, website host, email domain)
//     that duplicate detection reads.
//  2. Creates a verification case for companies without one, matching the status they already have.
//     The case records action "legacy_import"; no evidence is invented.
//  3. Recomputes the checklist and risk for each open case (apply mode only).
//
// It never changes a company's status. Companies already marked "verified" have no evidence to back a
// verified case, so they are listed for a decision and left alone. See docs/COMPANY_VERIFICATION.md.

const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");
const { validateEnvironment } = require("../config/env");
const Organization = require("../models/Organization");
const { CompanyVerificationCase } = require("../models/CompanyVerificationCase");
const policy = require("../domain/companyVerificationPolicy");
const service = require("../services/companyVerificationService");

const APPLY = process.argv.includes("--apply");

const normalizedFields = (org) => ({
  normalizedRegistrationNumber: policy.normalizeRegistrationNumber(org.registrationNumber),
  normalizedGstin: policy.normalizeGstin(org.gstin),
  websiteHost: policy.normalizeWebsiteHost(org.website),
  emailDomain: policy.emailDomainOf(org.businessEmail),
});

const run = async () => {
  validateEnvironment();
  await connectDB();

  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    organizations: 0,
    normalizedUpdated: 0,
    casesCreated: 0,
    casesRefreshed: 0,
    verifiedWithoutCase: [],
    failures: [],
  };

  const orgs = await Organization.find({}).lean();
  summary.organizations = orgs.length;

  for (const org of orgs) {
    const fields = normalizedFields(org);
    const changed = Object.keys(fields).some((key) => (org[key] || "") !== fields[key]);
    if (changed) {
      summary.normalizedUpdated += 1;
      if (APPLY) await Organization.updateOne({ _id: org._id }, { $set: fields });
    }

    const hasCase = await CompanyVerificationCase.exists({ organization: org._id });
    if (hasCase) continue;

    if (org.verificationStatus === "verified") {
      summary.verifiedWithoutCase.push(String(org._id));
      continue;
    }

    try {
      if (APPLY) {
        const fresh = await Organization.findById(org._id);
        const caseDoc = await service.ensureCurrentCase(fresh, null);
        await service.refreshAssessment(caseDoc, await Organization.findById(org._id));
        summary.casesCreated += 1;
      } else {
        summary.casesCreated += 1;
      }
    } catch (error) {
      summary.failures.push({ organization: String(org._id), error: error.message });
    }
  }

  if (APPLY) {
    // Cases that existed before this change may have no current checklist. Refresh the open ones.
    const open = await CompanyVerificationCase.find({ status: { $in: ["pending", "under_review"] } });
    for (const caseDoc of open) {
      try {
        const org = await Organization.findById(caseDoc.organization);
        if (!org) continue;
        await service.refreshAssessment(caseDoc, org);
        summary.casesRefreshed += 1;
      } catch (error) {
        summary.failures.push({ case: String(caseDoc._id), error: error.message });
      }
    }
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!APPLY) process.stdout.write("Dry run only. Re-run with --apply to write these changes.\n");
  await disconnectDB();
  if (summary.failures.length) process.exitCode = 1;
};

run().catch(async (error) => {
  process.stderr.write(`Backfill failed: ${error.message}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
