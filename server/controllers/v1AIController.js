const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { run } = require("../services/ai/orchestrator");
const Consent = require("../models/Consent");
const User = require("../models/User");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { CandidateMatch } = require("../models/Recruitment");
const { ParsedResume, ResumeVersion } = require("../models/Resume");

const features = new Set([
  "resume_extraction",
  "resume_rewrite",
  "resume_improvement",
  "jd_generation",
  "jd_parse",
  "jd_improvement",
  "interview_questions",
  "interview_preparation",
  "recruiter_copilot",
  "career_copilot",
  "nl_job_search",
  "job_explanation",
  "skill_gap_analysis",
  "recommendation_explanation",
  "candidate_summary",
  "candidate_match_explanation",
  "candidate_comparison",
]);

const recruiterOnly = new Set([
  "jd_generation",
  "jd_parse",
  "jd_improvement",
  "interview_questions",
  "recruiter_copilot",
  "candidate_summary",
  "candidate_match_explanation",
  "candidate_comparison",
]);

const candidateContext = async (userId) => {
  const user = await User.findById(userId).select("headline skills location").lean();
  const latest = await ResumeVersion.findOne({ candidate: userId, processingStatus: "ready" })
    .sort({ version: -1 })
    .select("_id")
    .lean();
  const parsed = latest
    ? await ParsedResume.findOne({ resumeVersion: latest._id })
        .select("skills experienceYears education experiences analysis confidence warnings")
        .lean()
    : null;
  return {
    headline: user?.headline || "",
    location: user?.location || "",
    declaredSkills: user?.skills || [],
    resumeEvidence: parsed
      ? {
          skills: parsed.skills,
          experienceYears: parsed.experienceYears,
          education: parsed.education,
          experiences: parsed.experiences,
          readiness: parsed.analysis?.atsScore,
          extractionConfidence: parsed.confidence,
          warnings: parsed.warnings,
        }
      : null,
  };
};

