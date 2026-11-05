// Phase 8 unit tests: JWT pinning, log redaction, image signatures, URL schema, admin guard.
// No database, no network. Runs locally and in CI.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "unit_test_only_jwt_secret_0123456789abcdef0123456789";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { signOptions, verifyAccessToken, JWT_ISSUER, JWT_AUDIENCE } = require("../utils/accessToken");
const { config } = require("../config/env");
const { redact, REDACTED } = require("../utils/redact");
const { detectImage } = require("../domain/imageSignature");
const { httpUrl, isSafeHttpUrl } = require("../domain/safeUrl");
const { requirePlatformAdmin } = require("../middleware/v1Auth");
const AppError = require("../utils/AppError");

const USER_ID = "64b000000000000000000001";

// ---- Access token pinning -------------------------------------------------------------------------------------
test("access tokens are signed HS256 with issuer, audience, and subject, and verify", () => {
  const token = jwt.sign({ role: "candidate" }, config.jwtSecret, signOptions(USER_ID));
  const decoded = verifyAccessToken(token);
  assert.equal(decoded.sub, USER_ID);
  assert.equal(decoded.iss, JWT_ISSUER);
  assert.equal(decoded.aud, JWT_AUDIENCE);
  assert.equal(jwt.decode(token, { complete: true }).header.alg, "HS256");
});

test("access tokens with the alg=none header are rejected", () => {
  const unsigned = jwt.sign({ sub: USER_ID, iss: JWT_ISSUER, aud: JWT_AUDIENCE }, "", { algorithm: "none" });
  assert.throws(() => verifyAccessToken(unsigned));
});

test("access tokens signed with another HMAC algorithm are rejected", () => {
  const hs512 = jwt.sign({ sub: USER_ID, iss: JWT_ISSUER, aud: JWT_AUDIENCE }, config.jwtSecret, {
    algorithm: "HS512",
    expiresIn: "5m",
  });
  assert.throws(() => verifyAccessToken(hs512));
});

test("access tokens with the wrong audience, issuer, or secret are rejected", () => {
  const wrongAudience = jwt.sign({ sub: USER_ID, iss: JWT_ISSUER, aud: "other-client" }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
  const wrongIssuer = jwt.sign({ sub: USER_ID, iss: "someone-else", aud: JWT_AUDIENCE }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
  const wrongSecret = jwt.sign({ sub: USER_ID, iss: JWT_ISSUER, aud: JWT_AUDIENCE }, "a-different-secret-value-xx", {
    algorithm: "HS256",
    expiresIn: "5m",
  });
  assert.throws(() => verifyAccessToken(wrongAudience));
  assert.throws(() => verifyAccessToken(wrongIssuer));
  assert.throws(() => verifyAccessToken(wrongSecret));
});

test("expired access tokens are rejected", () => {
  const expired = jwt.sign(
    { sub: USER_ID, iss: JWT_ISSUER, aud: JWT_AUDIENCE, exp: Math.floor(Date.now() / 1000) - 60 },
    config.jwtSecret,
    { algorithm: "HS256" },
  );
  assert.throws(() => verifyAccessToken(expired));
});

// ---- Redaction ------------------------------------------------------------------------------------------------
test("redaction removes secrets at any depth and keeps ordinary fields", () => {
  const input = {
    message: "login failed",
    email: "candidate@example.com",
    password: "hunter2hunter2",
    headers: { authorization: "Bearer abc.def.ghi", cookie: "hiresmart_refresh=secret", "x-request-id": "r1" },
    session: { accessToken: "a.b.c", refreshToken: "r.t.k", csrfToken: "csrf" },
    payment: { razorpay_signature: "sig", razorpay_payment_id: "pay_123", key_secret: "shh" },
    items: [{ apiKey: "k-1", name: "ok" }],
  };
  const out = redact(input);
  assert.equal(out.message, "login failed");
  assert.equal(out.email, "candidate@example.com");
  assert.equal(out.password, REDACTED);
  assert.equal(out.headers.authorization, REDACTED);
  assert.equal(out.headers.cookie, REDACTED);
  assert.equal(out.headers["x-request-id"], "r1");
  assert.equal(out.session.accessToken, REDACTED);
  assert.equal(out.session.refreshToken, REDACTED);
  assert.equal(out.session.csrfToken, REDACTED);
  assert.equal(out.payment.razorpay_signature, REDACTED);
  assert.equal(out.payment.key_secret, REDACTED);
  assert.equal(out.items[0].apiKey, REDACTED);
  assert.equal(out.items[0].name, "ok");
  // The original object is not mutated.
  assert.equal(input.password, "hunter2hunter2");
});

test("redaction terminates on deeply nested or circular-like input", () => {
  let deep = { leaf: "x" };
  for (let i = 0; i < 20; i += 1) deep = { child: deep };
  const out = JSON.stringify(redact(deep));
  assert.match(out, /TRUNCATED/);
});

// ---- Image signatures -----------------------------------------------------------------------------------------
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 0)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 0)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(8)]);

test("image types are detected from their bytes", () => {
  assert.equal(detectImage(JPEG).extension, ".jpg");
  assert.equal(detectImage(PNG).extension, ".png");
  assert.equal(detectImage(WEBP).extension, ".webp");
  assert.equal(detectImage(WEBP).contentType, "image/webp");
});

test("files that only claim to be images are rejected", () => {
  assert.equal(detectImage(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(detectImage(Buffer.from("GIF89a-------")), null);
  assert.equal(detectImage(Buffer.from("%PDF-1.7 plain pdf text")), null);
  assert.equal(detectImage(Buffer.from([0xff, 0xd8])), null, "too short");
  assert.equal(detectImage("not a buffer"), null);
  assert.equal(detectImage(Buffer.from("RIFF0000WAVEfmt ")), null, "RIFF container that is not WebP");
});

test("saveImage refuses non-image bytes before writing anything", async () => {
  const storageService = require("../services/storageService");
  await assert.rejects(
    storageService.saveImage({ buffer: Buffer.from("<svg onload=alert(1)>") }),
    (error) => error.code === "UNSUPPORTED_FILE_TYPE" && error.statusCode === 415,
  );
});

// ---- URL schema -----------------------------------------------------------------------------------------------
test("httpUrl accepts only http and https URLs", () => {
  for (const ok of ["https://meet.example.com/abc", "http://example.com", "https://a.b/c?d=e#f"]) {
    assert.equal(httpUrl.safeParse(ok).success, true, ok);
  }
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "ftp://example.com",
    "not a url",
    "https://",
  ]) {
    assert.equal(httpUrl.safeParse(bad).success, false, bad);
    assert.equal(isSafeHttpUrl(bad), false, bad);
  }
});

// ---- Admin guard ----------------------------------------------------------------------------------------------
const runGuard = (req) =>
  new Promise((resolve) => {
    requirePlatformAdmin(req, {}, (error) => resolve(error));
  });

test("requirePlatformAdmin rejects anonymous requests with 401", async () => {
  const error = await runGuard({});
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 401);
});

test("requirePlatformAdmin rejects non-admin users with 403", async () => {
  for (const platformRole of [undefined, "user", "recruiter", "candidate"]) {
    const error = await runGuard({ user: { _id: USER_ID }, auth: { platformRole } });
    assert.ok(error instanceof AppError, String(platformRole));
    assert.equal(error.statusCode, 403, String(platformRole));
  }
});

test("requirePlatformAdmin lets platform administrators through", async () => {
  const error = await runGuard({ user: { _id: USER_ID }, auth: { platformRole: "platform_admin" } });
  assert.equal(error, undefined);
});
