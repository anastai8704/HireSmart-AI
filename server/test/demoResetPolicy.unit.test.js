const test = require("node:test");
const assert = require("node:assert/strict");
const { assertDemoResetAllowed } = require("../domain/demoResetPolicy");

const ok = {
  nodeEnv: "development",
  confirmed: true,
  expectedDatabase: "hiresmart_dev",
  actualDatabase: "hiresmart_dev",
  host: "localhost",
};

test("allows a confirmed reset of a named local development database", () => {
  assert.deepEqual(assertDemoResetAllowed(ok), { database: "hiresmart_dev", host: "localhost" });
});

test("refuses production", () => {
  assert.throws(() => assertDemoResetAllowed({ ...ok, nodeEnv: "production" }), /NODE_ENV=production/);
});

test("refuses without the explicit confirmation flag", () => {
  assert.throws(() => assertDemoResetAllowed({ ...ok, confirmed: false }), /--confirm-reset/);
});

test("refuses when DEMO_RESET_DATABASE is missing", () => {
  assert.throws(() => assertDemoResetAllowed({ ...ok, expectedDatabase: "" }), /DEMO_RESET_DATABASE/);
});

test("refuses when the connected database is not the one named", () => {
  assert.throws(() => assertDemoResetAllowed({ ...ok, actualDatabase: "hiresmart" }), /Nothing was changed/);
});

test("refuses a remote host even with a matching name", () => {
  assert.throws(() => assertDemoResetAllowed({ ...ok, host: "cluster0.example.mongodb.net" }), /local MongoDB host/);
});

test("refuses a database whose name does not look like development", () => {
  const name = "hiresmart";
  assert.throws(
    () => assertDemoResetAllowed({ ...ok, expectedDatabase: name, actualDatabase: name }),
    /development database/,
  );
});
