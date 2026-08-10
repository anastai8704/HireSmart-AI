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
} = require("../controllers/candidateProfileController");

// Candidate profile
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

module.exports = router;