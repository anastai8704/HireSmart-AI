// Phase 11 unit tests: cursor pagination rules (limits, cursor validation, and page metadata). No database needed.
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const { parse, applyCursor, meta } = require("../utils/pagination");

const ID_A = "65a000000000000000000001";
const ID_B = "65a000000000000000000002";

test("parse: defaults to 20 and accepts both query styles", () => {
  assert.deepEqual(parse({}), { limit: 20, after: undefined });
  assert.equal(parse({ limit: "5" }).limit, 5);
  assert.equal(parse({ "page[limit]": "7" }).limit, 7);
  assert.equal(parse({ after: ID_A }).after, ID_A);
  assert.equal(parse({ "page[after]": ID_A }).after, ID_A);
});

test("parse: limits outside 1..max and non-integers are refused with INVALID_PAGINATION", () => {
  for (const limit of ["0", "-1", "101", "2.5", "abc"]) {
    assert.throws(() => parse({ limit }), (error) => error.code === "INVALID_PAGINATION" && error.statusCode === 422, limit);
  }
  assert.equal(parse({ limit: "100" }).limit, 100);
  assert.throws(() => parse({ limit: "11" }, 10), (error) => error.code === "INVALID_PAGINATION");
});

test("parse: a malformed cursor is refused with INVALID_CURSOR, never passed to the database", () => {
  for (const after of ["not-an-id", "123", "{$gt:''}"]) {
    assert.throws(() => parse({ after }), (error) => error.code === "INVALID_CURSOR", after);
  }
});

test("applyCursor: adds a strict upper bound on _id only when a cursor is present", () => {
  assert.deepEqual(applyCursor({ status: "open" }, undefined), { status: "open" });
  assert.deepEqual(applyCursor({ status: "open" }, ID_A), { status: "open", _id: { $lt: ID_A } });
});

test("meta: a short page has no next page; a full page offers a cursor from its last item", () => {
  const short = meta([{ _id: ID_A }], 5);
  assert.deepEqual(short, { count: 1, hasMore: false, nextCursor: null });
  const full = meta([{ _id: ID_A }, { _id: ID_B }], 2);
  assert.equal(full.hasMore, true);
  assert.equal(full.nextCursor, ID_B);
});

test("meta: a full page may report a next page that turns out to be empty (documented, not hidden)", () => {
  // The helper cannot know whether more rows exist without fetching one extra row. The UI treats an empty next page as
  // the end of the list. This test pins the behaviour so a change is deliberate.
  const exactlyFull = meta([{ _id: ID_A }, { _id: ID_B }], 2);
  assert.equal(exactlyFull.hasMore, true);
});

test("meta: the true total is included only when the caller supplies it", () => {
  assert.equal("total" in meta([], 5), false);
  assert.equal(meta([], 5, 42).total, 42);
});
