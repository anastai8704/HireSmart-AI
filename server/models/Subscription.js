const mongoose = require("mongoose");
const { protectRecords } = require("./plugins/protectRecords");

const planTiers = Object.freeze([
  "candidate_free",
  "candidate_plus",
  "recruiter_starter",
  "recruiter_growth",
  "recruiter_enterprise",
]);

const subscriptionStatuses = Object.freeze(["active", "past_due", "canceled", "expired"]);

const subscriptionSchema = new mongoose.Schema(
  {
    subscriberType: {
      type: String,
      enum: ["candidate", "organization"],
      required: true,
      index: true,
    },
    subscriberId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    planTier: {
      type: String,
      enum: planTiers,
      required: true,
      default: "candidate_free",
      index: true,
    },
    status: {
      type: String,
      enum: subscriptionStatuses,
      default: "active",
      index: true,
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    priceInr: {
      type: Number,
      min: 0,
      default: 0,
    },
    currentPeriodStart: {
      type: Date,
      default: Date.now,
    },
    currentPeriodEnd: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    limits: {
      activeJobs: { type: Number, default: 3 },
      teamMembers: { type: Number, default: 2 },
      aiAnalysesPerMonth: { type: Number, default: 50 },
    },
    usage: {
      activeJobsCount: { type: Number, default: 0 },
      teamMembersCount: { type: Number, default: 0 },
      aiAnalysesUsedThisMonth: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  },
);

subscriptionSchema.index({ subscriberType: 1, subscriberId: 1 }, { unique: true });

subscriptionSchema.plugin(protectRecords);

module.exports = {
  Subscription: mongoose.model("Subscription", subscriptionSchema),
  planTiers,
  subscriptionStatuses,
};
