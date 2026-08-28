const User = require("../models/User");
const CandidateProfile = require("../models/CandidateProfile");
const Job = require("../models/Job");
const { ResumeVersion, ParsedResume } = require("../models/Resume");
const Consent = require("../models/Consent");
const { Application } = require("../models/Application");
const SearchHistory = require("../models/SearchHistory");
const { calculateHybridMatch } = require("../services/hybridMatchingService");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../utils/AppError");
const hasAIConsent = (userId) => Consent.exists({ user: userId, purpose: "ai_processing", revokedAt: null });
const mapWithConcurrency = async (items, limit, mapper) => { const results = new Array(items.length); let cursor = 0; const workers = Array.from({ length: Math.min(limit, items.length) }, async () => { while (cursor < items.length) { const index = cursor; cursor += 1; results[index] = await mapper(items[index], index); } }); await Promise.all(workers); return results; };
exports.me = asyncHandler(async (req, res) => { const profile = await CandidateProfile.findOne({ user: req.user._id }); res.json({ data: { user: { id: req.user._id, displayName: req.user.name, email: req.user.email, headline: req.user.headline, location: req.user.location, bio: req.user.bio, skills: req.user.skills, onboardingCompleted: req.user.onboardingCompleted }, profile } }); });
exports.update = asyncHandler(async (req, res) => { const userFields = ["name", "headline", "location", "bio", "phone", "skills", "timezone", "locale", "onboardingCompleted"]; for (const key of userFields) if (req.body[key] !== undefined) req.user[key] = req.body[key]; await req.user.save(); const profileFields = ["city", "state", "country", "languages", "socialLinks", "education", "experience", "projects", "certifications"]; const profileUpdate = {}; for (const key of profileFields) if (req.body[key] !== undefined) profileUpdate[key] = req.body[key]; const profile = Object.keys(profileUpdate).length ? await CandidateProfile.findOneAndUpdate({ user: req.user._id }, { $set: profileUpdate, $setOnInsert: { user: req.user._id } }, { upsert: true, new: true, runValidators: true }) : await CandidateProfile.findOne({ user: req.user._id }); res.json({ data: { user: { id: req.user._id, displayName: req.user.name, headline: req.user.headline, location: req.user.location, bio: req.user.bio, skills: req.user.skills, onboardingCompleted: req.user.onboardingCompleted }, profile } }); });
exports.fit = asyncHandler(async (req, res) => { const job = await Job.findOne({ _id: req.params.jobId, status: "published", $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }] }); if (!job) throw new AppError("Job not found", 404, "RESOURCE_NOT_FOUND"); const version = await ResumeVersion.findOne({ _id: req.body.resumeVersionId, candidate: req.user._id, processingStatus: "ready" }).select("+text"); if (!version) throw new AppError("Ready resume version not found", 404, "RESOURCE_NOT_FOUND"); const parsed = await ParsedResume.findOne({ resumeVersion: version._id }).select("skills"); const versionSkills = parsed?.skills?.map((item) => item.normalized || item.name) || req.user.skills || []; const result = await calculateHybridMatch({ resumeText: version.text, candidateSkills: versionSkills, job, candidatePreferences: req.body.preferences || {}, allowExternalEmbeddings: Boolean(await hasAIConsent(req.user._id)) }); res.json({ data: { jobId: job._id, resumeVersionId: version._id, ...result } }); });
exports.savedJobs = asyncHandler(async (req, res) => { const user = await User.findById(req.user._id).populate({ path: "savedJobs", match: { status: "published" } }); res.json({ data: (user.savedJobs || []).filter(Boolean).map((job) => ({ id: job._id, title: job.title, company: job.company, location: job.location, salary: job.salary, compensation: job.compensation, experience: job.experience, jobType: job.jobType, workplaceMode: job.workplaceMode, description: job.description, requiredSkills: job.requiredSkills?.length ? job.requiredSkills : job.skills, preferredSkills: job.preferredSkills, createdAt: job.createdAt })) }); });
exports.saveJob = asyncHandler(async (req, res) => { const job = await Job.findOne({ _id: req.params.jobId, status: "published", $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }] }); if (!job) throw new AppError("Job not found", 404, "RESOURCE_NOT_FOUND"); await User.updateOne({ _id: req.user._id }, { $addToSet: { savedJobs: job._id } }); res.status(201).json({ data: { jobId: job._id, saved: true } }); });
exports.unsaveJob = asyncHandler(async (req, res) => { await User.updateOne({ _id: req.user._id }, { $pull: { savedJobs: req.params.jobId } }); res.status(204).end(); });
exports.recommendations = asyncHandler(async (req, res) => {
    const version = await ResumeVersion.findOne({ candidate: req.user._id, processingStatus: "ready" }).sort({ createdAt: -1 }).select("+text");
    if (!version) throw new AppError("Upload and process a resume first", 422, "RESUME_REQUIRED");
    const allowExternalEmbeddings = Boolean(await hasAIConsent(req.user._id));
    const parsed = await ParsedResume.findOne({ resumeVersion: version._id }).select("skills");
    const versionSkills = parsed?.skills?.map((item) => item.normalized || item.name) || req.user.skills || [];
    const [appliedJobs, userDoc, history] = await Promise.all([
        Application.find({ candidate: req.user._id }).select("job").limit(200).lean(),
        User.findById(req.user._id).select("savedJobs").lean(),
        SearchHistory.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    const appliedIds = appliedJobs.map((a) => a.job);
    const savedJobs = (userDoc?.savedJobs || []).length ? await Job.find({ _id: { $in: userDoc.savedJobs } }).select("requiredSkills skills").limit(20).lean() : [];
    const savedSkillSet = [...new Set(savedJobs.flatMap((j) => [...(j.requiredSkills || []), ...(j.skills || [])]))].slice(0, 30);
    const terms = history.map((h) => h.query).filter(Boolean);
    const jobs = await Job.find({ status: "published", _id: { $nin: appliedIds }, $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }] }).sort({ createdAt: -1 }).limit(100);
    const scored = await mapWithConcurrency(jobs, 4, async (job) => ({ job: { id: job._id, title: job.title, company: job.company, location: job.location, workplaceMode: job.workplaceMode, jobType: job.jobType, description: job.description, requiredSkills: job.requiredSkills?.length ? job.requiredSkills : job.skills, preferredSkills: job.preferredSkills, compensation: job.compensation, salary: job.salary, experience: job.experience, createdAt: job.createdAt }, match: await calculateHybridMatch({ resumeText: version.text, candidateSkills: versionSkills, job, allowExternalEmbeddings }) }));
    const signalBoostFor = (job) => {
        let boost = 0;
        const jobSkills = [...(job.requiredSkills || []), ...(job.preferredSkills || [])].map((s) => String(s).toLowerCase());
        const overlap = jobSkills.filter((s) => savedSkillSet.some((sk) => String(sk).toLowerCase() === s)).length;
        if (overlap) boost += Math.min(overlap, 3) * 2;
        const haystack = `${job.title} ${job.location} ${(job.skills || []).join(" ")}`.toLowerCase();
        if (terms.some((t) => String(t).toLowerCase().split(/\s+/).some((w) => w.length > 3 && haystack.includes(w)))) boost += 3;
        return Math.min(boost, 8);
    };
    scored.forEach((entry) => { const boost = signalBoostFor(entry.job); if (boost) entry.match.overallScore = Math.min(100, entry.match.overallScore + boost); entry.signalBoost = boost; });
    scored.sort((a, b) => b.match.overallScore - a.match.overallScore);
    res.json({ data: scored.slice(0, Math.min(Number(req.query.limit) || 20, 50)), meta: { evaluated: scored.length, resumeVersionId: version._id, signals: { savedSkillCount: savedSkillSet.length, searchTermCount: terms.length, appliedExcluded: appliedIds.length } } });
});
exports.searchHistory = asyncHandler(async (req, res) => { const items = await SearchHistory.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 20, 50)); res.json({ data: items, meta: { count: items.length } }); });
exports.clearSearchHistory = asyncHandler(async (req, res) => { await SearchHistory.deleteMany({ user: req.user._id }); res.status(204).send(); });
