const bcrypt = require("bcryptjs");

const User = require("../models/User");
const { Application } = require("../models/Application");
const { roles } = require("../constants/enums");
const { config } = require("../config/env");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { generateJwtToken, buildUserResponse } = require("../utils/authHelper");
const { createToken, hashToken } = require("../utils/tokenHelper");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/emailService");
const resumeService = require("../services/resumeService");
const storageService = require("../services/storageService");
const {
    validateRegistration,
    validateLogin,
    validatePasswordChange,
    validateEmailToken,
    validateForgotPassword,
    validatePasswordReset,
} = require("../validators/authValidator");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const createEmailVerificationToken = async (user) => {
    const { token, hashedToken } = createToken();

    user.emailVerificationToken = hashedToken;
    user.emailVerificationTokenExpires = new Date(
        Date.now() + config.emailVerificationTokenExpiresIn
    );

    await user.save({ validateBeforeSave: false });
    return token;
};

const createResetPasswordToken = async (user) => {
    const { token, hashedToken } = createToken();

    user.resetPasswordToken = hashedToken;
    user.resetPasswordTokenExpires = new Date(
        Date.now() + config.passwordResetTokenExpiresIn
    );

    await user.save({ validateBeforeSave: false });
    return token;
};

const createUser = async ({ name, email, password, role = roles.candidate }) => {
    validateRegistration({ name, email, password });

    const normalizedEmail = normalizeEmail(email);
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
        throw new AppError("An account with this email already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    return User.create({
        name: String(name).trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role,
    });
};

const finalizeRegistration = async (user, successMessage, res) => {
    if (config.requireEmailVerification) {
        const verificationToken = await createEmailVerificationToken(user);
        await sendVerificationEmail({ email: user.email, token: verificationToken });
    } else {
        user.emailVerified = true;
        await user.save({ validateBeforeSave: false });
    }

    res.status(201).json({
        success: true,
        message: successMessage,
        user: buildUserResponse(user),
    });
};

exports.register = asyncHandler(async (req, res) => {
    validateRegistration(req.body);

    const user = await createUser({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: roles.candidate,
    });

    await finalizeRegistration(user, "Candidate account created successfully", res);
});

exports.registerRecruiter = asyncHandler(async (req, res) => {
    if (config.recruiterInviteCode) {
        const { inviteCode } = req.body;

        if (!inviteCode || inviteCode !== config.recruiterInviteCode) {
            throw new AppError("Invalid recruiter invite code", 403);
        }
    }

    validateRegistration(req.body);

    const user = await createUser({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: roles.recruiter,
    });

    await finalizeRegistration(user, "Recruiter account created successfully", res);
});

exports.createRecruiter = asyncHandler(async (req, res) => {
    const user = await createUser({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: roles.recruiter,
    });

    await finalizeRegistration(user, "Recruiter account created successfully", res);
});

exports.login = asyncHandler(async (req, res) => {
    validateLogin(req.body);

    const { email, password } = req.body;
    const user = await User.findOne({ email: normalizeEmail(email) }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new AppError("Invalid email or password", 401);
    }

    if (config.requireEmailVerification && !user.emailVerified) {
        throw new AppError("Please verify your email before logging in", 403);
    }

    const token = generateJwtToken({ id: user._id, role: user.role });

    res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        user: buildUserResponse(user),
    });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
    validateEmailToken(req.body);

    const hashedToken = hashToken(req.body.token);
    const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
        throw new AppError("Verification token is invalid or has expired", 400);
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
        success: true,
        message: "Email verified successfully",
    });
});

exports.resendVerificationEmail = asyncHandler(async (req, res) => {
    validateForgotPassword(req.body);

    const user = await User.findOne({ email: normalizeEmail(req.body.email) });

    if (!user) {
        return res.status(200).json({
            success: true,
            message: "Verification email sent when the account exists",
        });
    }

    if (user.emailVerified) {
        return res.status(200).json({
            success: true,
            message: "Email already verified",
        });
    }

    const verificationToken = await createEmailVerificationToken(user);
    await sendVerificationEmail({ email: user.email, token: verificationToken });

    res.status(200).json({
        success: true,
        message: "Verification email sent",
    });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
    validateForgotPassword(req.body);

    const user = await User.findOne({ email: normalizeEmail(req.body.email) });

    if (user) {
        const resetToken = await createResetPasswordToken(user);
        await sendPasswordResetEmail({ email: user.email, token: resetToken });
    }

    res.status(200).json({
        success: true,
        message: "If the email is registered, a password reset link has been sent",
    });
});

