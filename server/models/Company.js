const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 150,
        },

        logo: {
            type: String,
            default: "",
        },

        website: {
            type: String,
            trim: true,
            default: "",
        },

        industry: {
            type: String,
            trim: true,
            default: "",
        },

        companySize: {
            type: String,
            enum: [
                "1-10",
                "11-50",
                "51-200",
                "201-500",
                "501-1000",
                "1000+",
            ],
            default: "1-10",
        },

        headquarters: {
            type: String,
            trim: true,
            default: "",
        },

        description: {
            type: String,
            trim: true,
            maxlength: 5000,
            default: "",
        },

        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

companySchema.index({ name: "text" });

module.exports = mongoose.model("Company", companySchema);