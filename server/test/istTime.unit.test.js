// Asia/Kolkata date and time rules (Requirement 10). Pure functions; no database.
process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert/strict");
const ist = require("../utils/istTime");

test("local IST wall-clock input converts to the correct UTC instant", () => {
  assert.equal(ist.istLocalToUtc("2026-11-20T10:00").toISOString(), "2026-11-20T04:30:00.000Z");
  assert.equal(ist.istLocalToUtc("2026-11-20T00:00").toISOString(), "2026-11-19T18:30:00.000Z");
  assert.equal(ist.istLocalToUtc("2026-11-20T23:59").toISOString(), "2026-11-20T18:29:00.000Z");
});

test("malformed or impossible local values are rejected, not guessed", () => {
  assert.equal(ist.istLocalToUtc("2026-11-20 10:00"), null);
  assert.equal(ist.istLocalToUtc("2026-11-20T25:00"), null);
  assert.equal(ist.istLocalToUtc(""), null);
  assert.equal(ist.istLocalToUtc(undefined), null);
});

test("round trip: an instant is shown as the same IST wall clock it was entered as", () => {
  const utc = ist.istLocalToUtc("2026-03-08T09:15");
  assert.equal(ist.formatIstTime(utc), "09:15 AM");
  assert.equal(ist.formatIstDate(utc), "08 Mar 2026");
});

test("AM/PM is explicit and zero-padded for interview times", () => {
  assert.equal(ist.formatIstTime(ist.istLocalToUtc("2026-11-20T00:05")), "12:05 AM");
  assert.equal(ist.formatIstTime(ist.istLocalToUtc("2026-11-20T12:00")), "12:00 PM");
  assert.equal(ist.formatIstTime(ist.istLocalToUtc("2026-11-20T15:30")), "03:30 PM");
});

test("dates use DD MMM YYYY", () => {
  assert.equal(ist.formatIstDate(ist.istLocalToUtc("2026-11-05T12:00")), "05 Nov 2026");
});

test("DST-independent: IST offset is +05:30 in winter, summer and across US and EU DST changes", () => {
  for (const local of ["2026-01-15T12:00", "2026-03-08T12:00", "2026-03-29T12:00", "2026-07-01T12:00", "2026-10-25T12:00", "2026-11-01T12:00"]) {
    const utc = ist.istLocalToUtc(local);
    const back = new Date(utc.getTime() + ist.IST_OFFSET_MS).toISOString().slice(0, 16);
    assert.equal(back, local, `round trip failed for ${local}`);
    // Cross-check the fixed offset against the zone database.
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" }).format(utc);
    assert.equal(parts.replace(/^24/, "00"), local.slice(11), `zone database disagrees for ${local}`);
  }
});

test("day boundaries: 23:30 UTC belongs to the next IST day", () => {
  assert.equal(ist.istDayKey(new Date("2026-11-20T23:30:00Z")), "2026-11-21");
  assert.equal(ist.istDayKey(new Date("2026-11-20T18:29:59Z")), "2026-11-20");
  assert.equal(ist.istDayKey(new Date("2026-11-20T18:30:00Z")), "2026-11-21");
});

test("day bounds are half-open IST days", () => {
  const { start, end } = ist.istDayBounds("2026-11-21");
  assert.equal(start.toISOString(), "2026-11-20T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-11-21T18:30:00.000Z");
  assert.equal(ist.istDayBounds("2026-02-30"), null, "impossible date rejected");
  assert.equal(ist.istDayBounds("21/11/2026"), null);
});

test("calendar days until expiry follow IST days, not 24-hour steps", () => {
  const now = new Date("2026-11-20T20:00:00Z"); // 21 Nov 01:30 IST
  const expiry = new Date("2026-11-22T10:00:00Z"); // 22 Nov 15:30 IST
  assert.equal(ist.istCalendarDaysUntil(expiry, now), 1);
});

test("subscription expiry shown to a user uses the IST day, never the UTC day", () => {
  // A plan ending 20:00 UTC on 20 Nov ends 01:30 IST on 21 Nov.
  const end = new Date("2026-11-20T20:00:00Z");
  assert.equal(ist.istDayKey(end), "2026-11-21");
  assert.equal(ist.formatIstDate(end), "21 Nov 2026");
});

test("invalid input yields an empty string, never 'Invalid Date'", () => {
  assert.equal(ist.formatIstDate("not-a-date"), "");
  assert.equal(ist.formatIstTime(null), "");
  assert.equal(ist.formatIstDateTime(undefined), "");
});

test("month names are fixed English abbreviations (Sep, not Sept)", () => {
  assert.equal(ist.formatIstDate(ist.istLocalToUtc("2026-09-08T10:00")), "08 Sep 2026");
});

test("analytics 'from' date means the start of that IST day", () => {
  const fallback = new Date("2000-01-01T00:00:00Z");
  assert.equal(ist.istSinceFromQuery("2026-11-20", fallback).toISOString(), "2026-11-19T18:30:00.000Z");
  assert.equal(ist.istSinceFromQuery("2026-11-20T06:00:00Z", fallback).toISOString(), "2026-11-20T06:00:00.000Z");
  assert.equal(ist.istSinceFromQuery(undefined, fallback), fallback);
  assert.equal(ist.istSinceFromQuery("", fallback), fallback);
  assert.equal(ist.istSinceFromQuery("2026-02-30", fallback), fallback, "impossible day falls back");
  assert.equal(ist.istSinceFromQuery("not a date", fallback), fallback);
});
