const crypto = require("node:crypto");
const logger = require("../utils/logger");

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const PAYMENT_MODE = process.env.PAYMENT_MODE || (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET ? "live" : "simulation");

const SIMULATION_SECRET = "hiresmart_simulation_secret_2026";

/**
 * Creates a payment order (Razorpay or Simulation mode).
 */
const createOrder = async ({ amount, currency = "INR", receipt = "", notes = {} }) => {
  if (PAYMENT_MODE === "live" && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
    try {
      // Lazy-load razorpay if installed/configured
      const Razorpay = require("razorpay");
      const instance = new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
      });

      const order = await instance.orders.create({
        amount: Math.round(amount * 100), // amount in paisa
        currency: currency.toUpperCase(),
        receipt: receipt || `rcpt_${Date.now()}`,
        notes,
      });

      return {
        orderId: order.id,
        amount: order.amount / 100,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        mode: "live",
        keyId: RAZORPAY_KEY_ID,
      };
    } catch (err) {
      logger.error(`Razorpay order creation failed: ${err.message}. Falling back to simulation mode.`);
    }
  }

  // Simulation mode
  const orderId = `order_sim_${crypto.randomBytes(8).toString("hex")}`;
  return {
    orderId,
    amount,
    currency: currency.toUpperCase(),
    receipt: receipt || `rcpt_sim_${Date.now()}`,
    status: "created",
    mode: "simulation",
    keyId: "sim_key_hiresmart_test",
  };
};

/**
 * Generates a valid test signature for simulation mode.
 */
const generateSimulationSignature = (orderId, paymentId) => {
  return crypto.createHmac("sha256", SIMULATION_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
};

/**
 * Verifies payment signature (HMAC-SHA256).
 */
const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) {
    return false;
  }

  // Simulation verification
  if (orderId.startsWith("order_sim_") || signature.startsWith("sim_sig_")) {
    const expected = generateSimulationSignature(orderId, paymentId);
    return signature === expected || signature === `sim_sig_${orderId}`;
  }

  // Live Razorpay HMAC verification
  if (RAZORPAY_KEY_SECRET) {
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(body).digest("hex");
    return signature === expected;
  }

  return false;
};

/**
 * Generates an invoice identifier (e.g. INV-202611-ABCD).
 */
const generateInvoiceNumber = () => {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `INV-${ym}-${rand}`;
};

module.exports = {
  createOrder,
  verifyPaymentSignature,
  generateSimulationSignature,
  generateInvoiceNumber,
  PAYMENT_MODE,
};
