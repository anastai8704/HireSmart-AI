const User = require("../models/User");
const CandidateProfile = require("../models/CandidateProfile");
const Job = require("../models/Job");
const { ResumeVersion, ParsedResume } = require("../models/Resume");
const Consent = require("../models/Consent");
const SearchHistory = require("../models/SearchHistory");
const RecommendationSnapshot = require("../models/RecommendationSnapshot");
const { Application } = require("../models/Application");
const { buildRecommendations } = require("../services/recommendationSnapshotService");
const { calculateHybridMatch } = require("../services/hybridMatchingService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const hasAIConsent = (userId) => Consent.exists({ user: userId, purpose: "ai_processing", revokedAt: null });
exports.me = asyncHandler(async (req, res) => { const profile = await CandidateProfile.findOne({ user: req.user._id }); res.json({ data: { user: { id: req.user._id, displayName: req.user.name, email: req.user.email, headline: req.user.headline, location: req.user.location, bio: req.user.bio, skills: req.user.skills, onboardingCompleted: req.user.onboardingCompleted }, profile } }); });
exports.update = asyncHandler(async (req, res) => { const userFields = ["name", "headline", "location", "bio", "phone", "skills", "timezone", "locale", "onboardingCompleted"]; for (const key of userFields) if (req.body[key] !== undefined) req.user[key] = req.body[key]; await req.user.save(); const profileFields = ["city", "state", "country", "languages", "socialLinks", "education", "experience", "projects", "certifications"]; const profileUpdate = {}; for (const key of profileFields) if (req.body[key] !== undefined) profileUpdate[key] = req.body[key]; const profile = Object.keys(profileUpdate).length ? await CandidateProfile.findOneAndUpdate({ user: req.user._id }, { $set: profileUpdate, $setOnInsert: { user: req.user._id } }, { upsert: true, new: true, runValidators: true }) : await CandidateProfile.findOne({ user: req.user._id }); res.json({ data: { user: { id: req.user._id, displayName: req.user.name, headline: req.user.headline, location: req.user.location, bio: req.user.bio, skills: req.user.skills, onboardingCompleted: req.user.onboardingCompleted }, profile } }); });
exports.fit = asyncHandler(async (req, res) => { const job = await Job.findOne({ _id: req.params.jobId, status: "published", $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }] }); if (!job) throw new AppError("Job not found", 404, "RESOURCE_NOT_FOUND"); const version = await ResumeVersion.findOne({ _id: req.body.resumeVersionId, candidate: req.user._id, processingStatus: "ready" }).select("+text"); if (!version) throw new AppError("Ready resume version not found", 404, "RESOURCE_NOT_FOUND"); const parsed = await ParsedResume.findOne({ resumeVersion: version._id }).select("skills"); const versionSkills = parsed?.skills?.map((item) => item.normalized || item.name) || req.user.skills || []; const result = await calculateHybridMatch({ resumeText: version.text, candidateSkills: versionSkills, job, candidatePreferences: req.body.preferences || {}, allowExternalEmbeddings: Boolean(await hasAIConsent(req.user._id)) }); res.json({ data: { jobId: job._id, resumeVersionId: version._id, ...result } }); });
exports.savedJobs = asyncHandler(async (req, res) => { const user = await User.findById(req.user._id).populate({ path: "savedJobs", match: { status: "published" } }); res.json({ data: (user.savedJobs || []).filter(Boolean).map((job) => ({ id: job._id, title: job.title, company: job.company, location: job.location, salary: job.salary, compensation: job.compensation, experience: job.experience, jobType: job.jobType, workplaceMode: job.workplaceMode, description: job.description, requiredSkills: job.requiredSkills?.length ? job.requiredSkills : job.skills, preferredSkills: job.preferredSkills, createdAt: job.createdAt })) }); });
exports.saveJob = asyncHandler(async (req, res) => { const job = await Job.findOne({ _id: req.params.jobId, status: "published", $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }] }); if (!job) throw new AppError("Job not found", 404, "RESOURCE_NOT_FOUND"); await User.updateOne({ _id: req.user._id }, { $addToSet: { savedJobs: job._id } }); res.status(201).json({ data: { jobId: job._id, saved: true } }); });
exports.unsaveJob = asyncHandler(async (req, res) => { await User.updateOne({ _id: req.user._id }, { $pull: { savedJobs: req.params.jobId } }); res.status(204).end(); });
exports.recommendations = asyncHandler(async (req, res) => {
    const version = await ResumeVersion.findOne({ candidate: req.user._id, processingStatus: "ready" }).sort({ createdAt: -1 }).select("_id");
    if (!version) throw new AppError("Upload and process a resume first", 422, "RESUME_REQUIRED");
    // Applied/saved jobs are filtered at read time, even for cached results:
    // a snapshot can be up to 24h old and predates the latest interactions,
    // while the expensive per-job match scores are still safe to reuse.
    const [appliedJobs, userDoc] = await Promise.all([
        Application.find({ candidate: req.user._id }).select("job").limit(200).lean(),
        User.findById(req.user._id).select("savedJobs").lean(),
    ]);
    const excludedIds = new Set([...appliedJobs.map((a) => String(a.job)), ...(userDoc?.savedJobs || []).map(String)]);
    const excludeEngaged = (items) => (items || []).filter((item) => !excludedIds.has(String(item?.job?.id)));
    const snapshot = await RecommendationSnapshot.findOne({ user: req.user._id });
    if (snapshot && String(snapshot.resumeVersionId) === String(version._id) && Date.now() - snapshot.computedAt.getTime() < 24 * 3600 * 1000) {
        return res.json({ data: excludeEngaged(snapshot.results), meta: { source: "snapshot", computedAt: snapshot.computedAt, evaluated: snapshot.evaluated, resumeVersionId: version._id, signals: snapshot.signals } });
    }
    const built = await buildRecommendations(req.user._id);
    await RecommendationSnapshot.findOneAndUpdate({ user: req.user._id }, { $set: { resumeVersionId: built.resumeVersionId, results: built.items, signals: built.signals, evaluated: built.evaluated, computedAt: new Date() } }, { upsert: true }).catch(() => {});
    res.json({ data: built.items.slice(0, Math.min(Number(req.query.limit) || 20, 50)), meta: { source: "live", evaluated: built.evaluated, resumeVersionId: version._id, signals: built.signals } });
});
exports.searchHistory = asyncHandler(async (req, res) => { const items = await SearchHistory.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 20, 50)); res.json({ data: items, meta: { count: items.length } }); });
exports.clearSearchHistory = asyncHandler(async (req, res) => { await SearchHistory.deleteMany({ user: req.user._id }); res.status(204).send(); });
