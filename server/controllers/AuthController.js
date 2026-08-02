const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { Application } = require("../models/Application");
const { config } = require("../config/env");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const {
    getResumePath,
    removeStoredResume,
} = require("../utils/resumeStorage");
const {
    validateRegistration,
    validateLogin,
} = require("../validators/authValidator");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const buildUserResponse = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    profileImage: user.profileImage,
    resume: user.resume
        ? {
              originalName: user.resumeOriginalName,
              mimeType: user.resumeMimeType,
              size: user.resumeSize,
              uploadedAt: user.resumeUploadedAt,
          }
        : null,
});

const removeResumeIfUnreferenced = async (storedResume) => {
    if (!storedResume) {
        return;
    }

    const isReferencedByApplication = await Application.exists({
        "resumeSnapshot.storageKey": storedResume,
    });

    if (!isReferencedByApplication) {
        await removeStoredResume(storedResume);
    }
};

const createUser = async ({ name, email, password, role }) => {
    validateRegistration({ name, email, password });

    const normalizedEmail = normalizeEmail(email);
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
        throw new AppError("An account with this email already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    return User.create({
        name: String(name).trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role,
    });
};

exports.register = asyncHandler(async (req, res) => {
    validateRegistration(req.body);

    const user = await createUser({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: "candidate",
    });

    res.status(201).json({
        success: true,
        message: "Candidate account created successfully",
        user: buildUserResponse(user),
    });
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
        role: "recruiter",
    });

    res.status(201).json({
        success: true,
        message: "Recruiter account created successfully",
        user: buildUserResponse(user),
    });
});

exports.createRecruiter = asyncHandler(async (req, res) => {
    const user = await createUser({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: "recruiter",
    });

    res.status(201).json({
        success: true,
        message: "Recruiter account created successfully",
        user: buildUserResponse(user),
    });
});

exports.login = asyncHandler(async (req, res) => {
    validateLogin(req.body);

    const { email, password } = req.body;
    const user = await User.findOne({ email: normalizeEmail(email) }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new AppError("Invalid email or password", 401);
    }

    const token = jwt.sign(
        { id: user._id, role: user.role },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
    );

    res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        user: buildUserResponse(user),
    });
});

exports.uploadResume = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new AppError("Please upload a resume", 400);
    }

    const user = await User.findById(req.user.id);

    if (!user) {
        await removeStoredResume(req.file.filename);
        throw new AppError("User not found", 404);
    }

    const previousResume = user.resume;

    user.resume = req.file.filename;
    user.resumeOriginalName = req.file.originalname;
    user.resumeMimeType = req.file.mimetype;
    user.resumeSize = req.file.size;
    user.resumeUploadedAt = new Date();

    try {
        await user.save();
    } catch (error) {
        await removeStoredResume(req.file.filename);
        throw error;
    }

    await removeResumeIfUnreferenced(previousResume);

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

    user.resume = "";
    user.resumeOriginalName = "";
    user.resumeMimeType = "";
    user.resumeSize = 0;
    user.resumeUploadedAt = null;

    await user.save();
    await removeResumeIfUnreferenced(previousResume);

    res.status(200).json({
        success: true,
        message: "Resume deleted successfully",
    });
});

exports.downloadMyResume = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id);

    if (!user || !user.resume) {
        throw new AppError("Resume not found", 404);
    }

    const filePath = getResumePath(user.resume);

    try {
        await require("node:fs").promises.access(filePath);
    } catch {
        throw new AppError("Resume file is unavailable", 404);
    }

    res.download(filePath, user.resumeOriginalName, (error) => {
        if (error) {
            next(error);
        }
    });
});
