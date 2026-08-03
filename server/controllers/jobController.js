const fs = require("node:fs");

const Job = require("../models/Job");
const User = require("../models/User");
const { Application, applicationStatuses } = require("../models/Application");
const { roles } = require("../constants/enums");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const resumeService = require("../services/resumeService");
const storageService = require("../services/storageService");
const {
    validateJobPayload,
} = require("../validators/jobValidator");
const {
    validateApplicationStatus,
    validateResumeDownloadRequest,
} = require("../validators/applicationValidator");
const publicJobFields =
    "title company location salary experience jobType description skills status closesAt recruiter createdAt updatedAt";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePagination = (query) => {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 12);

    if (!Number.isInteger(page) || page < 1) {
        throw new AppError("Page must be a positive integer", 400);
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError("Limit must be an integer between 1 and 100", 400);
    }

    return { page, limit, skip: (page - 1) * limit };
};

const getOwnedJob = async (jobId, user) => {
    const job = await Job.findById(jobId);

    if (!job) {
        throw new AppError("Job not found", 404);
    }

    if (user.role !== "admin" && job.recruiter.toString() !== user.id) {
        throw new AppError("You are not authorized to access this job", 403);
    }

    return job;
};

const getPublicJobQuery = (query) => {
    const filter = {
        status: "published",
        $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }],
    };

    if (query.keyword) {
        const keyword = String(query.keyword).trim();

        if (keyword.length > 100) {
            throw new AppError("keyword must not exceed 100 characters", 400);
        }

        const expression = new RegExp(escapeRegex(keyword), "i");
        filter.$and = [
            {
                $or: [
                    { title: expression },
                    { company: expression },
                    { skills: expression },
                ],
            },
        ];
    }

    for (const field of ["location", "experience", "jobType"]) {
        if (query[field]) {
            const value = String(query[field]).trim();

            if (value.length > 100) {
                throw new AppError(`${field} must not exceed 100 characters`, 400);
            }

            filter[field] = field === "jobType" ? value : new RegExp(escapeRegex(value), "i");
        }
    }

    return filter;
};

const formatApplication = (application, { includeInternalNotes = false } = {}) => {
    const response = {
        id: application._id,
        job: application.job,
        status: application.status,
        appliedAt: application.appliedAt,
        updatedAt: application.updatedAt,
        statusHistory: includeInternalNotes
            ? application.statusHistory
            : application.statusHistory.map(({ status, changedAt }) => ({ status, changedAt })),
    };

    if (includeInternalNotes) {
        response.recruiterNotes = application.recruiterNotes;
    }

    return response;
};

exports.createJob = asyncHandler(async (req, res) => {
    const jobPayload = validateJobPayload(req.body);
    const job = await Job.create({
        ...jobPayload,
        recruiter: req.user.id,
    });

    res.status(201).json({
        success: true,
        message: "Job created successfully",
        job,
    });
});

exports.getAllJobs = asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = getPublicJobQuery(req.query);
    const sortOptions = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        salary_high: { salary: -1 },
        salary_low: { salary: 1 },
    };
    const sort = sortOptions[req.query.sort] || sortOptions.newest;

    const [total, jobs] = await Promise.all([
        Job.countDocuments(filter),
        Job.find(filter)
            .select(publicJobFields)
            .populate("recruiter", "name")
            .sort(sort)
            .skip(skip)
            .limit(limit),
    ]);

    res.status(200).json({
        success: true,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
        jobs,
    });
});

exports.getSingleJob = asyncHandler(async (req, res) => {
    const job = await Job.findOne({
        _id: req.params.id,
        status: "published",
        $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }],
    })
        .select(publicJobFields)
        .populate("recruiter", "name");

    if (!job) {
        throw new AppError("Job not found", 404);
    }

    res.status(200).json({ success: true, job });
});

exports.updateJob = asyncHandler(async (req, res) => {
    const job = await getOwnedJob(req.params.id, req.user);
    const payload = validateJobPayload(req.body, { partial: true });

    if (Object.keys(payload).length === 0) {
        throw new AppError("No editable job fields were provided", 400);
    }

    Object.assign(job, payload);
    await job.save();

    res.status(200).json({
        success: true,
        message: "Job updated successfully",
        job,
    });
});

exports.deleteJob = asyncHandler(async (req, res) => {
    const job = await getOwnedJob(req.params.id, req.user);

    await Promise.all([
        Job.deleteOne({ _id: job._id }),
        Application.deleteMany({ job: job._id }),
        User.updateMany({ savedJobs: job._id }, { $pull: { savedJobs: job._id } }),
    ]);

    res.status(200).json({
        success: true,
        message: "Job and its applications were deleted successfully",
    });
});

