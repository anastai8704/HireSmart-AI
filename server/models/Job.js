const mongoose = require("mongoose");
const { jobTypes, jobStatuses } = require("../constants/enums");

const jobSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    company: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      index: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    salary: {
      type: Number,
      required: true,
      min: 0,
    },
    experience: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    jobType: {
      type: String,
      enum: jobTypes,
      default: jobTypes[0],
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 20000,
    },
    skills: {
      type: [String],
      required: true,
      validate: {
        validator: (skills) => skills.length > 0 && skills.length <= 50,
        message: "A job must list between 1 and 50 skills",
      },
    },
    requiredSkills: { type: [String], default: [] },
    preferredSkills: { type: [String], default: [] },
    workplaceMode: {
      type: String,
      enum: ["onsite", "hybrid", "remote", "unspecified"],
      default: "unspecified",
    },
    compensation: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      currency: { type: String, default: "INR", maxlength: 3 },
      period: { type: String, enum: ["hour", "month", "year"], default: "year" },
    },
    minExpYears: { type: Number, min: 0, default: 0 },
    maxExpYears: { type: Number, min: 0, default: 0 },
    educationRequired: { type: String, trim: true, maxlength: 200, default: "" },
    benefits: { type: [String], default: [] },
    industry: { type: String, trim: true, maxlength: 100, default: "" },
    moderation: {
      status: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      reviewedAt: { type: Date, default: null },
      reason: { type: String, maxlength: 500, default: "" },
    },
    source: { type: String, default: "direct", maxlength: 50 },
    hiringTeam: [{ type: mongoose.Schema.Types.ObjectId, ref: "Membership" }],
    version: { type: Number, default: 1, min: 1 },
    publishedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: jobStatuses,
      default: jobStatuses[1],
      index: true,
    },
    closesAt: {
      type: Date,
      default: null,
    },
    recruiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ status: 1, createdAt: -1, workplaceMode: 1 });
jobSchema.index({ status: 1, "compensation.min": -1 });
jobSchema.index({ industry: 1, status: 1 });
jobSchema.index({ recruiter: 1, status: 1, createdAt: -1 });
jobSchema.index({
  title: "text",
  location: "text",
  skills: "text",
});

module.exports = mongoose.model("Job", jobSchema);
