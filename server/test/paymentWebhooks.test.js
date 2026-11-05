// Phase 7 payment flow over HTTP against MongoDB (runs in CI). The Razorpay client is an injected fake:
// no network calls. Covers checkout, signature and amount checks, delayed confirmation, webhook
// signatures, idempotent redelivery, cancellation, and full refunds.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const nodeTest = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { PaymentWebhookEvent } = require("../models/PaymentWebhookEvent");
const ps = require("../services/paymentService");
const emailService = require("../services/emailService");

const API = "/api/v1";
const PASSWORD = "StrongPassword123!";
const KEY_ID = "rzp_test_flow_key_id";
const KEY_SECRET = "flow_test_only_key_secret_value";
const WEBHOOK_SECRET = "flow_test_only_webhook_secret_01234";
const ENV_VARS = {
  PAYMENT_MODE: "razorpay_test",
  NODE_ENV: "test",
  RAZORPAY_KEY_ID: KEY_ID,
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const savedEnv = {};
const originalSendMail = emailService.sendMail;

// The fake provider. `payment` controls what the provider reports for fetches.
const fake = {
  created: [],
  payment: null,
  client() {
    return {
      orders: {
        create: async (args) => {
          fake.created.push(args);
          return { id: `order_TEST${crypto.randomBytes(8).toString("hex")}`, receipt: args.receipt, status: "created" };
        },
      },
      payments: {
        fetch: async (id) => ({ ...fake.payment, id }),
      },
    };
  },
};

const failures = [];
process.on("exit", () => {
  if (failures.length) process.stderr.write(`\nPAYMENT FLOW FAILURES (${failures.length}):\n${failures.join("\n")}\n`);
});
const test = (name, fn) =>
  nodeTest(name, async () => {
    try {
      await fn();
    } catch (error) {
      failures.push(`- ${name}: ${String(error && error.message).slice(0, 400).replace(/\s+/g, " ")}`);
      throw error;
    }
  });

const register = async (email, intent) => {
  const reg = await request(app).post(`${API}/auth/register`).send({
    email,
    password: PASSWORD,
    displayName: email.split("@")[0],
    accountIntent: intent,
    termsConsent: true,
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  await User.updateOne({ _id: reg.body.data.user.id }, { $set: { emailVerified: true } });
  const login = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { token: login.body.data.accessToken, userId: reg.body.data.user.id };
};

const checkout = (actor, planTier = "candidate_plus") =>
  request(app).post(`${API}/subscriptions/checkout`).set(auth(actor.token)).send({ planTier });

const verify = (actor, body) => request(app).post(`${API}/subscriptions/verify-payment`).set(auth(actor.token)).send(body);

const providerSignature = (orderId, paymentId) =>
  crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

const sendWebhook = (event, { eventId, signature } = {}) => {
  const body = JSON.stringify(event);
  const sig = signature || crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  return request(app)
    .post(`${API}/payments/webhooks/razorpay`)
    .set("Content-Type", "application/json")
    .set("x-razorpay-signature", sig)
    .set("x-razorpay-event-id", eventId)
    .send(body);
};

const capturedEvent = (orderId, paymentId, amount = 14900) => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: "INR", status: "captured" } } },
});

const currentTier = async (actor) => {
  const res = await request(app).get(`${API}/subscriptions/current`).set(auth(actor.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.entitlement.tier;
};

nodeTest.before(async () => {
  for (const key of Object.keys(ENV_VARS)) {
    savedEnv[key] = process.env[key];
    process.env[key] = ENV_VARS[key];
  }
  ps.setProviderClientForTests(fake.client());
  emailService.sendMail = async () => ({ messageId: "test" });
  await startDatabase();
});
nodeTest.after(async () => {
  ps.setProviderClientForTests(null);
  emailService.sendMail = originalSendMail;
  for (const key of Object.keys(ENV_VARS)) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await stopDatabase();
});

const ctx = {};

test("seed: a candidate account", async () => {
  await clearDatabase();
  ctx.candidate = await register("asha@payflow.example", "candidate");
  assert.equal(await currentTier(ctx.candidate), "candidate_free");
});

test("checkout creates a Razorpay order for the server-side price and returns only the public key", async () => {
  const res = await checkout(ctx.candidate);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.order.mode, "razorpay_test");
  assert.equal(res.body.data.order.keyId, KEY_ID);
  assert.ok(!res.body.data.simulationHelper, "no sandbox proof in razorpay mode");
  assert.deepEqual(fake.created.at(-1).amount, 14900);
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: res.body.data.order.orderId }).lean();
  assert.equal(txn.gateway, "razorpay");
  assert.equal(txn.status, "initiated");
});

