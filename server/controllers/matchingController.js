const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { Application } = require("../models/Application");
const {
    calculateResumeJobMatch,
} = require("../services/resumeMatchingService");

exports.matchCandidateToJob = asyncHandler(async (req, res) => {
    const { applicationId } = req.params;

    const application = await Application.findById(applicationId)
        .populate("job")
        .populate("candidate", "name email skills");

    if (!application) {
        throw new AppError("Application not found", 404);
    }

    if (
        req.user.role !== "admin" &&
        String(application.job.recruiter) !== String(req.user.id)
    ) {
        throw new AppError(
            "You are not authorized to analyze this candidate",
            403
        );
    }

    const result = calculateResumeJobMatch({
        resumeText: application.resumeSnapshot?.text || "",
        resumeSkills: application.candidate?.skills || [],
        jobSkills: application.job.skills || [],
        jobDescription: application.job.description || "",
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
            ...result,
        },
    });
});