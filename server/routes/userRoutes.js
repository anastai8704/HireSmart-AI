const express = require("express");

const router = express.Router();

const {

    protect,

    authorize

} = require("../middleware/authMiddleware");

const {

    getProfile,

    adminDashboard,

    recruiterDashboard,

    candidateDashboard

} = require("../controllers/userController");

router.get("/profile", protect, getProfile);

router.get(
    "/admin",
    protect,
    authorize("admin"),
    adminDashboard
);

router.get(
    "/recruiter",
    protect,
    authorize("recruiter"),
    recruiterDashboard
);

router.get(
    "/candidate",
    protect,
    authorize("candidate"),
    candidateDashboard
);

module.exports = router;