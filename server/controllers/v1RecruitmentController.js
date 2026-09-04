const Job = require("../models/Job");
const Organization = require("../models/Organization");
const SearchHistory = require("../models/SearchHistory");
const { buildPublicJobFilter } = require("../utils/jobFilters");
const User = require("../models/User");
const { Application } = require("../models/Application");
const { ResumeVersion, ParsedResume } = require("../models/Resume");
const { CandidateMatch, Note } = require("../models/Recruitment");
const Consent = require("../models/Consent");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { parse, applyCursor, meta } = require("../utils/pagination");
const { calculateHybridMatch } = require("../services/hybridMatchingService");
const { notify } = require("../services/notificationService");
const { audit } = require("../services/auditService");
const storageService = require("../services/storageService");
const idempotency = require("../services/idempotencyService");
const logger = require("../utils/logger");

const jobDto = (j) => {
  const comp =
    j.compensation && (j.compensation.min || j.compensation.max)
      ? j.compensation
      : j.salary
        ? { min: 0, max: j.salary, currency: "INR", period: "year" }
        : j.compensation;
  return {
    id: j._id,
    organizationId: j.organization,
    organization: j.organization
      ? {
          id: j.organization._id || j.organization,
          slug: j.organization.slug,
          name: j.organization.name,
        }
      : null,
    title: j.title,
    company: j.company,
    location: j.location,
    workplaceMode: j.workplaceMode,
    jobType: j.jobType,
    compensation: comp,
    salary: j.salary,
    experience: j.experience,
    minExpYears: j.minExpYears,
    maxExpYears: j.maxExpYears,
    educationRequired: j.educationRequired,
    benefits: j.benefits,
    industry: j.industry,
    description: j.description,
    requiredSkills: j.requiredSkills?.length ? j.requiredSkills : j.skills,
    preferredSkills: j.preferredSkills,
    status: j.status,
    closesAt: j.closesAt,
    version: j.version,
    moderation: j.moderation
      ? {
          status: j.moderation.status,
          reason: j.moderation.reason,
          reviewedAt: j.moderation.reviewedAt,
        }
      : { status: "none", reason: "", reviewedAt: null },
    publishedAt: j.publishedAt,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
};
const assignmentRestricted = new Set(["hiring_manager", "interviewer", "viewer"]);
const assertJobAssignment = (req, job) => {
  if (
    req.membership &&
    assignmentRestricted.has(req.membership.role) &&
    !(job.hiringTeam || []).some((id) => String(id) === String(req.membership._id))
  )
    throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
};
const getOrgJob = async (req, id) => {
  const job = await Job.findOne({ _id: id, organization: req.auth.organizationId });
  if (!job) throw new AppError("Job not found", 404, "RESOURCE_NOT_FOUND");
  assertJobAssignment(req, job);
  return job;
};
const assertApplicationAssignment = async (req, application) => {
  const job = application.job?.hiringTeam
    ? application.job
    : await Job.findOne({ _id: application.job, organization: req.auth.organizationId }).select(
        "hiringTeam",
      );
  if (!job) throw new AppError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  assertJobAssignment(req, job);
  return job;
};
const ensureApplicationAccess = async (req, applicationId) => {
  const application = await Application.findOne({
    _id: applicationId,
    organization: req.auth.organizationId,
  }).select("job");
  if (!application) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  await assertApplicationAssignment(req, application);
  return application;
};
const safeApplication = (application, { includeInternal = false } = {}) => {
  const value = application.toObject ? application.toObject() : { ...application };
  if (value.resumeSnapshot) {
    delete value.resumeSnapshot.storageKey;
    delete value.resumeSnapshot.text;
  }
  if (!includeInternal) delete value.recruiterNotes;
  return value;
};
exports.jobDto = jobDto;
exports.publicJobs = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const { filter: base, sort } = await buildPublicJobFilter(req.query);
  const filter = applyCursor(base, page.after);
  const items = await Job.find(filter)
    .populate("organization", "slug name")
    .sort(sort)
    .limit(page.limit);
  if (
    req.user &&
    req.user.role === "candidate" &&
    (req.query.query || req.query.location || req.query.skills)
  ) {
    SearchHistory.create({
      user: req.user._id,
      query: String(req.query.query || "").slice(0, 100),
      location: String(req.query.location || "").slice(0, 150),
      workplaceMode: String(req.query.workplaceMode || "").slice(0, 20),
      jobType: String(req.query.jobType || "").slice(0, 50),
      skills: String(req.query.skills || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10),
    }).catch(() => {});
  }
  res.json({ data: items.map(jobDto), meta: meta(items, page.limit) });
});
exports.publicJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({
    _id: req.params.jobId,
    status: "published",
    $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }],
  }).populate("organization", "slug name");
  if (!job) throw new AppError("Job not found", 404, "RESOURCE_NOT_FOUND");
  res.json({ data: jobDto(job) });
});
exports.relatedJobs = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.jobId, status: "published" });
  if (!job) throw new AppError("Job not found", 404, "RESOURCE_NOT_FOUND"); // Match on required AND preferred skills of the source job, so a role that
  // only shares a preferred skill still counts as related.
  const sourceSkills = job.requiredSkills?.length ? job.requiredSkills : job.skills;
  const skills = [...new Set([...(sourceSkills || []), ...(job.preferredSkills || [])])].slice(
    0,
    10,
  );
  const filter = {
    status: "published",
    _id: { $ne: job._id },
    $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }],
  };
  if (skills.length)
    filter.$and = [
      {
        $or: skills.map((s) => ({
          $or: [{ requiredSkills: s }, { preferredSkills: s }, { skills: s }],
        })),
      },
    ];
  const items = await Job.find(filter).limit(6);
  res.json({ data: items.map(jobDto), meta: { count: items.length } });
});
exports.createJob = asyncHandler(async (req, res) => {
  const payload = req.body;
  const requiredSkills = payload.requiredSkills || payload.skills;
  const org = await Organization.findById(req.auth.organizationId).select("industry");
  const job = await Job.create({
    organization: req.auth.organizationId,
    recruiter: req.user._id,
    title: payload.title,
    company: payload.company,
    location: payload.location,
    salary: payload.salary ?? payload.compensation?.min ?? 0,
    compensation: payload.compensation,
    experience: payload.experience,
    minExpYears: payload.minExpYears || 0,
    maxExpYears: payload.maxExpYears || 0,
    educationRequired: payload.educationRequired || "",
    benefits: Array.isArray(payload.benefits) ? payload.benefits.slice(0, 20) : [],
    industry: payload.industry || org?.industry || "",
    jobType: payload.jobType,
    workplaceMode: payload.workplaceMode,
    description: payload.description,
    skills: requiredSkills,
    requiredSkills,
    preferredSkills: payload.preferredSkills || [],
    closesAt: payload.closesAt || null,
    status: "draft",
    hiringTeam: req.membership ? [req.membership._id] : [],
  });
  await audit({
    req,
    organization: req.auth.organizationId,
    action: "job.created",
    resourceType: "job",
    resourceId: job._id,
  });
  res.status(201).json({ data: jobDto(job) });
});
exports.orgJobs = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const filter = applyCursor({ organization: req.auth.organizationId }, page.after);
  if (req.membership && assignmentRestricted.has(req.membership.role))
    filter.hiringTeam = req.membership._id;
  if (req.query.status) filter.status = req.query.status;
  const items = await Job.find(filter).sort({ _id: -1 }).limit(page.limit);
  res.json({ data: items.map(jobDto), meta: meta(items, page.limit) });
});
exports.assignedJobs = asyncHandler(async (req, res) => {
  const filter = { organization: req.auth.organizationId, hiringTeam: req.membership?._id };
  const items = await Job.find(filter).sort({ updatedAt: -1 }).limit(100);
  res.json({ data: items.map(jobDto), meta: { count: items.length } });
});
exports.setHiringTeam = asyncHandler(async (req, res) => {
  const { Membership } = require("../models/Membership");
  const count = await Membership.countDocuments({
    _id: { $in: req.body.memberIds },
    organization: req.auth.organizationId,
    status: "active",
  });
  if (count !== req.body.memberIds.length)
    throw new AppError("One or more hiring-team members are invalid", 422, "INVALID_MEMBERSHIP");
  const job = await getOrgJob(req, req.params.jobId);
  job.hiringTeam = req.body.memberIds;
  await job.save();
  res.json({ data: jobDto(job) });
});
exports.getOrgJob = asyncHandler(async (req, res) =>
  res.json({ data: jobDto(await getOrgJob(req, req.params.jobId)) }),
);
exports.updateJob = asyncHandler(async (req, res) => {
  const job = await getOrgJob(req, req.params.jobId);
  const versionedFields = [
    "title",
    "location",
    "experience",
    "description",
    "requiredSkills",
    "preferredSkills",
    "workplaceMode",
    "compensation",
    "minExpYears",
    "maxExpYears",
    "educationRequired",
    "benefits",
  ];
  if (job.status === "published" && versionedFields.some((field) => req.body[field] !== undefined))
    job.version += 1;
  const allowed = [
    "title",
    "company",
    "location",
    "salary",
    "compensation",
    "experience",
    "minExpYears",
    "maxExpYears",
    "educationRequired",
    "benefits",
    "industry",
    "jobType",
    "workplaceMode",
    "description",
    "requiredSkills",
    "preferredSkills",
    "closesAt",
  ];
  for (const key of allowed) if (req.body[key] !== undefined) job[key] = req.body[key];
  if (req.body.requiredSkills) job.skills = req.body.requiredSkills;
  if (
    job.status === "published" &&
    versionedFields.some((field) => req.body[field] !== undefined)
  ) {
    const org = await Organization.findById(req.auth.organizationId).select("settings");
    if (org?.settings?.requireJobApproval) job.moderation.status = "pending";
  }
  await job.save();
  await CandidateMatch.updateMany(
    { organization: req.auth.organizationId, job: job._id, status: "completed" },
    { status: "stale" },
  );
  res.json({ data: jobDto(job) });
});
exports.publish = asyncHandler(async (req, res) => {
  const job = await getOrgJob(req, req.params.jobId);
  if (!job.description || !(job.requiredSkills?.length || job.skills?.length))
    throw new AppError(
      "A description and required skills are needed to publish",
      409,
      "JOB_INCOMPLETE",
    );
  const org = await Organization.findById(req.auth.organizationId).select("settings");
  job.status = "published";
  job.publishedAt = job.publishedAt || new Date();
  if (org?.settings?.requireJobApproval) {
    job.moderation.status = "pending";
    job.moderation.reviewedAt = null;
    job.moderation.reason = "";
  } else {
    job.moderation.status = "none";
  }
  await job.save();
  await audit({
    req,
    organization: req.auth.organizationId,
    action: "job.published",
    resourceType: "job",
    resourceId: job._id,
    metadata: { moderation: job.moderation.status },
  });
  res.json({ data: jobDto(job) });
});
exports.close = asyncHandler(async (req, res) => {
  const job = await getOrgJob(req, req.params.jobId);
  job.status = "closed";
  await job.save();
  res.json({ data: jobDto(job) });
});
exports.apply = asyncHandler(async (req, res) => {
  const idem = await idempotency.begin({ req, scope: `application.create:${req.params.jobId}` });
  if (idem.replay) return res.status(idem.replay.statusCode).json(idem.replay.response);
  const job = await Job.findOne({
    _id: req.params.jobId,
    status: "published",
    $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }],
  });
  if (!job) throw new AppError("Job is not accepting applications", 404, "RESOURCE_NOT_FOUND");
  const resume = await ResumeVersion.findOne({
    _id: req.body.resumeVersionId,
    candidate: req.user._id,
    processingStatus: "ready",
  }).select("+storageKey +text");
  if (!resume)
    throw new AppError(
      "A ready resume version owned by the candidate is required",
      422,
      "RESUME_NOT_READY",
    );
  if (await Application.exists({ job: job._id, candidate: req.user._id }))
    throw new AppError("An application already exists", 409, "APPLICATION_EXISTS");
  const application = await Application.create({
    organization: job.organization,
    job: job._id,
    jobVersion: job.version,
    jobSnapshot: {
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      requiredSkills: job.requiredSkills?.length ? job.requiredSkills : job.skills,
      preferredSkills: job.preferredSkills || [],
      experience: job.experience,
      workplaceMode: job.workplaceMode,
    },
    candidate: req.user._id,
    resumeVersion: resume._id,
    source: req.body.source || "direct",
    screeningAnswers: req.body.screeningAnswers || [],
    status: "submitted",
    resumeSnapshot: {
      storageKey: resume.storageKey,
      provider: resume.storageProvider,
      originalName: resume.originalName,
      mimeType: resume.mimeType,
      size: resume.size,
      text: resume.text,
    },
    statusHistory: [
      { status: "submitted", changedBy: req.user._id, note: "Application submitted" },
    ],
  });
  try {
    await notify({
      user: req.user._id,
      organization: job.organization,
      type: "application_acknowledged",
      title: "Application received",
      message: `Your application for ${job.title} was received.`,
      resourceType: "application",
      resourceId: application._id,
      email: req.user.email,
      idempotencyKey: `application:${application._id}:ack`,
    });
  } catch (error) {
    logger.error(
      `Application ${application._id} notification enqueue failed: ${error.code || error.name}`,
    );
  }
  await audit({
    req,
    organization: job.organization,
    action: "application.submitted",
    resourceType: "application",
    resourceId: application._id,
  });
  const response = {
    data: {
      id: application._id,
      jobId: application.job,
      resumeVersionId: application.resumeVersion,
      status: application.status,
      appliedAt: application.appliedAt,
    },
  };
  await idempotency.complete({
    req,
    scope: `application.create:${req.params.jobId}`,
    ...idem,
    statusCode: 201,
    response,
  });
  res.status(201).json(response);
});
exports.myApplications = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const filter = applyCursor({ candidate: req.user._id }, page.after);
  if (req.query.status) filter.status = req.query.status;
  const items = await Application.find(filter)
    .select("-resumeSnapshot.text -resumeSnapshot.storageKey -recruiterNotes")
    .populate("job", "title company location status")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});
