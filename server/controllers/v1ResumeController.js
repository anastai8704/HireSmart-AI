const { Resume, ResumeVersion, ParsedResume } = require("../models/Resume");
const { Application } = require("../models/Application");
const JobRun = require("../models/JobRun");
const Job = require("../models/Job");
const { calculateHybridMatch } = require("../services/hybridMatchingService");
const storageService = require("../services/storageService");
const { createVersion } = require("../services/resumeProcessingService");
const { enqueue } = require("../services/jobQueueService");
const { run } = require("../services/ai/orchestrator");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const { audit } = require("../services/auditService");
const Consent = require("../models/Consent");
const versionDto = (v) => ({ id: v._id, resumeId: v.resume, version: v.version, originalName: v.originalName, mimeType: v.mimeType, size: v.size, sha256: v.sha256, processingStatus: v.processingStatus, processingStage: v.processingStage, failure: v.failureCode ? { code: v.failureCode, message: v.failureMessage } : null, summary: v.summary, createdAt: v.createdAt, analyzedAt: v.analyzedAt });
exports.upload = asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError("Resume file is required", 422, "FILE_REQUIRED");
    const created = await createVersion({ user: req.user, file: req.file });
    if (created.duplicate && created.version.processingStatus === "ready") return res.status(200).json({ data: { resumeVersion: versionDto(created.version), duplicate: true } });
    const job = await enqueue({ type: "resume.process", owner: req.user._id, payload: { resumeVersionId: created.version._id } });
    await audit({ req, action: "resume.uploaded", resourceType: "resume_version", resourceId: created.version._id, metadata: { duplicate: created.duplicate, sha256: created.version.sha256 } });
    const refreshed = await ResumeVersion.findById(created.version._id);
    res.status(202).json({ data: { resumeVersion: versionDto(refreshed), duplicate: created.duplicate, jobRun: { id: job._id, status: job.status, progress: job.progress } } });
});
exports.list = asyncHandler(async (req, res) => {
    const resumes = await Resume.find({ candidate: req.user._id, status: { $ne: "deleted" } }).populate("currentVersion").sort({ updatedAt: -1 });
    const versions = await ResumeVersion.find({ candidate: req.user._id, processingStatus: { $ne: "deleted" } }).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 20, 100));
    res.json({ data: resumes.map((r) => ({ id: r._id, label: r.label, isPrimary: r.isPrimary, currentVersionId: r.currentVersion?._id })), meta: { versions: versions.map(versionDto), count: versions.length } });
});
exports.get = asyncHandler(async (req, res) => {
    const version = await ResumeVersion.findOne({ _id: req.params.versionId, candidate: req.user._id }); if (!version) throw new AppError("Resume version not found", 404, "RESOURCE_NOT_FOUND");
    const parsed = await ParsedResume.findOne({ resumeVersion: version._id }); res.json({ data: { resumeVersion: versionDto(version), parsedResume: parsed } });
});
exports.download = asyncHandler(async (req, res, next) => {
    const version = await ResumeVersion.findOne({ _id: req.params.versionId, candidate: req.user._id }).select("+storageKey"); if (!version || version.processingStatus === "deleted") throw new AppError("Resume version not found", 404, "RESOURCE_NOT_FOUND");
    const stream = await storageService.getFileStream(version.storageKey, version.storageProvider); res.setHeader("Content-Type", version.mimeType); res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(version.originalName)}`); res.setHeader("Cache-Control", "private, no-store"); stream.on("error", next); stream.pipe(res);
});
exports.remove = asyncHandler(async (req, res) => {
    const version = await ResumeVersion.findOne({ _id: req.params.versionId, candidate: req.user._id }).select("+storageKey"); if (!version) throw new AppError("Resume version not found", 404, "RESOURCE_NOT_FOUND");
    const referenced = await Application.exists({ resumeVersion: version._id });
    version.processingStatus = "deleted"; await version.save();
    if (!referenced) await storageService.deleteFile(version.storageKey, version.storageProvider);
    await audit({ req, action: "resume.deleted", resourceType: "resume_version", resourceId: version._id, metadata: { retainedForApplication: Boolean(referenced) } }); res.status(204).end();
});
exports.retry = asyncHandler(async (req, res) => {
    const version = await ResumeVersion.findOne({ _id: req.params.versionId, candidate: req.user._id }); if (!version) throw new AppError("Resume version not found", 404, "RESOURCE_NOT_FOUND"); if (!["failed", "rejected"].includes(version.processingStatus) || version.parseAttempts >= 3) throw new AppError("Resume processing cannot be retried", 409, "INVALID_STATE"); version.processingStatus = "queued"; await version.save(); const job = await enqueue({ type: "resume.process", owner: req.user._id, payload: { resumeVersionId: version._id } }); res.status(202).json({ data: { jobRun: { id: job._id, status: job.status } } });
});
exports.analysis = asyncHandler(async (req, res) => {
    const version = await ResumeVersion.findOne({ _id: req.params.versionId, candidate: req.user._id, processingStatus: "ready" }).select("+text"); if (!version) throw new AppError("Ready resume version not found", 404, "RESOURCE_NOT_FOUND");
    const allowExternal = Boolean(await Consent.exists({ user: req.user._id, purpose: "ai_processing", revokedAt: null })); const result = await run({ feature: "resume_improvement", input: { resumeText: version.text }, user: req.user._id, subjectType: "resume_version", subjectId: version._id, allowExternal }); res.json({ data: result });
});
exports.tailor = asyncHandler(async (req, res) => { const [version, job] = await Promise.all([ResumeVersion.findOne({ _id: req.params.versionId, candidate: req.user._id, processingStatus: "ready" }).select("+text"), Job.findOne({ _id: req.body.jobId, status: "published" })]); if (!version || !job) throw new AppError("Ready resume version or job not found", 404, "RESOURCE_NOT_FOUND"); const consent = Boolean(await Consent.exists({ user: req.user._id, purpose: "ai_processing", revokedAt: null })); const fit = await calculateHybridMatch({ resumeText: version.text, candidateSkills: req.user.skills || [], job, allowExternalEmbeddings: consent }); const improvement = await run({ feature: "resume_improvement", input: { resumeText: version.text, targetJob: { id: job._id, title: job.title, description: job.description, requiredSkills: job.requiredSkills?.length ? job.requiredSkills : job.skills, preferredSkills: job.preferredSkills }, missingRequiredSkills: fit.missingRequiredSkills, missingPreferredSkills: fit.missingPreferredSkills, instruction: "Suggest evidence-based tailoring only. Never invent experience or credentials." }, user: req.user._id, subjectType: "resume_job_tailoring", subjectId: `${version._id}:${job._id}`, allowExternal: consent }); res.json({ data: { resumeVersionId: version._id, job: { id: job._id, title: job.title, company: job.company }, fit, improvement } }); });
exports.jobRun = asyncHandler(async (req, res) => { const job = await JobRun.findOne({ _id: req.params.jobRunId, owner: req.user._id }); if (!job) throw new AppError("Job run not found", 404, "RESOURCE_NOT_FOUND"); res.json({ data: { id: job._id, type: job.type, status: job.status, progress: job.progress, result: job.result, error: job.error, createdAt: job.createdAt, updatedAt: job.updatedAt } }); });
