// Recent operations for the admin control center (Requirement 7). Five short lists, each newest first (upcoming
// interviews soonest first). Read-only. Platform administrators only; everyone else gets the same 404 as other
// admin routes. No candidate contact details are returned.
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const Interview = require("../models/Interview");
const { Placement } = require("../models/Placement");
const { PaymentTransaction } = require("../models/PaymentTransaction");

const LIMIT = 5;
const CLOSED_INTERVIEW = ["cancelled", "completed", "no_show"];

const requireAdmin = (req) => {
  if (req.auth?.platformRole !== "platform_admin") throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
};

exports.recentOperations = asyncHandler(async (req, res) => {
  requireAdmin(req);
  const now = new Date();

  const [companies, jobs, interviews, placements, payments] = await Promise.all([
    Organization.find({}).sort({ createdAt: -1 }).limit(LIMIT).select("name verificationStatus createdAt").lean(),
    Job.find({}).sort({ createdAt: -1 }).limit(LIMIT).select("title status organization createdAt").populate("organization", "name").lean(),
    Interview.find({ scheduledStart: { $gte: now }, status: { $nin: CLOSED_INTERVIEW } })
      .sort({ scheduledStart: 1 })
      .limit(LIMIT)
      .select("scheduledStart status job organization")
      .populate("job", "title")
      .populate("organization", "name")
      .lean(),
    Placement.find({ employmentStatusUpdatedAt: { $ne: null } })
      .sort({ employmentStatusUpdatedAt: -1 })
      .limit(LIMIT)
      .select("employment status employmentStatusSource employmentStatusUpdatedAt job organization")
      .populate("job", "title")
      .populate("organization", "name")
      .lean(),
    PaymentTransaction.find({ status: { $in: ["captured", "refunded"] }, gateway: "razorpay" })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .select("transactionNumber amount currency planTier mode status createdAt subscriberType")
      .lean(),
  ]);

  res.json({
    data: {
      generatedAt: now,
      companies: companies.map((c) => ({ id: String(c._id), name: c.name, verificationStatus: c.verificationStatus, createdAt: c.createdAt })),
      jobPostings: jobs.map((j) => ({
        id: String(j._id),
        title: j.title,
        status: j.status,
        organizationName: j.organization?.name || "",
        createdAt: j.createdAt,
      })),
      upcomingInterviews: interviews.map((i) => ({
        id: String(i._id),
        scheduledStart: i.scheduledStart,
        status: i.status,
        jobTitle: i.job?.title || "",
        organizationName: i.organization?.name || "",
      })),
      placementUpdates: placements.map((p) => ({
        id: String(p._id),
        employmentStatus: p.employment?.status || "",
        source: p.employmentStatusSource || "",
        updatedAt: p.employmentStatusUpdatedAt,
        jobTitle: p.job?.title || "",
        organizationName: p.organization?.name || "",
      })),
      payments: payments.map((t) => ({
        id: String(t._id),
        transactionNumber: t.transactionNumber,
        amount: t.amount,
        currency: t.currency || "INR",
        planTier: t.planTier,
        mode: t.mode || "",
        status: t.status,
        createdAt: t.createdAt,
      })),
    },
  });
});
