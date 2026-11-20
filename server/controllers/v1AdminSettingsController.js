// Admin Platform Settings Controller (Phase 4H)
// Strictly role-protected platform configuration, policies, and governance controls.
const PlatformSetting = require("../models/PlatformSetting");
const { audit } = require("../services/auditService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");

const requireAdmin = (req) => {
  if (req.auth?.platformRole !== "platform_admin") {
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  }
};

const ALLOWED_SECTIONS = new Set([
  "general",
  "registration",
  "moderation",
  "subscriptions",
  "notifications",
  "security",
  "features",
]);

/**
 * GET /admin/settings
 * Retrieves active global platform settings.
 */
exports.getSettings = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const settings = await PlatformSetting.getSettings();
  res.json({ data: settings });
});

/**
 * PATCH /admin/settings
 * Updates specified sections of platform configuration with strict schema validation.
 */
exports.updateSettings = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const updates = req.body;
  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    throw new AppError("No settings payload provided for update", 400, "VALIDATION_ERROR");
  }

  // Validate that only allowed sections are being modified (ignoring metadata keys like reason)
  const submittedSections = Object.keys(updates).filter(
    (k) => !["reason", "_id", "key", "createdAt", "updatedAt"].includes(k)
  );
  if (submittedSections.length === 0) {
    throw new AppError("No valid settings sections provided for update", 400, "VALIDATION_ERROR");
  }
  for (const section of submittedSections) {
    if (!ALLOWED_SECTIONS.has(section)) {
      throw new AppError(`Section '${section}' is not an editable platform setting`, 400, "INVALID_SECTION");
    }
  }

  const settings = await PlatformSetting.getSettings();
  const previousState = {};
  const newState = {};

  // 1. General & Branding
  if (updates.general) {
    previousState.general = { ...settings.general.toObject() };
    const { platformName, supportEmail, systemTimezone, maintenanceMode, maintenanceMessage } = updates.general;
    if (typeof platformName === "string" && platformName.trim()) {
      settings.general.platformName = platformName.trim().slice(0, 100);
    }
    if (typeof supportEmail === "string" && supportEmail.includes("@")) {
      settings.general.supportEmail = supportEmail.trim();
    }
    if (typeof systemTimezone === "string" && systemTimezone.trim()) {
      settings.general.systemTimezone = systemTimezone.trim();
    }
    if (typeof maintenanceMode === "boolean") {
      settings.general.maintenanceMode = maintenanceMode;
    }
    if (typeof maintenanceMessage === "string") {
      settings.general.maintenanceMessage = maintenanceMessage.trim().slice(0, 500);
    }
    newState.general = { ...settings.general.toObject() };
  }

  // 2. Registration & Account Policies
  if (updates.registration) {
    previousState.registration = { ...settings.registration.toObject() };
    const { allowCandidateSignup, allowRecruiterSignup, requireEmailVerification, allowedEmailDomains, defaultUserStatus } =
      updates.registration;
    if (typeof allowCandidateSignup === "boolean") settings.registration.allowCandidateSignup = allowCandidateSignup;
    if (typeof allowRecruiterSignup === "boolean") settings.registration.allowRecruiterSignup = allowRecruiterSignup;
    if (typeof requireEmailVerification === "boolean") settings.registration.requireEmailVerification = requireEmailVerification;
    if (Array.isArray(allowedEmailDomains)) {
      settings.registration.allowedEmailDomains = allowedEmailDomains
        .filter((d) => typeof d === "string" && d.trim().length > 0)
        .map((d) => d.trim().toLowerCase());
    }
    if (defaultUserStatus && ["active", "pending_review"].includes(defaultUserStatus)) {
      settings.registration.defaultUserStatus = defaultUserStatus;
    }
    newState.registration = { ...settings.registration.toObject() };
  }

  // 3. Moderation Policies
  if (updates.moderation) {
    previousState.moderation = { ...settings.moderation.toObject() };
    const { autoApproveVerifiedOrgs, requireManualApprovalNewOrgs, flaggedKeywords, maxJobsPerDayPerOrg } = updates.moderation;
    if (typeof autoApproveVerifiedOrgs === "boolean") settings.moderation.autoApproveVerifiedOrgs = autoApproveVerifiedOrgs;
    if (typeof requireManualApprovalNewOrgs === "boolean") settings.moderation.requireManualApprovalNewOrgs = requireManualApprovalNewOrgs;
    if (Array.isArray(flaggedKeywords)) {
      settings.moderation.flaggedKeywords = flaggedKeywords
        .filter((k) => typeof k === "string" && k.trim().length > 0)
        .map((k) => k.trim());
    }
    if (typeof maxJobsPerDayPerOrg === "number" && maxJobsPerDayPerOrg >= 1 && maxJobsPerDayPerOrg <= 1000) {
      settings.moderation.maxJobsPerDayPerOrg = maxJobsPerDayPerOrg;
    }
    newState.moderation = { ...settings.moderation.toObject() };
  }

  // 4. Subscription Policies
  if (updates.subscriptions) {
    previousState.subscriptions = { ...settings.subscriptions.toObject() };
    const { currency, trialDays, enforcementMode, allowPlanSelfDowngrade } = updates.subscriptions;
    if (currency && typeof currency === "string") settings.subscriptions.currency = currency.toUpperCase().slice(0, 3);
    if (typeof trialDays === "number" && trialDays >= 0 && trialDays <= 90) settings.subscriptions.trialDays = trialDays;
    if (enforcementMode && ["soft_cap", "strict_lockout"].includes(enforcementMode)) {
      settings.subscriptions.enforcementMode = enforcementMode;
    }
    if (typeof allowPlanSelfDowngrade === "boolean") {
      settings.subscriptions.allowPlanSelfDowngrade = allowPlanSelfDowngrade;
    }
    newState.subscriptions = { ...settings.subscriptions.toObject() };
  }

  // 5. Notifications Policies
  if (updates.notifications) {
    previousState.notifications = { ...settings.notifications.toObject() };
    const { systemSenderEmail, alertPlatformAdminsOnCriticalRisk, dailyAdminSummaryEmail } = updates.notifications;
    if (typeof systemSenderEmail === "string" && systemSenderEmail.includes("@")) {
      settings.notifications.systemSenderEmail = systemSenderEmail.trim();
    }
    if (typeof alertPlatformAdminsOnCriticalRisk === "boolean") {
      settings.notifications.alertPlatformAdminsOnCriticalRisk = alertPlatformAdminsOnCriticalRisk;
    }
    if (typeof dailyAdminSummaryEmail === "boolean") {
      settings.notifications.dailyAdminSummaryEmail = dailyAdminSummaryEmail;
    }
    newState.notifications = { ...settings.notifications.toObject() };
  }

  // 6. Security Policies
  if (updates.security) {
    previousState.security = { ...settings.security.toObject() };
    const { sessionTimeoutMinutes, maxFailedLoginsBeforeLockout, lockoutDurationMinutes, requireMfaForAdmins, minPasswordLength } =
      updates.security;
    if (typeof sessionTimeoutMinutes === "number" && sessionTimeoutMinutes >= 15 && sessionTimeoutMinutes <= 1440) {
      settings.security.sessionTimeoutMinutes = sessionTimeoutMinutes;
    }
    if (typeof maxFailedLoginsBeforeLockout === "number" && maxFailedLoginsBeforeLockout >= 3 && maxFailedLoginsBeforeLockout <= 20) {
      settings.security.maxFailedLoginsBeforeLockout = maxFailedLoginsBeforeLockout;
    }
    if (typeof lockoutDurationMinutes === "number" && lockoutDurationMinutes >= 5 && lockoutDurationMinutes <= 1440) {
      settings.security.lockoutDurationMinutes = lockoutDurationMinutes;
    }
    if (typeof requireMfaForAdmins === "boolean") settings.security.requireMfaForAdmins = requireMfaForAdmins;
    if (typeof minPasswordLength === "number" && minPasswordLength >= 8 && minPasswordLength <= 32) {
      settings.security.minPasswordLength = minPasswordLength;
    }
    newState.security = { ...settings.security.toObject() };
  }

  // 7. Feature Flags
  if (updates.features) {
    previousState.features = { ...settings.features.toObject() };
    const { aiResumeParsing, aiInterviewTranscripts, fraudRiskDetection, googleCalendarSync } = updates.features;
    if (typeof aiResumeParsing === "boolean") settings.features.aiResumeParsing = aiResumeParsing;
    if (typeof aiInterviewTranscripts === "boolean") settings.features.aiInterviewTranscripts = aiInterviewTranscripts;
    if (typeof fraudRiskDetection === "boolean") settings.features.fraudRiskDetection = fraudRiskDetection;
    if (typeof googleCalendarSync === "boolean") settings.features.googleCalendarSync = googleCalendarSync;
    newState.features = { ...settings.features.toObject() };
  }

  settings.updatedBy = req.user?._id || null;
  await settings.save();

  // Immutable audit trail recording with who changed what
  await audit({
    req,
    action: "platform_settings.updated",
    resourceType: "platform_settings",
    resourceId: "global",
    metadata: {
      updatedSections: submittedSections,
    },
    previousState,
    newState,
    reason: req.body.reason || "Platform administrator settings update",
  });

  res.json({
    success: true,
    message: "Platform settings updated successfully",
    data: settings,
  });
});
