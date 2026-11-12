const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { encryptSecret, decryptSecret } = require("../services/tokenCrypto");

const KEY = crypto.randomBytes(32).toString("base64");

test("round-trips a secret and never stores the plaintext", () => {
  const sealed = encryptSecret("1//refresh-token-value", KEY);
  assert.ok(!sealed.includes("refresh-token-value"));
  assert.equal(decryptSecret(sealed, KEY), "1//refresh-token-value");
});

test("each encryption uses a fresh nonce", () => {
  assert.notEqual(encryptSecret("same", KEY), encryptSecret("same", KEY));
});

test("a tampered value or a wrong key fails instead of returning garbage", () => {
  const sealed = encryptSecret("token", KEY);
  const parts = sealed.split(":");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptSecret(parts.join(":"), KEY));
  assert.throws(() => decryptSecret(sealed, crypto.randomBytes(32).toString("hex")));
});

test("refuses a missing or wrong-length key", () => {
  assert.throws(() => encryptSecret("x", ""), /not set/);
  assert.throws(() => encryptSecret("x", "c2hvcnQ="), /32 bytes/);
});
