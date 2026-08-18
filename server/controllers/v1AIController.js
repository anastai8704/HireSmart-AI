const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { run } = require("../services/ai/orchestrator");
const Consent = require("../models/Consent");
const User = require("../models/User");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const { ParsedResume, ResumeVersion } = require("../models/Resume");
const features = new Set(["resume_extraction", "resume_rewrite", "resume_improvement", "jd_generation", "jd_parse", "jd_improvement", "interview_questions", "interview_preparation", "recruiter_copilot", "career_copilot"]);
const recruiterOnly = new Set(["jd_generation", "jd_parse", "jd_improvement", "interview_questions", "recruiter_copilot"]);
const candidateContext = async (userId) => {
    const user = await User.findById(userId).select("headline skills").lean();
    const latest = await ResumeVersion.findOne({ candidate: userId, processingStatus: "ready" }).sort({ version: -1 }).select("_id").lean();
    const parsed = latest ? await ParsedResume.findOne({ resumeVersion: latest._id }).select("skills experienceYears education experiences analysis confidence warnings").lean() : null;
    return { headline: user?.headline || "", declaredSkills: user?.skills || [], resumeEvidence: parsed ? { skills: parsed.skills, experienceYears: parsed.experienceYears, education: parsed.education, experiences: parsed.experiences, readiness: parsed.analysis?.atsScore, extractionConfidence: parsed.confidence, warnings: parsed.warnings } : null };
};
const recruiterContext = async (organizationId) => {
    const [jobs, funnel] = await Promise.all([
        Job.find({ organization: organizationId }).select("title status requiredSkills preferredSkills workplaceMode updatedAt").sort({ updatedAt: -1 }).limit(30).lean(),
        Application.aggregate([{ $match: { organization: require("mongoose").Types.ObjectId.createFromHexString(String(organizationId)) } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);
    return { jobs, applicationFunnel: Object.fromEntries(funnel.map((item) => [item._id, item.count])) };
};
exports.execute = asyncHandler(async (req, res) => {
    if (!features.has(req.params.feature)) throw new AppError("AI feature not found", 404, "RESOURCE_NOT_FOUND");
    if (recruiterOnly.has(req.params.feature) && !["recruiter", "admin"].includes(req.user.role)) throw new AppError("This AI feature requires recruiter access", 403, "FORBIDDEN");
    const allowExternal = req.user.role !== "candidate" || Boolean(await Consent.exists({ user: req.user._id, purpose: "ai_processing", revokedAt: null }));
    let input = req.body.input;
    if (req.params.feature === "career_copilot") input = { ...input, authorizedContext: await candidateContext(req.user._id) };
    if (req.params.feature === "recruiter_copilot") input = { ...input, authorizedContext: await recruiterContext(req.auth.organizationId) };
    const result = await run({ feature: req.params.feature, input, user: req.user._id, organization: req.auth.organizationId || null, subjectType: req.body.subjectType || "ad_hoc", subjectId: req.body.subjectId || "ad_hoc", allowExternal });
    res.json({ data: result });
});
