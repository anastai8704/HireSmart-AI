const mongoose = require("mongoose");
const { roles } = require("../constants/enums");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(roles),
      default: roles.candidate,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationTokenExpires: {
      type: Date,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordTokenExpires: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
    tokenInvalidBefore: {
      type: Date,
      default: null,
    },
    accountStatus: {
      type: String,
      enum: ["pending_verification", "active", "suspended", "deletion_pending", "deleted"],
      default: "pending_verification",
      index: true,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    locale: { type: String, default: "en", maxlength: 20 },
    timezone: { type: String, default: "UTC", maxlength: 100 },
    phone: {
      type: String,
      default: "",
      trim: true,
      maxlength: 30,
    },
    profileImage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2048,
    },
    profileImageProvider: {
      type: String,
      enum: ["local", "s3"],
      default: "local",
    },
    socialLinks: {
      linkedin: { type: String, default: "", trim: true, maxlength: 2048 },
      github: { type: String, default: "", trim: true, maxlength: 2048 },
      portfolio: { type: String, default: "", trim: true, maxlength: 2048 },
      website: { type: String, default: "", trim: true, maxlength: 2048 },
    },
    pendingEmail: { type: String, default: "", lowercase: true, trim: true, select: false },
    pendingEmailToken: { type: String, select: false },
    pendingEmailTokenExpires: { type: Date, select: false },
    notificationPrefs: {
      applications: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
      },
      interviews: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
      },
      jobs: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
      },
      candidates: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
      },
      // Event-level preferences added by the role-based notification
      // system: { [eventType]: { inApp, email } }. Open (Mixed) because the
      // event catalog lives in config/notificationTypes.js and the API
      // filters keys to known events before writing.
      events: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    headline: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },
    location: {
      type: String,
      default: "",
      trim: true,
      maxlength: 150,
    },
    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    skills: {
      type: [String],
      default: [],
    },
    companyName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 150,
    },
    companyWebsite: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2048,
    },
    companyDescription: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    department: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    hiringSpecializations: {
      type: [String],
      default: [],
    },
    savedJobs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job",
      },
    ],
    resume: {
      type: String,
      default: "",
    },
    resumeProvider: {
      type: String,
      enum: ["local", "s3"],
      default: "local",
    },
    resumeOriginalName: {
      type: String,
      default: "",
    },
    resumeMimeType: {
      type: String,
      default: "",
    },
    resumeSize: {
      type: Number,
      default: 0,
    },
    resumeUploadedAt: {
      type: Date,
      default: null,
    },
    resumeText: {
      type: String,
      default: "",
    },
    resumeSummary: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ role: 1, createdAt: -1 });

userSchema.index({ profileImage: 1 }, { sparse: true });
module.exports = mongoose.model("User", userSchema);
