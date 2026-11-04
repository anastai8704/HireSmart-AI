const mongoose = require("mongoose");

const verificationStatuses = Object.freeze([
  "pending",
  "under_review",
  "verified",
  "rejected",
  "suspended",
]);

const businessTypes = Object.freeze([
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

// Uploaded verification documents. storageKey is internal: it never leaves the server.
const documentSchema = new mongoose.Schema(
  {
    type: { type: String, default: "incorporation_certificate" },
    fileName: { type: String, default: "" },
    // Legacy field from before uploads were private. New documents never set it.
    fileUrl: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0, min: 0 },
    sha256: { type: String, default: "" },
    storageKey: { type: String, default: "" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);
documentSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.storageKey;
    return ret;
  },
});

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    industry: { type: String, trim: true, maxlength: 100, default: "" },
    size: {
      type: String,
      enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+", "unknown"],
      default: "unknown",
    },
    website: { type: String, trim: true, maxlength: 2048, default: "" },
    logo: { type: String, trim: true, maxlength: 2048, default: "" },
    about: { type: String, trim: true, maxlength: 2000, default: "" },
    timezone: { type: String, trim: true, maxlength: 100, default: "UTC" },
    status: {
      type: String,
      enum: ["active", "suspended", "archived"],
      default: "active",
      index: true,
    },
    // Company Verification & Fraud Prevention fields
    verificationStatus: {
      type: String,
      enum: verificationStatuses,
      default: "pending",
      index: true,
    },
    businessEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      street: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      pincode: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "India" },
    },
    registrationNumber: {
      type: String,
      trim: true,
      default: "",
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 15,
      default: "",
    },
    businessType: {
      type: String,
      enum: businessTypes,
      default: "unspecified",
    },
    // Only the name and designation of the person who may act for the company. No personal ID data.
    authorizedRepresentative: {
      name: { type: String, trim: true, maxlength: 120, default: "" },
      designation: { type: String, trim: true, maxlength: 120, default: "" },
    },
    // Consent to verification, with the time it was given and the wording version.
    consent: {
      acceptedAt: { type: Date, default: null },
      version: { type: String, trim: true, maxlength: 40, default: "" },
    },
    // Set only after the business email owner confirmed a one-time code. Never set by the recruiter.
    businessEmailVerifiedAt: { type: Date, default: null },
    // One-time code state. The hash and expiry are never returned to clients (select: false).
    businessEmailTokenHash: { type: String, default: "", select: false },
    businessEmailTokenExpiresAt: { type: Date, default: null, select: false },
    businessEmailTokenAttempts: { type: Number, default: 0, select: false },
    businessEmailTokenSentAt: { type: Date, default: null, select: false },
    // Normalised identifiers used only for duplicate detection (see verificationRules / policy).
    normalizedRegistrationNumber: { type: String, default: "", index: true },
    normalizedGstin: { type: String, default: "", index: true },
    websiteHost: { type: String, default: "", index: true },
    emailDomain: { type: String, default: "", index: true },
    // Counts shown in admin filters. Refreshed whenever a verification case changes.
    verificationSummary: {
      missingCount: { type: Number, default: 0, min: 0 },
      duplicateCount: { type: Number, default: 0, min: 0 },
      updatedAt: { type: Date, default: null },
    },
    documents: [documentSchema],
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    riskFlags: [
      {
        code: { type: String, required: true },
        severity: { type: String, enum: ["low", "medium", "high"], default: "low" },
        message: { type: String, required: true },
        flaggedAt: { type: Date, default: Date.now },
      },
    ],
    verificationNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    settings: {
      requireJobApproval: { type: Boolean, default: false },
      aiEnabled: { type: Boolean, default: true },
      retentionDays: { type: Number, min: 30, max: 3650, default: 730 },
    },
  },
  { timestamps: true, optimisticConcurrency: true },
);

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ verificationStatus: 1, createdAt: -1 });

module.exports = mongoose.model("Organization", organizationSchema);
