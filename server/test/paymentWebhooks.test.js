// Phase 7 recurring payments over HTTP against MongoDB (runs in CI). The Razorpay client is an injected
// fake: no network calls. Covers subscription checkout, signature checks, activation on verified charge,
// renewal, past_due and halt handling, duplicate events, cancellation (including provider failure), refunds.
process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const nodeTest = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");
const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { PaymentWebhookEvent } = require("../models/PaymentWebhookEvent");
const { ALL_PLANS } = require("../config/subscriptionPlans");
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
const rid = (prefix) => `${prefix}${crypto.randomBytes(8).toString("hex")}`;
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

// The fake provider. Tests change its subscription and payment state to simulate Razorpay.
const fake = {
  plans: [],
  subs: {},
  payments: {},
  cancelled: [],
  failCancel: false,
  client() {
    return {
      plans: {
        create: async (args) => {
          const plan = { id: rid("plan_TEST"), ...args };
          fake.plans.push(plan);
          return plan;
        },
      },
      subscriptions: {
        create: async (args) => {
          const rec = {
            id: rid("sub_TEST"),
            plan_id: args.plan_id,
            total_count: args.total_count,
            status: "created",
            paid_count: 0,
            current_start: null,
            current_end: null,
            notes: args.notes || {},
          };
          fake.subs[rec.id] = rec;
          return { ...rec };
        },
        fetch: async (id) => {
          if (!fake.subs[id]) throw new Error("subscription not found");
          return { ...fake.subs[id] };
        },
        cancel: async (id, atCycleEnd) => {
          if (fake.failCancel) throw new Error("provider unavailable");
          fake.cancelled.push({ id, atCycleEnd });
          fake.subs[id].status = "cancelled";
          return { ...fake.subs[id] };
        },
      },
      payments: {
        fetch: async (id) => {
          if (!fake.payments[id]) throw new Error("payment not found");
          return { ...fake.payments[id] };
        },
      },
    };
  },
};

const setSub = (id, patch) => Object.assign(fake.subs[id], patch);
const addPayment = (id, subscriptionId, amount = 14900, status = "captured") => {
  fake.payments[id] = { id, subscription_id: subscriptionId, amount, currency: "INR", status };
  return fake.payments[id];
};
const activateSub = (id, periodDays = 30) =>
  setSub(id, {
    status: "active",
    paid_count: (fake.subs[id].paid_count || 0) + 1,
    current_start: nowSec(),
    current_end: nowSec() + periodDays * DAY,
  });

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

const checkout = (actor, body = {}) =>
  request(app)
    .post(`${API}/subscriptions/checkout`)
    .set(auth(actor.token))
    .send({ planTier: "candidate_plus", ...body });

const verifySub = (actor, body) =>
  request(app).post(`${API}/subscriptions/verify-subscription`).set(auth(actor.token)).send(body);

const subSignature = (subscriptionId, paymentId, secret = KEY_SECRET) =>
  crypto.createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex");

const sendWebhook = (event, { eventId = rid("evt_"), signature } = {}) => {
  const body = JSON.stringify(event);
  const sig = signature || crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  return request(app)
    .post(`${API}/payments/webhooks/razorpay`)
    .set("Content-Type", "application/json")
    .set("x-razorpay-signature", sig)
    .set("x-razorpay-event-id", eventId)
    .send(body);
};

const subEvent = (event, subscriptionId, payment = null) => ({
  event,
  payload: {
    subscription: { entity: { ...fake.subs[subscriptionId] } },
    ...(payment ? { payment: { entity: payment } } : {}),
  },
});

const subRecord = (subscriptionId) => Subscription.findOne({ providerSubscriptionId: subscriptionId }).lean();
const txnsFor = (subscriptionId) => PaymentTransaction.find({ providerSubscriptionId: subscriptionId }).lean();

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

test("seed: a candidate account on the free plan", async () => {
  await clearDatabase();
  ctx.asha = await register("asha@payflow.example", "candidate");
  assert.equal(await currentTier(ctx.asha), "candidate_free");
});

