const asyncHandler = require("../middleware/asyncHandler");

const candidateProfileService = require("../services/candidateProfileService");

const {
    validateCandidateProfilePayload,
} = require("../validators/candidateProfileValidator");


// ==========================================
// CREATE PROFILE
// ==========================================

exports.createProfile = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload(req.body);

    const profile =
        await candidateProfileService.createProfile(
            req.user._id,
            profileData
        );

    res.status(201).json({
        success: true,
        message: "Candidate profile created successfully",
        data: profile,
    });
});


// ==========================================
// GET PROFILE
// ==========================================

exports.getProfile = asyncHandler(async (req, res) => {
    const profile =
        await candidateProfileService.getProfileByUserId(
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


// ==========================================
// UPDATE PROFILE
// ==========================================

exports.updateProfile = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload(
            req.body,
            { partial: true }
        );

    const profile =
        await candidateProfileService.updateProfile(
            req.user._id,
            profileData
        );

    res.status(200).json({
        success: true,
        message: "Candidate profile updated successfully",
        data: profile,
    });
});


// ==========================================
// DELETE PROFILE
// ==========================================

exports.deleteProfile = asyncHandler(async (req, res) => {
    const result =
        await candidateProfileService.deleteProfile(
            req.user._id
        );

    res.status(200).json({
        success: true,
        ...result,
    });
});


// ==========================================
// ADD EDUCATION
// ==========================================

exports.addEducation = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload({
            education: [req.body],
        });

    const education = profileData.education[0];

    const profile =
        await candidateProfileService.addEducation(
            req.user._id,
            education
        );

    res.status(201).json({
        success: true,
        message: "Education added successfully",
        data: profile,
    });
});


// ==========================================
// UPDATE EDUCATION
// ==========================================

exports.updateEducation = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload({
            education: [req.body],
        });

    const education = profileData.education[0];

    const profile =
        await candidateProfileService.updateEducation(
            req.user._id,
            req.params.educationId,
            education
        );

    res.status(200).json({
        success: true,
        message: "Education updated successfully",
        data: profile,
    });
});


// ==========================================
// DELETE EDUCATION
// ==========================================

exports.deleteEducation = asyncHandler(async (req, res) => {
    const profile =
        await candidateProfileService.deleteEducation(
            req.user._id,
            req.params.educationId
        );

    res.status(200).json({
        success: true,
        message: "Education deleted successfully",
        data: profile,
    });
});


// ==========================================
// ADD EXPERIENCE
// ==========================================

exports.addExperience = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload({
            experience: [req.body],
        });

    const experience = profileData.experience[0];

    const profile =
        await candidateProfileService.addExperience(
            req.user._id,
            experience
        );

    res.status(201).json({
        success: true,
        message: "Experience added successfully",
        data: profile,
    });
});


// ==========================================
// UPDATE EXPERIENCE
// ==========================================

exports.updateExperience = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload({
            experience: [req.body],
        });

    const experience = profileData.experience[0];

    const profile =
        await candidateProfileService.updateExperience(
            req.user._id,
            req.params.experienceId,
            experience
        );

    res.status(200).json({
        success: true,
        message: "Experience updated successfully",
        data: profile,
    });
});


// ==========================================
// DELETE EXPERIENCE
// ==========================================

exports.deleteExperience = asyncHandler(async (req, res) => {
    const profile =
        await candidateProfileService.deleteExperience(
            req.user._id,
            req.params.experienceId
        );

    res.status(200).json({
        success: true,
        message: "Experience deleted successfully",
        data: profile,
    });
});

// ==========================================
// ADD PROJECT
// ==========================================

exports.addProject = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload({
            projects: [req.body],
        });

    const project = profileData.projects[0];

    const profile =
        await candidateProfileService.addProject(
            req.user._id,
            project
        );

    res.status(201).json({
        success: true,
        message: "Project added successfully",
        data: profile,
    });
});


// ==========================================
// UPDATE PROJECT
// ==========================================

exports.updateProject = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload({
            projects: [req.body],
        });

    const project = profileData.projects[0];

    const profile =
        await candidateProfileService.updateProject(
            req.user._id,
            req.params.projectId,
            project
        );

    res.status(200).json({
        success: true,
        message: "Project updated successfully",
        data: profile,
    });
});


// ==========================================
// DELETE PROJECT
// ==========================================

exports.deleteProject = asyncHandler(async (req, res) => {
    const profile =
        await candidateProfileService.deleteProject(
            req.user._id,
            req.params.projectId
        );

    res.status(200).json({
        success: true,
        message: "Project deleted successfully",
        data: profile,
    });
});

// ==========================================
// ADD CERTIFICATION
// ==========================================

exports.addCertification = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload({
            certifications: [req.body],
        });

    const certification =
        profileData.certifications[0];

    const profile =
        await candidateProfileService.addCertification(
            req.user._id,
            certification
        );

    res.status(201).json({
        success: true,
        message: "Certification added successfully",
        data: profile,
    });
});


// ==========================================
// UPDATE CERTIFICATION
// ==========================================

exports.updateCertification = asyncHandler(async (req, res) => {
    const profileData =
        validateCandidateProfilePayload({
            certifications: [req.body],
        });

    const certification =
        profileData.certifications[0];

    const profile =
        await candidateProfileService.updateCertification(
            req.user._id,
            req.params.certificationId,
            certification
        );

    res.status(200).json({
        success: true,
        message: "Certification updated successfully",
        data: profile,
    });
});


// ==========================================
// DELETE CERTIFICATION
// ==========================================

exports.deleteCertification = asyncHandler(async (req, res) => {
    const profile =
        await candidateProfileService.deleteCertification(
            req.user._id,
            req.params.certificationId
        );

    res.status(200).json({
        success: true,
        message: "Certification deleted successfully",
        data: profile,
    });
});