const express = require("express");

const router = express.Router();

const {
    createJob,
    getAllJobs,
    getSingleJob,
    updateJob,
    deleteJob,
    getMyJobs,
    applyJob,
} = require("../controllers/jobController");

const {
    protect,
    authorize,
} = require("../middleware/authMiddleware");


// ==========================
// Public Routes
// ==========================

// Get All Jobs
router.get("/", getAllJobs);

// Get Logged-in Recruiter's Jobs
router.get(
    "/my-jobs",
    protect,
    authorize("recruiter", "admin"),
    getMyJobs
);

// Apply for Job
router.post(
    "/:id/apply",
    protect,
    authorize("candidate"),
    applyJob
);

// Get Single Job
router.get("/:id", getSingleJob);


// ==========================
// Recruiter/Admin Routes
// ==========================

// Create Job
router.post(
    "/",
    protect,
    authorize("recruiter", "admin"),
    createJob
);

// Update Job
router.put(
    "/:id",
    protect,
    authorize("recruiter", "admin"),
    updateJob
);

// Delete Job
router.delete(
    "/:id",
    protect,
    authorize("recruiter", "admin"),
    deleteJob
);

module.exports = router;