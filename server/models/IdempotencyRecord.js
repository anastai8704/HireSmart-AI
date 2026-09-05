const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scope: { type: String, required: true, maxlength: 120 },
    key: { type: String, required: true, maxlength: 120 },
    requestHash: { type: String, required: true },
    statusCode: { type: Number, required: true },
    response: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
schema.index({ actor: 1, scope: 1, key: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("IdempotencyRecord", schema);
