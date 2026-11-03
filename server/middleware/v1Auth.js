const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { Membership } = require("../models/Membership");
const AppError = require("../utils/AppError");
const { config } = require("../config/env");

const authenticate = async (req, res, next) => {
  try {
    const header = req.get("authorization") || "";
    if (!header.startsWith("Bearer "))
      throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
    const decoded = jwt.verify(header.slice(7), config.jwtSecret, {
      issuer: "hiresmart-api",
      audience: "hiresmart-web",
    });
    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive || ["suspended", "deleted"].includes(user.accountStatus))
      throw new AppError("Session is no longer valid", 401, "SESSION_INVALID");
    if (user.tokenInvalidBefore && decoded.iat * 1000 < user.tokenInvalidBefore.getTime())
      throw new AppError("Session is no longer valid", 401, "SESSION_REVOKED");
    req.user = user;
    req.auth = {
      userId: String(user._id),
      sessionId: decoded.sid || null,
      platformRole: user.role === "admin" ? "platform_admin" : null,
    };
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError("Invalid or expired access token", 401, "SESSION_INVALID"));
  }
};

/** Attaches the user when a valid token is present, never rejects — for public endpoints that behave better signed in (personalized search, history). */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const header = req.get("authorization") || "";
    if (header.startsWith("Bearer ")) {
      const decoded = jwt.verify(header.slice(7), config.jwtSecret, {
        issuer: "hiresmart-api",
        audience: "hiresmart-web",
      });
      const user = await User.findById(decoded.sub);
      if (
        user &&
        user.isActive &&
        !["suspended", "deleted"].includes(user.accountStatus) &&
        !(user.tokenInvalidBefore && decoded.iat * 1000 < user.tokenInvalidBefore.getTime())
      ) {
        req.user = user;
        req.auth = {
          userId: String(user._id),
          sessionId: decoded.sid || null,
          platformRole: user.role === "admin" ? "platform_admin" : null,
        };
      }
    }
  } catch {
    /* anonymous request */
  }
  next();
};

const requireOrganization = (permission) => async (req, res, next) => {
  const organizationId =
    req.params.organizationId || req.params.orgId || req.get("x-organization-id");
  if (!organizationId)
    return next(new AppError("Organization context is required", 400, "ORGANIZATION_REQUIRED"));
  if (req.auth.platformRole === "platform_admin") {
    req.auth.organizationId = organizationId;
    return next();
  }
  const membership = await Membership.findOne({
    organization: organizationId,
    user: req.user._id,
    status: "active",
  });
  if (!membership || (permission && !membership.hasPermission(permission)))
    return next(new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND"));
  req.membership = membership;
  req.auth.organizationId = String(membership.organization);
  next();
};

/**
 * For routes shared by candidates and organization members. Candidates and platform admins
 * pass through (the controller applies record-level scoping); every other user must supply
 * an organization context whose active membership carries `permission`.
 */
const requireOrganizationForNonCandidate = (permission) => (req, res, next) => {
  if (req.user?.role === "candidate" || req.auth?.platformRole === "platform_admin") {
    return next();
  }
  return requireOrganization(permission)(req, res, next);
};

/** Returns the active membership for (user, organization) with `permission`, or null. */
const findActiveMembership = async (userId, organizationId, permission) => {
  if (!organizationId) return null;
  const membership = await Membership.findOne({
    organization: organizationId,
    user: userId,
    status: "active",
  });
  if (!membership) return null;
  if (permission && !membership.hasPermission(permission)) return null;
  return membership;
};

const requireAccountRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role))
      return next(new AppError("You are not permitted to perform this action", 403, "FORBIDDEN"));
    next();
  };
module.exports = {
  authenticate,
  optionalAuthenticate,
  requireOrganization,
  requireOrganizationForNonCandidate,
  findActiveMembership,
  requireAccountRole,
};
