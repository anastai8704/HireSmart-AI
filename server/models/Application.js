const mongoose = require("mongoose");
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
    note: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
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
  },
  {
    timestamps: true,
  },
);

applicationSchema.index({ job: 1, candidate: 1 }, { unique: true });
applicationSchema.index({ job: 1, status: 1, appliedAt: -1 });
applicationSchema.index({ candidate: 1, appliedAt: -1 });

module.exports = {
  Application: mongoose.model("Application", applicationSchema),
  applicationStatuses,
};
