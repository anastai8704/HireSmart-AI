const Job = require("../models/Job");
const User = require("../models/User");
// ==========================
// Create Job
// ==========================
exports.createJob = async (req, res) => {
    try {

        const {
            title,
            company,
            location,
            salary,
            experience,
            jobType,
            description,
            skills
        } = req.body;

        if (
            !title ||
            !company ||
            !location ||
            !salary ||
            !experience ||
            !jobType ||
            !description ||
            !skills
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        const job = await Job.create({
            title,
            company,
            location,
            salary,
            experience,
            jobType,
            description,
            skills,
            recruiter: req.user.id
        });

        return res.status(201).json({
            success: true,
            message: "Job Created Successfully",
            job
        });

    } catch (error) {

console.error(error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};
// ==========================
// Get All Jobs
// ==========================
exports.getAllJobs = async (req, res) => {
    try {

        const keyword = req.query.keyword
            ? {
                  $or: [
                      {
                          title: {
                              $regex: req.query.keyword,
                              $options: "i",
                          },
                      },
                      {
                          company: {
                              $regex: req.query.keyword,
                              $options: "i",
                          },
                      },
                  ],
              }
            : {};

        const location = req.query.location
            ? {
                  location: {
                      $regex: req.query.location,
                      $options: "i",
                  },
              }
            : {};

        const jobType = req.query.jobType
            ? { jobType: req.query.jobType }
            : {};

        const experience = req.query.experience
            ? { experience: req.query.experience }
            : {};

        const jobs = await Job.find({
            ...keyword,
            ...location,
            ...jobType,
            ...experience,
        });

        res.status(200).json({
            success: true,
            count: jobs.length,
            jobs,
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }
};
// ==========================
// Get Single Job
// ==========================
exports.getSingleJob = async (req, res) => {
    try {

        const job = await Job.findById(req.params.id)
            .populate("recruiter", "name email");

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        return res.status(200).json({
            success: true,
            job
        });

    } catch (error) {

console.error(error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};
// ==========================
// Update Job
// ==========================
exports.updateJob = async (req, res) => {

    try {

        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        // Only job owner or admin can update
        if (
            job.recruiter.toString() !== req.user.id &&
            req.user.role !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to update this job."
            });
        }

        const updatedJob = await Job.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        return res.status(200).json({
            success: true,
            message: "Job Updated Successfully",
            job: updatedJob
        });

    } catch (error) {

console.error(error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};
// ==========================
// Delete Job
// ==========================
exports.deleteJob = async (req, res) => {

    try {

        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        // Only job owner or admin can delete
        if (
            job.recruiter.toString() !== req.user.id &&
            req.user.role !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this job."
            });
        }

        await Job.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: "Job Deleted Successfully"
        });

    } catch (error) {

console.error(error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};
// ==========================
// Get Logged-in Recruiter's Jobs
// ==========================
exports.getMyJobs = async (req, res) => {
    try {

        const jobs = await Job.find({
            recruiter: req.user.id
        });

        return res.status(200).json({
            success: true,
            count: jobs.length,
            jobs,
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }
};
// ==========================
// Apply for Job
// ==========================
exports.applyJob = async (req, res) => {

    try {

        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found",
            });
        }

        const alreadyApplied = job.applicants.some(
            applicant =>
                applicant.candidate.toString() === req.user.id
        );

        if (alreadyApplied) {
            return res.status(400).json({
                success: false,
                message: "You have already applied for this job.",
            });
        }

        job.applicants.push({
            candidate: req.user.id,
            status: "Applied",
        });

        await job.save();

        return res.status(200).json({
            success: true,
            message: "Job Applied Successfully",
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};
// ==========================
// Get Applicants of a Job
// ==========================
exports.getJobApplicants = async (req, res) => {

    try {

        const job = await Job.findById(req.params.id)
            .populate(
                "applicants.candidate",
                "name email phone profileImage role"
            );

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found",
            });
        }

        if (
            job.recruiter.toString() !== req.user.id &&
            req.user.role !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to view applicants.",
            });
        }

        return res.status(200).json({
            success: true,
            count: job.applicants.length,
            applicants: job.applicants,
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};
// ==========================
// Get Applied Jobs
// ==========================
exports.getAppliedJobs = async (req, res) => {

    try {

        const jobs = await Job.find({
            "applicants.candidate": req.user.id,
        }).populate(
            "recruiter",
            "name email"
        );

        return res.status(200).json({
            success: true,
            count: jobs.length,
            jobs,
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};
// ==========================
// Withdraw Job Application
// ==========================
exports.withdrawApplication = async (req, res) => {

    try {

        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found",
            });
        }

        const applied = job.applicants.some(
            applicant =>
                applicant.candidate.toString() === req.user.id
        );

        if (!applied) {
            return res.status(400).json({
                success: false,
                message: "You have not applied for this job.",
            });
        }

        job.applicants = job.applicants.filter(
            applicant =>
                applicant.candidate.toString() !== req.user.id
        );

        await job.save();

        return res.status(200).json({
            success: true,
            message: "Application withdrawn successfully",
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};
// ==========================
// Save Job
// ==========================
exports.saveJob = async (req, res) => {
    try {

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found",
            });
        }

        if (
            user.savedJobs.some(
                savedJob => savedJob.toString() === job._id.toString()
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Job already saved.",
            });
        }

        user.savedJobs.push(job._id);

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Job saved successfully",
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }
};
// ==========================
// Get Saved Jobs
// ==========================
exports.getSavedJobs = async (req, res) => {
    try {

        const user = await User.findById(req.user.id)
            .populate({
                path: "savedJobs",
                populate: {
                    path: "recruiter",
                    select: "name email",
                },
            });

        return res.status(200).json({
            success: true,
            count: user.savedJobs.length,
            jobs: user.savedJobs,
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }
};
// ==========================
// Unsave Job
// ==========================
exports.unsaveJob = async (req, res) => {

    try {

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (!user.savedJobs.includes(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Job is not saved.",
            });
        }

        user.savedJobs = user.savedJobs.filter(
            (jobId) => jobId.toString() !== req.params.id
        );

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Job removed from saved jobs",
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};
// ==========================
// Recruiter Dashboard
// ==========================
exports.getDashboardStats = async (req, res) => {

    try {

        // Total jobs created by recruiter
        const jobs = await Job.find({
            recruiter: req.user.id,
        });

        const totalJobs = jobs.length;

let totalApplications = 0;

let applied = 0;
let shortlisted = 0;
let interview = 0;
let selected = 0;
let rejected = 0;

jobs.forEach((job) => {

    totalApplications += job.applicants.length;

    job.applicants.forEach((applicant) => {

        switch (applicant.status) {

            case "Applied":
                applied++;
                break;

            case "Shortlisted":
                shortlisted++;
                break;

            case "Interview":
                interview++;
                break;

            case "Selected":
                selected++;
                break;

            case "Rejected":
                rejected++;
                break;

            default:
                break;

        }

    });

});

        // Latest Job
        const latestJob = await Job.findOne({
            recruiter: req.user.id,
        })
            .sort({ createdAt: -1 })
            .select("title company location createdAt");

        return res.status(200).json({
            success: true,
dashboard: {
    totalJobs,
    totalApplications,
    applied,
    shortlisted,
    interview,
    selected,
    rejected,
    latestJob,
},
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};
// ==========================
// Candidate Dashboard
// ==========================
exports.getCandidateDashboard = async (req, res) => {

    try {

        const appliedJobs = await Job.find({
            "applicants.candidate": req.user.id,
        });

        const user = await User.findById(req.user.id);

        const totalSavedJobs = user.savedJobs.length;

        const latestAppliedJob = await Job.findOne({
            "applicants.candidate": req.user.id,
        })
        .sort({ createdAt: -1 })
        .select("title company location createdAt");

        return res.status(200).json({
            success: true,
            dashboard: {
                totalAppliedJobs: appliedJobs.length,
                totalSavedJobs,
                latestAppliedJob,
            },
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};
// ==========================
// getJobStatus
// ==========================
exports.getJobStatus = async (req, res) => {

    try {

        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found",
            });
        }

        const user = await User.findById(req.user.id);

        const isApplied = job.applicants.some(
            applicant =>
                applicant.candidate.toString() === req.user.id
        );

        const isSaved = user.savedJobs.some(
            savedJob => savedJob.toString() === job._id.toString()
        );

        return res.status(200).json({
            success: true,
            status: {
                isApplied,
                isSaved,
            },
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};
// ==========================
// Get Applicant Profile
// ==========================
exports.getApplicantProfile = async (req, res) => {

    try {

        const applicant = await User.findById(req.params.id)
            .select("-password");

        if (!applicant) {
            return res.status(404).json({
                success: false,
                message: "Applicant not found",
            });
        }

        if (
            req.user.role !== "recruiter" &&
            req.user.role !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to view this profile.",
            });
        }

        return res.status(200).json({
            success: true,
            applicant,
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};
// ==========================
// Update Applicant Status
// ==========================
exports.updateApplicantStatus = async (req, res) => {

    try {

        const { status } = req.body;
        const validStatuses = [
           "Applied",
           "Shortlisted",
           "Interview",
           "Selected",
           "Rejected",
];

        if (!validStatuses.includes(status)) {
        return res.status(400).json({
           success: false,
           message: "Invalid status",
    });
}        
        const job = await Job.findById(req.params.jobId);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found",
            });
        }

        if (
            job.recruiter.toString() !== req.user.id &&
            req.user.role !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized.",
            });
        }

        const applicant = job.applicants.find(
            item =>
                item.candidate.toString() === req.params.userId
        );

        if (!applicant) {
            return res.status(404).json({
                success: false,
                message: "Applicant not found",
            });
        }

        applicant.status = status;

        await job.save();

        return res.status(200).json({
            success: true,
            message: "Applicant status updated",
            applicant,
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Server Error",
        });

    }

};