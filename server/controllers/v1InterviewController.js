const Interview = require("../models/Interview");
const { Application } = require("../models/Application");
const Job = require("../models/Job");
const { notify } = require("../services/notificationService");
const { Membership } = require("../models/Membership");
const { run } = require("../services/ai/orchestrator");
const { audit } = require("../services/auditService");
const { parse, applyCursor, meta } = require("../utils/pagination");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const idempotency = require("../services/idempotencyService");
const logger = require("../utils/logger");

const orgOwner = async (organizationId) =>
  (await Membership.findOne({
    organization: organizationId,
    role: "owner",
    status: "active",
  }).select("user"))?.user || null;
const restrictedRoles = new Set(["hiring_manager", "interviewer", "viewer"]);
const getOrgInterview = async (req) => {
  const value = await Interview.findOne({
    _id: req.params.interviewId,
    organization: req.auth.organizationId,
  }).populate({
    path: "application",
    select: "candidate job status appliedAt",
    populate: { path: "job", select: "hiringTeam title company" },
  });
  if (!value) throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  if (req.membership && restrictedRoles.has(req.membership.role)) {
    const assigned = value.application?.job?.hiringTeam?.some(
      (id) => String(id) === String(req.membership._id),
    );
    const participant = value.participants?.some((id) => String(id) === String(req.user._id));
    if (!assigned && !participant)
      throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  }
  return value;
};
exports.create = asyncHandler(async (req, res) => {
  const idem = await idempotency.begin({
    req,
    scope: `interview.create:${req.body.applicationId}`,
  });
  if (idem.replay) return res.status(idem.replay.statusCode).json(idem.replay.response);
  const application = await Application.findOne({
    _id: req.body.applicationId,
    organization: req.auth.organizationId,
  })
    .populate("candidate", "email name")
    .populate("job", "title company");
  if (!application) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  if (
    req.body.scheduledEnd &&
    req.body.scheduledStart &&
    new Date(req.body.scheduledEnd) <= new Date(req.body.scheduledStart)
  )
    throw new AppError("scheduledEnd must be after scheduledStart", 422, "INVALID_SCHEDULE");
  const interview = await Interview.create({
    organization: req.auth.organizationId,
    application: application._id,
    createdBy: req.user._id,
    ...req.body,
    status: req.body.scheduledStart ? "invited" : "draft",
  });
  if (interview.status === "invited") {
    try {
      await notify({
        user: application.candidate._id,
        organization: req.auth.organizationId,
        type: "interview_invitation",
        category: "interviews",
        title: `Interview invitation: ${application.job?.title || "role"}`,
        message: `An interview is proposed for ${interview.scheduledStart.toISOString()}.`,
        resourceType: "interview",
        resourceId: interview._id,
        email: application.candidate.email,
        recipientName: application.candidate.name,
        emailContext: {
          jobTitle: application.job?.title || "",
          company: application.job?.company,
          scheduledStart: interview.scheduledStart,
          timezone: interview.timezone,
          type: interview.type,
          location: interview.location,
          interviewId: interview._id,
        },
        idempotencyKey: `interview:${interview._id}:invite`,
      });
    } catch (error) {
      logger.error(
        `Interview ${interview._id} notification enqueue failed: ${error.code || error.name}`,
      );
    }
  }
  await audit({
    req,
    organization: req.auth.organizationId,
    action: "interview.created",
    resourceType: "interview",
    resourceId: interview._id,
  });
  const response = { data: interview };
  await idempotency.complete({
    req,
    scope: `interview.create:${req.body.applicationId}`,
    ...idem,
    statusCode: 201,
    response,
  });
  res.status(201).json(response);
});
exports.list = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const filter = applyCursor({ organization: req.auth.organizationId }, page.after);
  if (req.membership && restrictedRoles.has(req.membership.role)) {
    const jobIds = await Job.find({
      organization: req.auth.organizationId,
      hiringTeam: req.membership._id,
    }).distinct("_id");
    const applicationIds = await Application.find({
      organization: req.auth.organizationId,
      job: { $in: jobIds },
    }).distinct("_id");
    filter.$or = [{ application: { $in: applicationIds } }, { participants: req.user._id }];
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.applicationId) filter.application = req.query.applicationId;
  const items = await Interview.find(filter)
    .populate({
      path: "application",
      select: "candidate job status appliedAt",
      populate: { path: "job", select: "title company" },
    })
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});
exports.update = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  if (["cancelled", "completed"].includes(interview.status))
    throw new AppError(
      "Completed or cancelled interviews cannot be rescheduled",
      409,
      "INVALID_STATE",
    );
  for (const key of [
    "scheduledStart",
    "scheduledEnd",
    "timezone",
    "location",
    "meetingUrl",
    "participants",
    "title",
    "type",
  ])
    if (req.body[key] !== undefined) interview[key] = req.body[key];
  const rescheduled = Boolean(req.body.scheduledStart);
  if (rescheduled) interview.status = "invited";
  await interview.save();
  if (rescheduled && interview.application) {
    try {
      const candidate = await require("../models/User").findById(
        interview.application.candidate,
      ).select("email name");
      await notify({
        user: interview.application.candidate,
        organization: interview.organization,
        type: "interview_rescheduled",
        category: "interviews",
        title: `Interview rescheduled: ${interview.title || "role"}`,
        message: `Your interview was rescheduled to ${interview.scheduledStart.toISOString()}. Please confirm the new time.`,
        resourceType: "interview",
        resourceId: interview._id,
        email: candidate?.email,
        recipientName: candidate?.name,
        emailContext: {
          jobTitle: interview.application?.job?.title || "",
          company: interview.application?.job?.company,
          scheduledStart: interview.scheduledStart,
          timezone: interview.timezone,
          type: interview.type,
          location: interview.location,
          interviewId: interview._id,
        },
        idempotencyKey: `interview:${interview._id}:rescheduled:${interview.updatedAt.getTime()}`,
      });
    } catch (error) {
      logger.error(`Interview reschedule notification failed: ${error.message}`);
    }
  }
  res.json({ data: interview });
});
exports.cancel = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  if (interview.status === "completed")
    throw new AppError("Completed interview cannot be cancelled", 409, "INVALID_STATE");
  interview.status = "cancelled";
  interview.cancelledReason = req.body.reason;
  await interview.save();
  if (interview.application) {
    try {
      const candidate = await require("../models/User").findById(
        interview.application.candidate,
      ).select("email name");
      await notify({
        user: interview.application.candidate,
        organization: interview.organization,
        type: "interview_cancelled",
        category: "interviews",
        title: `Interview cancelled: ${interview.title || "role"}`,
        message: `Your interview was cancelled${
          req.body.reason ? `: ${req.body.reason}` : ""
        }.`,
        resourceType: "interview",
        resourceId: interview._id,
        email: candidate?.email,
        recipientName: candidate?.name,
        emailContext: {
          jobTitle: interview.application?.job?.title || "",
          company: interview.application?.job?.company,
          scheduledStart: interview.scheduledStart,
          timezone: interview.timezone,
          type: interview.type,
          location: interview.location,
          reason: req.body.reason || "",
          interviewId: interview._id,
        },
        idempotencyKey: `interview:${interview._id}:cancelled`,
      });
    } catch (error) {
      logger.error(`Interview cancel notification failed: ${error.message}`);
    }
  }
  res.json({ data: interview });
});
exports.complete = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  if (!interview.scheduledStart || interview.scheduledStart > new Date())
    throw new AppError(
      "A future or unscheduled interview cannot be completed",
      409,
      "INVALID_STATE",
    );
  interview.status = "completed";
  await interview.save();
  res.json({ data: interview });
});
exports.listMine = asyncHandler(async (req, res) => {
  const applications = await Application.find({ candidate: req.user._id }).select("_id");
  const items = await Interview.find({ application: { $in: applications.map((item) => item._id) } })
    .populate({
      path: "application",
      select: "candidate job status appliedAt",
      populate: { path: "job", select: "title company" },
    })
    .sort({ scheduledStart: 1 });
  res.json({ data: items });
});
exports.confirm = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.interviewId).populate({
    path: "application",
    select: "candidate job",
    populate: { path: "job", select: "title company" },
  });
  if (!interview || String(interview.application?.candidate) !== String(req.user._id))
    throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  if (interview.status !== "invited")
    throw new AppError("Interview is not awaiting confirmation", 409, "INVALID_STATE");
  interview.status = "confirmed";
  interview.candidateConfirmedAt = new Date();
  await interview.save();
  try {
    const owner = await orgOwner(interview.organization);
    const ownerEmail = owner
      ? (await require("../models/User").findById(owner).select("email").lean())?.email || null
      : null;
    for (const userId of new Set([owner].filter(Boolean))) {
      await notify({
        user: userId,
        organization: interview.organization,
        type: "interview_confirmed",
        category: "interviews",
        title: `Interview confirmed: ${interview.application?.job?.title || "role"}`,
        message: `${req.user.name} confirmed the interview scheduled for ${
          interview.scheduledStart ? interview.scheduledStart.toISOString() : "TBD"
        }.`,
        resourceType: "interview",
        resourceId: interview._id,
        email: String(userId) === String(owner || "") ? ownerEmail : null,
        emailContext: {
          candidateName: req.user.name,
          jobTitle: interview.application?.job?.title || "",
          company: interview.application?.job?.company,
          scheduledStart: interview.scheduledStart,
          timezone: interview.timezone,
          organizationId: interview.organization,
          interviewId: interview._id,
        },
        idempotencyKey: `interview:${interview._id}:confirmed`,
      });
    }
  } catch (error) {
    logger.error(`Interview confirm notification failed: ${error.message}`);
  }
  res.json({ data: interview });
});
exports.rescheduleRequest = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.interviewId).populate({
    path: "application",
    select: "candidate",
  });
  if (!interview || String(interview.application?.candidate) !== String(req.user._id))
    throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  interview.status = "reschedule_requested";
  interview.cancelledReason = req.body.reason;
  await interview.save();
  try {
    const owner = await orgOwner(interview.organization);
    for (const userId of new Set([owner].filter(Boolean))) {
      await notify({
        user: userId,
        organization: interview.organization,
        type: "interview_reschedule_requested",
        category: "interviews",
        title: `Reschedule requested: ${interview.title || "interview"}`,
        message: `${req.user.name} requested a new interview time${
          req.body.reason ? `: ${req.body.reason}` : ""
        }.`,
        resourceType: "interview",
        resourceId: interview._id,
        idempotencyKey: `interview:${interview._id}:reschedule-requested`,
      });
    }
  } catch (error) {
    logger.error(`Reschedule request notification failed: ${error.message}`);
  }
  res.json({ data: interview });
});
exports.feedback = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  if (interview.feedback.some((f) => String(f.evaluator) === String(req.user._id)))
    throw new AppError("Feedback has already been submitted", 409, "FEEDBACK_EXISTS");
  interview.feedback.push({
    evaluator: req.user._id,
    ratings: req.body.ratings,
    recommendation: req.body.recommendation,
    summary: req.body.summary,
  });
  await interview.save();
  await audit({
    req,
    organization: req.auth.organizationId,
    action: "interview.feedback_submitted",
    resourceType: "interview",
    resourceId: interview._id,
  });
  res.status(201).json({ data: interview.feedback[interview.feedback.length - 1] });
});
exports.preparation = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.interviewId).populate({
    path: "application",
    select: "candidate job status",
    populate: {
      path: "job",
      select: "title description requiredSkills preferredSkills skills company",
    },
  });
  if (!interview || String(interview.application?.candidate) !== String(req.user._id))
    throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  const job = interview.application.job;
  const result = await run({
    feature: "interview_preparation",
    input: {
      title: job.title,
      description: job.description,
      requiredSkills: job.requiredSkills?.length ? job.requiredSkills : job.skills,
    },
    user: req.user._id,
    organization: interview.organization,
    subjectType: "interview",
    subjectId: interview._id,
  });
  res.json({ data: result });
});
exports.questions = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  const application = await Application.findById(interview.application._id);
  const job = await Job.findById(application.job);
  const result = await run({
    feature: "interview_questions",
    input: {
      title: job.title,
      description: job.description,
      skills: job.requiredSkills?.length ? job.requiredSkills : job.skills,
    },
    user: req.user._id,
    organization: req.auth.organizationId,
    subjectType: "interview",
    subjectId: interview._id,
  });
  res.json({ data: result });
});
