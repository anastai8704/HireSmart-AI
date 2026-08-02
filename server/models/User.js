const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 254,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        role: {
            type: String,
            enum: ["candidate", "recruiter", "admin"],
            default: "candidate",
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        phone: {
            type: String,
            default: "",
            trim: true,
            maxlength: 30,
        },
        profileImage: {
            type: String,
            default: "",
            trim: true,
            maxlength: 2048,
        },
        headline: {
            type: String,
            default: "",
            trim: true,
            maxlength: 160,
        },
        location: {
            type: String,
            default: "",
            trim: true,
            maxlength: 150,
        },
        bio: {
            type: String,
            default: "",
            trim: true,
            maxlength: 2000,
        },
        skills: {
            type: [String],
            default: [],
        },
        companyName: {
            type: String,
            default: "",
            trim: true,
            maxlength: 150,
        },
        companyWebsite: {
            type: String,
            default: "",
            trim: true,
            maxlength: 2048,
        },
        companyDescription: {
            type: String,
            default: "",
            trim: true,
            maxlength: 2000,
        },
        savedJobs: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Job",
            },
        ],
        resume: {
            type: String,
            default: "",
        },
        resumeOriginalName: {
            type: String,
            default: "",
        },
        resumeMimeType: {
            type: String,
            default: "",
        },
        resumeSize: {
            type: Number,
            default: 0,
        },
        resumeUploadedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

userSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
