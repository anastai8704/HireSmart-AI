const Job = require("../models/Job");
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

        console.log(error);

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

        const jobs = await Job.find()
            .populate("recruiter", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: jobs.length,
            jobs
        });

    } catch (error) {

        console.log(error);

        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }

};
// ==========================
// Get Single Job
// ==========================
exports.getJobById = async (req, res) => {

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

        console.log(error);

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

        console.log(error);

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

        console.log(error);

        return res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};