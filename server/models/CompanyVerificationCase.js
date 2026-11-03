const mongoose = require("mongoose");
const { protectRecords } = require("./plugins/protectRecords");
const { statesOf } = require("../domain/stateMachines");

// Case status uses the same values as Organization.verificationStatus.
const caseStatuses = Object.freeze(statesOf("companyVerification"));
const OPEN_STATUSES = Object.freeze(["pending", "under_review"]);

// Evidence assessment. Only "verified_evidence" may back a "verified" decision.
const assessments = Object.freeze([
  "unassessed",
  "verified_evidence",
  "unavailable_evidence",
  "mismatch",
  "suspicious_indicators",
  "manual_review",
]);

const evidenceTypes = Object.freeze([
  "business_email_domain",
  "website",
  "registration_number",
  "document",
  "manual_note",
]);

const evidenceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: evidenceTypes, required: true },
    // A domain, URL, registration number or document reference. Never personal data.
    value: { type: String, trim: true, maxlength: 500, required: true },
    source: { type: String, trim: true, maxlength: 200, default: "" },
    verified: { type: Boolean, default: false },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const historySchema = new mongoose.Schema(
  {
    from: { type: String, enum: caseStatuses, required: true },
    to: { type: String, enum: caseStatuses, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, trim: true, maxlength: 1000, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const companyVerificationCaseSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    status: { type: String, enum: caseStatuses, default: "pending", required: true },
    assessment: { type: String, enum: assessments, default: "unassessed", required: true },
    evidence: { type: [evidenceSchema], default: [] },
    decision: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
      // Required for "rejected" and "suspended" (see validator below).
      reason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
        validate: {
          validator(value) {
            if (!["rejected", "suspended"].includes(this.status)) return true;
            return typeof value === "string" && value.trim().length > 0;
          },
          message: "A reason is required for a rejected or suspended company",
        },
      },
    },
    statusHistory: { type: [historySchema], default: [] },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Evidence-based verification: "verified" requires a verified-evidence assessment and at least
// one evidence item that is marked verified.
companyVerificationCaseSchema.path("status").validate({
  validator(value) {
    if (value !== "verified") return true;
    return (
      this.assessment === "verified_evidence" &&
      Array.isArray(this.evidence) &&
      this.evidence.some((item) => item.verified === true)
    );
  },
  message: "A company can only be verified with verified evidence",
});

companyVerificationCaseSchema.index({ organization: 1, createdAt: -1 });
// At most one open case per organization. Concurrent duplicate submissions fail with E11000.
companyVerificationCaseSchema.index(
  { organization: 1 },
  { unique: true, partialFilterExpression: { status: { $in: OPEN_STATUSES } } },
);
companyVerificationCaseSchema.index({ status: 1, createdAt: -1 });

companyVerificationCaseSchema.plugin(protectRecords);

module.exports = {
  CompanyVerificationCase: mongoose.model("CompanyVerificationCase", companyVerificationCaseSchema),
  caseStatuses,
  assessments,
  evidenceTypes,
  OPEN_STATUSES,
};
