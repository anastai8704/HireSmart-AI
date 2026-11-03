const crypto = require("node:crypto");
const IdempotencyRecord = require("../models/IdempotencyRecord");
const AppError = require("../utils/AppError");
const hashRequest = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const begin = async ({ req, scope, required = false }) => {
  const key = req.get("idempotency-key");
  if (!key) {
    if (required)
      throw new AppError("Idempotency-Key is required", 422, "IDEMPOTENCY_KEY_REQUIRED");
    return { key: null, requestHash: null, replay: null };
  }
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key))
    throw new AppError(
      "Idempotency-Key must be 8-120 safe characters",
      422,
      "IDEMPOTENCY_KEY_INVALID",
    );
  const requestHash = hashRequest({ params: req.params, body: req.body });
  const existing = await IdempotencyRecord.findOne({ actor: req.user._id, scope, key });
  if (existing && existing.requestHash !== requestHash)
    throw new AppError(
      "Idempotency key was already used for a different request",
      409,
      "IDEMPOTENCY_CONFLICT",
    );
  return {
    key,
    requestHash,
    replay: existing ? { statusCode: existing.statusCode, response: existing.response } : null,
  };
};
const complete = async ({ req, scope, key, requestHash, statusCode, response }) => {
  if (!key) return;
  try {
    await IdempotencyRecord.create({
      actor: req.user._id,
      scope,
      key,
      requestHash,
      statusCode,
      response,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
};
module.exports = { begin, complete };
