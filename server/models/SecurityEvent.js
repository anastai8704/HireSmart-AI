const mongoose = require("mongoose");
const securityEventSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    type: { type: String, required: true, index: true, maxlength: 100 },
    severity: { type: String, enum: ["info", "low", "medium", "high", "critical"], default: "info", index: true },
    requestId: { type: String, default: "" },
    ipHash: { type: String, default: "" },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    resolvedAt: { type: Date, default: null },
}, { timestamps: true });
securityEventSchema.index({ createdAt: -1 });
module.exports = mongoose.model("SecurityEvent", securityEventSchema);
