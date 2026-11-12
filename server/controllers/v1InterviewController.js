const Interview = require("../models/Interview");
const { Application } = require("../models/Application");
const Job = require("../models/Job");
const User = require("../models/User");
const { notify } = require("../services/notificationService");
const { Membership } = require("../models/Membership");
const { run } = require("../services/ai/orchestrator");
const { audit } = require("../services/auditService");
const { parse, applyCursor, meta } = require("../utils/pagination");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const idempotency = require("../services/idempotencyService");
const logger = require("../utils/logger");
const pickDefined = require("../utils/pickDefined");
const Policy = require("../domain/interviewPolicy");const { formatIstDateTime } = require("../utils/istTime");

const Meeting = require("../services/interviewMeetingService");
const { candidateInterviewView } = require("../domain/interviewViews");

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
  })
    .populate({
      path: "application",
      select: "candidate job status appliedAt",
      populate: [
        { path: "job", select: "hiringTeam title company skills requiredSkills location workplaceMode" },
        { path: "candidate", select: "name email avatar" },
      ],
    })
    .populate("participants", "name email avatar")
    .populate("feedback.evaluator", "name email avatar");

  if (!value) throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");

  if (req.membership && restrictedRoles.has(req.membership.role)) {
    if (req.membership.role === "viewer") {
      throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
    }
    const assigned = value.application?.job?.hiringTeam?.some(
      (id) => String(id) === String(req.membership._id),
    );
    const participant = value.participants?.some((p) => {
      const pid = p?._id || p;
      return String(pid) === String(req.user._id);
    });
    if (!assigned && !participant) {
      throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
    }
  }
  return value;
};

const resolveParticipants = async (organizationId, participantIds) => {
  if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
    return [];
  }
  const memberships = await Membership.find({
    organization: organizationId,
    status: "active",
    $or: [{ _id: { $in: participantIds } }, { user: { $in: participantIds } }],
  }).select("user");
  return [...new Set(memberships.map((m) => String(m.user)))];
};

/** Emails of the candidate and the assigned interviewers, from real user records. Used only for Calendar attendees. */
const attendeeEmailsFor = async (interview) => {
  const ids = [interview.candidate || interview.application?.candidate?._id, ...(interview.participants || [])]
    .filter(Boolean)
    .map((id) => id._id || id);
  if (ids.length === 0) return [];
  const users = await User.find({ _id: { $in: ids } }).select("email").lean();
  return users.map((u) => u.email).filter(Boolean);
};

const stateError = (decision) => {
  const messages = {
    ALREADY_STARTED: "This interview has already started.",
    INTERVIEW_CANCELLED: "A cancelled interview cannot be started.",
    INTERVIEW_ENDED: "This interview has already ended.",
    NOT_SCHEDULED: "Schedule a date and time before starting the interview.",
    TOO_EARLY: "The interview can be started 15 minutes before its scheduled time.",
    START_WINDOW_CLOSED: "The start window for this interview has closed. Reschedule it to start.",
  };
  return new AppError(messages[decision.code] || "This interview cannot be started.", 409, decision.code);
};

const candidateView = (interview) => candidateInterviewView(interview);

