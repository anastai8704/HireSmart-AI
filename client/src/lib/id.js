// Unique client id. crypto.randomUUID() only exists in secure contexts
// (HTTPS/localhost); on plain-HTTP LAN access it is undefined, so fall back
// to a time+random id. Used for React keys and client idempotency keys,
// so cryptographic strength is not required.
export const newId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
};
