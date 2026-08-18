const mongoose = require("mongoose");
const aiAnalysisSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    feature: { type: String, required: true, index: true },
    subjectType: { type: String, required: true },
    subjectId: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    promptVersion: { type: String, required: true },
    schemaVersion: { type: String, default: "1.0" },
    output: { type: mongoose.Schema.Types.Mixed, required: true },
    confidence: { type: Number, min: 0, max: 1, default: null },
    fallbackUsed: { type: Boolean, default: false },
    usage: { inputTokens: Number, outputTokens: Number, estimatedCostUsd: Number, latencyMs: Number },
    status: { type: String, enum: ["completed", "failed"], default: "completed" },
}, { timestamps: true });
aiAnalysisSchema.index({ organization: 1, feature: 1, createdAt: -1 });
module.exports = mongoose.model("AIAnalysis", aiAnalysisSchema);