test("checkout creates a Razorpay subscription with the server-side price and returns only the public key", async () => {
  const res = await checkout(ctx.asha);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const s = res.body.data.subscription;
  assert.equal(s.mode, "razorpay_subscription");
  assert.match(s.subscriptionId, /^sub_TEST/);
  assert.equal(s.keyId, KEY_ID);
  assert.equal(s.amount, ALL_PLANS.candidate_plus.priceInr);
  assert.equal(s.billingCycle, "monthly");
  assert.ok(!res.body.data.simulationHelper, "no sandbox proof in razorpay mode");
  assert.ok(!res.body.data.order, "no one-time order in razorpay mode");
  const created = fake.subs[s.subscriptionId];
  assert.equal(created.total_count, 120, "monthly plan runs 120 cycles");
  const plan = fake.plans.at(-1);
  assert.equal(plan.period, "monthly");
  assert.equal(plan.interval, 1);
  assert.equal(plan.item.amount, ALL_PLANS.candidate_plus.priceInr * 100, "amount in paise from config");
  assert.equal(created.plan_id, plan.id);
  const txn = await PaymentTransaction.findById(res.body.data.transaction._id).lean();
  assert.equal(txn.gateway, "razorpay");
  assert.equal(txn.status, "initiated");
  assert.equal(txn.providerSubscriptionId, s.subscriptionId);
  ctx.firstSubId = s.subscriptionId;
});

test("the client cannot choose the price or the cycle count", async () => {
  const res = await checkout(ctx.asha, { amount: 1 });
  // The schema is strict: an unknown "amount" field is a validation error (422), never a price.
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.equal(res.body.code, "VALIDATION_ERROR");
});

test("yearly is refused while no yearly price is configured", async () => {
  const res = await checkout(ctx.asha, { billingCycle: "yearly" });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "YEARLY_PRICE_NOT_CONFIGURED", JSON.stringify(res.body));
});

test("a Checkout signature that does not match grants nothing and leaves the order open for reconciliation", async () => {
  const res = await verifySub(ctx.asha, {
    subscriptionId: ctx.firstSubId,
    paymentId: "pay_forged",
    signature: "0".repeat(64),
  });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body.code, "PAYMENT_VERIFICATION_FAILED");
  const txn = await PaymentTransaction.findOne({ providerSubscriptionId: ctx.firstSubId }).lean();
  assert.equal(txn.status, "initiated", "a bad browser signature is not an authoritative failure");
  assert.equal(await currentTier(ctx.asha), "candidate_free");
});

test("a fresh checkout for a new subscription is needed after a failed signature", async () => {
  const res = await checkout(ctx.asha);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  ctx.subId = res.body.data.subscription.subscriptionId;
  ctx.initiatedTxnId = res.body.data.transaction._id;
});

test("a subscription the provider has not authorised yet is pending: nothing activates", async () => {
  const res = await verifySub(ctx.asha, {
    subscriptionId: ctx.subId,
    paymentId: "pay_first",
    signature: subSignature(ctx.subId, "pay_first"),
  });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  assert.equal(res.body.data.status, "pending");
  assert.equal(await currentTier(ctx.asha), "candidate_free");
});

test("a verified first charge activates the plan with a period from the provider", async () => {
  const payId = "pay_first";
  addPayment(payId, ctx.subId);
  activateSub(ctx.subId, 30);
  const res = await verifySub(ctx.asha, {
    subscriptionId: ctx.subId,
    paymentId: payId,
    signature: subSignature(ctx.subId, payId),
    planTier: "candidate_plus",
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await currentTier(ctx.asha), "candidate_plus");
  const sub = await subRecord(ctx.subId);
  assert.equal(sub.status, "active");
  assert.equal(sub.billingCycle, "monthly");
  assert.equal(Math.floor(new Date(sub.currentPeriodEnd).getTime() / 1000), fake.subs[ctx.subId].current_end);
  const txn = await PaymentTransaction.findById(ctx.initiatedTxnId).lean();
  assert.equal(txn.status, "captured");
  assert.equal(txn.gatewayPaymentId, payId);
  assert.ok(txn.invoiceNumber, "invoice number issued");
});

test("replaying the verification of a processed payment is refused", async () => {
  const res = await verifySub(ctx.asha, {
    subscriptionId: ctx.subId,
    paymentId: "pay_first",
    signature: subSignature(ctx.subId, "pay_first"),
  });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.code, "PAYMENT_ALREADY_PROCESSED");
});

test("a recurring subscription blocks a second purchase", async () => {
  const res = await checkout(ctx.asha, { planTier: "candidate_plus" });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.code, "ALREADY_SUBSCRIBED");
});

test("webhook: a bad signature is refused and changes nothing", async () => {
  const res = await sendWebhook(subEvent("subscription.charged", ctx.subId, fake.payments.pay_first), {
    signature: "f".repeat(64),
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "INVALID_WEBHOOK_SIGNATURE");
});

test("webhook: a renewal charge extends the period and creates a renewal transaction", async () => {
  const before = (await subRecord(ctx.subId)).currentPeriodEnd;
  const payId = "pay_renew_1";
  addPayment(payId, ctx.subId);
  activateSub(ctx.subId, 60);
  const res = await sendWebhook(subEvent("subscription.charged", ctx.subId, fake.payments[payId]));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.outcome, "renewed");
  const sub = await subRecord(ctx.subId);
  assert.ok(new Date(sub.currentPeriodEnd) > new Date(before), "period moved forward");
  const renewal = await PaymentTransaction.findOne({ gatewayPaymentId: payId }).lean();
  assert.equal(renewal.status, "captured");
  assert.equal(String(renewal.subscription), String(sub._id));
});

