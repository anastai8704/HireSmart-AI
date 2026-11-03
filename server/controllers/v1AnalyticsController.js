const mongoose = require("mongoose");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { CandidateMatch } = require("../models/Recruitment");
const AIAnalysis = require("../models/AIAnalysis");
const asyncHandler = require("../middleware/asyncHandler");
exports.recruiter = asyncHandler(async (req, res) => {
  const organization = mongoose.Types.ObjectId.createFromHexString(req.auth.organizationId);
  const since = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 90 * 86400000);
  const match = { organization, createdAt: { $gte: since } };
  const [jobs, funnel, timeToStage, matches, sourcePerformance, jobPerformance] = await Promise.all(
    [
      Job.countDocuments({ organization }),
      Application.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Application.aggregate([
        { $match: match },
        { $unwind: "$statusHistory" },
        {
          $group: {
            _id: "$statusHistory.status",
            averageHoursFromApplication: {
              $avg: {
                $divide: [{ $subtract: ["$statusHistory.changedAt", "$appliedAt"] }, 3600000],
              },
            },
          },
        },
      ]),
      CandidateMatch.aggregate([
        { $match: { organization, createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            averageAIScore: { $avg: "$overallScore" },
            scoresGenerated: { $sum: 1 },
          },
        },
      ]),
      Application.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$source",
            applications: { $sum: 1 },
            hires: { $sum: { $cond: [{ $in: ["$status", ["hired", "Selected"]] }, 1, 0] } },
          },
        },
      ]),
      Application.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$job",
            applications: { $sum: 1 },
            shortlisted: {
              $sum: { $cond: [{ $in: ["$status", ["shortlisted", "Shortlisted"]] }, 1, 0] },
            },
            interviews: {
              $sum: { $cond: [{ $in: ["$status", ["interview", "Interview"]] }, 1, 0] },
            },
            hires: { $sum: { $cond: [{ $in: ["$status", ["hired", "Selected"]] }, 1, 0] } },
          },
        },
        { $sort: { applications: -1 } },
        { $limit: 50 },
      ]),
    ],
  );
  const counts = Object.fromEntries(funnel.map((x) => [x._id, x.count]));
  const total = funnel.reduce((sum, x) => sum + x.count, 0);
  res.json({
    data: {
      period: { from: since, to: new Date() },
      jobs,
      applications: total,
      funnel: counts,
      rates: {
        shortlist: total ? (counts.shortlisted || counts.Shortlisted || 0) / total : 0,
        interview: total ? (counts.interview || counts.Interview || 0) / total : 0,
        hired: total ? (counts.hired || counts.Selected || 0) / total : 0,
      },
      timeToStage,
      sourcePerformance,
      jobPerformance,
      ai: matches[0] || { averageAIScore: 0, scoresGenerated: 0 },
      note: "AI scores are decision-support signals and are reported separately from human outcomes.",
    },
  });
});
exports.aiUsage = asyncHandler(async (req, res) => {
  const data = await AIAnalysis.aggregate([
    {
      $match: {
        organization: mongoose.Types.ObjectId.createFromHexString(req.auth.organizationId),
      },
    },
    {
      $group: {
        _id: { feature: "$feature", provider: "$provider", model: "$model" },
        runs: { $sum: 1 },
        inputTokens: { $sum: "$usage.inputTokens" },
        outputTokens: { $sum: "$usage.outputTokens" },
        averageLatencyMs: { $avg: "$usage.latencyMs" },
        fallbacks: { $sum: { $cond: ["$fallbackUsed", 1, 0] } },
      },
    },
  ]);
  res.json({ data });
});
