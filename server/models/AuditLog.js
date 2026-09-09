const mongoose = require("mongoose");
const auditLogSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    action: { type: String, required: true, index: true, maxlength: 120 },
    resourceType: { type: String, required: true, maxlength: 80 },
    resourceId: { type: String, default: "", index: true },
    outcome: { type: String, enum: ["success", "denied", "failure"], default: "success" },
    requestId: { type: String, default: "", index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ organization: 1, createdAt: -1 });
module.exports = mongoose.model("AuditLog", auditLogSchema);
