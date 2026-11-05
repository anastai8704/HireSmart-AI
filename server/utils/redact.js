// Removes secrets and unnecessary personal data before anything is logged.
// Matching is by key name, case-insensitive, at any depth. Values are replaced, never partially shown.
const SENSITIVE_KEY_PATTERN =
  /pass(word)?|token|secret|authorization|cookie|signature|csrf|api[-_]?key|credential|private|otp|resumetext|rawbody|razorpay_signature|key_secret|keysecret/i;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;

const redact = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (Buffer.isBuffer(value)) return "[BINARY]";
  if (typeof value === "object") {
    if (value instanceof Date) return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(item, depth + 1);
    }
    return out;
  }
  return value;
};

module.exports = { redact, SENSITIVE_KEY_PATTERN, REDACTED };
