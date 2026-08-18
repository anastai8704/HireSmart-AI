const mongoose = require("mongoose");
const JobRun = require("../models/JobRun");
const asyncHandler = require("../middleware/asyncHandler");
exports.live = (req, res) => res.json({ data: { status: "ok", uptimeSeconds: Math.floor(process.uptime()) } });
exports.ready = asyncHandler(async (req, res) => {
    const mongoReady = mongoose.connection.readyState === 1; let jobStoreReady = false; let queue = { queued: null, staleProcessing: null };
    if (mongoReady) {
        const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
        const [queued, staleProcessing] = await Promise.all([JobRun.countDocuments({ status: "queued" }), JobRun.countDocuments({ status: "processing", lockedAt: { $lte: staleBefore } })]);
        queue = { queued, staleProcessing }; jobStoreReady = true;
    }
    const ready = mongoReady && jobStoreReady;
    res.status(ready ? 200 : 503).json({ data: { status: ready ? "ready" : "not_ready", checks: { mongodb: mongoReady ? "up" : "down", jobStore: jobStoreReady ? "up" : "down" }, queue } });
});
