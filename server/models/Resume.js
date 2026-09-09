const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, trim: true, maxlength: 100, default: "Primary resume" },
    currentVersion: { type: mongoose.Schema.Types.ObjectId, ref: "ResumeVersion", default: null },
    isPrimary: { type: Boolean, default: true, index: true },
    status: {
      type: String,
      enum: ["active", "archived", "deleted"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);
resumeSchema.index(
  { candidate: 1, isPrimary: 1 },
  { unique: true, partialFilterExpression: { isPrimary: true, status: "active" } },
);

const resumeVersionSchema = new mongoose.Schema(
  {
    resume: { type: mongoose.Schema.Types.ObjectId, ref: "Resume", required: true, index: true },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: {
      type: String,
      enum: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      required: true,
    },
    size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
    sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/, index: true },
    storageKey: { type: String, required: true, select: false },
    storageProvider: { type: String, enum: ["local", "s3"], required: true },
    processingStatus: {
      type: String,
      enum: ["queued", "processing", "ready", "partial", "failed", "rejected", "deleted"],
      default: "queued",
      index: true,
    },
    processingStage: {
      type: String,
      enum: ["uploaded", "validated", "parsing", "extracting", "analyzing", "complete"],
      default: "uploaded",
    },
    failureCode: { type: String, maxlength: 100, default: "" },
    failureMessage: { type: String, maxlength: 500, default: "" },
    parseAttempts: { type: Number, default: 0, min: 0, max: 5 },
    parserVersion: { type: String, default: "resume-parser-v1" },
    text: { type: String, default: "", select: false },
    summary: { type: String, default: "", maxlength: 2000 },
    analyzedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
resumeVersionSchema.index({ resume: 1, version: 1 }, { unique: true });
resumeVersionSchema.index({ candidate: 1, sha256: 1 });

const parsedResumeSchema = new mongoose.Schema(
  {
    resumeVersion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResumeVersion",
      required: true,
      unique: true,
      index: true,
    },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    schemaVersion: { type: String, default: "1.0" },
    contact: { email: String, phone: String, linkedin: String, github: String, portfolio: String },
    skills: [
      {
        name: { type: String, required: true },
        normalized: { type: String, required: true },
        confidence: { type: Number, min: 0, max: 1, default: 0.7 },
        evidence: String,
      },
    ],
    experienceYears: { type: Number, min: 0, max: 80, default: null },
    education: [{ degree: String, field: String, institution: String, evidence: String }],
    experiences: [
      {
        title: String,
        company: String,
        startDate: Date,
        endDate: Date,
        description: String,
        evidence: String,
      },
    ],
    analysis: { type: mongoose.Schema.Types.Mixed, default: {} },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    warnings: { type: [String], default: [] },
    correctedByCandidate: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true },
);

module.exports = {
  Resume: mongoose.model("Resume", resumeSchema),
  ResumeVersion: mongoose.model("ResumeVersion", resumeVersionSchema),
  ParsedResume: mongoose.model("ParsedResume", parsedResumeSchema),
};
