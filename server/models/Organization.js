const mongoose = require("mongoose");

const verificationStatuses = Object.freeze([
  "pending",
  "under_review",
  "verified",
  "rejected",
  "suspended",
]);

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
    documents: [
      {
        type: { type: String, default: "incorporation_certificate" },
        fileName: { type: String, default: "" },
        fileUrl: { type: String, default: "" },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
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
