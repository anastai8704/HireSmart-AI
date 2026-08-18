const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AuthSession = require("../models/AuthSession");
const Organization = require("../models/Organization");
const { Membership } = require("../models/Membership");
const Consent = require("../models/Consent");
const { config } = require("../config/env");
const AppError = require("../utils/AppError");
const asyncHandler = require("../middleware/asyncHandler");
const { createToken, hashToken } = require("../utils/tokenHelper");
const { createSession, rotateSession, revoke, cookieOptions } = require("../services/sessionService");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/emailService");
const { audit, security } = require("../services/auditService");

const dto = (user) => ({ id: user._id, email: user.email, displayName: user.name, emailVerified: user.emailVerified, status: user.accountStatus, onboardingCompleted: user.onboardingCompleted });
const slugify = (value) => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
const uniqueSlug = async (name) => {
    const base = slugify(name) || "organization";
    let slug = base;
    for (let count = 1; await Organization.exists({ slug }); count += 1) slug = `${base}-${count}`;
    return slug;
};
const issueVerification = async (user) => {
    const { token, hashedToken } = createToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationTokenExpires = new Date(Date.now() + config.emailVerificationTokenExpiresIn);
    await user.save({ validateBeforeSave: false });
    await sendVerificationEmail({ email: user.email, token });
};

