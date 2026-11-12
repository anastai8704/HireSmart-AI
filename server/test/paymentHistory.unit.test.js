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
