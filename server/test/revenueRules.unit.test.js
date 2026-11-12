// Pure revenue rules (Requirement 8). No database: these run in every environment.
process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../domain/revenueRules");

const txn = (over = {}) => ({
  _id: "64b000000000000000000001",
  transactionNumber: "TXN-1",
  subscriberType: "organization",
  subscriberId: "64b000000000000000000002",
  planTier: "recruiter_pro",
  amount: 999,
  currency: "INR",
  status: "captured",
  gateway: "razorpay",
  mode: "test",
  gatewayPaymentId: "pay_test_1",
  gatewayOrderId: "order_test_1",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  refundedAt: null,
  ...over,
});

test("only captured or refunded razorpay payments are revenue", () => {
  assert.equal(rules.isRevenueEligible(txn()), true);
  assert.equal(rules.isRevenueEligible(txn({ status: "refunded", refundedAt: new Date() })), true);
  assert.equal(rules.isRevenueEligible(txn({ status: "failed" })), false);
  assert.equal(rules.isRevenueEligible(txn({ status: "initiated" })), false);
  assert.equal(rules.isRevenueEligible(txn({ status: "cancelled" })), false);
});

test("sandbox (simulation) records are never revenue, even when captured", () => {
  const sandbox = txn({ gateway: "simulation", mode: "simulation", gatewayPaymentId: "pay_sim_1" });
  assert.equal(rules.isRevenueEligible(sandbox), false);
  assert.equal(rules.revenueMode(sandbox), "simulation");
  assert.equal(rules.paymentVerificationOf(sandbox), "sandbox_excluded");
});

test("legacy razorpay records without a stored mode are test-mode revenue", () => {
  const legacy = txn({ mode: undefined });
  assert.equal(rules.revenueMode(legacy), "test");
  assert.equal(rules.isRevenueEligible(legacy), true);
});

test("live mode is only reported when the record says live", () => {
  assert.equal(rules.revenueMode(txn({ mode: "live" })), "live");
  assert.equal(rules.revenueMode(txn({ mode: "test" })), "test");
});

test("refund status and payment verification are derived from the record", () => {
  assert.equal(rules.refundStatusOf(txn()), "none");
  assert.equal(rules.refundStatusOf(txn({ status: "refunded" })), "refunded");
  assert.equal(rules.paymentVerificationOf(txn()), "verified");
  assert.equal(rules.paymentVerificationOf(txn({ gatewayPaymentId: "" })), "unverified");
  assert.equal(rules.paymentVerificationOf(txn({ status: "failed" })), "not_captured");
});

test("net revenue subtracts refunds once and never reduces gross", () => {
  const s = rules.summarizeRevenueTotals({ grossAmount: 2998, refundAmount: 999, count: 3, refundCount: 1 });
  assert.equal(s.grossCaptured, 2998);
  assert.equal(s.refunds, 999);
  assert.equal(s.netRevenue, 1999);
  assert.equal(s.successfulPayments, 3);
  assert.equal(s.refundedPayments, 1);
});

test("amounts are rounded to two decimals", () => {
  const s = rules.summarizeRevenueTotals({ grossAmount: 0.1 + 0.2, refundAmount: 0 });
  assert.equal(s.grossCaptured, 0.3);
});

test("transaction row exposes no gateway signature and marks eligibility", () => {
  const row = rules.transactionRow({ ...txn(), gatewaySignature: "secret-signature" }, { organizationName: "Acme" });
  assert.equal("gatewaySignature" in row, false);
  assert.equal(row.organizationName, "Acme");
  assert.equal(row.eligibleForRevenue, true);
  assert.equal(row.mode, "test");
  assert.equal(row.refundStatus, "none");
});

test("the shared match admits only razorpay captured or refunded records", () => {
  assert.deepEqual(rules.REVENUE_MATCH.status.$in, ["captured", "refunded"]);
  assert.deepEqual(rules.REVENUE_MATCH.gateway.$in, ["razorpay"]);
});
