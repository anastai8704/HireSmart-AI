const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
{
    title: {
        type: String,
        required: true,
        trim: true,
    },

    company: {
        type: String,
        required: true,
        trim: true,
    },

    location: {
        type: String,
        required: true,
        trim: true,
    },

    salary: {
        type: Number,
        required: true,
    },

    experience: {
        type: String,
        required: true,
    },

    jobType: {
        type: String,
        enum: ["Full-Time", "Part-Time", "Internship", "Remote"],
        default: "Full-Time",
    },

    description: {
        type: String,
        required: true,
    },

    skills: [
        {
            type: String,
        },
    ],

    recruiter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },

    applications: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Application",
        },
    ],
},
{
    timestamps: true,
}
);

module.exports = mongoose.model("Job", jobSchema);