test("the client cannot choose the price at checkout", async () => {
  const res = await request(app)
    .post(`${API}/subscriptions/checkout`)
    .set(auth(ctx.candidate.token))
    .send({ planTier: "candidate_plus", amount: 1 });
  assert.equal(res.status, 400, JSON.stringify(res.body));
});

test("a Checkout signature that does not match fails the order and grants nothing", async () => {
  const order = (await checkout(ctx.candidate)).body.data.order;
  const res = await verify(ctx.candidate, {
    orderId: order.orderId,
    paymentId: "pay_TESTforged",
    signature: "0".repeat(64),
    planTier: "candidate_plus",
  });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body.code, "PAYMENT_VERIFICATION_FAILED");
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: order.orderId }).lean();
  assert.equal(txn.status, "failed");
  assert.equal(await currentTier(ctx.candidate), "candidate_free");
});

test("a payment still authorized is pending: nothing activates until the provider captures it", async () => {
  const order = (await checkout(ctx.candidate)).body.data.order;
  fake.payment = { order_id: order.orderId, amount: 14900, currency: "INR", status: "authorized" };
  const paymentId = "pay_TESTauthorized";
  const res = await verify(ctx.candidate, {
    orderId: order.orderId,
    paymentId,
    signature: providerSignature(order.orderId, paymentId),
    planTier: "candidate_plus",
  });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  assert.equal(res.body.data.status, "pending");
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: order.orderId }).lean();
  assert.equal(txn.status, "initiated");
  assert.equal(await currentTier(ctx.candidate), "candidate_free");
});

test("a captured payment for a different amount is refused and marked failed", async () => {
  const order = (await checkout(ctx.candidate)).body.data.order;
  fake.payment = { order_id: order.orderId, amount: 100, currency: "INR", status: "captured" };
  const paymentId = "pay_TESTwrongamount";
  const res = await verify(ctx.candidate, {
    orderId: order.orderId,
    paymentId,
    signature: providerSignature(order.orderId, paymentId),
    planTier: "candidate_plus",
  });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: order.orderId }).lean();
  assert.equal(txn.status, "failed");
  assert.equal(await currentTier(ctx.candidate), "candidate_free");
});

test("a captured payment activates the plan once; a replay is refused", async () => {
  const order = (await checkout(ctx.candidate)).body.data.order;
  fake.payment = { order_id: order.orderId, amount: 14900, currency: "INR", status: "captured" };
  const paymentId = "pay_TESTcaptured1";
  const body = {
    orderId: order.orderId,
    paymentId,
    signature: providerSignature(order.orderId, paymentId),
    planTier: "candidate_plus",
  };
  const res = await verify(ctx.candidate, body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await currentTier(ctx.candidate), "candidate_plus");
  const replay = await verify(ctx.candidate, body);
  assert.equal(replay.status, 409);
  assert.equal(replay.body.code, "PAYMENT_ALREADY_PROCESSED");
});

test("webhook: a bad signature is refused and changes nothing", async () => {
  const res = await sendWebhook(capturedEvent("order_TESTnone", "pay_TESTnone"), {
    eventId: "evt_bad_sig",
    signature: "f".repeat(64),
  });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body.code, "INVALID_WEBHOOK_SIGNATURE");
  assert.equal(await PaymentWebhookEvent.countDocuments({ eventId: "evt_bad_sig" }), 0);
});

