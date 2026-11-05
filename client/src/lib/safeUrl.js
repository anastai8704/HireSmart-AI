// Client-side guard for user-supplied URLs rendered as links. The server already restricts these to http and
// https; this is defence in depth for data that was stored before that rule existed.
export function safeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
