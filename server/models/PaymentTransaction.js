const mongoose = require("mongoose");

const transactionStatuses = Object.freeze(["initiated", "captured", "failed", "refunded"]);
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
    gatewayOrderId: {
      type: String,
      default: "",
      index: true,
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

module.exports = {
  PaymentTransaction: mongoose.model("PaymentTransaction", paymentTransactionSchema),
  transactionStatuses,
  paymentGateways,
};
