const mongoose = require("mongoose");

const jobAlertSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, trim: true, maxlength: 100, default: "My job alert" },
    query: { type: String, trim: true, maxlength: 100, default: "" },
    location: { type: String, trim: true, maxlength: 150, default: "" },
    workplaceMode: { type: String, enum: ["", "onsite", "hybrid", "remote"], default: "" },
    jobType: { type: String, trim: true, maxlength: 50, default: "" },
    minSalary: { type: Number, min: 0, default: 0 },
    maxExp: { type: Number, min: 0, default: 0 },
    skills: { type: [String], default: [] },
    industry: { type: String, trim: true, maxlength: 100, default: "" },
    cadence: { type: String, enum: ["daily", "weekly"], default: "weekly" },
    active: { type: Boolean, default: true },
    lastRunAt: { type: Date, default: null },
    deliveredJobIds: { type: [String], default: [] },
}, { timestamps: true });

jobAlertSchema.index({ user: 1, active: 1 });

module.exports = mongoose.model("JobAlert", jobAlertSchema);
