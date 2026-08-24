/**
 * Generates a unique id that works in every browser context.
 *
 * crypto.randomUUID() is only exposed in secure contexts (HTTPS or
 * localhost). This app is also served over plain HTTP on LAN addresses
 * (e.g. http://10.61.91.145:5173 from a second device), where
 * crypto.randomUUID is undefined and calling it throws
 * "crypto.randomUUID is not a function" - which surfaced as failed
 * toasts and failed action banners.
 *
 * The fallback is time+random based. These ids are React keys and
 * client-side idempotency keys (the API accepts any 8-120 char safe
 * string), so cryptographic strength is not required.
 */
export const newId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
};
