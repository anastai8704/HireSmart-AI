const mongoose = require("mongoose");
const jobRunSchema = new mongoose.Schema({
    type: { type: String, required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
    status: { type: String, enum: ["queued", "processing", "completed", "failed", "cancelled"], default: "queued", index: true },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date, default: null },
    error: { code: String, message: String },
}, { timestamps: true });
jobRunSchema.index({ status: 1, nextAttemptAt: 1 });
module.exports = mongoose.model("JobRun", jobRunSchema);
