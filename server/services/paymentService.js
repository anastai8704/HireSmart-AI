const crypto = require("node:crypto");
const AppError = require("../utils/AppError");

/**
 * Payment sandbox service.
 *
 * Phase 0.5 (security hotfix): this service only supports two modes:
 *   - "disabled"   (default) — every payment operation fails closed with 503.
 *   - "simulation" — a local, TEST-ONLY sandbox. Rejected in production.
 *
 * Live payment providers are intentionally NOT implemented here. Live modes and
 * provider credentials are rejected by config/env.js validation. Razorpay test-mode
 * integration is planned for a later, separately approved phase.
 *
 * All configuration is read from process.env at call time so that behaviour can be
 * verified in tests. Secrets never leave the server.
 */

const PAYMENT_MODE_DISABLED = "disabled";
const PAYMENT_MODE_SIMULATION = "simulation";
const SIMULATION_SECRET_MIN_LENGTH = 32;

const readPaymentConfig = () => ({
  mode: String(process.env.PAYMENT_MODE || PAYMENT_MODE_DISABLED)
    .trim()
    .toLowerCase(),
  simulationSecret: process.env.PAYMENT_SIMULATION_SECRET || "",
  isProduction: String(process.env.NODE_ENV || "").toLowerCase() === "production",
  liveCredentialsPresent: Boolean(process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_SECRET),
});

/**
 * Throws if the payment configuration is unsafe. Pure function so it can be unit tested.
 * Accepts an explicit config object (see readPaymentConfig).
 */
const validatePaymentConfig = (cfg = readPaymentConfig()) => {
  if (cfg.liveCredentialsPresent) {
    throw new Error(
      "Live payment provider credentials must not be configured in this release. Remove RAZORPAY_* variables.",
    );
  }
  if (![PAYMENT_MODE_DISABLED, PAYMENT_MODE_SIMULATION].includes(cfg.mode)) {
    throw new Error(
      `PAYMENT_MODE must be "${PAYMENT_MODE_DISABLED}" or "${PAYMENT_MODE_SIMULATION}". Live payment modes are not permitted in this release.`,
    );
  }
  if (cfg.mode === PAYMENT_MODE_SIMULATION) {
    if (cfg.isProduction) {
      throw new Error("PAYMENT_MODE=simulation is not allowed when NODE_ENV=production.");
    }
    if (cfg.simulationSecret.length < SIMULATION_SECRET_MIN_LENGTH) {
      throw new Error(
        `PAYMENT_SIMULATION_SECRET must be at least ${SIMULATION_SECRET_MIN_LENGTH} characters when PAYMENT_MODE=simulation.`,
      );
    }
  }
  return true;
};

const getPaymentMode = () => readPaymentConfig().mode;

const isSimulationEnabled = (cfg = readPaymentConfig()) => {
  try {
    validatePaymentConfig(cfg);
  } catch {
    return false;
  }
  return cfg.mode === PAYMENT_MODE_SIMULATION;
};

const requireSimulationEnabled = () => {
  if (!isSimulationEnabled()) {
    throw new AppError(
      "Payments are not configured on this server",
      503,
      "PAYMENT_NOT_CONFIGURED",
    );
  }
};

/** Creates a sandbox order. The amount must come from the server-side plan, never the client. */
const createOrder = async ({ amount, currency = "INR", receipt = "" }) => {
  requireSimulationEnabled();
  const orderId = `order_sim_${crypto.randomBytes(12).toString("hex")}`;
  return {
    orderId,
    amount,
    currency: String(currency).toUpperCase(),
    receipt: receipt || `rcpt_sim_${Date.now()}`,
    status: "created",
    mode: PAYMENT_MODE_SIMULATION,
  };
};

/** Server-issued sandbox payment identifier. The client must echo this value back. */
const generateSimulationPaymentId = () => `pay_sim_${crypto.randomBytes(12).toString("hex")}`;

const computeSimulationSignature = (orderId, paymentId, secret) =>
  crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

/** HMAC-SHA256 over "orderId|paymentId" using the server-side sandbox secret. */
const generateSimulationSignature = (orderId, paymentId) => {
  requireSimulationEnabled();
  return computeSimulationSignature(orderId, paymentId, readPaymentConfig().simulationSecret);
};

const safeEqualHex = (a, b) => {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

/**
 * Verifies a sandbox payment signature. Returns false (never throws for bad input) when the
 * sandbox is disabled, so a disabled deployment can never accept any payment proof.
 * The legacy "sim_sig_<orderId>" format is no longer accepted.
 */
const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return false;
  if (!isSimulationEnabled()) return false;
  const expected = computeSimulationSignature(
    String(orderId),
    String(paymentId),
    readPaymentConfig().simulationSecret,
  );
  return safeEqualHex(signature, expected);
};

/** Generates an invoice identifier (e.g. INV-202611-ABCD). */
const generateInvoiceNumber = () => {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `INV-${ym}-${rand}`;
};

module.exports = {
  PAYMENT_MODE_DISABLED,
  PAYMENT_MODE_SIMULATION,
  readPaymentConfig,
  validatePaymentConfig,
  getPaymentMode,
  isSimulationEnabled,
  createOrder,
  generateSimulationPaymentId,
  generateSimulationSignature,
  verifyPaymentSignature,
  generateInvoiceNumber,
};
