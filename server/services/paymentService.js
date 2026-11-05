const crypto = require("node:crypto");
const AppError = require("../utils/AppError");

/**
 * Payment service (Phase 7).
 *
 * Modes (PAYMENT_MODE):
 *   - "disabled"       (default) every payment operation fails closed with 503.
 *   - "simulation"     local TEST-ONLY sandbox. Refused unless NODE_ENV is development or test.
 *   - "razorpay_test"  Razorpay TEST mode through the official `razorpay` SDK. Requires test-mode keys
 *                      (rzp_test_...). Live keys are refused. Refused when NODE_ENV=production.
 *
 * Live payments are not enabled by this code. Enabling them needs a separate, approved change with
 * live credentials, a live-mode review, and end-to-end testing with those credentials.
 *
 * Trust rules (enforced by the controllers that call this module):
 *   - The amount always comes from the server-side plan, never from the client.
 *   - A subscription is activated only after a verified, captured payment. The frontend's
 *     success callback is not proof.
 *   - Checkout signatures and webhook signatures are verified with HMAC-SHA256 and a constant-time compare.
 *
 * Configuration is read from process.env at call time so behaviour can be verified in tests.
 */

const PAYMENT_MODE_DISABLED = "disabled";
const PAYMENT_MODE_SIMULATION = "simulation";
const PAYMENT_MODE_RAZORPAY_TEST = "razorpay_test";
const PAYMENT_MODES = [PAYMENT_MODE_DISABLED, PAYMENT_MODE_SIMULATION, PAYMENT_MODE_RAZORPAY_TEST];

const SIMULATION_SECRET_MIN_LENGTH = 32;
const WEBHOOK_SECRET_MIN_LENGTH = 16;
// Allowlist, not denylist: simulation runs only when NODE_ENV is explicitly development or test.
const SIMULATION_ALLOWED_NODE_ENVS = ["development", "test"];
const RAZORPAY_TEST_KEY_PREFIX = "rzp_test_";
const RAZORPAY_LIVE_KEY_PREFIX = "rzp_live_";

const readPaymentConfig = () => ({
  mode: String(process.env.PAYMENT_MODE || PAYMENT_MODE_DISABLED).trim().toLowerCase(),
  simulationSecret: process.env.PAYMENT_SIMULATION_SECRET || "",
  nodeEnv: String(process.env.NODE_ENV || "").trim().toLowerCase(),
  razorpayKeyId: String(process.env.RAZORPAY_KEY_ID || "").trim(),
  razorpayKeySecret: String(process.env.RAZORPAY_KEY_SECRET || "").trim(),
  razorpayWebhookSecret: String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim(),
});

const razorpayVarsPresent = (cfg) =>
  Boolean(cfg.razorpayKeyId || cfg.razorpayKeySecret || cfg.razorpayWebhookSecret);

/**
 * Throws if the payment configuration is unsafe. Pure apart from reading the config object.
 */
