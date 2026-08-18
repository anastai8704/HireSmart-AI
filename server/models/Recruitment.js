const mongoose = require("mongoose");

const candidateMatchSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null, index: true },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    jobVersion: { type: Number, min: 1, default: 1 },
    resumeVersion: { type: mongoose.Schema.Types.ObjectId, ref: "ResumeVersion", default: null },
    scorePolicyVersion: { type: String, default: "hybrid-v1" },
    overallScore: { type: Number, min: 0, max: 100, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    componentScores: { type: mongoose.Schema.Types.Mixed, required: true },
    matchedSkills: { type: [String], default: [] },
    missingRequiredSkills: { type: [String], default: [] },
    missingPreferredSkills: { type: [String], default: [] },
    experienceEvidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    educationEvidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    semanticEvidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    strengths: { type: [String], default: [] },
    concerns: { type: [String], default: [] },
    recommendation: { type: String, maxlength: 100 },
    limitations: { type: [String], default: [] },
    modelMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["completed", "failed", "stale"], default: "completed", index: true },
}, { timestamps: true });
candidateMatchSchema.index({ organization: 1, job: 1, overallScore: -1 });
candidateMatchSchema.index({ application: 1, scorePolicyVersion: 1 }, { unique: true, partialFilterExpression: { application: { $type: "objectId" } } });

const noteSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    targetType: { type: String, enum: ["application", "candidate", "job", "interview"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    visibility: { type: String, enum: ["private", "hiring_team"], default: "hiring_team" },
    tags: { type: [String], default: [] },
    archivedAt: { type: Date, default: null },
}, { timestamps: true, optimisticConcurrency: true });
noteSchema.index({ organization: 1, targetType: 1, targetId: 1, createdAt: -1 });

module.exports = {
    CandidateMatch: mongoose.model("CandidateMatch", candidateMatchSchema),
    Note: mongoose.model("Note", noteSchema),
};
