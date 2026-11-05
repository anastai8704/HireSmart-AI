const mongoose = require("mongoose");
const { protectRecords } = require("./plugins/protectRecords");
const { applicationStatuses } = require("../constants/enums");

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: applicationStatuses,
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The stage before this change (empty for the first entry). Lets the history show each move.
    fromStatus: {
      type: String,
      enum: [...applicationStatuses, ""],
      default: "",
    },
    note: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  { _id: false },
);

// A pre-hire offer is part of the application. "Issued" means the company sent it; only the
// candidate's response records acceptance. Hiring requires "accepted".
const offerSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["none", "issued", "accepted", "declined"],
      default: "none",
    },
    designation: { type: String, trim: true, maxlength: 200, default: "" },
    ctc: { type: Number, min: 0, default: null },
    currency: { type: String, trim: true, maxlength: 10, default: "INR" },
    joiningDate: { type: Date, default: null },
    issuedAt: { type: Date, default: null },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    respondedAt: { type: Date, default: null },
    responseNote: { type: String, trim: true, maxlength: 2000, default: "" },
  },
  { _id: false },
);

const applicationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    jobVersion: { type: Number, default: 1, min: 1 },
    jobSnapshot: {
      title: String,
      company: String,
      location: String,
      description: String,
      requiredSkills: { type: [String], default: [] },
      preferredSkills: { type: [String], default: [] },
      experience: String,
      workplaceMode: String,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: applicationStatuses,
      default: "Applied",
      index: true,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    resumeSnapshot: {
      storageKey: {
        type: String,
        required: true,
        select: false,
      },
      provider: {
        type: String,
        enum: ["local", "s3"],
        required: true,
        default: "local",
      },
      originalName: {
        type: String,
        required: true,
      },
      mimeType: {
        type: String,
        required: true,
      },
      size: {
        type: Number,
        required: true,
      },
      text: {
        type: String,
        default: "",
      },
    },
    resumeVersion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResumeVersion",
      default: null,
      index: true,
    },
    source: { type: String, default: "direct", maxlength: 100 },
    tags: { type: [String], default: [] },
    screeningAnswers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    withdrawnAt: { type: Date, default: null },
    recruiterNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
    offer: { type: offerSchema, default: () => ({}) },
  },
  {
    timestamps: true,
  },
);

applicationSchema.index({ job: 1, candidate: 1 }, { unique: true });
applicationSchema.index({ job: 1, status: 1, appliedAt: -1 });
applicationSchema.index({ candidate: 1, appliedAt: -1 });

applicationSchema.plugin(protectRecords);

module.exports = {
  Application: mongoose.model("Application", applicationSchema),
  applicationStatuses,
};
