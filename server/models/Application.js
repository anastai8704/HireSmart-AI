const mongoose = require("mongoose");
const { applicationStatuses } = require("../constants/enums");

const statusHistorySchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: applicationStatuses,
            required: true,
        },
        changedAt: {
            type: Date,
            default: Date.now,
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        note: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: "",
        },
    },
    { _id: false }
);

const applicationSchema = new mongoose.Schema(
    {
        job: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Job",
            required: true,
            index: true,
        },
        candidate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: applicationStatuses,
            default: "Applied",
            index: true,
        },
        appliedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        resumeSnapshot: {
            storageKey: {
                type: String,
                required: true,
                select: false,
            },
            provider: {
                type: String,
                enum: ["local", "s3"],
                required: true,
                default: "local",
            },
            originalName: {
                type: String,
                required: true,
            },
            mimeType: {
                type: String,
                required: true,
            },
            size: {
                type: Number,
                required: true,
            },
            text: {
                type: String,
                default: "",
            },
        },
        recruiterNotes: {
            type: String,
            trim: true,
            maxlength: 5000,
            default: "",
        },
        statusHistory: {
            type: [statusHistorySchema],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

applicationSchema.index({ job: 1, candidate: 1 }, { unique: true });
applicationSchema.index({ job: 1, status: 1, appliedAt: -1 });
applicationSchema.index({ candidate: 1, appliedAt: -1 });

module.exports = {
    Application: mongoose.model("Application", applicationSchema),
    applicationStatuses,
};
