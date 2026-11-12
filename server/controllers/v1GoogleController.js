// Google Calendar connection for recruiters (OAuth 2.0). The browser never sees the client secret, the refresh token
// or the access token. The callback is protected by a signed, expiring state that names the user who started it.
const GoogleConnection = require("../models/GoogleCalendarConnection");
const Google = require("../services/googleCalendarService");
const { encryptSecret, decryptSecret } = require("../services/tokenCrypto");
const { audit } = require("../services/auditService");
const { config } = require("../config/env");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");

const SETTINGS_PATH = "/app/settings/integrations";

exports.status = asyncHandler(async (req, res) => {
  const env = Google.readGoogleEnv();
  const configured = Google.isGoogleConfigured(env);
  const conn = await GoogleConnection.findOne({ user: req.user._id }).select("status connectedAt lastErrorCode").lean();
  const connected = Boolean(conn && conn.status === "connected");
  res.json({
    data: {
      configured,
      status: !configured ? "setup_required" : connected ? "connected" : conn ? "reconnect_required" : "not_connected",
      connected,
      connectedAt: conn?.connectedAt || null,
      lastErrorCode: conn?.lastErrorCode || "",
    },
  });
});

exports.connect = asyncHandler(async (req, res) => {
  const env = Google.readGoogleEnv();
  if (!Google.isGoogleConfigured(env)) {
    throw new AppError(
      "Google Calendar is not configured on this server. An administrator must set the GOOGLE_OAUTH_* variables.",
      503,
      "GOOGLE_NOT_CONFIGURED",
    );
  }
  const state = Google.signOAuthState({ userId: req.user._id, env });
  res.json({ data: { url: Google.buildAuthUrl({ state, env }) } });
});

exports.callback = asyncHandler(async (req, res) => {
  const back = (outcome) => res.redirect(`${config.clientUrl}${SETTINGS_PATH}?google=${outcome}`);
  if (req.query.error) return back("denied");
  const env = Google.readGoogleEnv();
  if (!Google.isGoogleConfigured(env)) return back("not_configured");
  const verified = Google.verifyOAuthState({ state: String(req.query.state || ""), env });
  if (!verified) return back("invalid_state");
  if (!req.query.code) return back("error");

  let tokens;
  try {
    tokens = await Google.exchangeCode({ code: String(req.query.code), env });
  } catch {
    return back("error");
  }
  await GoogleConnection.updateOne(
    { user: verified.userId },
    {
      $set: {
        encryptedRefreshToken: encryptSecret(tokens.refreshToken, env.encryptionKey),
        scope: tokens.scope,
        status: "connected",
        connectedAt: new Date(),
        lastErrorCode: "",
      },
    },
    { upsert: true },
  );
  await audit({
    action: "integration.google_connected",
    resourceType: "user",
    resourceId: verified.userId,
    metadata: { scope: Google.SCOPE },
  });
  return back("connected");
});

exports.disconnect = asyncHandler(async (req, res) => {
  const env = Google.readGoogleEnv();
  const conn = await GoogleConnection.findOne({ user: req.user._id }).select("+encryptedRefreshToken");
  if (conn) {
    if (conn.status === "connected" && Google.isGoogleConfigured(env)) {
      try {
        await Google.revokeToken(decryptSecret(conn.encryptedRefreshToken, env.encryptionKey));
      } catch {
        // Revocation is best effort. The local connection is removed either way.
      }
    }
    await GoogleConnection.deleteOne({ _id: conn._id });
    await audit({
      req,
      action: "integration.google_disconnected",
      resourceType: "user",
      resourceId: req.user._id,
      metadata: {},
    });
  }
  res.json({ data: { connected: false } });
});
