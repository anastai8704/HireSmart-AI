const express = require("express");

const router = express.Router();

const {

    protect,

    authorize

} = require("../middleware/authMiddleware");

const {
    getProfile,
    updateProfile,
    adminDashboard,
    recruiterDashboard,
    candidateDashboard,
    listUsers,
    updateUserAccountStatus,
} = require("../controllers/userController");

router.get("/profile", protect, getProfile);

router.put("/profile", protect, updateProfile);

router.get(
    "/admin",
    protect,
    authorize("admin"),
    adminDashboard
);

router.get(
    "/admin/users",
    protect,
    authorize("admin"),
    listUsers
);

router.patch(
    "/admin/users/:id/status",
    protect,
    authorize("admin"),
    updateUserAccountStatus
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
