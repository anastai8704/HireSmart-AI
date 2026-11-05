const mongoose = require("mongoose");
const { protectRecords } = require("./plugins/protectRecords");

// initiated -> captured | failed | cancelled ; captured -> refunded (full refund only).
const transactionStatuses = Object.freeze(["initiated", "captured", "failed", "cancelled", "refunded"]);
const paymentGateways = Object.freeze(["razorpay", "simulation"]);

const paymentTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
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
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },
    planTier: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },
    status: {
      type: String,
      enum: transactionStatuses,
      default: "initiated",
      index: true,
    },
    gateway: {
      type: String,
      enum: paymentGateways,
      default: "simulation",
    },
    // Indexed (unique, partial) below.
    gatewayOrderId: {
      type: String,
      default: "",
    },
    gatewayPaymentId: {
      type: String,
      default: "",
    },
    gatewaySignature: {
      type: String,
      default: "",
    },
    invoiceNumber: {
      type: String,
      default: "",
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

paymentTransactionSchema.index({ createdAt: -1 });
paymentTransactionSchema.index({ subscriberType: 1, subscriberId: 1, createdAt: -1 });
// One gateway order maps to one transaction, and one gateway payment can capture at most one
// order (replay protection). Partial filters exclude the empty-string defaults.
paymentTransactionSchema.index(
  { gatewayOrderId: 1 },
  { unique: true, partialFilterExpression: { gatewayOrderId: { $gt: "" } } },
);
paymentTransactionSchema.index(
  { gatewayPaymentId: 1 },
  { unique: true, partialFilterExpression: { gatewayPaymentId: { $gt: "" } } },
);

paymentTransactionSchema.plugin(protectRecords);

module.exports = {
  PaymentTransaction: mongoose.model("PaymentTransaction", paymentTransactionSchema),
  transactionStatuses,
  paymentGateways,
};