// Fields a recruiter may set when scheduling. Ownership and workflow fields are set by the server only.
const INTERVIEW_WRITABLE_FIELDS = [
  "title",
  "type",
  "scheduledStart",
  "scheduledEnd",
  "timezone",
  "location",
  "meetingUrl",
];

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
    .populate("candidate", "email name avatar")
    .populate("job", "title company");
  if (!application) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");

  if (
    req.body.scheduledEnd &&
    req.body.scheduledStart &&
    new Date(req.body.scheduledEnd) <= new Date(req.body.scheduledStart)
  ) {
    throw new AppError("scheduledEnd must be after scheduledStart", 422, "INVALID_SCHEDULE");
  }

  // Job-first binding (Req 3): if the client names a job it must be the application's job. The stored job is always
  // taken from the application, never from the client.
  const binding = Policy.assertApplicationBelongsToJob({
    applicationJobId: application.job?._id || application.job,
    selectedJobId: req.body.jobId,
  });
  if (req.body.jobId && !binding.ok) {
    throw new AppError("This application does not belong to the selected job.", 422, binding.code);
  }
  if (req.body.scheduledStart) {
    const future = Policy.scheduleIsInFuture({ scheduledStart: req.body.scheduledStart });
    if (!future.ok) throw new AppError("An interview cannot be scheduled in the past.", 422, future.code);
  }

  let participants = [];
  if (req.body.participants) {
    participants = await resolveParticipants(req.auth.organizationId, req.body.participants);
  }

  const priorRounds = await Interview.countDocuments({ application: application._id, status: { $ne: "cancelled" } });
  const interview = new Interview({
    organization: req.auth.organizationId,
    application: application._id,
    job: application.job?._id || application.job,
    candidate: application.candidate?._id || application.candidate,
    round: priorRounds + 1,
    createdBy: req.user._id,
    ...pickDefined(req.body, INTERVIEW_WRITABLE_FIELDS),
    participants: participants.length > 0 ? participants : (req.body.participants || []),
    status: req.body.scheduledStart ? "invited" : "draft",
  });
  if (req.body.meetingUrl) {
    interview.meetingProvider = "manual";
    interview.meetingStatus = "manual";
  } else if (interview.scheduledStart) {
    await Meeting.ensureMeeting({
      interview,
      recruiterId: req.user._id,
      attendeeEmails: await attendeeEmailsFor(interview),
      title: req.body.title,
    });
  }
  await interview.save();

  if (interview.status === "invited") {
    try {
      await notify({
        user: application.candidate._id,
        organization: req.auth.organizationId,
        type: "interview_invitation",
        category: "interviews",
        title: `Interview invitation: ${application.job?.title || "role"}`,
        message: `An interview is proposed for ${formatIstDateTime(interview.scheduledStart)}.`,
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
    if (req.membership.role === "viewer") {
      return res.json({ data: [], meta: meta([], page.limit) });
    }
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
  if (req.query.jobId) filter.job = req.query.jobId;
  if (req.query.applicationId) filter.application = req.query.applicationId;
  if (req.query.type) filter.type = req.query.type;

  const items = await Interview.find(filter)
    .populate({
      path: "application",
      select: "candidate job status appliedAt",
      populate: [
        { path: "job", select: "title company skills requiredSkills location workplaceMode" },
        { path: "candidate", select: "name email avatar" },
      ],
    })
    .populate("participants", "name email avatar")
    .populate("feedback.evaluator", "name email avatar")
    .sort({ scheduledStart: 1, _id: -1 })
    .limit(page.limit);

  res.json({ data: items, meta: meta(items, page.limit) });
});

exports.get = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  res.json({ data: interview });
});

