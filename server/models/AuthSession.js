const mongoose = require("mongoose");
const authSessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    previousTokenHash: { type: String, default: null, select: false, index: true },
    csrfHash: { type: String, required: true, select: false },
    familyId: { type: String, required: true, index: true },
    userAgent: { type: String, maxlength: 500, default: "" },
    ipHash: { type: String, maxlength: 64, default: "" },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    revokeReason: { type: String, maxlength: 100, default: "" },
}, { timestamps: true });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("AuthSession", authSessionSchema);