exports.getMyJobs = asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = req.user.role === "admin" && req.query.recruiterId
        ? { recruiter: req.query.recruiterId }
        : { recruiter: req.user.id };

    const [total, jobs] = await Promise.all([
        Job.countDocuments(filter),
        Job.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    ]);

    const applicationCounts = await Application.aggregate([
        { $match: { job: { $in: jobs.map((job) => job._id) } } },
        { $group: { _id: "$job", count: { $sum: 1 } } },
    ]);
    const countByJob = new Map(
        applicationCounts.map((entry) => [entry._id.toString(), entry.count])
    );

    res.status(200).json({
        success: true,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        jobs: jobs.map((job) => ({
            ...job.toObject(),
            applicationCount: countByJob.get(job._id.toString()) || 0,
        })),
    });
});

exports.applyJob = asyncHandler(async (req, res) => {
    const job = await Job.findOne({
        _id: req.params.id,
        status: "published",
        $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }],
    });

    if (!job) {
        throw new AppError("This job is not accepting applications", 404);
    }

    const candidate = await User.findById(req.user.id);

    if (!candidate || !candidate.resume) {
        throw new AppError("Upload a resume before applying", 400);
    }

    const existingApplication = await Application.exists({
        job: job._id,
        candidate: candidate._id,
    });

    if (existingApplication) {
        throw new AppError("You have already applied for this job", 409);
    }

    const application = await Application.create({
        job: job._id,
        candidate: candidate._id,
        resumeSnapshot: {
            storageKey: candidate.resume,
            originalName: candidate.resumeOriginalName,
            mimeType: candidate.resumeMimeType,
            size: candidate.resumeSize,
        },
        statusHistory: [
            {
                status: "Applied",
                changedBy: candidate._id,
                note: "Application submitted",
            },
        ],
    });


    res.status(201).json({
        success: true,
        message: "Job application submitted successfully",
        application: formatApplication(application),
    });
});

exports.getJobApplicants = asyncHandler(async (req, res) => {
    const job = await getOwnedJob(req.params.id, req.user);
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { job: job._id };

    if (req.query.status) {
        if (!applicationStatuses.includes(req.query.status)) {
            throw new AppError("Invalid application status", 400);
        }

        filter.status = req.query.status;
    }

    const sortOptions = {
        newest: { appliedAt: -1 },
        oldest: { appliedAt: 1 },
        status: { status: 1, appliedAt: -1 },
    };
    const sort = sortOptions[req.query.sort] || sortOptions.newest;
    let applicants = await Application.find(filter)
        .populate("candidate", "name email phone profileImage")
        .sort(sort);

    if (req.query.search) {
        const keyword = String(req.query.search).trim().toLowerCase();

        if (keyword.length > 100) {
            throw new AppError("search must not exceed 100 characters", 400);
        }

        applicants = applicants.filter((application) =>
            application.candidate?.name?.toLowerCase().includes(keyword)
        );
    }

    if (req.query.sort === "name") {
        applicants.sort((left, right) =>
            (left.candidate?.name || "").localeCompare(right.candidate?.name || "")
        );
    }

    const total = applicants.length;
    const paginatedApplicants = applicants.slice(skip, skip + limit);

    res.status(200).json({
        success: true,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        applicants: paginatedApplicants.map((application) => ({
            ...formatApplication(application, { includeInternalNotes: true }),
            candidate: application.candidate,
        })),
    });
});

exports.getAppliedJobs = asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const [total, applications] = await Promise.all([
        Application.countDocuments({ candidate: req.user.id }),
        Application.find({ candidate: req.user.id })
            .populate({ path: "job", select: publicJobFields, populate: { path: "recruiter", select: "name" } })
            .sort({ appliedAt: -1 })
            .skip(skip)
            .limit(limit),
    ]);

    res.status(200).json({
        success: true,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        applications: applications.map(formatApplication),
    });
});

exports.withdrawApplication = asyncHandler(async (req, res) => {
    const application = await Application.findOne({
        job: req.params.id,
        candidate: req.user.id,
    });

    if (!application) {
        throw new AppError("You have not applied for this job", 404);
    }

    if (["Selected", "Rejected"].includes(application.status)) {
        throw new AppError("This application can no longer be withdrawn", 409);
    }

    await application.deleteOne();

    res.status(200).json({
        success: true,
        message: "Application withdrawn successfully",
    });
});

