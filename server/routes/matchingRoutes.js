/**
 * matchingRoutes.js
 * -----------------------------------------------------------------------------
 * All AI-powered endpoints live under /api/matching.
 *
 * Access rules at a glance:
 *   Recruiter/Admin - score and rank the applicants for THEIR OWN jobs
 *   Candidate       - analyse their own resume and find jobs that fit
 *   Public          - paste-and-analyse resume text (no account needed)
 */

const express = require("express");

const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");

const {
    matchCandidateToJob,
    rankApplicantsForJob,
    recommendJobs,
    getJobFit,
    getResumeAnalysis,
    analyzeResumeText,
} = require("../controllers/matchingController");

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

// Try the analyzer with pasted text - nothing is stored.
router.post("/resume/analyze-text", analyzeResumeText);

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------

router.get(
    "/resume/analysis",
    protect,
    authorize("candidate"),
    getResumeAnalysis
);

router.get(
    "/recommendations",
    protect,
    authorize("candidate"),
    recommendJobs
);

router.get(
    "/jobs/:jobId/fit",
    protect,
    authorize("candidate"),
    getJobFit
);

// ---------------------------------------------------------------------------
// Recruiter / Admin
// ---------------------------------------------------------------------------

router.get(
    "/jobs/:jobId/ranking",
    protect,
    authorize("recruiter", "admin"),
    rankApplicantsForJob
);

router.get(
    "/applications/:applicationId/match",
    protect,
    authorize("recruiter", "admin"),
    matchCandidateToJob
);

module.exports = router;
