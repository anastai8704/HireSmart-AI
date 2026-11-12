// Billing attempt state for plan badges (Requirement 17).
process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert/strict");
const { billingStateFrom, PENDING_WINDOW_MS } = require("../domain/billingState");

const now = new Date("2026-11-20T10:00:00Z");
// Hex ObjectId-like strings: later ids compare greater.
const OLD = "65a000000000000000000001";
const NEW = "65a000000000000000000009";

test("nothing in flight and nothing failed", () => {
  assert.deepEqual(billingStateFrom({ now }), { pendingCheckout: false, lastPaymentFailed: false });
});

test("a checkout started recently is pending", () => {
  const initiatedAt = new Date(now.getTime() - 5 * 60 * 1000);
  assert.equal(billingStateFrom({ initiatedAt, now }).pendingCheckout, true);
});

test("an abandoned checkout stops being pending after the window", () => {
  const initiatedAt = new Date(now.getTime() - PENDING_WINDOW_MS - 1000);
  assert.equal(billingStateFrom({ initiatedAt, now }).pendingCheckout, false);
});

test("a failed attempt is shown until a later capture supersedes it", () => {
  assert.equal(billingStateFrom({ failedId: OLD, now }).lastPaymentFailed, true);
  assert.equal(billingStateFrom({ failedId: OLD, capturedId: NEW, now }).lastPaymentFailed, false);
  assert.equal(billingStateFrom({ failedId: NEW, capturedId: OLD, now }).lastPaymentFailed, true);
});
