const mongoose = require("mongoose");
const { protectRecords } = require("./plugins/protectRecords");

/**
 * A Razorpay plan this platform created for one (planTier, billingCycle, amount) combination.
 * Plans are created on demand and reused. A price change creates a new row, so existing subscriptions keep
 * the plan they were authorised on.
 */
const razorpayPlanSchema = new mongoose.Schema(
  {
    planTier: { type: String, required: true },
    billingCycle: { type: String, enum: ["monthly", "yearly"], required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR" },
    razorpayPlanId: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

razorpayPlanSchema.index({ planTier: 1, billingCycle: 1, amountPaise: 1, currency: 1 }, { unique: true });
razorpayPlanSchema.plugin(protectRecords);

const RazorpayPlan = mongoose.model("RazorpayPlan", razorpayPlanSchema);

module.exports = { RazorpayPlan };