exports.update = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  if (["cancelled", "completed"].includes(interview.status)) {
    throw new AppError(
      "Completed or cancelled interviews cannot be rescheduled",
      409,
      "INVALID_STATE",
    );
  }

  const schedulingChanged = req.body.scheduledStart !== undefined || req.body.scheduledEnd !== undefined;
  if (interview.status === "in_progress" && schedulingChanged) {
    throw stateError({ code: "ALREADY_STARTED" });
  }
  if (req.body.scheduledStart) {
    const future = Policy.scheduleIsInFuture({ scheduledStart: req.body.scheduledStart });
    if (!future.ok) throw new AppError("An interview cannot be rescheduled to the past.", 422, future.code);
  }

  const nextStart = req.body.scheduledStart !== undefined ? req.body.scheduledStart : interview.scheduledStart;
  const nextEnd = req.body.scheduledEnd !== undefined ? req.body.scheduledEnd : interview.scheduledEnd;
  if (nextStart && nextEnd && new Date(nextEnd) <= new Date(nextStart)) {
    throw new AppError("scheduledEnd must be after scheduledStart", 422, "INVALID_SCHEDULE");
  }

  for (const key of [
    "scheduledStart",
    "scheduledEnd",
    "timezone",
    "location",
    "meetingUrl",
    "title",
    "type",
  ]) {
    if (req.body[key] !== undefined) interview[key] = req.body[key];
  }

  if (req.body.participants !== undefined) {
    interview.participants = await resolveParticipants(
      req.auth.organizationId,
      req.body.participants,
    );
  }

  if (req.body.meetingUrl !== undefined) {
    if (req.body.meetingUrl) {
      interview.meetingProvider = "manual";
      interview.meetingStatus = "manual";
    } else if (interview.meetingProvider === "manual") {
      interview.meetingProvider = "none";
      interview.meetingStatus = "none";
    }
  }

  const rescheduled = Boolean(req.body.scheduledStart);
  if (rescheduled) {
    interview.status = "invited";
    interview.candidateConfirmedAt = null;
    if (interview.meetingProvider !== "manual") {
      await Meeting.syncMeetingOnReschedule({
        interview,
        recruiterId: req.user._id,
        attendeeEmails: await attendeeEmailsFor(interview),
        title: interview.title,
      });
    }
  }
  await interview.save();

  await audit({
    req,
    organization: req.auth.organizationId,
    action: "interview.updated",
    resourceType: "interview",
    resourceId: interview._id,
  });

  if (rescheduled && interview.application) {
    try {
      const candidateId = interview.application.candidate?._id || interview.application.candidate;
      const candidate = await User.findById(candidateId).select("email name");
      await notify({
        user: candidateId,
        organization: interview.organization,
        type: "interview_rescheduled",
        category: "interviews",
        title: `Interview rescheduled: ${interview.title || "role"}`,
        message: `Your interview was rescheduled to ${formatIstDateTime(interview.scheduledStart)}. Please confirm the new time.`,
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
  if (interview.status === "completed") {
    throw new AppError("Completed interview cannot be cancelled", 409, "INVALID_STATE");
  }
  if (interview.googleEventId) {
    await Meeting.removeMeetingOnCancel({ interview, recruiterId: req.user._id });
  }
  interview.status = "cancelled";
  interview.cancelledReason = req.body.reason;
  await interview.save();

  await audit({
    req,
    organization: req.auth.organizationId,
    action: "interview.cancelled",
    resourceType: "interview",
    resourceId: interview._id,
    metadata: { reason: req.body.reason },
  });

  if (interview.application) {
    try {
      const candidateId = interview.application.candidate?._id || interview.application.candidate;
      const candidate = await User.findById(candidateId).select("email name");
      await notify({
        user: candidateId,
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
  if (!interview.scheduledStart || interview.scheduledStart > new Date()) {
    throw new AppError(
      "A future or unscheduled interview cannot be completed",
      409,
      "INVALID_STATE",
    );
  }
  if (interview.status === "cancelled") {
    throw new AppError("Cancelled interview cannot be completed", 409, "INVALID_STATE");
  }
  interview.status = "completed";
  await interview.save();

  await audit({
    req,
    organization: req.auth.organizationId,
    action: "interview.completed",
    resourceType: "interview",
    resourceId: interview._id,
  });

  res.json({ data: interview });
});

exports.listMine = asyncHandler(async (req, res) => {
  const applications = await Application.find({ candidate: req.user._id }).select("_id");
  const items = await Interview.find({ application: { $in: applications.map((item) => item._id) } })
    .populate({
      path: "application",
      select: "candidate job status appliedAt",
      populate: [
        { path: "job", select: "title company skills requiredSkills location workplaceMode" },
        { path: "candidate", select: "name email avatar" },
      ],
    })
    .populate("participants", "name email avatar")
    .sort({ scheduledStart: 1 });
  res.json({ data: items.map(candidateView) });
});

exports.getCandidateInterview = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.interviewId)
    .populate({
      path: "application",
      select: "candidate job status appliedAt",
      populate: [
        { path: "job", select: "title company skills requiredSkills location workplaceMode" },
        { path: "candidate", select: "name email avatar" },
      ],
    })
    .populate("participants", "name email avatar");

  if (
    !interview ||
    String(interview.application?.candidate?._id || interview.application?.candidate) !==
      String(req.user._id)
  ) {
    throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  }
  res.json({ data: candidateView(interview) });
});

exports.confirm = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.interviewId).populate({
    path: "application",
    select: "candidate job",
    populate: { path: "job", select: "title company" },
  });
  if (!interview || String(interview.application?.candidate?._id || interview.application?.candidate) !== String(req.user._id)) {
    throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  }
  if (interview.status !== "invited") {
    throw new AppError("Interview is not awaiting confirmation", 409, "INVALID_STATE");
  }
  interview.status = "confirmed";
  interview.candidateConfirmedAt = new Date();
  await interview.save();

  await audit({
    req,
    organization: interview.organization,
    action: "interview.confirmed",
    resourceType: "interview",
    resourceId: interview._id,
  });

  try {
    const owner = await orgOwner(interview.organization);
    const ownerEmail = owner
      ? (await User.findById(owner).select("email").lean())?.email || null
      : null;
    const recipientIds = new Set([owner, ...(interview.participants || [])].filter(Boolean));
    for (const userId of recipientIds) {
      await notify({
        user: userId,
        organization: interview.organization,
        type: "interview_confirmed",
        category: "interviews",
        title: `Interview confirmed: ${interview.application?.job?.title || "role"}`,
        message: `${req.user.name} confirmed the interview scheduled for ${
          interview.scheduledStart ? formatIstDateTime(interview.scheduledStart) : "TBD"
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
        idempotencyKey: `interview:${interview._id}:confirmed:${userId}`,
      });
    }
  } catch (error) {
    logger.error(`Interview confirm notification failed: ${error.message}`);
  }
  res.json({ data: candidateView(interview) });
});

exports.rescheduleRequest = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.interviewId).populate({
    path: "application",
    select: "candidate job",
    populate: { path: "job", select: "title company" },
  });
  if (!interview || String(interview.application?.candidate?._id || interview.application?.candidate) !== String(req.user._id)) {
    throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  }
  if (["completed", "cancelled"].includes(interview.status)) {
    throw new AppError("Completed or cancelled interviews cannot be rescheduled", 409, "INVALID_STATE");
  }
  interview.status = "reschedule_requested";
  interview.cancelledReason = req.body.reason;
  await interview.save();

  await audit({
    req,
    organization: interview.organization,
    action: "interview.reschedule_requested",
    resourceType: "interview",
    resourceId: interview._id,
    metadata: { reason: req.body.reason },
  });

  try {
    const owner = await orgOwner(interview.organization);
    const recipientIds = new Set([owner, ...(interview.participants || [])].filter(Boolean));
    for (const userId of recipientIds) {
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
        emailContext: {
          candidateName: req.user.name,
          jobTitle: interview.application?.job?.title || "",
          company: interview.application?.job?.company,
          reason: req.body.reason || "",
          organizationId: interview.organization,
          interviewId: interview._id,
        },
        idempotencyKey: `interview:${interview._id}:reschedule-requested:${userId}`,
      });
    }
  } catch (error) {
    logger.error(`Reschedule request notification failed: ${error.message}`);
  }
  res.json({ data: candidateView(interview) });
});

exports.feedback = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  if (interview.feedback.some((f) => String(f.evaluator?._id || f.evaluator) === String(req.user._id))) {
    throw new AppError("Feedback has already been submitted", 409, "FEEDBACK_EXISTS");
  }
  interview.feedback.push({
    evaluator: req.user._id,
    ratings: req.body.ratings,
    recommendation: req.body.recommendation,
    summary: req.body.summary,
    submittedAt: new Date(),
  });
  await interview.save();
  await audit({
    req,
    organization: req.auth.organizationId,
    action: "interview.feedback_submitted",
    resourceType: "interview",
    resourceId: interview._id,
    metadata: { recommendation: req.body.recommendation },
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
  if (!interview || String(interview.application?.candidate?._id || interview.application?.candidate) !== String(req.user._id)) {
    throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  }
  const job = interview.application?.job;
  if (!job) throw new AppError("Job details not found", 404, "RESOURCE_NOT_FOUND");

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
  if (!job) throw new AppError("Job details not found", 404, "RESOURCE_NOT_FOUND");

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

/**
 * Start the interview (Req 6). Only an authorised recruiter in the organisation, only a scheduled interview, and only
 * inside the start window. The candidate's Join action becomes available from this point.
 */
exports.start = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  const decision = Policy.canStartInterview({
    status: interview.status,
    scheduledStart: interview.scheduledStart,
    scheduledEnd: interview.scheduledEnd,
  });
  if (!decision.ok) throw stateError(decision);
  if (!interview.meetingUrl) {
    throw new AppError("Add a meeting link before starting. The candidate needs it to join.", 409, "MEETING_LINK_REQUIRED");
  }

  interview.status = "in_progress";
  interview.startedAt = new Date();
  await interview.save();

  await audit({
    req,
    organization: req.auth.organizationId,
    action: "interview.started",
    resourceType: "interview",
    resourceId: interview._id,
    metadata: { application: String(interview.application?._id || interview.application) },
  });

  const candidateId = interview.application?.candidate?._id || interview.candidate;
  if (candidateId) {
    try {
      await notify({
        user: candidateId,
        organization: interview.organization,
        type: "interview_started",
        category: "interviews",
        title: `Your interview has started: ${interview.title || "interview"}`,
        message: "Your recruiter has started the interview. You can join now from your interview page.",
        resourceType: "interview",
        resourceId: interview._id,
        idempotencyKey: `interview:${interview._id}:started:${interview.startedAt.getTime()}`,
      });
    } catch (error) {
      logger.error(`Interview start notification failed: ${error.message}`);
    }
  }
  res.json({ data: interview });
});

/** Candidate join (Req 6). Only the candidate on this application, and only once the recruiter has started it. */
exports.join = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.interviewId).populate({
    path: "application",
    select: "candidate job",
  });
  const candidateId = interview?.application?.candidate?._id || interview?.application?.candidate;
  if (!interview || String(candidateId) !== String(req.user._id)) {
    throw new AppError("Interview not found", 404, "RESOURCE_NOT_FOUND");
  }
  const state = Policy.candidateJoinState({
    status: interview.status,
    meetingUrl: interview.meetingUrl,
    scheduledStart: interview.scheduledStart,
  });
  if (!state.canJoin) throw new AppError(state.message, 409, `JOIN_${state.reason}`);

  await audit({
    req,
    organization: interview.organization,
    action: "interview.join_opened",
    resourceType: "interview",
    resourceId: interview._id,
  });
  res.json({ data: { url: interview.meetingUrl, joinState: state } });
});

/** Staff join link for the organisation's assigned interviewers and recruiters. Not blocked by the candidate rule. */
exports.staffJoin = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  if (interview.status === "cancelled") throw new AppError("This interview was cancelled.", 409, "JOIN_CANCELLED");
  if (!interview.meetingUrl) throw new AppError("No meeting link is set for this interview.", 409, "JOIN_MISSING_MEETING_URL");
  res.json({ data: { url: interview.meetingUrl, meetingProvider: interview.meetingProvider } });
});

/** Retries Meet creation for an interview whose conference is pending, failed or not yet set up. */
exports.retryMeeting = asyncHandler(async (req, res) => {
  const interview = await getOrgInterview(req);
  if (["cancelled", "completed", "no_show"].includes(interview.status)) {
    throw new AppError("Meeting links are not changed for a closed interview.", 409, "INVALID_STATE");
  }
  if (interview.meetingProvider === "manual") {
    throw new AppError("This interview uses a manual meeting link. Edit the link instead.", 409, "MANUAL_LINK_IN_USE");
  }
  if (interview.googleEventId) {
    await Meeting.refreshPendingMeeting({ interview, recruiterId: req.user._id });
  } else {
    await Meeting.ensureMeeting({
      interview,
      recruiterId: req.user._id,
      attendeeEmails: await attendeeEmailsFor(interview),
      title: interview.title,
    });
  }
  await interview.save();
  res.json({ data: interview });
});
