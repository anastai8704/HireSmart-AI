const express = require("express");

const router = express.Router();

const {
    createJob,
    getAllJobs,
    getJobById,
    updateJob,
    deleteJob
} = require("../controllers/jobController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");


// Public Route
router.get("/", getAllJobs);
router.get("/:id", getJobById);

// Recruiter/Admin Only
router.post(
    "/",
    protect,
    authorize("recruiter", "admin"),
    createJob
);

router.put(
    "/:id",
    protect,
    authorize("recruiter", "admin"),
    updateJob
);

router.delete(
    "/:id",
    protect,
    authorize("recruiter", "admin"),
    deleteJob
);

module.exports = router;