const mongoose = require("mongoose");

// A pending team invitation sent by an org owner/admin. The invited person
// accepts it through a token link and joins the organization with the
// assigned role. Mirrors the real-world "invite by email" flow used by
// mainstream ATS products.
const inviteSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    // Owner cannot be invited (ownership is not transferable in v1).
    role: {
      type: String,
      enum: ["recruiter", "admin", "hiring_manager", "interviewer", "viewer"],
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked"],
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

inviteSchema.index({ organization: 1, email: 1, status: 1 });

module.exports = mongoose.model("Invite", inviteSchema);
