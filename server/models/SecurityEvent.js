const mongoose = require("mongoose");
const securityEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    type: { type: String, required: true, index: true, maxlength: 100 },
    severity: {
      type: String,
      enum: ["info", "low", "medium", "high", "critical"],
      default: "info",
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "investigating", "resolved", "dismissed"],
      default: "open",
      index: true,
    },
    requestId: { type: String, default: "" },
    ipHash: { type: String, default: "" },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    investigationNotes: [
      {
        note: { type: String, required: true, maxlength: 2000 },
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        authorName: { type: String, default: "Platform Admin" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    resolutionReason: { type: String, default: "", maxlength: 1000 },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
securityEventSchema.index({ createdAt: -1 });
module.exports = mongoose.model("SecurityEvent", securityEventSchema);