exports.saveJob = asyncHandler(async (req, res) => {
    const job = await Job.findOne({
        _id: req.params.id,
        status: "published",
        $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }],
    });

    if (!job) {
        throw new AppError("Job not found", 404);
    }

    const result = await User.updateOne(
        { _id: req.user.id, savedJobs: { $ne: job._id } },
        { $addToSet: { savedJobs: job._id } }
    );

    if (result.modifiedCount === 0) {
        throw new AppError("Job is already saved", 409);
    }

    res.status(200).json({ success: true, message: "Job saved successfully" });
});

exports.getSavedJobs = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).populate({
        path: "savedJobs",
        select: publicJobFields,
        populate: { path: "recruiter", select: "name" },
    });

    if (!user) {
        throw new AppError("User not found", 404);
    }

    const jobs = user.savedJobs.filter(Boolean);

    res.status(200).json({
        success: true,
        count: jobs.length,
        jobs,
    });
});

exports.unsaveJob = asyncHandler(async (req, res) => {
    const result = await User.updateOne(
        { _id: req.user.id, savedJobs: req.params.id },
        { $pull: { savedJobs: req.params.id } }
    );

    if (result.modifiedCount === 0) {
        throw new AppError("Job is not saved", 404);
    }

    res.status(200).json({ success: true, message: "Job removed from saved jobs" });
});

exports.getDashboardStats = asyncHandler(async (req, res) => {
    const jobs = await Job.find({ recruiter: req.user.id }).select("_id title company location createdAt");
    const jobIds = jobs.map((job) => job._id);
    const applications = await Application.find({ job: { $in: jobIds } }).select("job status");
    const statusCounts = Object.fromEntries(applicationStatuses.map((status) => [status, 0]));

    for (const application of applications) {
        statusCounts[application.status] += 1;
    }

    res.status(200).json({
        success: true,
        dashboard: {
            totalJobs: jobs.length,
            totalApplications: applications.length,
            applied: statusCounts.Applied,
            shortlisted: statusCounts.Shortlisted,
            interview: statusCounts.Interview,
            selected: statusCounts.Selected,
            rejected: statusCounts.Rejected,
            latestJob: jobs.sort((left, right) => right.createdAt - left.createdAt)[0] || null,
        },
    });
});

exports.getCandidateDashboard = asyncHandler(async (req, res) => {
    const [user, applications, latestApplication] = await Promise.all([
        User.findById(req.user.id).select("savedJobs"),
        Application.find({ candidate: req.user.id }).select("status"),
        Application.findOne({ candidate: req.user.id })
            .populate({ path: "job", select: publicJobFields })
            .sort({ appliedAt: -1 }),
    ]);

    if (!user) {
        throw new AppError("User not found", 404);
    }

    const statusCounts = Object.fromEntries(applicationStatuses.map((status) => [status, 0]));
    applications.forEach((application) => {
        statusCounts[application.status] += 1;
    });

    res.status(200).json({
        success: true,
        dashboard: {
            totalAppliedJobs: applications.length,
            totalSavedJobs: user.savedJobs.length,
            statusCounts,
            latestApplication: latestApplication ? formatApplication(latestApplication) : null,
        },
    });
});

exports.getJobStatus = asyncHandler(async (req, res) => {
    const [job, application, user] = await Promise.all([
        Job.exists({ _id: req.params.id }),
        Application.findOne({ job: req.params.id, candidate: req.user.id }).select("status appliedAt"),
        User.findById(req.user.id).select("savedJobs"),
    ]);

    if (!job) {
        throw new AppError("Job not found", 404);
    }

    res.status(200).json({
        success: true,
        status: {
            isApplied: Boolean(application),
            applicationStatus: application?.status || null,
            appliedAt: application?.appliedAt || null,
            isSaved: user.savedJobs.some((savedJob) => savedJob.toString() === req.params.id),
        },
    });
});

exports.getApplicantProfile = asyncHandler(async (req, res) => {
    const candidate = await User.findById(req.params.id).select("name email phone profileImage createdAt");

    if (!candidate || candidate.role !== roles.candidate) {
        throw new AppError("Applicant not found", 404);
    }

    if (req.user.role !== "admin") {
        const recruiterJobIds = await Job.find({ recruiter: req.user.id }).distinct("_id");
        const hasApplication = await Application.exists({
            candidate: candidate._id,
            job: { $in: recruiterJobIds },
        });

        if (!hasApplication) {
            throw new AppError("You are not authorized to view this profile", 403);
        }
    }

    res.status(200).json({ success: true, applicant: candidate });
});

