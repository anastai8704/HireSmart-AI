const mongoose = require("mongoose");
const { jobTypes, jobStatuses } = require("../constants/enums");

const jobSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 150,
        },
        company: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
            index: true,
        },
        location: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },
        salary: {
            type: Number,
            required: true,
            min: 0,
        },
        experience: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        jobType: {
            type: String,
            enum: jobTypes,
            default: jobTypes[0],
        },
        description: {
            type: String,
            required: true,
            trim: true,
            minlength: 20,
            maxlength: 20000,
        },
        skills: {
            type: [String],
            required: true,
            validate: {
                validator: (skills) => skills.length > 0 && skills.length <= 50,
                message: "A job must list between 1 and 50 skills",
            },
        },
        status: {
            type: String,
            enum: jobStatuses,
            default: jobStatuses[1],
            index: true,
        },
        closesAt: {
            type: Date,
            default: null,
        },
        recruiter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ recruiter: 1, status: 1, createdAt: -1 });
jobSchema.index({
    title: "text",
    location: "text",
    skills: "text",
});

module.exports = mongoose.model("Job", jobSchema);
