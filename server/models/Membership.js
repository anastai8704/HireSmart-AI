const mongoose = require("mongoose");

const permissionsByRole = Object.freeze({
  owner: [
    "organization.manage",
    "member.manage",
    "job.manage",
    "job.read",
    "application.manage",
    "application.review",
    "interview.manage",
    "interview.feedback",
    "analytics.read",
    "audit.read",
  ],
  admin: [
    "organization.manage",
    "member.manage",
    "job.manage",
    "job.read",
    "application.manage",
    "application.review",
    "interview.manage",
    "interview.feedback",
    "analytics.read",
    "audit.read",
  ],
  recruiter: [
    "job.manage",
    "job.read",
    "application.manage",
    "application.review",
    "interview.manage",
    "interview.feedback",
    "analytics.read",
  ],
  hiring_manager: [
    "job.read",
    "application.review",
    "application.manage",
    "interview.feedback",
    "analytics.read",
  ],
  interviewer: ["application.review", "interview.feedback"],
  viewer: ["job.read"],
});
const membershipSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: Object.keys(permissionsByRole), required: true, index: true },
    status: {
      type: String,
      enum: ["invited", "active", "suspended", "revoked"],
      default: "active",
      index: true,
    },
    permissions: { type: [String], default: [] },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
membershipSchema.index({ organization: 1, user: 1 }, { unique: true });
membershipSchema.methods.hasPermission = function hasPermission(permission) {
  return (
    this.status === "active" &&
    (permissionsByRole[this.role] || []).concat(this.permissions).includes(permission)
  );
};
module.exports = { Membership: mongoose.model("Membership", membershipSchema), permissionsByRole };
