const express = require("express");

const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");

const {
    matchCandidateToJob,
} = require("../controllers/matchingController");

router.get(
    "/applications/:applicationId/match",
    protect,
    authorize("recruiter", "admin"),
    matchCandidateToJob
);

module.exports = router;