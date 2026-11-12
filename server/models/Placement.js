const mongoose = require("mongoose");
const { protectRecords } = require("./plugins/protectRecords");

const placementStatuses = Object.freeze([
  "selected",
  "hired",
  "joining_confirmed",
  "placement_verified",
  "currently_working",
  "employment_ended",
]);

const placementSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      unique: true,
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: placementStatuses,
      default: "hired",
      index: true,
    },
    offerDetails: {
      designation: { type: String, trim: true, default: "" },
      ctc: { type: Number, min: 0, default: 0 },
      currency: { type: String, default: "INR" },
      offerDate: { type: Date, default: Date.now },
      offeredJoiningDate: { type: Date, default: null },
      // When the candidate accepted the offer (recorded by the candidate, see Application.offer).
      acceptedAt: { type: Date, default: null },
    },
    joiningConfirmation: {
      confirmedByCandidate: { type: Boolean, default: false },
      actualJoiningDate: { type: Date, default: null },
      confirmedAt: { type: Date, default: null },
      candidateNotes: { type: String, trim: true, maxlength: 2000, default: "" },
    },
    verification: {
      isVerified: { type: Boolean, default: false },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      verifiedAt: { type: Date, default: null },
      proofDocumentUrl: { type: String, default: "" },
      adminRemarks: { type: String, trim: true, maxlength: 2000, default: "" },
    },
    employmentPeriod: {
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
      exitReason: { type: String, trim: true, maxlength: 2000, default: "" },
    },
    // Who reported the latest employment status change. Distinct from verification.isVerified,
    // which is set only by a platform administrator after independent checks.
    employmentStatusSource: {
      type: String,
      enum: ["", "candidate_reported", "organization_reported", "platform_reported"],
      default: "",
    },
    // Append-only history of placement and employment events. Entries are added, never edited or removed.
    // Reported (candidate or company) and verified (platform administrator) facts are separate events.
    employmentHistory: {
      type: [
        {
          _id: false,
          event: {
            type: String,
            enum: ["placement_created", "joining_confirmed", "employment_reported", "placement_verified"],
            required: true,
          },
          fromStatus: { type: String, default: "" },
          toStatus: { type: String, default: "" },
          source: { type: String, default: "" },
          actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          at: { type: Date, required: true, default: Date.now },
          startDate: { type: Date, default: null },
          endDate: { type: Date, default: null },
          note: { type: String, trim: true, maxlength: 2000, default: "" },
        },
      ],
      default: [],
    },
    employmentStatusUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    employmentStatusUpdatedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

placementSchema.index({ organization: 1, status: 1 });
placementSchema.index({ candidate: 1, status: 1 });
placementSchema.index({ createdAt: -1 });

placementSchema.plugin(protectRecords);

module.exports = {
  Placement: mongoose.model("Placement", placementSchema),
  placementStatuses,
};
