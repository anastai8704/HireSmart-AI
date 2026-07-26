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
    getJobApplicants,
    getAppliedJobs,
    withdrawApplication,
    saveJob,
    getSavedJobs,
    unsaveJob,
    getDashboardStats,
    getCandidateDashboard,
    getJobStatus,
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

// ==========================
// Candidate Routes
// ==========================

router.get(
    "/candidate-dashboard",
    protect,
    authorize("candidate"),
    getCandidateDashboard
);

// My Applied Jobs
router.get(
    "/applied",
    protect,
    authorize("candidate"),
    getAppliedJobs
);

// Apply Job
router.post(
    "/:id/apply",
    protect,
    authorize("candidate"),
    applyJob
);

// Save Job
router.post(
    "/:id/save",
    protect,
    authorize("candidate"),
    saveJob
);

// Withdraw Application
router.delete(
    "/:id/apply",
    protect,
    authorize("candidate"),
    withdrawApplication
);

// Get Saved Jobs
router.get(
    "/saved",
    protect,
    authorize("candidate"),
    getSavedJobs
);

router.delete(
    "/:id/save",
    protect,
    authorize("candidate"),
    unsaveJob
);

router.get(
    "/:id/status",
    protect,
    authorize("candidate"),
    getJobStatus
);

// ==========================
// Recruiter Routes
// ==========================

// Recruiter Dashboard
router.get(
    "/dashboard",
    protect,
    authorize("recruiter", "admin"),
    getDashboardStats
);

// My Jobs
router.get(
    "/my-jobs",
    protect,
    authorize("recruiter", "admin"),
    getMyJobs
);

// Job Applicants
router.get(
    "/:id/applicants",
    protect,
    authorize("recruiter", "admin"),
    getJobApplicants
);

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

// ==========================
// Get Single Job (LAST)
// ==========================

router.get("/:id", getSingleJob);

module.exports = router;