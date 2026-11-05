const mongoose = require("mongoose");
const { protectRecords } = require("./plugins/protectRecords");

/**
 * One row per provider webhook delivery. `eventId` is unique, so a redelivered event is detected and
 * never processed twice. A row is removed if processing fails, so the provider's retry is processed.
 */
const paymentWebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["razorpay"], required: true },
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true, index: true },
    status: { type: String, enum: ["processing", "processed"], default: "processing", index: true },
    outcome: { type: String, default: "" },
    providerOrderId: { type: String, default: "", index: true },
    providerPaymentId: { type: String, default: "", index: true },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentWebhookEventSchema.plugin(protectRecords);

const PaymentWebhookEvent = mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema);

module.exports = { PaymentWebhookEvent };
