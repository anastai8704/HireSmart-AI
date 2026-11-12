const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../services/googleCalendarService");

const env = {
  clientId: "cid.apps.googleusercontent.com",
  clientSecret: "test-client-secret",
  redirectUri: "http://localhost:4000/api/v1/integrations/google/callback",
  encryptionKey: "k".repeat(64),
};

test("configured only when all four settings are present", () => {
  assert.equal(G.isGoogleConfigured(env), true);
  assert.equal(G.isGoogleConfigured({ ...env, clientSecret: "" }), false);
  assert.equal(G.isGoogleConfigured({ ...env, encryptionKey: "" }), false);
});

test("the auth URL requests only the calendar events scope and offline access", () => {
  const url = new URL(G.buildAuthUrl({ state: "s1", env }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/calendar.events");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("state"), "s1");
});

test("OAuth state round-trips for the same user and is rejected when tampered or expired", () => {
  const state = G.signOAuthState({ userId: "64b0000000000000000000aa", env });
  assert.equal(G.verifyOAuthState({ state, env }).userId, "64b0000000000000000000aa");
  const [payload] = state.split(".");
  const forged = `${Buffer.from(JSON.stringify({ u: "other", n: "x", exp: Date.now() + 1e6 })).toString("base64url")}.${state.split(".")[1]}`;
  assert.equal(G.verifyOAuthState({ state: forged, env }), null, "forged payload");
  assert.equal(G.verifyOAuthState({ state: `${payload}.bad`, env }), null, "bad signature");
  const issuedAt = Date.now() - 60 * 60 * 1000;
  const old = G.signOAuthState({ userId: "u", now: issuedAt, env });
  assert.equal(G.verifyOAuthState({ state: old, env }), null, "expired");
});

test("each interview's event carries its own conference request and the Meet solution", () => {
  const interview = { scheduledStart: "2026-11-12T10:00:00Z", scheduledEnd: "2026-11-12T11:00:00Z", instructions: "Bring ID" };
  const a = G.buildEventBody({ interview, title: "Round 1", attendeeEmails: ["c@x.com", null, "i@x.com"], requestId: "req-A" });
  const b = G.buildEventBody({ interview, title: "Round 2", attendeeEmails: [], requestId: "req-B" });
  assert.equal(a.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.notEqual(a.conferenceData.createRequest.requestId, b.conferenceData.createRequest.requestId);
  assert.deepEqual(a.attendees, [{ email: "c@x.com" }, { email: "i@x.com" }]);
  assert.equal(a.start.timeZone, "Asia/Kolkata");
});

test("a Meet link is returned only when Google provides a video entry point", () => {
  assert.deepEqual(
    G.resolveConference({ id: "e1", conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }] } }),
    { status: "success", url: "https://meet.google.com/abc-defg-hij", eventId: "e1" },
  );
  assert.equal(G.resolveConference({ id: "e2", conferenceData: { createRequest: { status: { statusCode: "pending" } } } }).status, "pending");
  assert.equal(G.resolveConference({ id: "e3", conferenceData: { createRequest: { status: { statusCode: "failure" } } } }).status, "failure");
  assert.equal(G.resolveConference({ id: "e4", conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:+1" }] } }).url, "");
});

test("a revoked refresh token is reported as revoked, not as a generic failure", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response("{}", { status: 400 });
  try {
    await assert.rejects(G.refreshAccessToken({ refreshToken: "r", env }), (err) => err.revoked === true);
  } finally {
    global.fetch = original;
  }
});

test("calendar create uses conferenceDataVersion=1 and sends the body", async () => {
  const original = global.fetch;
  let seen;
  global.fetch = async (url, init) => {
    seen = { url: String(url), init };
    return new Response(JSON.stringify({ id: "evt_1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const event = await G.createEvent({ accessToken: "at", body: { summary: "x" } });
    assert.equal(event.id, "evt_1");
    assert.match(seen.url, /conferenceDataVersion=1/);
    assert.equal(seen.init.method, "POST");
    assert.equal(seen.init.headers.authorization, "Bearer at");
  } finally {
    global.fetch = original;
  }
});

test("a failed Calendar call throws a safe code without the response body", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response("secret-body-should-not-leak", { status: 403 });
  try {
    await assert.rejects(G.createEvent({ accessToken: "at", body: {} }), (err) => {
      assert.equal(err.message, "calendar_create_403");
      assert.ok(!err.message.includes("secret"));
      return true;
    });
  } finally {
    global.fetch = original;
  }
});
