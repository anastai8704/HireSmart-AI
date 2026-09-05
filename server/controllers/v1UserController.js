const AuthSession = require("../models/AuthSession");
const CandidateProfile = require("../models/CandidateProfile");
const { Resume, ResumeVersion, ParsedResume } = require("../models/Resume");
const { Application } = require("../models/Application");
const Consent = require("../models/Consent");
const asyncHandler = require("../middleware/asyncHandler");
const { audit } = require("../services/auditService");
exports.me = asyncHandler(async (req, res) =>
  res.json({
    data: {
      id: req.user._id,
      displayName: req.user.name,
      email: req.user.email,
      emailVerified: req.user.emailVerified,
      role: req.user.role,
      status: req.user.accountStatus,
      locale: req.user.locale,
      timezone: req.user.timezone,
      onboardingCompleted: req.user.onboardingCompleted,
    },
  }),
);
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