exports.myApplication = asyncHandler(async (req, res) => {
  const item = await Application.findOne({
    _id: req.params.applicationId,
    candidate: req.user._id,
  }).populate("job", "title company location status");
  if (!item) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  const safe = item.toObject();
  safe.recruiterNotes = undefined;
  safe.statusHistory = safe.statusHistory.map(({ status, changedAt }) => ({ status, changedAt }));
  safe.resumeSnapshot = undefined;
  res.json({ data: safe });
});
exports.withdraw = asyncHandler(async (req, res) => {
  const app = await Application.findOne({ _id: req.params.applicationId, candidate: req.user._id });
  if (!app) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  if (["rejected", "hired", "withdrawn", "closed"].includes(app.status))
    throw new AppError(
      "Application cannot be withdrawn from its current state",
      409,
      "INVALID_TRANSITION",
    );
  const from = app.status;
  app.status = "withdrawn";
  app.withdrawnAt = new Date();
  app.statusHistory.push({
    status: "withdrawn",
    changedBy: req.user._id,
    note: req.body.reason || "Candidate withdrew",
  });
  await app.save();
  await audit({
    req,
    organization: app.organization,
    action: "application.withdrawn",
    resourceType: "application",
    resourceId: app._id,
    metadata: { from },
  });
  res.json({ data: safeApplication(app) });
});
exports.applications = asyncHandler(async (req, res) => {
  const job = await getOrgJob(req, req.params.jobId);
  const page = parse(req.query);
  const filter = applyCursor({ organization: req.auth.organizationId, job: job._id }, page.after);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.tag) filter.tags = req.query.tag;
  const items = await Application.find(filter)
    .select("-resumeSnapshot.text -resumeSnapshot.storageKey")
    .populate("candidate", "name email headline location skills")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});
