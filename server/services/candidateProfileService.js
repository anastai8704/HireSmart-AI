const CandidateProfile = require("../models/CandidateProfile");
const AppError = require("../utils/AppError");

const userPopulateFields =
    "name email phone profileImage headline location bio skills resume";


// ==========================================
// GET PROFILE BY USER ID
// ==========================================

const getProfileByUserId = async (userId) => {
    return CandidateProfile.findOne({
        user: userId,
    }).populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// CREATE PROFILE
// ==========================================

const createProfile = async (userId, profileData) => {
    const existingProfile = await CandidateProfile.findOne({
        user: userId,
    });

    if (existingProfile) {
        throw new AppError(
            "Candidate profile already exists",
            409
        );
    }

    const profile = await CandidateProfile.create({
        user: userId,
        ...profileData,
    });

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// UPDATE PROFILE
// ==========================================

const updateProfile = async (userId, profileData) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    Object.assign(profile, profileData);

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// DELETE PROFILE
// ==========================================

const deleteProfile = async (userId) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    await CandidateProfile.deleteOne({
        _id: profile._id,
    });

    return {
        message: "Candidate profile deleted successfully",
    };
};


// ==========================================
// ADD EDUCATION
// ==========================================

const addEducation = async (userId, educationData) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    profile.education.push(educationData);

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// UPDATE EDUCATION
// ==========================================

const updateEducation = async (
    userId,
    educationId,
    educationData
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    const education = profile.education.id(
        educationId
    );

    if (!education) {
        throw new AppError(
            "Education record not found",
            404
        );
    }

    Object.assign(
        education,
        educationData
    );

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// DELETE EDUCATION
// ==========================================

const deleteEducation = async (
    userId,
    educationId
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    const education = profile.education.id(
        educationId
    );

    if (!education) {
        throw new AppError(
            "Education record not found",
            404
        );
    }

    education.deleteOne();

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// ADD EXPERIENCE
// ==========================================

const addExperience = async (
    userId,
    experienceData
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    profile.experience.push(
        experienceData
    );

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// UPDATE EXPERIENCE
// ==========================================

const updateExperience = async (
    userId,
    experienceId,
    experienceData
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    const experience = profile.experience.id(
        experienceId
    );

    if (!experience) {
        throw new AppError(
            "Experience record not found",
            404
        );
    }

    Object.assign(
        experience,
        experienceData
    );

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// DELETE EXPERIENCE
// ==========================================

const deleteExperience = async (
    userId,
    experienceId
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    const experience = profile.experience.id(
        experienceId
    );

    if (!experience) {
        throw new AppError(
            "Experience record not found",
            404
        );
    }

    experience.deleteOne();

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};

// ==========================================
// ADD PROJECT
// ==========================================

const addProject = async (
    userId,
    projectData
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    profile.projects.push(projectData);

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// UPDATE PROJECT
// ==========================================

const updateProject = async (
    userId,
    projectId,
    projectData
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    const project = profile.projects.id(
        projectId
    );

    if (!project) {
        throw new AppError(
            "Project record not found",
            404
        );
    }

    Object.assign(
        project,
        projectData
    );

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// DELETE PROJECT
// ==========================================

const deleteProject = async (
    userId,
    projectId
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    const project = profile.projects.id(
        projectId
    );

    if (!project) {
        throw new AppError(
            "Project record not found",
            404
        );
    }

    project.deleteOne();

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};

// ==========================================
// ADD CERTIFICATION
// ==========================================

const addCertification = async (
    userId,
    certificationData
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    profile.certifications.push(
        certificationData
    );

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// UPDATE CERTIFICATION
// ==========================================

const updateCertification = async (
    userId,
    certificationId,
    certificationData
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    const certification =
        profile.certifications.id(
            certificationId
        );

    if (!certification) {
        throw new AppError(
            "Certification record not found",
            404
        );
    }

    Object.assign(
        certification,
        certificationData
    );

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};


// ==========================================
// DELETE CERTIFICATION
// ==========================================

const deleteCertification = async (
    userId,
    certificationId
) => {
    const profile = await CandidateProfile.findOne({
        user: userId,
    });

    if (!profile) {
        throw new AppError(
            "Candidate profile not found",
            404
        );
    }

    const certification =
        profile.certifications.id(
            certificationId
        );

    if (!certification) {
        throw new AppError(
            "Certification record not found",
            404
        );
    }

    certification.deleteOne();

    await profile.save();

    return profile.populate(
        "user",
        userPopulateFields
    );
};

module.exports = {
    getProfileByUserId,
    createProfile,
    updateProfile,
    deleteProfile,

    addEducation,
    updateEducation,
    deleteEducation,

    addExperience,
    updateExperience,
    deleteExperience,

    addProject,
    updateProject,
    deleteProject,

    addCertification,
    updateCertification,
    deleteCertification,
};