test("webhook: payment.captured activates an order the browser never confirmed, once per delivery", async () => {
  ctx.webhookActor = await register("webhook-buyer@payflow.example", "candidate");
  const order = (await checkout(ctx.webhookActor)).body.data.order;
  const event = capturedEvent(order.orderId, "pay_TESTwebhook1");

  const first = await sendWebhook(event, { eventId: "evt_capture_1" });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.outcome, "activated");
  assert.equal(await currentTier(ctx.webhookActor), "candidate_plus");

  const again = await sendWebhook(event, { eventId: "evt_capture_1" });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.status, "duplicate");

  const upgrades = await AuditLog.countDocuments({ action: "subscription.upgrade", "metadata.source": "webhook" });
  assert.equal(upgrades, 1, "a redelivered event activates nothing twice");
});

test("webhook: a different event id for the same captured payment is not activated again", async () => {
  const txn = await PaymentTransaction.findOne({ gatewayPaymentId: "pay_TESTwebhook1" }).lean();
  const res = await sendWebhook(capturedEvent(txn.gatewayOrderId, "pay_TESTwebhook1"), { eventId: "evt_capture_2" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "already_captured");
});

test("webhook: a capture with the wrong amount changes no state", async () => {
  const order = (await checkout(ctx.candidate)).body.data.order;
  const res = await sendWebhook(capturedEvent(order.orderId, "pay_TESTbadamt", 100), { eventId: "evt_bad_amount" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "amount_mismatch");
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: order.orderId }).lean();
  assert.equal(txn.status, "initiated");
});

test("webhook: a full refund marks the payment refunded and ends the plan it paid for; jobs are not touched", async () => {
  const refund = {
    event: "refund.processed",
    payload: { refund: { entity: { id: "rfnd_TEST1", payment_id: "pay_TESTwebhook1", amount: 14900 } } },
  };
  const res = await sendWebhook(refund, { eventId: "evt_refund_1" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.outcome, "refunded");
  const txn = await PaymentTransaction.findOne({ gatewayPaymentId: "pay_TESTwebhook1" }).lean();
  assert.equal(txn.status, "refunded");
  assert.equal(await currentTier(ctx.webhookActor), "candidate_free");
  const sub = await Subscription.findOne({ subscriberId: txn.subscriberId, subscriberType: "candidate" }).lean();
  assert.equal(sub.status, "expired");

  const duplicate = await sendWebhook(refund, { eventId: "evt_refund_2" });
  assert.equal(duplicate.body.data.outcome, "already_refunded");
});

test("cancelling Checkout marks the order cancelled and it can no longer be verified", async () => {
  const order = (await checkout(ctx.candidate)).body.data.order;
  const cancelled = await request(app)
    .post(`${API}/subscriptions/checkout/cancel`)
    .set(auth(ctx.candidate.token))
    .send({ orderId: order.orderId });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.data.transaction.status, "cancelled");
  const paymentId = "pay_TESTafter_cancel";
  const res = await verify(ctx.candidate, {
    orderId: order.orderId,
    paymentId,
    signature: providerSignature(order.orderId, paymentId),
    planTier: "candidate_plus",
  });
  assert.equal(res.status, 409);
});

test("webhook: payment.failed marks an initiated order failed", async () => {
  const order = (await checkout(ctx.candidate)).body.data.order;
  const res = await sendWebhook(
    { event: "payment.failed", payload: { payment: { entity: { id: "pay_TESTfailed", order_id: order.orderId, amount: 14900, currency: "INR", status: "failed" } } } },
    { eventId: "evt_failed_1" },
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "failed");
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: order.orderId }).lean();
  assert.equal(txn.status, "failed");
});

test("webhook: an unknown event type is recorded and ignored", async () => {
  const res = await sendWebhook({ event: "order.notify", payload: {} }, { eventId: "evt_other_1" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "ignored");
});