test("webhook: the same payment delivered under a new event id is recorded once", async () => {
  const count = (await txnsFor(ctx.subId)).length;
  const res = await sendWebhook(subEvent("subscription.charged", ctx.subId, fake.payments.pay_renew_1));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "already_recorded");
  assert.equal((await txnsFor(ctx.subId)).length, count);
});

test("webhook: a redelivery of the same event id is a duplicate and changes nothing", async () => {
  const eventId = rid("evt_dup_");
  const body = subEvent("subscription.pending", ctx.subId);
  const first = await sendWebhook(body, { eventId });
  assert.equal(first.status, 200);
  const second = await sendWebhook(body, { eventId });
  assert.equal(second.status, 200);
  assert.equal(second.body.data.status, "duplicate");
  const row = await PaymentWebhookEvent.findOne({ eventId }).lean();
  assert.equal(row.status, "processed");
});

test("webhook: a charge with the wrong amount changes no state and is audited", async () => {
  const payId = "pay_wrong_amount";
  addPayment(payId, ctx.subId, 1);
  const beforeCount = (await txnsFor(ctx.subId)).length;
  const res = await sendWebhook(subEvent("subscription.charged", ctx.subId, fake.payments[payId]));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "amount_mismatch");
  assert.equal((await txnsFor(ctx.subId)).length, beforeCount);
  assert.equal(await PaymentTransaction.exists({ gatewayPaymentId: payId }), null);
});

test("webhook: a failed renewal marks the subscription past_due and records the failed attempt", async () => {
  const failuresBefore = (await subRecord(ctx.subId)).renewalFailures;
  setSub(ctx.subId, { status: "pending" });
  const res = await sendWebhook(subEvent("subscription.pending", ctx.subId));
  assert.equal(res.status, 200);
  const sub = await subRecord(ctx.subId);
  assert.equal(sub.status, "past_due");
  assert.equal(sub.renewalFailures, failuresBefore + 1, "each failed attempt is counted once");
  assert.ok(sub.pastDueSince);
  const failedPay = { id: "pay_failed_renewal", subscription_id: ctx.subId, amount: 14900, currency: "INR", status: "failed", error_description: "card declined" };
  const failed = await sendWebhook({ event: "payment.failed", payload: { payment: { entity: failedPay } } });
  assert.equal(failed.status, 200);
  assert.equal(failed.body.data.outcome, "failure_recorded");
  const failedTxn = await PaymentTransaction.findOne({ gatewayPaymentId: "pay_failed_renewal" }).lean();
  assert.equal(failedTxn.status, "failed");
  // The failed attempt is in the history, but the plan itself is still in its grace window.
  assert.equal(await currentTier(ctx.asha), "candidate_plus");
});

test("webhook: halted after retries are exhausted keeps the plan in past_due", async () => {
  setSub(ctx.subId, { status: "halted" });
  const res = await sendWebhook(subEvent("subscription.halted", ctx.subId));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "halted");
  assert.equal((await subRecord(ctx.subId)).status, "past_due");
});

test("webhook: a charge after a halt recovers the subscription to active", async () => {
  const payId = "pay_recover";
  addPayment(payId, ctx.subId);
  // A recovery charge starts a new period after the one already recorded (the out-of-order guard refuses earlier ones).
  activateSub(ctx.subId, 90);
  const res = await sendWebhook(subEvent("subscription.charged", ctx.subId, fake.payments[payId]));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "renewed");
  const sub = await subRecord(ctx.subId);
  assert.equal(sub.status, "active");
  assert.equal(sub.renewalFailures, 0);
  assert.equal(sub.pastDueSince, null);
});

test("cancellation: a provider failure changes nothing locally", async () => {
  fake.failCancel = true;
  const res = await request(app).post(`${API}/subscriptions/cancel`).set(auth(ctx.asha.token));
  fake.failCancel = false;
  assert.ok(res.status >= 500, JSON.stringify(res.body));
  assert.equal((await subRecord(ctx.subId)).cancelAtPeriodEnd, false);
});

