const mongoose = require("mongoose");
const feedbackSchema = new mongoose.Schema({
    evaluator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ratings: [{ criterion: { type: String, required: true, maxlength: 100 }, score: { type: Number, min: 1, max: 5, required: true }, evidence: { type: String, maxlength: 2000, default: "" } }],
    recommendation: { type: String, enum: ["strong_yes", "yes", "mixed", "no", "strong_no"], required: true },
    summary: { type: String, maxlength: 5000, default: "" },
    submittedAt: { type: Date, default: Date.now },
}, { _id: true });
const interviewSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    type: { type: String, enum: ["phone", "video", "onsite", "technical", "panel", "hr"], default: "video" },
    status: { type: String, enum: ["draft", "invited", "confirmed", "reschedule_requested", "cancelled", "completed"], default: "draft", index: true },
    scheduledStart: { type: Date, default: null, index: true },
    scheduledEnd: { type: Date, default: null },
    timezone: { type: String, default: "UTC", maxlength: 100 },
    location: { type: String, default: "", maxlength: 500 },
    meetingUrl: { type: String, default: "", maxlength: 2048 },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    candidateConfirmedAt: { type: Date, default: null },
    cancelledReason: { type: String, default: "", maxlength: 1000 },
    remindersSent: { type: [String], default: [] },
    feedback: { type: [feedbackSchema], default: [] },
}, { timestamps: true, optimisticConcurrency: true });
interviewSchema.index({ organization: 1, scheduledStart: 1 });
module.exports = mongoose.model("Interview", interviewSchema);
