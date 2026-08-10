const asyncHandler = require("../middleware/asyncHandler");

const candidateProfileService = require("../services/candidateProfileService");

const {
    validateCandidateProfilePayload,
} = require("../validators/candidateProfileValidator");

exports.createProfile = asyncHandler(async (req, res) => {
    const profileData = validateCandidateProfilePayload(req.body);

    const profile = await candidateProfileService.createProfile(
        req.user._id,
        profileData
    );

    res.status(201).json({
        success: true,
        message: "Candidate profile created successfully",
        data: profile,
    });
});

exports.getProfile = asyncHandler(async (req, res) => {
    const profile = await candidateProfileService.getProfileByUserId(
        req.user._id
    );

    res.status(200).json({
        success: true,
        message: profile
            ? "Candidate profile fetched successfully"
            : "Candidate profile not created yet",
        data: profile || null,
    });
});

exports.updateProfile = asyncHandler(async (req, res) => {
    const profileData = validateCandidateProfilePayload(
        req.body,
        { partial: true }
    );

    const profile = await candidateProfileService.updateProfile(
        req.user._id,
        profileData
    );

    res.status(200).json({
        success: true,
        message: "Candidate profile updated successfully",
        data: profile,
    });
});

exports.deleteProfile = asyncHandler(async (req, res) => {
    const result = await candidateProfileService.deleteProfile(
        req.user._id
    );

    res.status(200).json({
        success: true,
        ...result,
    });
});