const mongoose = require("mongoose");
const { protectRecords } = require("./plugins/protectRecords");
const { statesOf } = require("../domain/stateMachines");
const {
  CHECK_TYPES,
  CHECK_RESULTS,
  CHECK_METHODS,
} = require("../domain/verificationRules");

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

// Evidence items are recorded per checklist item (Requirement 1, section B).
const evidenceTypes = CHECK_TYPES;

const evidenceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: evidenceTypes, required: true },
    // An identifier, domain, document reference or reviewer note. Never personal data.
    value: { type: String, trim: true, maxlength: 500, default: "" },
    source: { type: String, trim: true, maxlength: 200, default: "" },
    method: { type: String, enum: CHECK_METHODS, required: true },
    result: { type: String, enum: CHECK_RESULTS, required: true },
    // Reviewer explanation (required for manual checks; see the service).
    note: { type: String, trim: true, maxlength: 1000, default: "" },
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
    // "status_change", "submitted", "resubmitted", "changes_requested", "legacy_import", ...
    action: { type: String, trim: true, maxlength: 60, default: "status_change" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, trim: true, maxlength: 1000, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const riskIndicatorSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, maxlength: 60 },
    severity: { type: String, enum: ["low", "medium", "high"], required: true },
    weight: { type: Number, min: 0, max: 100, default: 0 },
    explanation: { type: String, maxlength: 500, default: "" },
  },
  { _id: false },
);

const duplicateCandidateSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    reasons: { type: [{ type: String, maxlength: 60 }], default: [] },
  },
  { _id: false },
);

const companyVerificationCaseSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
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
    // Request-for-changes: the case stays under_review while the company is asked to fix items.
    changeRequest: {
      active: { type: Boolean, default: false },
      items: { type: [{ type: String, trim: true, maxlength: 300 }], default: [] },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      requestedAt: { type: Date, default: null },
    },
    // Latest explainable risk assessment (indicators, not a probability of fraud).
    risk: {
      score: { type: Number, min: 0, max: 100, default: 0 },
      level: { type: String, enum: ["low", "medium", "high"], default: "low" },
      indicators: { type: [riskIndicatorSchema], default: [] },
      requiresManualReview: { type: Boolean, default: false },
      computedAt: { type: Date, default: null },
    },
    // What is still missing or blocking, recomputed on every change.
    readiness: {
      missing: { type: [{ type: String, enum: CHECK_TYPES }], default: [] },
      blockers: { type: [{ type: String, enum: CHECK_TYPES }], default: [] },
      computedAt: { type: Date, default: null },
    },
    // Other company profiles that overlap with this one. Visible to reviewers only.
    duplicateCandidates: { type: [duplicateCandidateSchema], default: [] },
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

// Organization lookups use this compound index (no separate single-field index on organization).
companyVerificationCaseSchema.index({ organization: 1, createdAt: -1 });
// At most one open case per organization. Concurrent duplicate submissions fail with E11000.
// The explicit name avoids clashing with the auto-generated "organization_1" name.
companyVerificationCaseSchema.index(
  { organization: 1 },
  {
    name: "uniq_open_case_per_organization",
    unique: true,
    partialFilterExpression: { status: { $in: OPEN_STATUSES } },
  },
);
companyVerificationCaseSchema.index({ status: 1, createdAt: -1 });
companyVerificationCaseSchema.index({ "readiness.missing": 1, status: 1 });
companyVerificationCaseSchema.index({ "risk.level": 1, status: 1 });

companyVerificationCaseSchema.plugin(protectRecords);

module.exports = {
  CompanyVerificationCase: mongoose.model("CompanyVerificationCase", companyVerificationCaseSchema),
  caseStatuses,
  assessments,
  evidenceTypes,
  OPEN_STATUSES,
};
