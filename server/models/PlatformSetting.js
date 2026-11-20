// Platform Setting Model (Phase 4H)
// Manages global platform configuration, registration policies, moderation rules,
// subscriptions, security, and feature flags. No secret credentials or API keys are stored here.
const mongoose = require("mongoose");

const platformSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "global",
      index: true,
    },
    general: {
      platformName: { type: String, default: "HireSmart-AI", trim: true, maxlength: 100 },
      supportEmail: { type: String, default: "support@hiresmart.ai", trim: true, maxlength: 150 },
      systemTimezone: { type: String, default: "Asia/Kolkata", trim: true },
      maintenanceMode: { type: Boolean, default: false },
      maintenanceMessage: {
        type: String,
        default: "Platform is undergoing scheduled maintenance. Please check back shortly.",
        maxlength: 500,
      },
    },
    registration: {
      allowCandidateSignup: { type: Boolean, default: true },
      allowRecruiterSignup: { type: Boolean, default: true },
      requireEmailVerification: { type: Boolean, default: true },
      allowedEmailDomains: [{ type: String, trim: true, lowercase: true }],
      defaultUserStatus: {
        type: String,
        enum: ["active", "pending_review"],
        default: "active",
      },
    },
    moderation: {
      autoApproveVerifiedOrgs: { type: Boolean, default: true },
      requireManualApprovalNewOrgs: { type: Boolean, default: true },
      flaggedKeywords: [{ type: String, trim: true }],
      maxJobsPerDayPerOrg: { type: Number, default: 50, min: 1, max: 1000 },
    },
    subscriptions: {
      currency: { type: String, default: "INR", uppercase: true },
      trialDays: { type: Number, default: 14, min: 0, max: 90 },
      enforcementMode: {
        type: String,
        enum: ["soft_cap", "strict_lockout"],
        default: "soft_cap",
      },
      allowPlanSelfDowngrade: { type: Boolean, default: true },
    },
    notifications: {
      systemSenderEmail: { type: String, default: "noreply@hiresmart.ai", trim: true },
      alertPlatformAdminsOnCriticalRisk: { type: Boolean, default: true },
      dailyAdminSummaryEmail: { type: Boolean, default: false },
    },
    security: {
      sessionTimeoutMinutes: { type: Number, default: 120, min: 15, max: 1440 },
      maxFailedLoginsBeforeLockout: { type: Number, default: 5, min: 3, max: 20 },
      lockoutDurationMinutes: { type: Number, default: 30, min: 5, max: 1440 },
      requireMfaForAdmins: { type: Boolean, default: false },
      minPasswordLength: { type: Number, default: 8, min: 8, max: 32 },
    },
    features: {
      aiResumeParsing: { type: Boolean, default: true },
      aiInterviewTranscripts: { type: Boolean, default: true },
      fraudRiskDetection: { type: Boolean, default: true },
      googleCalendarSync: { type: Boolean, default: true },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * Returns the singleton platform settings document, creating it with defaults if not present.
 */
platformSettingSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: "global" }).populate("updatedBy", "name email");
  if (!settings) {
    settings = await this.create({ key: "global" });
  }
  return settings;
};

module.exports = mongoose.model("PlatformSetting", platformSettingSchema);
