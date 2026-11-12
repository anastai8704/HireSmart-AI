// Unit tests for the recurring-billing subscription lookup. No database: model methods are replaced for the
// duration of each test. The lookup must create the Free record for a subscriber that has none, so the first
// verified charge can always be applied (previously it failed as unknown_subscription).
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { linkedSubscription, ensureSubscriber } = require("../services/recurringBillingService");

const withStubs = async ({ subFindOne, txn }, fn) => {
  const originals = {
    subFindOne: Subscription.findOne,
    subCreate: Subscription.create,
    txnFindOne: PaymentTransaction.findOne,
  };
  const calls = { created: [] };
  Subscription.findOne = async (filter) => subFindOne(filter);
  Subscription.create = async (doc) => {
    calls.created.push(doc);
    return { _id: new mongoose.Types.ObjectId(), ...doc };
  };
  PaymentTransaction.findOne = () => ({ sort: () => ({ lean: async () => txn }) });
  try {
    await fn(calls);
  } finally {
    Subscription.findOne = originals.subFindOne;
    Subscription.create = originals.subCreate;
    PaymentTransaction.findOne = originals.txnFindOne;
  }
};

test("first charge for an organization with no subscription record creates a Free record and returns it", async () => {
  const orgId = new mongoose.Types.ObjectId();
  await withStubs(
    {
      subFindOne: async () => null,
      txn: { subscriberType: "organization", subscriberId: orgId },
    },
    async (calls) => {
      const sub = await linkedSubscription("sub_TEST_NEW");
      assert.ok(sub, "a subscription record must be returned");
      assert.equal(calls.created.length, 1, "exactly one record is created");
      assert.equal(calls.created[0].subscriberType, "organization");
      assert.equal(String(calls.created[0].subscriberId), String(orgId));
      assert.equal(calls.created[0].planTier, "recruiter_free");
      assert.equal(calls.created[0].priceInr, 0);
    },
  );
});

test("a candidate with no record also gets a Free record", async () => {
  const candidateId = new mongoose.Types.ObjectId();
  await withStubs(
    {
      subFindOne: async () => null,
      txn: { subscriberType: "candidate", subscriberId: candidateId },
    },
    async (calls) => {
      const sub = await ensureSubscriber("candidate", candidateId);
      assert.ok(sub);
      assert.equal(calls.created.length, 1);
      assert.equal(calls.created[0].subscriberType, "candidate");
      assert.equal(calls.created[0].planTier, "candidate_free");
    },
  );
});

test("an existing record is reused and nothing is created", async () => {
  const orgId = new mongoose.Types.ObjectId();
  const existing = { _id: new mongoose.Types.ObjectId(), subscriberType: "organization", subscriberId: orgId, planTier: "recruiter_free" };
  await withStubs(
    {
      subFindOne: async (filter) => (filter.subscriberType ? existing : null),
      txn: { subscriberType: "organization", subscriberId: orgId },
    },
    async (calls) => {
      const sub = await linkedSubscription("sub_TEST_EXISTING");
      assert.equal(String(sub._id), String(existing._id));
      assert.equal(calls.created.length, 0);
    },
  );
});

test("no transaction for the provider subscription means no record and no creation", async () => {
  await withStubs({ subFindOne: async () => null, txn: null }, async (calls) => {
    assert.equal(await linkedSubscription("sub_UNKNOWN"), null);
    assert.equal(calls.created.length, 0);
  });
});

const { paymentBelongsToSubscription } = require("../services/recurringBillingService");

test("payment-to-subscription link: absent id is accepted (Checkout signature covers it), a conflicting id is rejected", () => {
  assert.equal(paymentBelongsToSubscription({ id: "pay_1" }, "sub_A"), true, "absent subscription_id");
  assert.equal(paymentBelongsToSubscription({ id: "pay_1", subscription_id: null }, "sub_A"), true, "null subscription_id");
  assert.equal(paymentBelongsToSubscription({ id: "pay_1", subscription_id: "" }, "sub_A"), true, "empty subscription_id");
  assert.equal(paymentBelongsToSubscription({ id: "pay_1", subscription_id: "sub_A" }, "sub_A"), true, "matching id");
  assert.equal(paymentBelongsToSubscription({ id: "pay_1", subscription_id: "sub_B" }, "sub_A"), false, "conflicting id");
});