exports.register = asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase();
    if (await User.exists({ email })) throw new AppError("An account with this email already exists", 409, "EMAIL_IN_USE");
    if (req.body.accountIntent === "recruiter" && !req.body.organizationName) throw new AppError("organizationName is required for recruiters", 422, "ORGANIZATION_REQUIRED");
    let user; let organization = null;
    try {
        user = await User.create({ name: req.body.displayName, email, password: await bcrypt.hash(req.body.password, 12), role: req.body.accountIntent === "recruiter" ? "recruiter" : "candidate", accountStatus: config.requireEmailVerification ? "pending_verification" : "active", emailVerified: !config.requireEmailVerification });
        if (req.body.accountIntent === "recruiter") {
            organization = await Organization.create({ name: req.body.organizationName, slug: await uniqueSlug(req.body.organizationName), industry: req.body.industry || "" });
            await Membership.create({ organization: organization._id, user: user._id, role: "owner", status: "active" });
        }
        await Consent.create({ user: user._id, purpose: "terms", policyVersion: req.body.termsPolicyVersion || "2026-08", source: "registration" });
        await Consent.create({ user: user._id, purpose: "privacy", policyVersion: req.body.privacyPolicyVersion || "2026-08", source: "registration" });
        if (req.body.aiProcessingConsent) await Consent.create({ user: user._id, purpose: "ai_processing", policyVersion: "2026-08", source: "registration" });
    } catch (error) {
        if (organization) { await Membership.deleteMany({ organization: organization._id }); await Organization.deleteOne({ _id: organization._id }); }
        if (user) { await Consent.deleteMany({ user: user._id }); await User.deleteOne({ _id: user._id }); }
        throw error;
    }
    if (config.requireEmailVerification) await issueVerification(user);
    await audit({ req, action: "user.registered", resourceType: "user", resourceId: user._id, metadata: { accountIntent: req.body.accountIntent } });
    res.status(201).json({ data: { user: dto(user), organization: organization && { id: organization._id, name: organization.name, slug: organization.slug }, verificationRequired: config.requireEmailVerification } });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
    const user = await User.findOne({ emailVerificationToken: hashToken(req.body.token), emailVerificationTokenExpires: { $gt: new Date() } });
    if (!user) throw new AppError("Verification token is invalid or expired", 400, "TOKEN_INVALID");
    user.emailVerified = true; user.accountStatus = "active"; user.emailVerificationToken = undefined; user.emailVerificationTokenExpires = undefined;
    await user.save({ validateBeforeSave: false });
    await audit({ req, action: "user.email_verified", resourceType: "user", resourceId: user._id });
    res.json({ data: { verified: true } });
});
exports.resendVerification = asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (user && !user.emailVerified) { try { await issueVerification(user); } catch (error) { await security({ req, user: user._id, type: "email.verification_delivery_failed", severity: "low", details: { providerError: error.code || error.name } }); } }
    res.status(202).json({ data: { accepted: true } });
});
exports.login = asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() }).select("+password");
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
        await security({ req, user: user?._id, type: "login.failed", severity: "medium" });
        throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }
    if (config.requireEmailVerification && !user.emailVerified) throw new AppError("Email verification is required", 403, "EMAIL_NOT_VERIFIED");
    if (!user.isActive || ["suspended", "deleted"].includes(user.accountStatus)) throw new AppError("Account is unavailable", 403, "ACCOUNT_UNAVAILABLE");
    if (user.accountStatus === "pending_verification") user.accountStatus = "active";
    const issued = await createSession(user, req);
    res.cookie(config.refreshCookieName, issued.refreshToken, cookieOptions());
    res.cookie("hiresmart_csrf", issued.csrfToken, { ...cookieOptions(), httpOnly: false, path: "/" });
    await audit({ req, action: "session.created", resourceType: "session", resourceId: issued.session._id });
    res.json({ data: { accessToken: issued.accessToken, expiresIn: config.accessTokenExpiresIn, user: dto(user) } });
});
exports.refresh = asyncHandler(async (req, res) => {
    const issued = await rotateSession(req.cookies?.[config.refreshCookieName], req);
    res.cookie(config.refreshCookieName, issued.refreshToken, cookieOptions());
    res.cookie("hiresmart_csrf", issued.csrfToken, { ...cookieOptions(), httpOnly: false, path: "/" });
    res.json({ data: { accessToken: issued.accessToken, expiresIn: config.accessTokenExpiresIn, user: dto(issued.user) } });
});
exports.logout = asyncHandler(async (req, res) => {
    if (req.auth.sessionId) await revoke({ _id: req.auth.sessionId, user: req.user._id }, "logout");
    res.clearCookie(config.refreshCookieName, cookieOptions());
    res.clearCookie("hiresmart_csrf", { ...cookieOptions(), httpOnly: false, path: "/" });
    res.status(204).end();
});
exports.sessions = asyncHandler(async (req, res) => {
    const sessions = await AuthSession.find({ user: req.user._id, revokedAt: null }).select("userAgent lastUsedAt expiresAt createdAt").sort({ lastUsedAt: -1 });
    res.json({ data: sessions.map((item) => ({ id: item._id, userAgent: item.userAgent, lastUsedAt: item.lastUsedAt, expiresAt: item.expiresAt, current: String(item._id) === req.auth.sessionId })) });
});
exports.revokeSession = asyncHandler(async (req, res) => { await revoke({ _id: req.params.sessionId, user: req.user._id }, "user_revoked"); res.status(204).end(); });
exports.forgotPassword = asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (user) { const created = createToken(); user.resetPasswordToken = created.hashedToken; user.resetPasswordTokenExpires = new Date(Date.now() + config.passwordResetTokenExpiresIn); await user.save({ validateBeforeSave: false }); try { await sendPasswordResetEmail({ email: user.email, token: created.token }); } catch (error) { await security({ req, user: user._id, type: "email.password_reset_delivery_failed", severity: "low", details: { providerError: error.code || error.name } }); } }
    res.status(202).json({ data: { accepted: true } });
});
exports.resetPassword = asyncHandler(async (req, res) => {
    const user = await User.findOne({ resetPasswordToken: hashToken(req.body.token), resetPasswordTokenExpires: { $gt: new Date() } });
    if (!user) throw new AppError("Reset token is invalid or expired", 400, "TOKEN_INVALID");
    user.password = await bcrypt.hash(req.body.newPassword, 12); user.passwordChangedAt = new Date(); user.tokenInvalidBefore = new Date(); user.resetPasswordToken = undefined; user.resetPasswordTokenExpires = undefined;
    await user.save(); await revoke({ user: user._id }, "password_reset");
    await security({ req, user: user._id, type: "password.reset", severity: "info" });
    res.json({ data: { reset: true } });
});
exports.changePassword = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("+password");
    if (!(await bcrypt.compare(req.body.currentPassword, user.password))) throw new AppError("Current password is incorrect", 422, "CURRENT_PASSWORD_INVALID");
    user.password = await bcrypt.hash(req.body.newPassword, 12); user.passwordChangedAt = new Date(); user.tokenInvalidBefore = new Date(Date.now() - 1000); await user.save();
    await revoke({ user: user._id, _id: { $ne: req.auth.sessionId } }, "password_changed");
    res.json({ data: { changed: true } });
});
