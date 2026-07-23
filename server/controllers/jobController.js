const Job = require("../models/Job");

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

        // Validation
        if (
            !title ||
            !company ||
            !location ||
            !salary ||
            !experience ||
            !description
        ) {
            return res.status(400).json({
                success: false,
                message: "Please fill all required fields"
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

        res.status(201).json({
            success: true,
            message: "Job Created Successfully",
            job
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }
};