test("cancellation: the provider cancels at period end and access continues until then", async () => {
  const res = await request(app).post(`${API}/subscriptions/cancel`).set(auth(ctx.asha.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(fake.cancelled.at(-1), { id: ctx.subId, atCycleEnd: true });
  const sub = await subRecord(ctx.subId);
  assert.equal(sub.cancelAtPeriodEnd, true);
  assert.equal(await currentTier(ctx.asha), "candidate_plus", "paid period is kept");
});

test("webhook: the provider's cancellation notice is recorded without revoking access", async () => {
  setSub(ctx.subId, { status: "cancelled" });
  const res = await sendWebhook(subEvent("subscription.cancelled", ctx.subId));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "cancelled");
  const sub = await subRecord(ctx.subId);
  assert.equal(sub.cancelAtPeriodEnd, true);
});

test("a renewal cancelled at period end still holds the subscription slot until the period ends", async () => {
  const res = await checkout(ctx.asha, { planTier: "candidate_plus" });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.code, "ALREADY_SUBSCRIBED");
  assert.equal(await PaymentTransaction.countDocuments({ subscriberId: ctx.asha.userId, status: "initiated" }), 0, "no second order created");
});

test("checkout cancellation: an abandoned subscription checkout is cancelled and cannot be verified", async () => {
  const other = await register("ravi@payflow.example", "candidate");
  const started = await checkout(other);
  assert.equal(started.status, 200);
  const subId = started.body.data.subscription.subscriptionId;
  const res = await request(app)
    .post(`${API}/subscriptions/checkout/cancel`)
    .set(auth(other.token))
    .send({ subscriptionId: subId });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.transaction.status, "cancelled");
  addPayment("pay_after_cancel", subId);
  const verify = await verifySub(other, {
    subscriptionId: subId,
    paymentId: "pay_after_cancel",
    signature: subSignature(subId, "pay_after_cancel"),
  });
  assert.equal(verify.status, 409, JSON.stringify(verify.body));
  assert.equal(verify.body.code, "PAYMENT_ALREADY_PROCESSED");
  assert.equal(await PaymentTransaction.exists({ gatewayPaymentId: "pay_after_cancel" }), null, "nothing recorded");
  ctx.ravi = other;
});

test("refund: a full refund of a renewal ends the plan it paid for", async () => {
  const refund = {
    id: rid("rfnd_"),
    payment_id: "pay_renew_1",
    amount: 14900,
    status: "processed",
  };
  const res = await sendWebhook({ event: "refund.processed", payload: { refund: { entity: refund } } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.outcome, "refunded");
  const renewal = await PaymentTransaction.findOne({ gatewayPaymentId: "pay_renew_1" }).lean();
  assert.equal(renewal.status, "refunded");
  assert.equal((await subRecord(ctx.subId)).status, "expired");
  assert.equal(await currentTier(ctx.asha), "candidate_free");
});

test("unknown event types are recorded and ignored", async () => {
  const res = await sendWebhook({ event: "something.else", payload: {} });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.outcome, "ignored");
});

test("yearly: once a yearly price is configured, checkout uses a yearly provider plan and 10 cycles", async () => {
  const original = ALL_PLANS.candidate_plus.yearlyPriceInr;
  ALL_PLANS.candidate_plus.yearlyPriceInr = 1490;
  try {
    const res = await checkout(ctx.ravi, { billingCycle: "yearly" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const s = res.body.data.subscription;
    assert.equal(s.billingCycle, "yearly");
    assert.equal(s.amount, 1490);
    assert.equal(fake.subs[s.subscriptionId].total_count, 10);
    const plan = fake.plans.at(-1);
    assert.equal(plan.period, "yearly");
    assert.equal(plan.item.amount, 149000);
  } finally {
    ALL_PLANS.candidate_plus.yearlyPriceInr = original;
  }
});

test("a bad browser signature followed by the provider's charge records the first purchase, not a renewal", async () => {
  const late = await register("late-verify@payflow.example", "candidate");
  const created = await checkout(late);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const subId = created.body.data.subscription.subscriptionId;
  const orderTxnId = created.body.data.transaction._id;

  const forged = await verifySub(late, { subscriptionId: subId, paymentId: "pay_bad_sig", signature: "1".repeat(64) });
  assert.equal(forged.status, 400, JSON.stringify(forged.body));
  assert.equal(forged.body.code, "PAYMENT_VERIFICATION_FAILED");

  const payId = "pay_late_webhook";
  addPayment(payId, subId);
  activateSub(subId, 30);
  const res = await sendWebhook(subEvent("subscription.charged", subId, fake.payments[payId]));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.outcome, "activated", "the first charge completes the original order");

  const orderTxn = await PaymentTransaction.findById(orderTxnId).lean();
  assert.equal(orderTxn.status, "captured");
  assert.equal(orderTxn.gatewayPaymentId, payId);
  assert.equal(await PaymentTransaction.countDocuments({ providerSubscriptionId: subId }), 1, "no second row");
  assert.equal(await PaymentTransaction.countDocuments({ status: "failed", providerSubscriptionId: subId }), 0);
  assert.equal(await currentTier(late), "candidate_plus");
});
