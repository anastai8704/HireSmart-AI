// Pure analytics rules (Phase 5): IST date ranges, rate denominators, cash-basis revenue.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  resolveRange,
  ratePercent,
  summarizeRevenue,
  canonicalStage,
  istDayOf,
  AnalyticsRangeError,
  MAX_CUSTOM_DAYS,
} = require("../domain/analyticsDefinitions");

// 2026-11-05 10:00 IST is 04:30 UTC on the same day.
const NOW = new Date("2026-11-05T04:30:00.000Z");

test("presets are the last N IST calendar days including today", () => {
  const r7 = resolveRange({ range: "7d" }, NOW);
  assert.equal(r7.fromDay, "2026-10-30");
  assert.equal(r7.toDay, "2026-11-05");
  assert.equal(r7.days, 7);
  assert.equal(resolveRange({ range: "30d" }, NOW).days, 30);
  assert.equal(resolveRange({ range: "90d" }, NOW).days, 90);
});

test("range boundaries are IST midnight, half-open, in UTC", () => {
  const r = resolveRange({ range: "7d" }, NOW);
  assert.equal(r.start.toISOString(), "2026-10-29T18:30:00.000Z");
  assert.equal(r.end.toISOString(), "2026-11-05T18:30:00.000Z");
  assert.equal(r.timezone, "Asia/Kolkata");
});

test("an instant just before IST midnight belongs to the previous IST day", () => {
  assert.equal(istDayOf(new Date("2026-11-05T18:29:59.000Z")), "2026-11-05");
  assert.equal(istDayOf(new Date("2026-11-05T18:30:00.000Z")), "2026-11-06");
});

test("custom ranges are validated: format, order, cap and future dates", () => {
  const r = resolveRange({ range: "custom", from: "2026-10-01", to: "2026-10-31" }, NOW);
  assert.equal(r.days, 31);
  assert.equal(r.preset, "custom");
  assert.throws(() => resolveRange({ range: "custom", from: "2026-10-31", to: "2026-10-01" }, NOW), AnalyticsRangeError);
  assert.throws(() => resolveRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, NOW), AnalyticsRangeError);
  assert.throws(() => resolveRange({ range: "custom", from: "2026-10-01" }, NOW), AnalyticsRangeError);
  assert.throws(() => resolveRange({ range: "custom", from: "2026-11-01", to: "2026-11-30" }, NOW), /future/);
  const tooLong = new Date(Date.UTC(2026, 0, 1) + (MAX_CUSTOM_DAYS) * 24 * 3600 * 1000);
  const toStr = tooLong.toISOString().slice(0, 10);
  assert.throws(() => resolveRange({ range: "custom", from: "2026-01-01", to: toStr }, NOW), /cannot exceed/);
});

test("unknown range values are refused rather than defaulted", () => {
  assert.throws(() => resolveRange({ range: "365d" }, NOW), AnalyticsRangeError);
  assert.throws(() => resolveRange({ range: "all" }, NOW), AnalyticsRangeError);
});

test("rates use the stated denominator and report null when it is zero", () => {
  assert.equal(ratePercent(1, 4), 25);
  assert.equal(ratePercent(1, 3), 33.3);
  assert.equal(ratePercent(0, 0), null);
  assert.equal(ratePercent(2, 0), null);
});

test("revenue is cash-basis: captured minus refunds; failed and initiated attempts are excluded", () => {
  const summary = summarizeRevenue({ grossCapturedAmount: 1200, refundsAmount: 200, successfulCount: 2, failedCount: 1 });
  assert.deepEqual(summary, { grossCaptured: 1200, refunds: 200, netRevenue: 1000, successfulPayments: 2, failedPayments: 1 });
  const none = summarizeRevenue({});
  assert.equal(none.netRevenue, 0);
  assert.equal(none.successfulPayments, 0);
});

test("legacy application statuses map to lifecycle stages", () => {
  assert.equal(canonicalStage("Applied"), "submitted");
  assert.equal(canonicalStage("Selected"), "hired");
  assert.equal(canonicalStage("Withdrawn"), "withdrawn");
  assert.equal(canonicalStage("interview"), "interview");
});
