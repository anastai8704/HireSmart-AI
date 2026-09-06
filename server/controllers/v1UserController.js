const AuthSession = require("../models/AuthSession");
const CandidateProfile = require("../models/CandidateProfile");
const { Resume, ResumeVersion, ParsedResume } = require("../models/Resume");
const { Application } = require("../models/Application");
const Consent = require("../models/Consent");
const asyncHandler = require("../middleware/asyncHandler");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const storageService = require("../services/storageService");
const logger = require("../utils/logger");
const { audit } = require("../services/auditService");
const publicUserDto = (user) => ({
  id: user._id,
  displayName: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  role: user.role,
  status: user.accountStatus,
  locale: user.locale,
  timezone: user.timezone,
  onboardingCompleted: user.onboardingCompleted,
  phone: user.phone || "",
  headline: user.headline || "",
  location: user.location || "",
  bio: user.bio || "",
  skills: user.skills || [],
  companyName: user.companyName || "",
  companyWebsite: user.companyWebsite || "",
  socialLinks: {
    linkedin: user.socialLinks?.linkedin || "",
    github: user.socialLinks?.github || "",
    portfolio: user.socialLinks?.portfolio || "",
    website: user.socialLinks?.website || "",
  },
  profileImage: user.profileImage ? `/api/v1/avatars/${user.profileImage}` : "",
  pendingEmail: user.pendingEmail || "",
  notificationPrefs: user.notificationPrefs || {},
});
exports.me = asyncHandler(async (req, res) =>
  res.json({ data: publicUserDto(req.user) }),
);

const profileFields = [
  "name",
  "phone",
  "headline",
  "location",
  "bio",
  "skills",
  "companyName",
  "companyWebsite",
  "socialLinks",
  "timezone",
  "locale",
];
exports.updateProfile = asyncHandler(async (req, res) => {
  for (const key of profileFields)
    if (req.body[key] !== undefined) req.user[key] = req.body[key];
  await req.user.save();
  await audit({
    req,
    action: "user.profile_updated",
    resourceType: "user",
    resourceId: req.user._id,
    metadata: { fields: profileFields.filter((key) => req.body[key] !== undefined) },
  });
  res.json({ data: publicUserDto(req.user) });
});

exports.updateNotificationPrefs = asyncHandler(async (req, res) => {
  for (const category of ["applications", "interviews", "jobs", "candidates"]) {
    if (!req.body[category]) continue;
    if (typeof req.body[category].inApp === "boolean")
      req.user.notificationPrefs[category].inApp = req.body[category].inApp;
    if (typeof req.body[category].email === "boolean")
      req.user.notificationPrefs[category].email = req.body[category].email;
  }
  // Account/security events are always delivered; never stored as off.
  await req.user.save();
  res.json({ data: { notificationPrefs: req.user.notificationPrefs } });
});

exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("A profile photo is required", 422, "FILE_REQUIRED");
  const user = await User.findById(req.user._id);
  if (user.profileImage) {
    try {
      await storageService.deleteAvatar(user.profileImage, user.profileImageProvider);
    } catch (error) {
      logger.error(`Old avatar cleanup failed: ${error.message}`);
    }
  }
  const saved = await storageService.saveImage({
    buffer: req.file.buffer,
    originalName: req.file.originalname || "avatar.jpg",
  });
  user.profileImage = saved.storageKey;
  user.profileImageProvider = saved.provider;
  await user.save();
  await audit({
    req,
    action: "user.avatar_updated",
    resourceType: "user",
    resourceId: user._id,
  });
  res.status(201).json({ data: { profileImage: "/api/v1/users/me/avatar" } });
});

exports.removeAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.profileImage) {
    try {
      await storageService.deleteAvatar(user.profileImage, user.profileImageProvider);
    } catch (error) {
      logger.error(`Avatar deletion failed: ${error.message}`);
    }
  }
  user.profileImage = "";
  await user.save();
  res.json({ data: { profileImage: "" } });
});