const transitions = {
  submitted: ["under_review", "shortlisted", "rejected"],
  under_review: ["shortlisted", "interview", "rejected"],
  shortlisted: ["interview", "rejected"],
  interview: ["offer", "rejected"],
  offer: ["hired", "rejected"],
  Applied: ["under_review", "shortlisted", "rejected"],
};
exports.transition = asyncHandler(async (req, res) => {
  const app = await Application.findOne({
    _id: req.params.applicationId,
    organization: req.auth.organizationId,
  })
    .populate("candidate", "email name")
    .populate("job", "title hiringTeam");
  if (!app) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  await assertApplicationAssignment(req, app);
  if (!(transitions[app.status] || []).includes(req.body.toStatus))
    throw new AppError(
      `Cannot transition from ${app.status} to ${req.body.toStatus}`,
      409,
      "INVALID_TRANSITION",
    );
  const from = app.status;
  app.status = req.body.toStatus;
  app.statusHistory.push({
    status: req.body.toStatus,
    changedBy: req.user._id,
    note: req.body.note || req.body.reasonCode || "",
  });
  await app.save();
  try {
    await notify({
      user: app.candidate._id,
      organization: app.organization,
      type: "application_status_changed",
      title: "Application update",
      message: `Your application for ${app.job?.title || "a role"} moved to ${req.body.toStatus}.`,
      resourceType: "application",
      resourceId: app._id,
      email: app.candidate.email,
      idempotencyKey: `application:${app._id}:status:${app.status}:${app.statusHistory.length}`,
    });
  } catch (error) {
    logger.error(
      `Application ${app._id} status notification enqueue failed: ${error.code || error.name}`,
    );
  }
  await audit({
    req,
    organization: app.organization,
    action: "application.status_changed",
    resourceType: "application",
    resourceId: app._id,
    metadata: { from, to: app.status },
  });
  res.json({ data: safeApplication(app, { includeInternal: true }) });
});
exports.shortlist = asyncHandler(async (req, res) => {
  req.body.toStatus = "shortlisted";
  return exports.transition(req, res, (e) => {
    throw e;
  });
});
exports.match = asyncHandler(async (req, res) => {
  const app = await Application.findOne({
    _id: req.params.applicationId,
    organization: req.auth.organizationId,
  })
    .populate("job")
    .populate("candidate", "skills");
  if (!app) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  await assertApplicationAssignment(req, app);
  const version = app.resumeVersion
    ? await ResumeVersion.findById(app.resumeVersion).select("+text")
    : null;
  const allowExternalEmbeddings = Boolean(
    await Consent.exists({ user: app.candidate._id, purpose: "ai_processing", revokedAt: null }),
  );
  const parsed = version
    ? await ParsedResume.findOne({ resumeVersion: version._id }).select("skills")
    : null;
  const versionSkills =
    parsed?.skills?.map((item) => item.normalized || item.name) || app.candidate?.skills || [];
  const result = await calculateHybridMatch({
    resumeText: version?.text || app.resumeSnapshot?.text || "",
    candidateSkills: versionSkills,
    job: app.job,
    allowExternalEmbeddings,
  });
  const saved = await CandidateMatch.findOneAndUpdate(
    { application: app._id, scorePolicyVersion: "hybrid-v1" },
    {
      organization: req.auth.organizationId,
      candidate: app.candidate._id,
      job: app.job._id,
      jobVersion: app.jobVersion || app.job.version || 1,
      resumeVersion: version?._id || null,
      ...result,
      modelMetadata: {
        scorePolicyVersion: "hybrid-v1",
        matchingWeights: require("../config/env").config.matchingWeights,
        generatedAt: new Date(),
      },
      status: "completed",
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );
  res.json({ data: saved });
});
exports.ranking = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  await getOrgJob(req, req.params.jobId);
  const filter = applyCursor(
    { organization: req.auth.organizationId, job: req.params.jobId, status: "completed" },
    page.after,
  );
  if (req.query.minScore) filter.overallScore = { $gte: Number(req.query.minScore) };
  const items = await CandidateMatch.find(filter)
    .populate("candidate", "name headline location skills")
    .sort({ overallScore: -1, _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});
exports.notes = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  await ensureApplicationAccess(req, req.params.applicationId);
  const items = await Note.find(
    applyCursor(
      {
        organization: req.auth.organizationId,
        targetType: "application",
        targetId: req.params.applicationId,
        archivedAt: null,
      },
      page.after,
    ),
  )
    .populate("author", "name")
    .sort({ _id: -1 })
    .limit(page.limit);
  res.json({ data: items, meta: meta(items, page.limit) });
});
exports.addNote = asyncHandler(async (req, res) => {
  await ensureApplicationAccess(req, req.params.applicationId);
  const note = await Note.create({
    organization: req.auth.organizationId,
    targetType: "application",
    targetId: req.params.applicationId,
    author: req.user._id,
    body: req.body.body,
    visibility: req.body.visibility,
    tags: req.body.tags || [],
  });
  res.status(201).json({ data: note });
});
exports.applicationDetail = asyncHandler(async (req, res) => {
  const item = await Application.findOne({
    _id: req.params.applicationId,
    organization: req.auth.organizationId,
  })
    .populate("candidate", "name email phone headline location skills")
    .populate("job", "title company hiringTeam");
  if (!item) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  await assertApplicationAssignment(req, item);
  const match = await CandidateMatch.findOne({ application: item._id, status: "completed" });
  res.json({ data: { application: safeApplication(item, { includeInternal: true }), match } });
});
exports.updateTags = asyncHandler(async (req, res) => {
  await ensureApplicationAccess(req, req.params.applicationId);
  const item = await Application.findOneAndUpdate(
    { _id: req.params.applicationId, organization: req.auth.organizationId },
    { tags: [...new Set(req.body.tags.map((x) => x.toLowerCase().trim()))] },
    { returnDocument: "after", runValidators: true },
  );
  if (!item) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  res.json({ data: safeApplication(item, { includeInternal: true }) });
});
exports.contact = asyncHandler(async (req, res) => {
  await ensureApplicationAccess(req, req.params.applicationId);
  const item = await Application.findOne({
    _id: req.params.applicationId,
    organization: req.auth.organizationId,
  }).populate("candidate", "email name");
  if (!item) throw new AppError("Application not found", 404, "RESOURCE_NOT_FOUND");
  const sent = await notify({
    user: item.candidate._id,
    organization: req.auth.organizationId,
    type: "recruiter_message",
    title: req.body.subject,
    message: req.body.message,
    resourceType: "application",
    resourceId: item._id,
    email: item.candidate.email,
    idempotencyKey: req.get("idempotency-key") || `message:${item._id}:${Date.now()}`,
  });
  await audit({
    req,
    organization: req.auth.organizationId,
    action: "candidate.contacted",
    resourceType: "application",
    resourceId: item._id,
  });
  res.status(202).json({ data: sent });
});
exports.downloadSubmittedResume = asyncHandler(async (req, res, next) => {
  await ensureApplicationAccess(req, req.params.applicationId);
  const item = await Application.findOne({
    _id: req.params.applicationId,
    organization: req.auth.organizationId,
  }).populate({
    path: "resumeVersion",
    select: "+storageKey originalName mimeType storageProvider processingStatus",
  });
  if (!item?.resumeVersion)
    throw new AppError("Submitted resume is unavailable", 404, "RESOURCE_NOT_FOUND");
  const version = item.resumeVersion;
  const stream = await storageService.getFileStream(version.storageKey, version.storageProvider);
  await audit({
    req,
    organization: req.auth.organizationId,
    action: "resume.downloaded",
    resourceType: "application",
    resourceId: item._id,
  });
  res.setHeader("Content-Type", version.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(version.originalName)}`,
  );
  res.setHeader("Cache-Control", "private, no-store");
  stream.on("error", next);
  stream.pipe(res);
});
exports.compare = asyncHandler(async (req, res) => {
  const ids = req.body.applicationIds;
  const apps = await Application.find({
    _id: { $in: ids },
    organization: req.auth.organizationId,
  }).populate("candidate", "name headline skills");
  if (apps.length !== ids.length)
    throw new AppError("One or more applications were not found", 404, "RESOURCE_NOT_FOUND");
  for (const application of apps) await assertApplicationAssignment(req, application);
  const matches = await CandidateMatch.find({
    application: { $in: ids },
    organization: req.auth.organizationId,
    status: "completed",
  });
  const byApp = new Map(matches.map((m) => [String(m.application), m]));
  res.json({
    data: apps.map((a) => ({
      applicationId: a._id,
      candidate: a.candidate,
      status: a.status,
      match: byApp.get(String(a._id)) || null,
    })),
    meta: { warning: "Comparison supports human review; AI scores are not autonomous decisions." },
  });
});
exports.searchCandidates = asyncHandler(async (req, res) => {
  const page = parse(req.query);
  const appFilter = { organization: req.auth.organizationId };
  if (req.membership && assignmentRestricted.has(req.membership.role))
    appFilter.job = {
      $in: await Job.find({
        organization: req.auth.organizationId,
        hiringTeam: req.membership._id,
      }).distinct("_id"),
    };
  if (req.query.status) appFilter.status = req.query.status;
  if (req.query.tag) appFilter.tags = req.query.tag;
  if (req.query.jobId) {
    await getOrgJob(req, req.query.jobId);
    appFilter.job = req.query.jobId;
  }
  const applications = await Application.find(appFilter)
    .select("candidate job status tags")
    .limit(1000);
  let candidateIds = [...new Set(applications.map((a) => String(a.candidate)))];
  if (req.query.jobId && req.query.minFit) {
    const fitCandidates = await CandidateMatch.find({
      organization: req.auth.organizationId,
      job: req.query.jobId,
      overallScore: { $gte: Number(req.query.minFit) },
      status: "completed",
    }).distinct("candidate");
    const allowed = new Set(fitCandidates.map(String));
    candidateIds = candidateIds.filter((id) => allowed.has(id));
  }
  const userFilter = { _id: { $in: candidateIds } };
  if (req.query.location)
    userFilter.location = new RegExp(
      String(req.query.location).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  if (req.query.skill)
    userFilter.skills = new RegExp(
      String(req.query.skill).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  if (req.query.query) {
    const q = new RegExp(
      String(req.query.query)
        .slice(0, 100)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    userFilter.$or = [{ headline: q }, { skills: q }, { bio: q }];
  }
  const users = await User.find(userFilter)
    .select("name headline location skills")
    .sort({ _id: -1 })
    .limit(page.limit);
  const parsed = await ParsedResume.find({ candidate: { $in: users.map((u) => u._id) } }).select(
    "candidate experienceYears confidence",
  );
  const byCandidate = new Map(parsed.map((p) => [String(p.candidate), p]));
  const minYears = Number(req.query.minExperience || 0);
  const data = users
    .map((u) => ({
      candidate: u,
      applicationIds: applications
        .filter((application) => String(application.candidate) === String(u._id))
        .map((application) => application._id),
      experienceYears: byCandidate.get(String(u._id))?.experienceYears ?? null,
      evidenceConfidence: byCandidate.get(String(u._id))?.confidence ?? null,
    }))
    .filter((x) => !minYears || (x.experienceYears || 0) >= minYears);
  res.json({
    data,
    meta: {
      count: data.length,
      hasMore: users.length === page.limit,
      nextCursor: users.length === page.limit ? String(users[users.length - 1]._id) : null,
    },
  });
});
