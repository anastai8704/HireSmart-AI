const mongoose = require("mongoose");
const consentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["terms", "privacy", "ai_processing", "talent_pool", "marketing"], required: true },
    policyVersion: { type: String, required: true, maxlength: 50 },
    grantedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    source: { type: String, enum: ["registration", "settings", "admin_import"], default: "settings" },
}, { timestamps: true });
consentSchema.index({ user: 1, purpose: 1, policyVersion: 1 }, { unique: true });
module.exports = mongoose.model("Consent", consentSchema);
