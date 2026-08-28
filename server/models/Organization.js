const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
    slug: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    industry: { type: String, trim: true, maxlength: 100, default: "" },
    size: { type: String, enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+", "unknown"], default: "unknown" },
    website: { type: String, trim: true, maxlength: 2048, default: "" },
    logo: { type: String, trim: true, maxlength: 2048, default: "" },
    about: { type: String, trim: true, maxlength: 2000, default: "" },
    timezone: { type: String, trim: true, maxlength: 100, default: "UTC" },
    status: { type: String, enum: ["active", "suspended", "archived"], default: "active", index: true },
    settings: {
        requireJobApproval: { type: Boolean, default: false },
        aiEnabled: { type: Boolean, default: true },
        retentionDays: { type: Number, min: 30, max: 3650, default: 730 },
    },
}, { timestamps: true, optimisticConcurrency: true });
organizationSchema.index({ slug: 1 }, { unique: true });
module.exports = mongoose.model("Organization", organizationSchema);
