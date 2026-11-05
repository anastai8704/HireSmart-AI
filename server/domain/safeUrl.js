// URLs that users submit and the app later renders as links or images. Only http and https are allowed.
// `javascript:`, `data:`, `file:` and similar schemes would run script or leak data when a user clicks them.
const { z } = require("zod");

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

const isSafeHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return SAFE_PROTOCOLS.has(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(isSafeHttpUrl, { message: "Must be an http or https URL" });

module.exports = { httpUrl, isSafeHttpUrl };
