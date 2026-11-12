const test = require("node:test");
const assert = require("node:assert/strict");
const { remindersDue, lapseDue, REMINDER_7D, REMINDER_1D } = require("../services/subscriptionNoticeService");

const DAY = 24 * 3600 * 1000;
const NOW = new Date("2026-11-03T06:00:00.000Z");
const paid = (over = {}) => ({
  status: "active",
  priceInr: 999,
  planTier: "recruiter_starter",
  cancelAtPeriodEnd: true,
  providerSubscriptionId: "sub_1",
  currentPeriodEnd: new Date(NOW.getTime() + 25 * DAY),
  ...over,
});

test("no reminder while more than 7 days remain", () => {
  assert.deepEqual(remindersDue(paid(), NOW), []);
});

test("the 7-day reminder is due inside the 7-day window", () => {
  assert.deepEqual(remindersDue(paid({ currentPeriodEnd: new Date(NOW.getTime() + 6 * DAY) }), NOW), [REMINDER_7D]);
});

test("both reminders are due inside the 1-day window (missed worker runs are covered)", () => {
  assert.deepEqual(remindersDue(paid({ currentPeriodEnd: new Date(NOW.getTime() + DAY / 2) }), NOW), [REMINDER_7D, REMINDER_1D]);
});

test("auto-renewing subscriptions get no expiry reminders", () => {
  assert.deepEqual(remindersDue(paid({ cancelAtPeriodEnd: false, currentPeriodEnd: new Date(NOW.getTime() + DAY / 2) }), NOW), []);
});

test("free and non-active subscriptions get no reminders", () => {
  assert.deepEqual(remindersDue(paid({ priceInr: 0 }), NOW), []);
  assert.deepEqual(remindersDue(paid({ status: "expired", currentPeriodEnd: new Date(NOW.getTime() + DAY / 2) }), NOW), []);
});

test("a non-renewing paid plan lapses exactly at its period end, and not before", () => {
  assert.equal(lapseDue(paid({ currentPeriodEnd: new Date(NOW.getTime() + 1000) }), NOW), false);
  assert.equal(lapseDue(paid({ currentPeriodEnd: new Date(NOW.getTime() - 1000) }), NOW), true);
});

test("a renewal failure keeps access through the 3-day grace period, then lapses", () => {
  const ended = (days) => new Date(NOW.getTime() - days * DAY);
  assert.equal(lapseDue(paid({ status: "past_due", cancelAtPeriodEnd: false, currentPeriodEnd: ended(2) }), NOW), false);
  assert.equal(lapseDue(paid({ status: "past_due", cancelAtPeriodEnd: false, currentPeriodEnd: ended(4) }), NOW), true);
});

test("an auto-renewing active subscription past its end is left to the grace logic, not expired here", () => {
  assert.equal(lapseDue(paid({ cancelAtPeriodEnd: false, currentPeriodEnd: new Date(NOW.getTime() - DAY) }), NOW), false);
});
