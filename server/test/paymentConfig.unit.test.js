// Unit tests for the payment sandbox configuration and signature rules.
// These do not touch the database, so they run locally and in CI.
const test = require("node:test");
const assert = require("node:assert/strict");
const ps = require("../services/paymentService");

const SECRET = "unit_test_only_payment_secret_0123456789abcdef";
const MANAGED_VARS = [
  "NODE_ENV",
  "PAYMENT_MODE",
  "PAYMENT_SIMULATION_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
];

const withEnv = (overrides, fn) => {
  const saved = Object.fromEntries(MANAGED_VARS.map((key) => [key, process.env[key]]));
  for (const key of MANAGED_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
  const restore = () => {
    for (const key of MANAGED_VARS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
};

const simulationEnv = { NODE_ENV: "test", PAYMENT_MODE: "simulation", PAYMENT_SIMULATION_SECRET: SECRET };

test("validatePaymentConfig accepts the default disabled mode without any secret", () =>
  withEnv({ NODE_ENV: "development" }, () => {
    assert.equal(ps.validatePaymentConfig(), true);
  }));

test("validatePaymentConfig rejects live or unknown payment modes", () => {
  for (const mode of ["live", "razorpay", "production", "sandbox_please"]) {
    withEnv({ NODE_ENV: "development", PAYMENT_MODE: mode }, () => {
      assert.throws(() => ps.validatePaymentConfig(), /Live payment modes are not permitted|PAYMENT_MODE must be/);
    });
  }
});

test("validatePaymentConfig rejects live provider credentials even when payments are disabled", () =>
  withEnv({ NODE_ENV: "development", RAZORPAY_KEY_ID: "placeholder-id" }, () => {
    assert.throws(() => ps.validatePaymentConfig(), /Live payment provider credentials must not be configured/);
  }));

test("validatePaymentConfig refuses simulation mode in production", () =>
  withEnv({ NODE_ENV: "production", PAYMENT_MODE: "simulation", PAYMENT_SIMULATION_SECRET: SECRET }, () => {
    assert.throws(() => ps.validatePaymentConfig(), /not allowed when NODE_ENV=production/);
  }));

test("validatePaymentConfig requires a long simulation secret", () => {
  withEnv({ NODE_ENV: "development", PAYMENT_MODE: "simulation", PAYMENT_SIMULATION_SECRET: "short" }, () => {
    assert.throws(() => ps.validatePaymentConfig(), /at least 32 characters/);
  });
  withEnv({ NODE_ENV: "development", PAYMENT_MODE: "simulation" }, () => {
    assert.throws(() => ps.validatePaymentConfig(), /at least 32 characters/);
  });
  withEnv({ NODE_ENV: "development", PAYMENT_MODE: "simulation", PAYMENT_SIMULATION_SECRET: SECRET }, () => {
    assert.equal(ps.validatePaymentConfig(), true);
  });
});

test("createOrder fails closed with 503 when payments are disabled", () =>
  withEnv({ NODE_ENV: "test" }, async () => {
    await assert.rejects(
      () => ps.createOrder({ amount: 999 }),
      (error) => error.statusCode === 503 && error.code === "PAYMENT_NOT_CONFIGURED",
    );
    assert.throws(
      () => ps.generateSimulationSignature("order_sim_x", "pay_sim_x"),
      (error) => error.code === "PAYMENT_NOT_CONFIGURED",
    );
  }));

test("createOrder issues a sandbox order only in simulation mode", () =>
  withEnv(simulationEnv, async () => {
    const order = await ps.createOrder({ amount: 999, currency: "inr" });
    assert.match(order.orderId, /^order_sim_[a-f0-9]{24}$/);
    assert.equal(order.mode, "simulation");
    assert.equal(order.amount, 999);
    assert.equal(order.currency, "INR");
    assert.equal(order.keyId, undefined, "no key identifiers are returned");
  }));

test("sandbox signatures are HMAC-based and verify only for the exact order and payment", () =>
  withEnv(simulationEnv, () => {
    const orderId = "order_sim_abc123";
    const paymentId = ps.generateSimulationPaymentId();
    const signature = ps.generateSimulationSignature(orderId, paymentId);

    assert.match(signature, /^[a-f0-9]{64}$/);
    assert.equal(ps.verifyPaymentSignature({ orderId, paymentId, signature }), true);
    assert.equal(ps.verifyPaymentSignature({ orderId, paymentId: "pay_other", signature }), false);
    assert.equal(
      ps.verifyPaymentSignature({ orderId: "order_sim_other", paymentId, signature }),
      false,
    );
    const tampered = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    assert.equal(ps.verifyPaymentSignature({ orderId, paymentId, signature: tampered }), false);
  }));

test("the legacy sim_sig_<orderId> forgery is never accepted", () =>
  withEnv(simulationEnv, () => {
    const orderId = "order_sim_abc123";
    assert.equal(
      ps.verifyPaymentSignature({ orderId, paymentId: "pay_forged", signature: `sim_sig_${orderId}` }),
      false,
    );
    assert.equal(
      ps.verifyPaymentSignature({ orderId, paymentId: "pay_forged", signature: "sim_sig_order_sim_abc123" }),
      false,
    );
  }));

test("a correct signature is rejected when payments are disabled", () => {
  let signature;
  withEnv(simulationEnv, () => {
    signature = ps.generateSimulationSignature("order_sim_abc123", "pay_sim_1");
  });
  withEnv({ NODE_ENV: "development" }, () => {
    assert.equal(
      ps.verifyPaymentSignature({ orderId: "order_sim_abc123", paymentId: "pay_sim_1", signature }),
      false,
    );
  });
});

test("verifyPaymentSignature returns false for missing or malformed input without throwing", () =>
  withEnv(simulationEnv, () => {
    assert.equal(ps.verifyPaymentSignature({}), false);
    assert.equal(ps.verifyPaymentSignature({ orderId: "o", paymentId: "p" }), false);
    assert.equal(ps.verifyPaymentSignature({ orderId: "o", paymentId: "p", signature: "x" }), false);
  }));
