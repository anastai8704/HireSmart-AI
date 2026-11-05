const mongoose = require("mongoose");

const educationSchema = new mongoose.Schema(
  {
    institution: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    degree: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    fieldOfStudy: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    startYear: {
      type: Number,
      min: 1950,
      max: 2100,
    },
    endYear: {
      type: Number,
      min: 1950,
      max: 2100,
    },
    cgpa: {
      type: Number,
      min: 0,
      max: 10,
    },
  },
  { _id: true },
);

const experienceSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    position: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    startDate: Date,
    endDate: Date,
    currentlyWorking: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true },
);

const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    technologies: {
      type: [String],
      default: [],
    },
    githubUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
    },
    liveUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
    },
  },
  { _id: true },
);

const certificateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    issuer: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    issueDate: Date,
    certificateUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
    },
  },
  { _id: true },
);

// Candidate-reported employment details. Shown to recruiters only when the candidate has disclosed
// them AND allowed sharing (privacy.shareCurrentEmployment). The platform never infers these.
const currentEmploymentSchema = new mongoose.Schema(
  {
    disclosed: { type: Boolean, default: false },
    employer: { type: String, trim: true, maxlength: 200, default: "" },
    designation: { type: String, trim: true, maxlength: 200, default: "" },
    startDate: { type: Date, default: null },
  },
  { _id: false },
);

const candidateProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    employmentStatus: {
      type: String,
      enum: ["unspecified", "employed", "unemployed", "student", "freelancer", "other"],
      default: "unspecified",
    },
    currentEmployment: { type: currentEmploymentSchema, default: () => ({}) },
    jobPreferences: {
      desiredRoles: { type: [String], default: [] },
      preferredLocations: { type: [String], default: [] },
      workplaceModes: {
        type: [String],
        enum: ["onsite", "hybrid", "remote"],
        default: [],
      },
      employmentTypes: { type: [String], default: [] },
    },
    // Privacy is closed by default: contact details and employment are not shared with recruiters
    // unless the candidate turns them on. Resumes are only available to recruiters who received
    // the candidate's application for their company.
    privacy: {
      sharePhoneWithRecruiters: { type: Boolean, default: false },
      shareCurrentEmployment: { type: Boolean, default: false },
    },

    dateOfBirth: Date,

    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },

    address: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    state: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    country: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    languages: {
      type: [String],
      default: [],
    },

    socialLinks: {
      github: {
        type: String,
        trim: true,
        maxlength: 2048,
      },
      linkedin: {
        type: String,
        trim: true,
        maxlength: 2048,
      },
      portfolio: {
        type: String,
        trim: true,
        maxlength: 2048,
      },
      website: {
        type: String,
        trim: true,
        maxlength: 2048,
      },
    },

    education: {
      type: [educationSchema],
      default: [],
    },

    experience: {
      type: [experienceSchema],
      default: [],
    },

    projects: {
      type: [projectSchema],
      default: [],
    },

    certifications: {
      type: [certificateSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("CandidateProfile", candidateProfileSchema);
