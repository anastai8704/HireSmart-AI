/**
 * matchingController.js
 * -----------------------------------------------------------------------------
 * HTTP layer for every AI feature. It does three jobs and nothing else:
 *
 *   1. authorise the caller,
 *   2. load the data the scoring engine needs,
 *   3. hand that data to the pure service and return the result.
 *
 * All the actual intelligence lives in services/resumeMatchingService.js and
 * services/resumeAnalyzerService.js. Keeping controllers thin is what lets us
 * unit-test the scoring logic without spinning up Express or MongoDB.
 */

const Job = require("../models/Job");
const User = require("../models/User");
const { Application } = require("../models/Application");
const { roles } = require("../constants/enums");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");

const {
    calculateResumeJobMatch,
    rankCandidatesForJob,
    recommendJobsForCandidate,
} = require("../services/resumeMatchingService");

const {
    analyzeResume,
    analyzeResumeAgainstJob,
} = require("../services/resumeAnalyzerService");

/**
 * Confirms the signed-in recruiter actually owns this job (admins bypass).
 * Without this check any recruiter could read another company's applicants.
 */
const assertJobAccess = (job, user) => {
    if (user.role === roles.admin) {
        return;
    }

    if (String(job.recruiter) !== String(user.id)) {
        throw new AppError("You are not authorized to access this job", 403);
    }
};

/**
 * GET /api/matching/applications/:applicationId/match
 * Recruiter view: how well does this one applicant fit the job they applied to?
 */
exports.matchCandidateToJob = asyncHandler(async (req, res) => {
    const application = await Application.findById(req.params.applicationId)
        .select("+resumeSnapshot.storageKey")
        .populate("job")
        .populate("candidate", "name email skills resumeText");

    if (!application || !application.job) {
        throw new AppError("Application not found", 404);
    }

    assertJobAccess(application.job, req.user);

    const match = calculateResumeJobMatch({
        // Prefer the snapshot taken at apply-time so the score reflects exactly
        // what the candidate submitted, not a resume they changed afterwards.
        resumeText:
            application.resumeSnapshot?.text || application.candidate?.resumeText || "",
        resumeSkills: application.candidate?.skills || [],
        jobSkills: application.job.skills || [],
        jobDescription: application.job.description || "",
        jobTitle: application.job.title || "",
        jobExperience: application.job.experience || "",
    });

    res.status(200).json({
        success: true,
        message: "Candidate-job match calculated successfully",
        data: {
            applicationId: application._id,
            candidate: {
                id: application.candidate._id,
                name: application.candidate.name,
                email: application.candidate.email,
            },
            job: {
                id: application.job._id,
                title: application.job.title,
            },
            ...match,
        },
    });
});

/**
 * GET /api/matching/jobs/:jobId/ranking
 * Recruiter view: every applicant for a job, ranked best-fit first.
 *
 * This is the feature that saves a recruiter the most time - instead of opening
 * 200 resumes in arrival order they start with the strongest candidates.
 */
exports.rankApplicantsForJob = asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId);

    if (!job) {
        throw new AppError("Job not found", 404);
    }

    assertJobAccess(job, req.user);

    const applications = await Application.find({ job: job._id })
        .populate("candidate", "name email skills headline location resumeText")
        .lean();

    const ranked = rankCandidatesForJob({
        job,
        candidates: applications
            .filter((application) => application.candidate)
            .map((application) => ({
                applicationId: application._id,
                status: application.status,
                appliedAt: application.appliedAt,
                candidate: {
                    id: application.candidate._id,
                    name: application.candidate.name,
                    email: application.candidate.email,
                    headline: application.candidate.headline,
                    location: application.candidate.location,
                },
                skills: application.candidate.skills || [],
                resumeText:
                    application.resumeSnapshot?.text ||
                    application.candidate.resumeText ||
                    "",
            })),
    }).map(({ resumeText, ...rest }) => rest); // never leak full resume text to the list view

    res.status(200).json({
        success: true,
        message: "Applicants ranked successfully",
        data: {
            job: { id: job._id, title: job.title, company: job.company },
            totalApplicants: ranked.length,
            averageScore: ranked.length
                ? Math.round(
                      ranked.reduce((sum, item) => sum + item.match.matchScore, 0) /
                          ranked.length
                  )
                : 0,
            applicants: ranked,
        },
    });
});

/**
 * GET /api/matching/recommendations
 * Candidate view: the open jobs that best fit their resume, best first.
 */
exports.recommendJobs = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("skills resumeText resume");

    if (!user) {
        throw new AppError("User not found", 404);
    }

    if (!user.resumeText && (!user.skills || user.skills.length === 0)) {
        throw new AppError(
            "Upload a resume or add skills to your profile to receive recommendations",
            400
        );
    }

    const limit = Math.min(Number(req.query.limit) || 10, 50);

    // Only score jobs the candidate could actually apply to.
    const jobs = await Job.find({ status: "published" })
        .select("title company location salary experience jobType description skills createdAt")
        .sort({ createdAt: -1 })
        .limit(200) // cap the working set so scoring stays fast
        .lean();

    const recommendations = recommendJobsForCandidate({
        resumeText: user.resumeText || "",
        skills: user.skills || [],
        jobs,
    })
        // A very poor fit is noise, not a recommendation.
        .filter((item) => item.match.matchScore >= 20)
        .slice(0, limit);

    res.status(200).json({
        success: true,
        message: "Job recommendations generated successfully",
        data: {
            total: recommendations.length,
            recommendations,
        },
    });
});

/**
 * GET /api/matching/jobs/:jobId/fit
 * Candidate view: "should I apply to this one, and what is missing?"
 */
exports.getJobFit = asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.jobId).lean();

    if (!job || job.status !== "published") {
        throw new AppError("Job not found", 404);
    }

    const user = await User.findById(req.user.id).select("skills resumeText");

    if (!user?.resumeText) {
        throw new AppError("Upload a resume first to check your fit for this job", 400);
    }

    const report = analyzeResumeAgainstJob({ resumeText: user.resumeText, job });

    res.status(200).json({
        success: true,
        message: "Job fit analysis completed",
        data: report,
    });
});

/**
 * GET /api/matching/resume/analysis
 * Candidate view: a general ATS health check of their uploaded resume.
 */
exports.getResumeAnalysis = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select(
        "resumeText resume resumeOriginalName resumeUploadedAt"
    );

    if (!user?.resume) {
        throw new AppError("Upload a resume before requesting an analysis", 400);
    }

    const report = analyzeResume(user.resumeText || "");

    res.status(200).json({
        success: true,
        message: "Resume analysis completed",
        data: {
            resume: {
                originalName: user.resumeOriginalName,
                uploadedAt: user.resumeUploadedAt,
            },
            ...report,
        },
    });
});

/**
 * POST /api/matching/resume/analyze-text
 * Analyses pasted resume text without saving anything.
 *
 * Useful for a public "try it" experience and for candidates who want to
 * iterate on wording before uploading a new file.
 */
exports.analyzeResumeText = asyncHandler(async (req, res) => {
    const { resumeText } = req.body;

    if (typeof resumeText !== "string" || resumeText.trim().length < 50) {
        throw new AppError("Provide at least 50 characters of resume text", 400);
    }

    if (resumeText.length > 50000) {
        throw new AppError("Resume text must be under 50,000 characters", 400);
    }

    res.status(200).json({
        success: true,
        message: "Resume analysis completed",
        data: analyzeResume(resumeText),
    });
});