const recruiterContext = async (organizationId) => {
  if (!organizationId) return { jobs: [], applicationFunnel: {} };
  const [jobs, funnel] = await Promise.all([
    Job.find({ organization: organizationId })
      .select("title status requiredSkills preferredSkills workplaceMode updatedAt")
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean(),
    Application.aggregate([
      {
        $match: {
          organization: require("mongoose").Types.ObjectId.createFromHexString(
            String(organizationId),
          ),
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  return {
    jobs,
    applicationFunnel: Object.fromEntries(funnel.map((item) => [item._id, item.count])),
  };
};

exports.execute = asyncHandler(async (req, res) => {
  const { feature } = req.params;
  if (!features.has(feature)) {
    throw new AppError(`AI feature '${feature}' not found`, 404, "RESOURCE_NOT_FOUND");
  }

  if (recruiterOnly.has(feature) && !["recruiter", "admin"].includes(req.user.role)) {
    throw new AppError("This AI feature requires recruiter access", 403, "FORBIDDEN");
  }

  const allowExternal =
    req.user.role !== "candidate" ||
    Boolean(
      await Consent.exists({ user: req.user._id, purpose: "ai_processing", revokedAt: null }),
    );

  let input = { ...(req.body.input || {}) };

  // Context Enrichment based on Feature
  if (feature === "career_copilot" && !input.authorizedContext) {
    input.authorizedContext = await candidateContext(req.user._id);
  }

  if (feature === "recruiter_copilot" && !input.authorizedContext) {
    input.authorizedContext = await recruiterContext(req.auth?.organizationId);
  }

  if (feature === "job_explanation" && input.jobId) {
    const job = await Job.findById(input.jobId).select("title description requiredSkills preferredSkills skills company location").lean();
    if (job) {
      input.title = input.title || job.title;
      input.description = input.description || job.description;
      input.requiredSkills = input.requiredSkills || (job.requiredSkills?.length ? job.requiredSkills : job.skills);
      input.preferredSkills = input.preferredSkills || job.preferredSkills || [];
      input.company = input.company || job.company;
      input.location = input.location || job.location;
    }
  }

  if (feature === "skill_gap_analysis") {
    if (input.jobId && (!input.requiredSkills || !input.candidateSkills)) {
      const job = await Job.findById(input.jobId).select("title requiredSkills preferredSkills skills").lean();
      if (job) {
        input.jobTitle = input.jobTitle || job.title;
        input.requiredSkills = input.requiredSkills || (job.requiredSkills?.length ? job.requiredSkills : job.skills);
        input.preferredSkills = input.preferredSkills || job.preferredSkills || [];
      }
    }
    if (!input.candidateSkills) {
      const cand = await candidateContext(req.user._id);
      input.candidateSkills = cand.resumeEvidence?.skills?.map((s) => s.normalized || s.name) || cand.declaredSkills || [];
    }
  }

  if (feature === "recommendation_explanation" && input.jobId && !input.jobTitle) {
    const job = await Job.findById(input.jobId).select("title company requiredSkills skills").lean();
    if (job) {
      input.jobTitle = job.title;
      input.company = job.company;
      const cand = await candidateContext(req.user._id);
      const candSkills = new Set((cand.resumeEvidence?.skills?.map((s) => s.normalized || s.name) || cand.declaredSkills || []).map((s) => String(s).toLowerCase().trim()));
      const reqSkills = job.requiredSkills?.length ? job.requiredSkills : job.skills || [];
      input.matchedSkills = input.matchedSkills || reqSkills.filter((s) => candSkills.has(String(s).toLowerCase().trim()));
      input.missingSkills = input.missingSkills || reqSkills.filter((s) => !candSkills.has(String(s).toLowerCase().trim()));
    }
  }

  if (feature === "candidate_summary" && input.applicationId && req.auth?.organizationId) {
    const app = await Application.findOne({
      _id: input.applicationId,
      organization: req.auth.organizationId,
    })
      .populate("candidate", "name email headline location skills")
      .populate("job", "title requiredSkills skills")
      .lean();
    if (app) {
      input.candidateName = input.candidateName || app.candidate?.name;
      input.jobTitle = input.jobTitle || app.job?.title;
      const parsed = app.resumeVersion
        ? await ParsedResume.findOne({ resumeVersion: app.resumeVersion }).select("skills experienceYears education experiences").lean()
        : null;
      if (parsed) {
        input.skills = input.skills || parsed.skills?.map((s) => s.normalized || s.name) || app.candidate?.skills;
        input.experienceYears = input.experienceYears != null ? input.experienceYears : parsed.experienceYears;
        input.experiences = input.experiences || parsed.experiences;
        input.education = input.education || parsed.education;
      }
      const jobSkills = app.job?.requiredSkills?.length ? app.job.requiredSkills : app.job?.skills || [];
      const candSkills = new Set((input.skills || []).map((s) => String(s).toLowerCase().trim()));
      input.missingSkills = input.missingSkills || jobSkills.filter((s) => !candSkills.has(String(s).toLowerCase().trim()));
    }
  }

  if (feature === "candidate_match_explanation" && input.applicationId && req.auth?.organizationId) {
    const [app, match] = await Promise.all([
      Application.findOne({ _id: input.applicationId, organization: req.auth.organizationId })
        .populate("candidate", "name")
        .populate("job", "title")
        .lean(),
      CandidateMatch.findOne({ application: input.applicationId, status: "completed" }).lean(),
    ]);
    if (app) {
      input.candidateName = input.candidateName || app.candidate?.name;
      input.jobTitle = input.jobTitle || app.job?.title;
    }
    if (match) {
      input.overallScore = input.overallScore != null ? input.overallScore : match.overallScore;
      input.matchedSkills = input.matchedSkills || match.matchedSkills;
      input.missingRequiredSkills = input.missingRequiredSkills || match.missingRequiredSkills;
      input.missingPreferredSkills = input.missingPreferredSkills || match.missingPreferredSkills;
      input.experienceScore = input.experienceScore != null ? input.experienceScore : match.experienceScore;
      input.skillScore = input.skillScore != null ? input.skillScore : match.skillScore;
    }
  }

  if (feature === "candidate_comparison" && Array.isArray(input.applicationIds) && req.auth?.organizationId) {
    const apps = await Application.find({
      _id: { $in: input.applicationIds },
      organization: req.auth.organizationId,
    })
      .populate("candidate", "name skills")
      .populate("job", "title")
      .lean();
    const matches = await CandidateMatch.find({
      application: { $in: input.applicationIds },
      organization: req.auth.organizationId,
      status: "completed",
    }).lean();
    const matchMap = new Map(matches.map((m) => [String(m.application), m]));
    if (!input.candidates) {
      input.candidates = apps.map((a) => {
        const m = matchMap.get(String(a._id));
        return {
          candidateId: String(a.candidate?._id || a._id),
          candidateName: a.candidate?.name || "Candidate",
          overallScore: m?.overallScore ?? null,
          matchedSkills: m?.matchedSkills || [],
          missingSkills: m?.missingRequiredSkills || [],
          skills: a.candidate?.skills || [],
        };
      });
    }
    if (apps[0]?.job?.title && !input.jobTitle) {
      input.jobTitle = apps[0].job.title;
    }
  }

  const result = await run({
    feature,
    input,
    user: req.user._id,
    organization: req.auth?.organizationId || null,
    subjectType: req.body.subjectType || "ad_hoc",
    subjectId: req.body.subjectId || "ad_hoc",
    allowExternal,
  });

  res.json({ data: result });
});
