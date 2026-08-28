const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const JobAlert = require("../models/JobAlert");
const { runAlertScan } = require("../services/alertScanService");

const alertDto = (a) => ({ id: a._id, name: a.name, query: a.query, location: a.location, workplaceMode: a.workplaceMode, jobType: a.jobType, minSalary: a.minSalary, maxExp: a.maxExp, skills: a.skills, industry: a.industry, cadence: a.cadence, active: a.active, lastRunAt: a.lastRunAt, createdAt: a.createdAt });

exports.list = asyncHandler(async (req, res) => { const items = await JobAlert.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50); res.json({ data: items.map(alertDto), meta: { count: items.length } }); });

exports.create = asyncHandler(async (req, res) => { const b = req.body; const alert = await JobAlert.create({ user: req.user._id, name: b.name, query: b.query, location: b.location, workplaceMode: b.workplaceMode, jobType: b.jobType, minSalary: b.minSalary, maxExp: b.maxExp, skills: b.skills, industry: b.industry, cadence: b.cadence || "weekly" }); res.status(201).json({ data: alertDto(alert) }); });

exports.update = asyncHandler(async (req, res) => {
    const alert = await JobAlert.findOne({ _id: req.params.alertId, user: req.user._id });
    if (!alert) throw new AppError("Alert not found", 404, "RESOURCE_NOT_FOUND");
    const allowed = ["name", "query", "location", "workplaceMode", "jobType", "minSalary", "maxExp", "skills", "industry", "cadence", "active"];
    for (const key of allowed) if (req.body[key] !== undefined) alert[key] = req.body[key];
    await alert.save();
    res.json({ data: alertDto(alert) });
});

exports.remove = asyncHandler(async (req, res) => { const deleted = await JobAlert.findOneAndDelete({ _id: req.params.alertId, user: req.user._id }); if (!deleted) throw new AppError("Alert not found", 404, "RESOURCE_NOT_FOUND"); res.status(204).send(); });

/** Manual scan trigger (used by tests and a future admin surface). */
exports.runScan = asyncHandler(async (req, res) => { const result = await runAlertScan(); res.json({ data: result }); });
