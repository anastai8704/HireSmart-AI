// Google Calendar and Google Meet through the official Google REST APIs (OAuth 2.0 + Calendar v3).
// No Meet link is ever invented: a link exists only when Google returns a conference entry point for the event.
//
// Pure pieces (URL building, OAuth state, event body, conference resolution) are unit-tested. HTTP calls go through
// `fetch` with a timeout and are tested with a mocked fetch. Live calls need real credentials (see docs/GOOGLE_MEET.md).
const crypto = require("node:crypto");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
/** Minimum scope: create, update and delete events on the user's primary calendar. Nothing else is requested. */
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const REQUEST_TIMEOUT_MS = 10000;
const STATE_TTL_MS = 10 * 60 * 1000;

const readGoogleEnv = () => ({
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
  redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || "",
  encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || "",
});

/** True only when every Google setting is present. Otherwise the feature reports setup-required. */
const isGoogleConfigured = (env = readGoogleEnv()) =>
  Boolean(env.clientId && env.clientSecret && env.redirectUri && env.encryptionKey);

const buildAuthUrl = ({ state, env = readGoogleEnv() }) => {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
};

/** OAuth state binds the callback to the user who started it, with an expiry, signed with the encryption key. */
const signOAuthState = ({ userId, now = Date.now(), env = readGoogleEnv() }) => {
  const payload = Buffer.from(
    JSON.stringify({ u: String(userId), n: crypto.randomBytes(12).toString("hex"), exp: now + STATE_TTL_MS }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", env.encryptionKey).update(payload).digest("base64url");
  return `${payload}.${sig}`;
};

const verifyOAuthState = ({ state, now = Date.now(), env = readGoogleEnv() }) => {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", env.encryptionKey).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!data?.u || !data.exp || data.exp < now) return null;
  return { userId: data.u };
};

const fetchWithTimeout = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

/** A short, safe error code for storage and logs. Never includes the response body or tokens. */
const safeError = (operation, status) => `${operation}_${status || "network"}`;

const exchangeCode = async ({ code, env = readGoogleEnv() }) => {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw Object.assign(new Error(safeError("oauth_exchange", res.status)), { safe: true });
  const data = await res.json();
  if (!data.refresh_token) throw Object.assign(new Error("oauth_no_refresh_token"), { safe: true });
  return { refreshToken: data.refresh_token, accessToken: data.access_token, expiresIn: data.expires_in, scope: data.scope || SCOPE };
};

const refreshAccessToken = async ({ refreshToken, env = readGoogleEnv() }) => {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (res.status === 400 || res.status === 401) {
    // invalid_grant: the user revoked access or the token expired. The connection must be reconnected.
    throw Object.assign(new Error("oauth_revoked"), { safe: true, revoked: true });
  }
  if (!res.ok) throw Object.assign(new Error(safeError("oauth_refresh", res.status)), { safe: true });
  const data = await res.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
};

const revokeToken = async (refreshToken) => {
  await fetchWithTimeout(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => null);
};

/**
 * The Calendar event body. Each interview gets its own conference request id, so a Meet link is never reused across
 * interviews. Attendees are the candidate and the assigned interviewers (emails from real user records).
 */
const buildEventBody = ({ interview, title, attendeeEmails, requestId, timezone = "Asia/Kolkata" }) => ({
  summary: title,
  description: interview.instructions || "",
  start: { dateTime: new Date(interview.scheduledStart).toISOString(), timeZone: timezone },
  end: { dateTime: new Date(interview.scheduledEnd).toISOString(), timeZone: timezone },
  attendees: attendeeEmails.filter(Boolean).map((email) => ({ email })),
  conferenceData: {
    createRequest: {
      requestId,
      conferenceSolutionKey: { type: "hangoutsMeet" },
    },
  },
  guestsCanModify: false,
});

/**
 * Turns a Calendar event response into a meeting state. Conference creation is asynchronous: Google may return a
 * pending createRequest first. Only a real video entry point counts as success.
 */
const resolveConference = (event) => {
  const status = event?.conferenceData?.createRequest?.status?.statusCode;
  const entry = (event?.conferenceData?.entryPoints || []).find((p) => p.entryPointType === "video");
  if (entry?.uri) return { status: "success", url: entry.uri, eventId: event.id || null };
  if (status === "pending") return { status: "pending", url: "", eventId: event?.id || null };
  if (status === "failure") return { status: "failure", url: "", eventId: event?.id || null };
  return { status: "pending", url: "", eventId: event?.id || null };
};

const authHeaders = (accessToken) => ({ authorization: `Bearer ${accessToken}`, "content-type": "application/json" });

const createEvent = async ({ accessToken, body }) => {
  const url = `${CALENDAR_BASE}?conferenceDataVersion=1&sendUpdates=all`;
  const res = await fetchWithTimeout(url, { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify(body) });
  if (!res.ok) throw Object.assign(new Error(safeError("calendar_create", res.status)), { safe: true, status: res.status });
  return res.json();
};

const patchEvent = async ({ accessToken, eventId, body }) => {
  const url = `${CALENDAR_BASE}/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`;
  const res = await fetchWithTimeout(url, { method: "PATCH", headers: authHeaders(accessToken), body: JSON.stringify(body) });
  if (!res.ok) throw Object.assign(new Error(safeError("calendar_update", res.status)), { safe: true, status: res.status });
  return res.json();
};

const getEvent = async ({ accessToken, eventId }) => {
  const res = await fetchWithTimeout(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}`, { headers: authHeaders(accessToken) });
  if (!res.ok) throw Object.assign(new Error(safeError("calendar_get", res.status)), { safe: true, status: res.status });
  return res.json();
};

const deleteEvent = async ({ accessToken, eventId }) => {
  const res = await fetchWithTimeout(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  // 410 Gone means the event was already removed: that is the intended end state.
  if (!res.ok && res.status !== 410) throw Object.assign(new Error(safeError("calendar_delete", res.status)), { safe: true });
  return true;
};

module.exports = {
  SCOPE,
  readGoogleEnv,
  isGoogleConfigured,
  buildAuthUrl,
  signOAuthState,
  verifyOAuthState,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  buildEventBody,
  resolveConference,
  createEvent,
  patchEvent,
  getEvent,
  deleteEvent,
};
