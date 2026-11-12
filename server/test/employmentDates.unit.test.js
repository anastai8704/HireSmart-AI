const test = require("node:test");
const assert = require("node:assert/strict");
const { parseOptionalDate, assertEmploymentRange } = require("../domain/employmentDates");

test("empty dates are 'not supplied', not an error", () => {
  assert.equal(parseOptionalDate(undefined, "startDate"), null);
  assert.equal(parseOptionalDate("", "endDate"), null);
  assert.equal(parseOptionalDate(null, "endDate"), null);
});

test("a valid date parses", () => {
  assert.equal(parseOptionalDate("2026-10-01", "startDate").toISOString(), "2026-10-01T00:00:00.000Z");
});

test("an invalid date is rejected with 422 instead of being stored as Invalid Date", () => {
  for (const bad of ["not-a-date", "2026-13-45", "31/12/2026x"]) {
    assert.throws(
      () => parseOptionalDate(bad, "startDate"),
      (err) => err.statusCode === 422 && err.code === "INVALID_DATE",
      bad,
    );
  }
});

test("an end before the start is rejected", () => {
  const start = new Date("2026-10-10T00:00:00Z");
  assert.throws(
    () => assertEmploymentRange(start, new Date("2026-10-09T00:00:00Z")),
    (err) => err.statusCode === 422 && err.code === "INVALID_DATE_RANGE",
  );
});

test("an end on or after the start is allowed, and a missing bound is not checked", () => {
  const start = new Date("2026-10-10T00:00:00Z");
  assert.doesNotThrow(() => assertEmploymentRange(start, new Date("2026-10-10T00:00:00Z")));
  assert.doesNotThrow(() => assertEmploymentRange(null, new Date("2020-01-01T00:00:00Z")));
  assert.doesNotThrow(() => assertEmploymentRange(start, null));
});
