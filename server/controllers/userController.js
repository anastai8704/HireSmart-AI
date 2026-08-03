const Job = require("../models/Job");
const User = require("../models/User");
const { Application, applicationStatuses } = require("../models/Application");
const { roles } = require("../constants/enums");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { validateProfileUpdate } = require("../validators/userValidator");

const editableProfileFields = [
    "name",
    "phone",
    "profileImage",
    "headline",
    "location",
    "bio",
    "skills",
    "companyName",
    "companyWebsite",
    "companyDescription",
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeSkills = (skills) => {
    const values = Array.isArray(skills) ? skills : String(skills || "").split(",");
    const normalized = [
        ...new Set(values.map((skill) => String(skill).trim()).filter(Boolean)),
    ];

    if (normalized.length > 50) {
        throw new AppError("A profile can contain at most 50 skills", 400);
    }

    return normalized;
};

const profileResponse = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    phone: user.phone,
    profileImage: user.profileImage,
    headline: user.headline,
    location: user.location,
    bio: user.bio,
    skills: user.skills,
    companyName: user.companyName,
    companyWebsite: user.companyWebsite,
    companyDescription: user.companyDescription,
    resume: user.resume
        ? {
              originalName: user.resumeOriginalName,
              mimeType: user.resumeMimeType,
              size: user.resumeSize,
              uploadedAt: user.resumeUploadedAt,
          }
        : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
});

exports.getProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        throw new AppError("User not found", 404);
    }

    res.status(200).json({ success: true, user: profileResponse(user) });
});

exports.updateProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        throw new AppError("User not found", 404);
    }

    const updates = validateProfileUpdate(req.body);

    if (updates.skills !== undefined) {
        updates.skills = normalizeSkills(req.body.skills);
    }

    for (const field of ["profileImage", "name"]) {
        if (updates[field] === undefined) {
            continue;
        }

        if (field === "name" && updates.name.length < 2) {
            throw new AppError("Name must contain at least 2 characters", 400);
        }

        if (field === "profileImage" && updates.profileImage && !/^https:\/\//i.test(updates.profileImage)) {
            throw new AppError("profileImage must be an HTTPS URL", 400);
        }
    }

    if (req.body.companyName !== undefined || req.body.companyWebsite !== undefined || req.body.companyDescription !== undefined) {
        if (user.role === "candidate") {
            throw new AppError("Only recruiters can update company details", 403);
        }
    }

    if (Object.keys(updates).length === 0) {
        throw new AppError("No editable profile fields were provided", 400);
    }

    Object.assign(user, updates);
    await user.save();

    res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user: profileResponse(user),
    });
});

exports.adminDashboard = asyncHandler(async (req, res) => {
    const [users, jobs, applicationCounts] = await Promise.all([
        User.aggregate([
            { $group: { _id: "$role", total: { $sum: 1 }, active: { $sum: { $cond: ["$isActive", 1, 0] } } } },
        ]),
        Job.aggregate([{ $group: { _id: "$status", total: { $sum: 1 } } }]),
        Application.aggregate([{ $group: { _id: "$status", total: { $sum: 1 } } }]),
    ]);
    const userCounts = Object.fromEntries(users.map((entry) => [entry._id, entry]));
    const jobCounts = Object.fromEntries(jobs.map((entry) => [entry._id, entry.total]));
    const applicationStatusCounts = Object.fromEntries(
        applicationCounts.map((entry) => [entry._id, entry.total])
    );

    res.status(200).json({
        success: true,
        dashboard: {
            users: {
                total: users.reduce((total, entry) => total + entry.total, 0),
                active: users.reduce((total, entry) => total + entry.active, 0),
                candidates: userCounts.candidate?.total || 0,
                recruiters: userCounts.recruiter?.total || 0,
                admins: userCounts.admin?.total || 0,
            },
            jobs: {
                total: jobs.reduce((total, entry) => total + entry.total, 0),
                draft: jobCounts.draft || 0,
                published: jobCounts.published || 0,
                closed: jobCounts.closed || 0,
            },
            applications: Object.fromEntries(
                applicationStatuses.map((status) => [status, applicationStatusCounts[status] || 0])
            ),
        },
    });
});

exports.listUsers = asyncHandler(async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);

    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError("page and limit must be positive integers; limit may not exceed 100", 400);
    }

    const filter = {};

    if (req.query.role) {
        if (!Object.values(roles).includes(req.query.role)) {
            throw new AppError("Invalid user role", 400);
        }

        filter.role = req.query.role;
    }

    if (req.query.search) {
        const search = String(req.query.search).trim();

        if (search.length > 100) {
            throw new AppError("search must not exceed 100 characters", 400);
        }

        const expression = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ name: expression }, { email: expression }];
    }

    const [total, users] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter)
            .select("name email role isActive phone headline location companyName createdAt updatedAt")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
    ]);

    res.status(200).json({
        success: true,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        users,
    });
});

exports.updateUserAccountStatus = asyncHandler(async (req, res) => {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
        throw new AppError("isActive must be a boolean", 400);
    }

    if (req.params.id === req.user.id) {
        throw new AppError("You cannot change your own account status", 400);
    }

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive },
        { new: true, runValidators: true }
    ).select("name email role isActive");

    if (!user) {
        throw new AppError("User not found", 404);
    }

    res.status(200).json({
        success: true,
        message: `User account ${isActive ? "activated" : "deactivated"}`,
        user,
    });
});

exports.recruiterDashboard = (req, res) => {
    res.status(200).json({
        success: true,
        message: "Use /api/jobs/dashboard for recruiter metrics",
    });
};

exports.candidateDashboard = (req, res) => {
    res.status(200).json({
        success: true,
        message: "Use /api/jobs/candidate-dashboard for candidate metrics",
    });
};