exports.resetPassword = asyncHandler(async (req, res) => {
    validatePasswordReset(req.body);

    const hashedToken = hashToken(req.body.token);
    const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordTokenExpires: { $gt: Date.now() },
    }).select("+password");

    if (!user) {
        throw new AppError("Reset token is invalid or has expired", 400);
    }

    user.password = await bcrypt.hash(req.body.password, 12);
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpires = undefined;
    user.emailVerified = true;
    user.passwordChangedAt = new Date();
    await user.save();

    res.status(200).json({
        success: true,
        message: "Password reset successfully",
    });
});

exports.uploadResume = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new AppError("Please upload a resume", 400);
    }

    const user = await User.findById(req.user.id);

    if (!user) {
        throw new AppError("User not found", 404);
    }

    const previousResume = user.resume;
    const previousProvider = user.resumeProvider || "local";

    const fileMetadata = await resumeService.uploadResume(req.file);

    user.resume = fileMetadata.storageKey;
    user.resumeProvider = fileMetadata.provider;
    user.resumeOriginalName = fileMetadata.originalName;
    user.resumeMimeType = fileMetadata.mimeType;
    user.resumeSize = fileMetadata.size;
    user.resumeUploadedAt = fileMetadata.uploadedAt;
    user.resumeText = fileMetadata.text;
    user.resumeSummary = fileMetadata.summary;

    try {
        await user.save();
    } catch (error) {
        await resumeService.deleteFile(fileMetadata.storageKey, fileMetadata.provider);
        throw error;
    }

    if (previousResume) {
        const wasUnreferenced = await Application.exists({
            "resumeSnapshot.storageKey": previousResume,
        });

        if (!wasUnreferenced) {
            await resumeService.deleteFile(previousResume, previousProvider);
        }
    }

    res.status(200).json({
        success: true,
        message: "Resume uploaded successfully",
        resume: buildUserResponse(user).resume,
    });
});

exports.deleteResume = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user || !user.resume) {
        throw new AppError("Resume not found", 404);
    }

    const previousResume = user.resume;
    const previousProvider = user.resumeProvider || "local";

    user.resume = "";
    user.resumeProvider = "local";
    user.resumeOriginalName = "";
    user.resumeMimeType = "";
    user.resumeSize = 0;
    user.resumeUploadedAt = null;
    user.resumeText = "";
    user.resumeSummary = "";

    await user.save();
    const referencedByApplication = await Application.exists({ "resumeSnapshot.storageKey": previousResume });
    if (!referencedByApplication) {
        await resumeService.deleteFile(previousResume, previousProvider);
    }

    res.status(200).json({
        success: true,
        message: "Resume deleted successfully",
    });
});

exports.changePassword = asyncHandler(async (req, res) => {
    validatePasswordChange(req.body);

    const user = await User.findById(req.user.id).select("+password");

    if (!user) {
        throw new AppError("User not found", 404);
    }

    const isCurrentPasswordValid = await bcrypt.compare(req.body.currentPassword, user.password);

    if (!isCurrentPasswordValid) {
        throw new AppError("Current password is incorrect", 401);
    }

    user.password = await bcrypt.hash(req.body.newPassword, 12);
    user.passwordChangedAt = new Date();
    user.tokenInvalidBefore = new Date(Date.now() - 1000);
    await user.save();

    res.status(200).json({
        success: true,
        message: "Password changed successfully",
    });
});

exports.downloadMyResume = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id);

    if (!user || !user.resume) {
        throw new AppError("Resume not found", 404);
    }

    const provider = user.resumeProvider || "local";
    let fileStream;

    try {
        fileStream = await storageService.getFileStream(user.resume, provider);
    } catch (_error) {
        throw new AppError("Resume file is unavailable", 404);
    }

    res.setHeader("Content-Type", user.resumeMimeType || "application/octet-stream");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(user.resumeOriginalName || "resume")}`
    );

    fileStream.on("error", next);
    fileStream.pipe(res);
});
