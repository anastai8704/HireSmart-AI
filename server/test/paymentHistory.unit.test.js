const test = require("node:test");
const assert = require("node:assert/strict");
const { historyStatusesFor, historyWindow, createdAtFilter } = require("../domain/paymentHistory");

test("default history lists captured, refunded and failed, never initiated", () => {
  assert.deepEqual(historyStatusesFor(undefined), ["captured", "refunded", "failed"]);
  assert.equal(historyStatusesFor("initiated"), null);
});

test("status filters narrow to one state", () => {
  assert.deepEqual(historyStatusesFor("failed"), ["failed"]);
  assert.deepEqual(historyStatusesFor("refunded"), ["refunded"]);
  assert.equal(historyStatusesFor("bogus"), null);
});

test("an IST day maps to 00:00 IST to the next midnight IST", () => {
  const w = historyWindow({ from: "2026-11-03", to: "2026-11-03" });
  assert.equal(w.start.toISOString(), "2026-11-02T18:30:00.000Z");
  assert.equal(w.end.toISOString(), "2026-11-03T18:30:00.000Z");
});

test("the upper bound includes the whole last day (exclusive next midnight)", () => {
  const w = historyWindow({ to: "2026-11-30" });
  assert.equal(w.start, null);
  assert.equal(w.end.toISOString(), "2026-11-30T18:30:00.000Z");
  const f = createdAtFilter(w);
  assert.equal(f.createdAt.$lt.toISOString(), "2026-11-30T18:30:00.000Z");
});

test("reversed, malformed or impossible days are rejected", () => {
  assert.equal(historyWindow({ from: "2026-11-05", to: "2026-11-04" }), null);
  assert.equal(historyWindow({ from: "03/11/2026" }), null);
  assert.equal(historyWindow({ from: "2026-02-30" }), null);
});

test("no dates means no date filter", () => {
  assert.deepEqual(createdAtFilter(historyWindow({})), {});
});

test("search: an empty term adds no condition", () => {
  const { searchFilter } = require("../domain/paymentHistory");
  assert.deepEqual(searchFilter(""), {});
  assert.deepEqual(searchFilter("   "), {});
  assert.deepEqual(searchFilter(undefined), {});
});

test("search: matches the subscriber's references, case-insensitively, as a literal substring", () => {
  const { searchFilter, SEARCH_FIELDS } = require("../domain/paymentHistory");
  const f = searchFilter("pay_ABC");
  assert.equal(f.$or.length, SEARCH_FIELDS.length);
  assert.ok(SEARCH_FIELDS.includes("gatewayPaymentId"));
  const rx = f.$or[0].transactionNumber;
  assert.ok(rx.test("TXN-1-pay_abc-2"));
  assert.ok(!rx.test("TXN-1-xyz"));
});

test("search: regex metacharacters are literal and cannot widen the match", () => {
  const { searchFilter } = require("../domain/paymentHistory");
  const rx = searchFilter(".*").$or[1].invoiceNumber;
  assert.ok(rx.test("a.*b"));
  assert.ok(!rx.test("anything"));
  const parens = searchFilter("(a|b)").$or[1].invoiceNumber;
  assert.ok(parens.test("x(a|b)y"));
  assert.ok(!parens.test("a"));
});

test("search: terms longer than 64 characters are refused", () => {
  const { searchFilter } = require("../domain/paymentHistory");
  assert.equal(searchFilter("x".repeat(65)), null);
  assert.notEqual(searchFilter("x".repeat(64)), null);
});