const validatePaymentConfig = (cfg = readPaymentConfig()) => {
  if (!PAYMENT_MODES.includes(cfg.mode)) {
    throw new Error(
      `PAYMENT_MODE must be one of "${PAYMENT_MODES.join('", "')}". Live payment modes are not permitted in this release.`,
    );
  }
  if (cfg.razorpayKeyId.startsWith(RAZORPAY_LIVE_KEY_PREFIX) || cfg.razorpayKeySecret.startsWith("rzp_live")) {
    throw new Error("Live payment provider credentials must not be configured in this release. Use rzp_test_ keys.");
  }
  if (razorpayVarsPresent(cfg) && cfg.mode !== PAYMENT_MODE_RAZORPAY_TEST) {
    throw new Error('RAZORPAY_* variables are set but PAYMENT_MODE is not "razorpay_test". Set one or remove them.');
  }
  if (cfg.mode === PAYMENT_MODE_SIMULATION) {
    if (!SIMULATION_ALLOWED_NODE_ENVS.includes(cfg.nodeEnv)) {
      throw new Error(
        `PAYMENT_MODE=simulation is only allowed when NODE_ENV is development or test (current: "${cfg.nodeEnv || "unset"}").`,
      );
    }
    if (cfg.simulationSecret.length < SIMULATION_SECRET_MIN_LENGTH) {
      throw new Error(
        `PAYMENT_SIMULATION_SECRET must be at least ${SIMULATION_SECRET_MIN_LENGTH} characters when PAYMENT_MODE=simulation.`,
      );
    }
  }
  if (cfg.mode === PAYMENT_MODE_RAZORPAY_TEST) {
    if (cfg.nodeEnv === "production") {
      throw new Error("PAYMENT_MODE=razorpay_test is not permitted when NODE_ENV=production.");
    }
    if (!cfg.razorpayKeyId.startsWith(RAZORPAY_TEST_KEY_PREFIX)) {
      throw new Error("RAZORPAY_KEY_ID must be a test-mode key (rzp_test_...) when PAYMENT_MODE=razorpay_test.");
    }
    if (!cfg.razorpayKeySecret) {
      throw new Error("RAZORPAY_KEY_SECRET is required when PAYMENT_MODE=razorpay_test.");
    }
    if (cfg.razorpayWebhookSecret.length < WEBHOOK_SECRET_MIN_LENGTH) {
      throw new Error(
        `RAZORPAY_WEBHOOK_SECRET must be at least ${WEBHOOK_SECRET_MIN_LENGTH} characters when PAYMENT_MODE=razorpay_test.`,
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

/** True only when the Razorpay test-mode configuration is valid. */
const isRazorpayEnabled = (cfg = readPaymentConfig()) => {
  try {
    validatePaymentConfig(cfg);
  } catch {
    return false;
  }
  return cfg.mode === PAYMENT_MODE_RAZORPAY_TEST;
};

const requireEnabled = () => {
  const cfg = readPaymentConfig();
  if (!isSimulationEnabled(cfg) && !isRazorpayEnabled(cfg)) {
    throw new AppError("Payments are not configured on this server", 503, "PAYMENT_NOT_CONFIGURED");
  }
  return cfg;
};

const requireSimulationEnabled = () => {
  if (!isSimulationEnabled()) {
    throw new AppError("Payments are not configured on this server", 503, "PAYMENT_NOT_CONFIGURED");
  }
};

const safeEqualHex = (a, b) => {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

// ---- Provider client (Razorpay SDK). Created lazily; tests may inject a fake. ----

let providerClientOverride = null;
let razorpayClient = null;
let razorpayClientKey = "";

/** Test seam: replaces the Razorpay client. Never called by application code. */
const setProviderClientForTests = (client) => {
  providerClientOverride = client;
};

const getProviderClient = (cfg = readPaymentConfig()) => {
  if (providerClientOverride) return providerClientOverride;
  const key = `${cfg.razorpayKeyId}|${cfg.razorpayKeySecret}`;
  if (!razorpayClient || razorpayClientKey !== key) {
    const Razorpay = require("razorpay");
    razorpayClient = new Razorpay({ key_id: cfg.razorpayKeyId, key_secret: cfg.razorpayKeySecret });
    razorpayClientKey = key;
  }
  return razorpayClient;
};

const providerError = () => {
  // Never forward provider messages or identifiers to the browser.
  // The cause is intentionally not returned; log it server-side if needed.
  return new AppError("The payment provider could not complete this request. Try again shortly.", 502, "PAYMENT_PROVIDER_ERROR");
};

/**
 * Creates a one-time sandbox order. Simulation only. Razorpay test mode sells recurring subscriptions
 * (createProviderSubscription), so it never creates one-time orders. The amount is in rupees and comes from
 * the server-side plan.
 */
const createOrder = async ({ amount, currency = "INR", receipt = "" }) => {
  requireEnabled();
  if (getPaymentMode() !== PAYMENT_MODE_SIMULATION) {
    throw new AppError("One-time payments are not offered. Choose a recurring plan.", 409, "ONE_TIME_NOT_AVAILABLE");
  }
  return {
    orderId: `order_sim_${crypto.randomBytes(12).toString("hex")}`,
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

/**
 * Verifies a sandbox payment signature. Returns false (never throws for bad input) when the
 * sandbox is disabled, so a disabled deployment can never accept any payment proof.
 */
const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return false;
  if (!isSimulationEnabled()) return false;
  const expected = computeSimulationSignature(String(orderId), String(paymentId), readPaymentConfig().simulationSecret);
  return safeEqualHex(signature, expected);
};

/**
 * Verifies a Razorpay Checkout signature: HMAC-SHA256 of "order_id|payment_id" with the key secret.
 * Returns false for bad input or when razorpay_test is not configured.
 */
const verifyRazorpayCheckoutSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return false;
  const cfg = readPaymentConfig();
  if (!isRazorpayEnabled(cfg)) return false;
  const expected = crypto.createHmac("sha256", cfg.razorpayKeySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(signature, expected);
};

/**
 * Verifies the Checkout signature for a recurring subscription: HMAC-SHA256 of "payment_id|subscription_id"
 * with the key secret. Returns false for bad input or when razorpay_test is not configured.
 */
const verifyRazorpaySubscriptionSignature = ({ subscriptionId, paymentId, signature }) => {
  if (!subscriptionId || !paymentId || !signature) return false;
  const cfg = readPaymentConfig();
  if (!isRazorpayEnabled(cfg)) return false;
  const expected = crypto.createHmac("sha256", cfg.razorpayKeySecret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return safeEqualHex(signature, expected);
};

/** Creates a Razorpay plan (period monthly|yearly, interval 1). The amount is in paise. */
const createProviderPlan = async ({ period, interval = 1, name, amountPaise, currency = "INR", notes = {} }) => {
  const cfg = requireEnabled();
  if (cfg.mode !== PAYMENT_MODE_RAZORPAY_TEST) {
    throw new AppError("Recurring billing is not configured on this server", 503, "PAYMENT_NOT_CONFIGURED");
  }
  try {
    return await getProviderClient(cfg).plans.create({
      period,
      interval,
      item: { name, amount: amountPaise, currency, description: name },
      notes,
    });
  } catch {
    throw providerError();
  }
};

/** Creates a Razorpay subscription in state "created". The browser authorises it with Checkout. */
const createProviderSubscription = async ({ planId, totalCount, notes = {} }) => {
  const cfg = requireEnabled();
  if (cfg.mode !== PAYMENT_MODE_RAZORPAY_TEST) {
    throw new AppError("Recurring billing is not configured on this server", 503, "PAYMENT_NOT_CONFIGURED");
  }
  try {
    return await getProviderClient(cfg).subscriptions.create({
      plan_id: planId,
      total_count: totalCount,
      quantity: 1,
      customer_notify: 1,
      notes,
    });
  } catch {
    throw providerError();
  }
};

/** Reads a subscription from the provider. Used to confirm state before the server changes anything. */
const fetchProviderSubscription = async (subscriptionId) => {
  const cfg = requireEnabled();
  if (cfg.mode !== PAYMENT_MODE_RAZORPAY_TEST) {
    throw new AppError("Recurring billing is not configured on this server", 503, "PAYMENT_NOT_CONFIGURED");
  }
  try {
    return await getProviderClient(cfg).subscriptions.fetch(String(subscriptionId));
  } catch {
    throw providerError();
  }
};

/** Cancels at the end of the current billing cycle, so the paid period is not cut short. */
const cancelProviderSubscription = async (subscriptionId) => {
  const cfg = requireEnabled();
  if (cfg.mode !== PAYMENT_MODE_RAZORPAY_TEST) {
    throw new AppError("Recurring billing is not configured on this server", 503, "PAYMENT_NOT_CONFIGURED");
  }
  try {
    return await getProviderClient(cfg).subscriptions.cancel(String(subscriptionId), true);
  } catch {
    throw providerError();
  }
};

/**
 * Verifies a Razorpay webhook: HMAC-SHA256 of the raw request body with the webhook secret.
 * `rawBody` must be the exact bytes received, not a re-serialised object.
 */
const verifyRazorpayWebhookSignature = (rawBody, signature) => {
  if (!signature || !Buffer.isBuffer(rawBody)) return false;
  const cfg = readPaymentConfig();
  if (!isRazorpayEnabled(cfg)) return false;
  const expected = crypto.createHmac("sha256", cfg.razorpayWebhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(signature, expected);
};

/** Fetches a payment from the provider so its status, order and amount are checked server-side. */
const fetchProviderPayment = async (paymentId) => {
  const cfg = requireEnabled();
  if (cfg.mode !== PAYMENT_MODE_RAZORPAY_TEST) {
    throw new AppError("Payments are not configured on this server", 503, "PAYMENT_NOT_CONFIGURED");
  }
  try {
    return await getProviderClient(cfg).payments.fetch(String(paymentId));
  } catch {
    throw providerError();
  }
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
  PAYMENT_MODE_RAZORPAY_TEST,
  readPaymentConfig,
  validatePaymentConfig,
  getPaymentMode,
  isSimulationEnabled,
  isRazorpayEnabled,
  createOrder,
  generateSimulationPaymentId,
  generateSimulationSignature,
  verifyPaymentSignature,
  verifyRazorpayCheckoutSignature,
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
  createProviderPlan,
  createProviderSubscription,
  fetchProviderSubscription,
  cancelProviderSubscription,
  fetchProviderPayment,
  setProviderClientForTests,
  generateInvoiceNumber,
};