exports.updateApplicantStatus = asyncHandler(async (req, res) => {
    const { status, note } = req.body;

    validateApplicationStatus(status);

    if (note !== undefined && String(note).length > 2000) {
        throw new AppError("Status note must not exceed 2000 characters", 400);
    }

    if (note !== undefined && String(note).length > 2000) {
        throw new AppError("Status note must not exceed 2000 characters", 400);
    }

    const job = await getOwnedJob(req.params.jobId, req.user);
    const application = await Application.findOne({
        job: job._id,
        candidate: req.params.userId,
    });

    if (!application) {
        throw new AppError("Applicant not found", 404);
    }

    application.status = status;
    application.statusHistory.push({
        status,
        changedBy: req.user.id,
        note: note ? String(note).trim() : "",
    });
    await application.save();

    res.status(200).json({
        success: true,
        message: "Applicant status updated",
        application: formatApplication(application, { includeInternalNotes: true }),
    });
});

exports.updateRecruiterNotes = asyncHandler(async (req, res) => {
    const { recruiterNotes } = req.body;

    if (typeof recruiterNotes !== "string" || recruiterNotes.trim().length > 5000) {
        throw new AppError("recruiterNotes must be a string no longer than 5000 characters", 400);
    }

    const job = await getOwnedJob(req.params.jobId, req.user);
    const application = await Application.findOne({
        job: job._id,
        candidate: req.params.userId,
    });

    if (!application) {
        throw new AppError("Applicant not found", 404);
    }

    application.recruiterNotes = recruiterNotes.trim();
    await application.save();

    res.status(200).json({
        success: true,
        message: "Recruiter notes updated",
        application: formatApplication(application, { includeInternalNotes: true }),
    });
});

exports.getRecruiterAnalytics = asyncHandler(async (req, res) => {
    const jobs = await Job.find({ recruiter: req.user.id }).select("_id title");
    const jobIds = jobs.map((job) => job._id);
    const applicationCounts = await Application.aggregate([
        { $match: { job: { $in: jobIds } } },
        {
            $group: {
                _id: "$job",
                total: { $sum: 1 },
                applied: { $sum: { $cond: [{ $eq: ["$status", "Applied"] }, 1, 0] } },
                shortlisted: { $sum: { $cond: [{ $eq: ["$status", "Shortlisted"] }, 1, 0] } },
                interview: { $sum: { $cond: [{ $eq: ["$status", "Interview"] }, 1, 0] } },
                selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
            },
        },
    ]);
    const totals = {
        totalCandidates: 0,
        applied: 0,
        shortlisted: 0,
        interview: 0,
        selected: 0,
        rejected: 0,
    };

    applicationCounts.forEach((count) => {
        totals.totalCandidates += count.total;
        for (const status of ["applied", "shortlisted", "interview", "selected", "rejected"]) {
            totals[status] += count[status];
        }
    });

    const topCount = applicationCounts.sort((left, right) => right.total - left.total)[0];
    const topJob = topCount
        ? {
              _id: topCount._id,
              title: jobs.find((job) => job._id.equals(topCount._id))?.title,
              applications: topCount.total,
          }
        : null;

    res.status(200).json({
        success: true,
        analytics: { totalJobs: jobs.length, ...totals, topJob },
    });
});

exports.downloadCandidateResume = asyncHandler(async (req, res, next) => {
    const { candidateId } = req.params;
    const { jobId } = req.query;

    validateResumeDownloadRequest({ candidateId, jobId });

    await getOwnedJob(jobId, req.user);
    const application = await Application.findOne({
        job: jobId,
        candidate: candidateId,
    }).select("+resumeSnapshot.storageKey resumeSnapshot.originalName");

    if (!application) {
        throw new AppError("Candidate has not applied for this job", 404);
    }

    const provider = application.resumeSnapshot.provider || "local";

    let fileStream;

    try {
        fileStream = await storageService.getFileStream(application.resumeSnapshot.storageKey, provider);
    } catch (error) {
        console.log("[jobController] getFileStream error:", error && error.message);
        throw new AppError("Resume file is unavailable", 404);
    }


    res.setHeader("Content-Type", application.resumeSnapshot.mimeType || "application/octet-stream");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(application.resumeSnapshot.originalName || "resume")}`
    );

    fileStream.on("error", next);
    fileStream.pipe(res);
});
