// AES-256-GCM for sensitive values at rest (Google refresh tokens). The key comes from GOOGLE_TOKEN_ENCRYPTION_KEY:
// 32 bytes encoded as base64 or hex. A wrong key or a tampered value fails loudly; it is never silently ignored.
const crypto = require("node:crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;

const parseKey = (raw) => {
  const value = String(raw || "").trim();
  if (!value) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not set");
  const buf = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (buf.length !== KEY_BYTES) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  return buf;
};

const encryptSecret = (plaintext, rawKey) => {
  const key = parseKey(rawKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
};

const decryptSecret = (payload, rawKey) => {
  const key = parseKey(rawKey);
  const [version, ivB64, tagB64, dataB64] = String(payload || "").split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Unsupported encrypted value");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
};

module.exports = { encryptSecret, decryptSecret, parseKey };
