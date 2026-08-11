const express = require("express");

const router = express.Router();

const {
    protect,
    authorize,
} = require("../middleware/authMiddleware");

const {
    createProfile,
    getProfile,
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
} = require("../controllers/candidateProfileController");


// ==========================================
// CANDIDATE PROFILE
// ==========================================

router.post(
    "/profile",
    protect,
    authorize("candidate"),
    createProfile
);

router.get(
    "/profile",
    protect,
    authorize("candidate"),
    getProfile
);

router.put(
    "/profile",
    protect,
    authorize("candidate"),
    updateProfile
);

router.delete(
    "/profile",
    protect,
    authorize("candidate"),
    deleteProfile
);


// ==========================================
// EDUCATION
// ==========================================

router.post(
    "/profile/education",
    protect,
    authorize("candidate"),
    addEducation
);

router.put(
    "/profile/education/:educationId",
    protect,
    authorize("candidate"),
    updateEducation
);

router.delete(
    "/profile/education/:educationId",
    protect,
    authorize("candidate"),
    deleteEducation
);


// ==========================================
// EXPERIENCE
// ==========================================

router.post(
    "/profile/experience",
    protect,
    authorize("candidate"),
    addExperience
);

router.put(
    "/profile/experience/:experienceId",
    protect,
    authorize("candidate"),
    updateExperience
);

router.delete(
    "/profile/experience/:experienceId",
    protect,
    authorize("candidate"),
    deleteExperience
);

// ==========================================
// PROJECTS
// ==========================================

router.post(
    "/profile/projects",
    protect,
    authorize("candidate"),
    addProject
);

router.put(
    "/profile/projects/:projectId",
    protect,
    authorize("candidate"),
    updateProject
);

router.delete(
    "/profile/projects/:projectId",
    protect,
    authorize("candidate"),
    deleteProject
);

// ==========================================
// CERTIFICATIONS
// ==========================================

router.post(
    "/profile/certifications",
    protect,
    authorize("candidate"),
    addCertification
);

router.put(
    "/profile/certifications/:certificationId",
    protect,
    authorize("candidate"),
    updateCertification
);

router.delete(
    "/profile/certifications/:certificationId",
    protect,
    authorize("candidate"),
    deleteCertification
);

module.exports = router;