const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const AuthSession = require("../models/AuthSession");
const { config } = require("../config/env");
const AppError = require("../utils/AppError");
const { hashIp, security } = require("./auditService");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const accessToken = (user, session) =>
  jwt.sign({ role: user.role, sid: String(session._id) }, config.jwtSecret, {
    subject: String(user._id),
    issuer: "hiresmart-api",
    audience: "hiresmart-web",
    expiresIn: config.accessTokenExpiresIn,
  });
const createSession = async (user, req) => {
  const token = crypto.randomBytes(48).toString("base64url");
  const csrfToken = crypto.randomBytes(24).toString("base64url");
  const session = await AuthSession.create({
    user: user._id,
    tokenHash: hash(token),
    csrfHash: hash(csrfToken),
    familyId: crypto.randomUUID(),
    userAgent: req.get("user-agent") || "",
    ipHash: hashIp(req.ip),
    expiresAt: new Date(Date.now() + config.refreshTokenExpiresDays * 86400000),
  });
  return { session, refreshToken: token, csrfToken, accessToken: accessToken(user, session) };
};
const rotateSession = async (rawToken, req) => {
  if (!rawToken) throw new AppError("Refresh token is required", 401, "REFRESH_REQUIRED");
  const presentedHash = hash(rawToken);
  const session = await AuthSession.findOne({
    $or: [{ tokenHash: presentedHash }, { previousTokenHash: presentedHash }],
  }).select("+tokenHash +previousTokenHash +csrfHash");
  if (session?.previousTokenHash === presentedHash) {
    await AuthSession.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { revokedAt: new Date(), revokeReason: "refresh_token_reuse" },
    );
    await security({
      req,
      user: session.user,
      type: "session.refresh_token_reuse",
      severity: "high",
      details: { familyId: session.familyId },
    });
    throw new AppError(
      "Refresh token reuse detected; session family revoked",
      401,
      "SESSION_REUSE_DETECTED",
    );
  }
  const csrfHeader = req.get("x-csrf-token");
  const csrfCookie = req.cookies?.hiresmart_csrf;
  if (
    !csrfHeader ||
    !csrfCookie ||
    csrfHeader !== csrfCookie ||
    !session ||
    hash(csrfHeader) !== session.csrfHash
  )
    throw new AppError("CSRF validation failed", 403, "CSRF_INVALID");
  if (!session || session.revokedAt || session.expiresAt <= new Date())
    throw new AppError("Refresh session is invalid", 401, "SESSION_INVALID");
  const User = require("../models/User");
  const user = await User.findById(session.user);
  if (!user || !user.isActive)
    throw new AppError("Refresh session is invalid", 401, "SESSION_INVALID");
  const next = crypto.randomBytes(48).toString("base64url");
  const nextCsrf = crypto.randomBytes(24).toString("base64url");
  session.previousTokenHash = session.tokenHash;
  session.tokenHash = hash(next);
  session.csrfHash = hash(nextCsrf);
  session.lastUsedAt = new Date();
  session.userAgent = req.get("user-agent") || session.userAgent;
  session.ipHash = hashIp(req.ip);
  await session.save();
  return {
    session,
    user,
    refreshToken: next,
    csrfToken: nextCsrf,
    accessToken: accessToken(user, session),
  };
};
const revoke = async (query, reason) =>
  AuthSession.updateMany(
    { ...query, revokedAt: null },
    { revokedAt: new Date(), revokeReason: reason },
  );
const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: config.cookieSameSite,
  path: "/api/v1/auth",
  maxAge: config.refreshTokenExpiresDays * 86400000,
});
module.exports = { createSession, rotateSession, revoke, cookieOptions };
