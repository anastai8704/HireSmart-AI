// Razorpay test-mode integration (Phase 7). No network: the provider client is an injected fake.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const ps = require("../services/paymentService");

const KEY_ID = "rzp_test_unit_key_id";
const KEY_SECRET = "unit_test_only_key_secret_value";
const WEBHOOK_SECRET = "unit_test_only_webhook_secret_0123";
const MANAGED = ["NODE_ENV", "PAYMENT_MODE", "PAYMENT_SIMULATION_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];

const withEnv = async (overrides, fn) => {
  const saved = Object.fromEntries(MANAGED.map((k) => [k, process.env[k]]));
  for (const k of MANAGED) delete process.env[k];
  Object.assign(process.env, overrides);
  try {
    return await fn();
  } finally {
    for (const k of MANAGED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    ps.setProviderClientForTests(null);
  }
};

const razorpayEnv = {
  NODE_ENV: "development",
  PAYMENT_MODE: "razorpay_test",
  RAZORPAY_KEY_ID: KEY_ID,
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
};

const fakeClient = (overrides = {}) => {
  const calls = { create: [], fetch: [] };
  return {
    calls,
    orders: {
      create: async (args) => {
        calls.create.push(args);
        return { id: "order_TESTabc123", receipt: args.receipt, status: "created", ...overrides.order };
      },
    },
    payments: {
      fetch: async (id) => {
        calls.fetch.push(id);
        if (overrides.fetch) return overrides.fetch(id);
        return { id, order_id: "order_TESTabc123", amount: 14900, currency: "INR", status: "captured" };
      },
    },
  };
};

test("razorpay_test needs a test-mode key, a secret and a webhook secret", async () => {
  await withEnv({ ...razorpayEnv, RAZORPAY_KEY_ID: "rzp_live_nope" }, () => {
    assert.throws(() => ps.validatePaymentConfig(), /Live payment provider credentials/);
  });
  await withEnv({ ...razorpayEnv, RAZORPAY_KEY_ID: "key_without_prefix" }, () => {
    assert.throws(() => ps.validatePaymentConfig(), /must be a test-mode key/);
  });
  await withEnv({ ...razorpayEnv, RAZORPAY_KEY_SECRET: "" }, () => {
    assert.throws(() => ps.validatePaymentConfig(), /RAZORPAY_KEY_SECRET is required/);
  });
  await withEnv({ ...razorpayEnv, RAZORPAY_WEBHOOK_SECRET: "short" }, () => {
    assert.throws(() => ps.validatePaymentConfig(), /RAZORPAY_WEBHOOK_SECRET must be at least 16/);
  });
});

test("razorpay_test is refused in production and accepted with valid test configuration", async () => {
  await withEnv({ ...razorpayEnv, NODE_ENV: "production" }, () => {
    assert.throws(() => ps.validatePaymentConfig(), /not permitted when NODE_ENV=production/);
  });
  await withEnv(razorpayEnv, () => {
    assert.equal(ps.validatePaymentConfig(), true);
    assert.equal(ps.isRazorpayEnabled(), true);
    assert.equal(ps.isSimulationEnabled(), false);
  });
});

test("one-time orders are refused in razorpay_test: recurring purchases use subscriptions", async () => {
  await withEnv(razorpayEnv, async () => {
    const fake = fakeClient();
    ps.setProviderClientForTests(fake);
    await assert.rejects(
      () => ps.createOrder({ amount: 149, currency: "INR", receipt: "order_candidate_1" }),
      (error) => error.code === "ONE_TIME_NOT_AVAILABLE" && error.statusCode === 409,
    );
    assert.equal(fake.calls.create.length, 0, "no provider order is created");
  });
});

test("createProviderSubscription sends the plan, cycle count and notify flag; the amount is never sent here", async () => {
  await withEnv(razorpayEnv, async () => {
    const calls = [];
    ps.setProviderClientForTests({
      subscriptions: {
        create: async (args) => {
          calls.push(args);
          return { id: "sub_TESTabc", status: "created" };
        },
      },
    });
    const sub = await ps.createProviderSubscription({ planId: "plan_TEST1", totalCount: 120, notes: { planTier: "candidate_plus" } });
    assert.equal(sub.id, "sub_TESTabc");
    assert.deepEqual(calls, [
      { plan_id: "plan_TEST1", total_count: 120, quantity: 1, customer_notify: 1, notes: { planTier: "candidate_plus" } },
    ]);
  });
});

test("a provider failure becomes a 502 without exposing the provider's message", async () => {
  await withEnv(razorpayEnv, async () => {
    ps.setProviderClientForTests({
      subscriptions: {
        create: async () => {
          throw new Error("Authentication failed for key rzp_test_unit_key_id");
        },
      },
    });
    await assert.rejects(
      () => ps.createProviderSubscription({ planId: "plan_TEST1", totalCount: 120 }),
      (error) => {
        assert.equal(error.statusCode, 502);
        assert.equal(error.code, "PAYMENT_PROVIDER_ERROR");
        assert.doesNotMatch(error.message, /rzp_test|Authentication/);
        return true;
      },
    );
  });
});

test("the Checkout signature is HMAC(order|payment) with the key secret and rejects tampering", async () => {
  await withEnv(razorpayEnv, () => {
    const orderId = "order_TESTabc123";
    const paymentId = "pay_TESTxyz789";
    const signature = crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
    assert.equal(ps.verifyRazorpayCheckoutSignature({ orderId, paymentId, signature }), true);
    assert.equal(ps.verifyRazorpayCheckoutSignature({ orderId, paymentId: "pay_other", signature }), false);
    assert.equal(ps.verifyRazorpayCheckoutSignature({ orderId, paymentId, signature: "0".repeat(64) }), false);
    assert.equal(ps.verifyRazorpayCheckoutSignature({ orderId, paymentId }), false);
  });
});

test("the webhook signature covers the exact raw bytes", async () => {
  await withEnv(razorpayEnv, () => {
    const raw = Buffer.from('{"event":"payment.captured","payload":{}}');
    const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
    assert.equal(ps.verifyRazorpayWebhookSignature(raw, signature), true);
    const reformatted = Buffer.from('{"event": "payment.captured", "payload": {}}');
    assert.equal(ps.verifyRazorpayWebhookSignature(reformatted, signature), false);
    assert.equal(ps.verifyRazorpayWebhookSignature(raw.toString("utf8"), signature), false, "a string is not the raw body");
    assert.equal(ps.verifyRazorpayWebhookSignature(raw, undefined), false);
  });
});

test("the checkout and webhook verifiers accept nothing when razorpay_test is not configured", async () => {
  await withEnv({ NODE_ENV: "development" }, () => {
    assert.equal(ps.verifyRazorpayCheckoutSignature({ orderId: "o", paymentId: "p", signature: "x" }), false);
    assert.equal(ps.verifyRazorpayWebhookSignature(Buffer.from("{}"), "x"), false);
  });
});

test("fetchProviderPayment reads the payment from the provider", async () => {
  await withEnv(razorpayEnv, async () => {
    const fake = fakeClient();
    ps.setProviderClientForTests(fake);
    const payment = await ps.fetchProviderPayment("pay_TESTxyz789");
    assert.equal(payment.status, "captured");
    assert.deepEqual(fake.calls.fetch, ["pay_TESTxyz789"]);
  });
});

test("priceFor: monthly uses the configured price; yearly is refused until a yearly price is configured", () => {
  const { priceFor } = require("../services/recurringBillingService");
  const { ALL_PLANS } = require("../config/subscriptionPlans");
  const plan = ALL_PLANS.candidate_plus;
  assert.equal(priceFor(plan, "monthly"), plan.priceInr);
  assert.throws(() => priceFor({ ...plan, yearlyPriceInr: null }, "yearly"), (e) => e.code === "YEARLY_PRICE_NOT_CONFIGURED");
  assert.equal(priceFor({ ...plan, yearlyPriceInr: 1490 }, "yearly"), 1490);
  assert.throws(() => priceFor(plan, "weekly"), (e) => e.code === "INVALID_BILLING_CYCLE");
});

test("recurring cycles: monthly 120 cycles, yearly 10 cycles, interval 1", () => {
  const { RECURRING } = require("../config/recurringBilling");
  assert.deepEqual(RECURRING.monthly, { period: "monthly", interval: 1, totalCount: 120 });
  assert.deepEqual(RECURRING.yearly, { period: "yearly", interval: 1, totalCount: 10 });
});
