const mongoose = require("mongoose");
const { appendOnly, protectRecords } = require("./plugins/protectRecords");
const { canTransition, statesOf } = require("../domain/stateMachines");

// Append-only job history. Each event records one status change with its actor and reason.
// Lifecycle events track Job.status; moderation events track Job.moderation.status.
const areas = Object.freeze({ lifecycle: "jobLifecycle", moderation: "jobModeration" });

const jobModerationEventSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    area: { type: String, enum: Object.keys(areas), required: true },
    fromStatus: {
      type: String,
      // Mongoose "required" rejects empty strings, so only the lifecycle area requires a value.
      // A first moderation event legitimately starts from "" (meaning "none").
      required: function requiredForLifecycle() {
        return this.area === "lifecycle";
      },
      trim: true,
      validate: {
        validator(value) {
          // A new job has no prior moderation state, so "" is allowed as the starting point.
          if (value === "") return this.area === "moderation";
          return statesOf(areas[this.area]).includes(value);
        },
        message: "fromStatus is not a valid state for this area",
      },
    },
    toStatus: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          // Moderation starts from the "none" state; lifecycle has no empty starting state.
          const raw = this.fromStatus || "";
          const from = raw === "" && this.area === "moderation" ? "none" : raw;
          return canTransition(areas[this.area], from, value);
        },
        message: "toStatus is not a valid transition from fromStatus for this area",
      },
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, trim: true, maxlength: 1000, default: "" },
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false },
);

jobModerationEventSchema.index({ job: 1, createdAt: -1 });
jobModerationEventSchema.index({ organization: 1, createdAt: -1 });

jobModerationEventSchema.plugin(appendOnly);
jobModerationEventSchema.plugin(protectRecords);

module.exports = {
  JobModerationEvent: mongoose.model("JobModerationEvent", jobModerationEventSchema),
  moderationAreas: areas,
};