// Public delivery by storage key. The key is a random UUID issued at upload
// time (capability URL); the ownership check keeps deleted avatars 404.
exports.avatarByKey = asyncHandler(async (req, res) => {
  const key = String(req.params.key || "");
  if (!/^avatar-[0-9a-f-]+\.(jpg|jpeg|png|webp)$/i.test(key))
    throw new AppError("No profile photo", 404, "RESOURCE_NOT_FOUND");
  const user = await User.findOne({ profileImage: key }).select("_id profileImageProvider");
  if (!user) throw new AppError("No profile photo", 404, "RESOURCE_NOT_FOUND");
  const stream = await storageService.getAvatarStream(user.profileImage, user.profileImageProvider);
  res.setHeader("Content-Type", contentTypeFor(key));
  res.setHeader("Cache-Control", "public, max-age=86400");
  stream.pipe(res);
});
const contentTypeFor = (key) =>
  key.toLowerCase().endsWith(".png")
    ? "image/png"
    : key.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

exports.avatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.profileImage) throw new AppError("No profile photo", 404, "RESOURCE_NOT_FOUND");
  const stream = await storageService.getAvatarStream(user.profileImage, user.profileImageProvider);
  res.setHeader("Content-Type", contentTypeFor(user.profileImage));
  res.setHeader("Cache-Control", "private, max-age=86400");
  stream.pipe(res);
});
exports.exportData = asyncHandler(async (req, res) => {
  const [profile, resumes, versions, parsed, applications, consents] = await Promise.all([
    CandidateProfile.findOne({ user: req.user._id }).lean(),
    Resume.find({ candidate: req.user._id }).lean(),
    ResumeVersion.find({ candidate: req.user._id }).select("-storageKey -text").lean(),
    ParsedResume.find({ candidate: req.user._id }).lean(),
    Application.find({ candidate: req.user._id })
      .select("-recruiterNotes -resumeSnapshot.storageKey -resumeSnapshot.text")
      .lean(),
    Consent.find({ user: req.user._id }).lean(),
  ]);
  await audit({
    req,
    action: "user.data_exported",
    resourceType: "user",
    resourceId: req.user._id,
  });
  res.json({
    data: {
      exportedAt: new Date(),
      identity: { id: req.user._id, name: req.user.name, email: req.user.email },
      profile,
      resumes,
      resumeVersions: versions,
      parsedResumes: parsed,
      applications,
      consents,
    },
  });
});
exports.consents = asyncHandler(async (req, res) => {
  const items = await Consent.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ data: items });
});
exports.setConsent = asyncHandler(async (req, res) => {
  let item = await Consent.findOne({
    user: req.user._id,
    purpose: req.params.purpose,
    policyVersion: req.body.policyVersion,
  });
  if (!item)
    item = new Consent({
      user: req.user._id,
      purpose: req.params.purpose,
      policyVersion: req.body.policyVersion,
      source: "settings",
    });
  if (req.body.granted) {
    item.grantedAt = new Date();
    item.revokedAt = null;
  } else item.revokedAt = new Date();
  await item.save();
  await audit({
    req,
    action: req.body.granted ? "consent.granted" : "consent.revoked",
    resourceType: "consent",
    resourceId: item._id,
    metadata: { purpose: item.purpose, policyVersion: item.policyVersion },
  });
  res.json({ data: item });
});
exports.requestDeletion = asyncHandler(async (req, res) => {
  req.user.accountStatus = "deletion_pending";
  req.user.isActive = false;
  req.user.tokenInvalidBefore = new Date();
  await req.user.save();
  await AuthSession.updateMany(
    { user: req.user._id, revokedAt: null },
    { revokedAt: new Date(), revokeReason: "account_deletion_requested" },
  );
  await audit({
    req,
    action: "user.deletion_requested",
    resourceType: "user",
    resourceId: req.user._id,
    metadata: { reason: req.body.reason || "" },
  });
  res.status(202).json({ data: { status: "deletion_pending" } });
});
