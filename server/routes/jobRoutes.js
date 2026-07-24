const express = require("express");

const router = express.Router();

const {
    createJob,
    getAllJobs
} = require("../controllers/jobController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");


// Public Route
router.get("/", getAllJobs);


// Recruiter/Admin Only
router.post(
    "/",
    protect,
    authorize("recruiter", "admin"),
    createJob
);

module.exports = router;