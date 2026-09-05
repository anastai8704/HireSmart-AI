const AppError = require("../utils/AppError");
const User = require("../models/User");
const Job = require("../models/Job");
const Consent = require("../models/Consent");
const SearchHistory = require("../models/SearchHistory");
const RecommendationSnapshot = require("../models/RecommendationSnapshot");
const JobRun = require("../models/JobRun");
const { Application } = require("../models/Application");
const { ResumeVersion, ParsedResume } = require("../models/Resume");
const { calculateHybridMatch } = require("./hybridMatchingService");
const { enqueue } = require("./jobQueueService");
const logger = require("../utils/logger");

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

/**
 * Score the latest published jobs against the user's latest ready resume,
 * excluding already-applied jobs and boosting roles that match the user's
 * saved-job skills and recent search terms. Deterministic, explainable.
 */
const buildRecommendations = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404, "RESOURCE_NOT_FOUND");
  const version = await ResumeVersion.findOne({ candidate: userId, processingStatus: "ready" })
    .sort({ createdAt: -1 })
    .select("+text");
  if (!version) throw new AppError("Upload and process a resume first", 422, "RESUME_REQUIRED");
  const allowExternalEmbeddings = Boolean(
    await Consent.exists({ user: userId, purpose: "ai_processing", revokedAt: null }),
  );
  const parsed = await ParsedResume.findOne({ resumeVersion: version._id }).select("skills");
  const versionSkills =
    parsed?.skills?.map((item) => item.normalized || item.name) || user.skills || [];
  const [appliedJobs, userDoc, history] = await Promise.all([
    Application.find({ candidate: userId }).select("job").limit(200).lean(),
    User.findById(userId).select("savedJobs").lean(),
    SearchHistory.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  const appliedIds = appliedJobs.map((a) => a.job);
  const savedJobIds = userDoc?.savedJobs || [];
  const savedJobs = savedJobIds.length
    ? await Job.find({ _id: { $in: savedJobIds } })
        .select("requiredSkills skills")
        .limit(20)
        .lean()
    : [];
  const savedSkillSet = [
    ...new Set(savedJobs.flatMap((j) => [...(j.requiredSkills || []), ...(j.skills || [])])),
  ].slice(0, 30);
  const terms = history.map((h) => h.query).filter(Boolean);
  // Jobs the candidate already applied to or saved are excluded: recommendations
  // should surface new roles, not re-pitch ones the candidate already engaged with.
  const excludedIds = [...new Set([...appliedIds, ...savedJobIds])];
  const jobs = await Job.find({
    status: "published",
    _id: { $nin: excludedIds },
    $or: [{ closesAt: null }, { closesAt: { $gte: new Date() } }],
  })
    .sort({ createdAt: -1 })
    .limit(100);
  const scored = await mapWithConcurrency(jobs, 4, async (job) => ({
    job: {
      id: job._id,
      title: job.title,
      company: job.company,
      location: job.location,
      workplaceMode: job.workplaceMode,
      jobType: job.jobType,
      description: job.description,
      requiredSkills: job.requiredSkills?.length ? job.requiredSkills : job.skills,
      preferredSkills: job.preferredSkills,
      compensation: job.compensation,
      salary: job.salary,
      experience: job.experience,
      createdAt: job.createdAt,
    },
    match: await calculateHybridMatch({
      resumeText: version.text,
      candidateSkills: versionSkills,
      job,
      allowExternalEmbeddings,
    }),
  }));
  const signalBoostFor = (job) => {
    let boost = 0;
    const jobSkills = [...(job.requiredSkills || []), ...(job.preferredSkills || [])].map((s) =>
      String(s).toLowerCase(),
    );
    const overlap = jobSkills.filter((s) =>
      savedSkillSet.some((sk) => String(sk).toLowerCase() === s),
    ).length;
    if (overlap) boost += Math.min(overlap, 3) * 2;
    const haystack = `${job.title} ${job.location} ${(job.skills || []).join(" ")}`.toLowerCase();
    if (
      terms.some((t) =>
        String(t)
          .toLowerCase()
          .split(/\s+/)
          .some((w) => w.length > 3 && haystack.includes(w)),
      )
    )
      boost += 3;
    return Math.min(boost, 8);
  };
  scored.forEach((entry) => {
    const boost = signalBoostFor(entry.job);
    if (boost) entry.match.overallScore = Math.min(100, entry.match.overallScore + boost);
    entry.signalBoost = boost;
  });
  scored.sort((a, b) => b.match.overallScore - a.match.overallScore);
  const signals = {
    savedSkillCount: savedSkillSet.length,
    searchTermCount: terms.length,
    appliedExcluded: appliedIds.length,
  };
  return {
    resumeVersionId: version._id,
    items: scored.slice(0, 20),
    signals,
    evaluated: scored.length,
  };
};

const refreshSnapshot = async (userId) => {
  const built = await buildRecommendations(userId);
  await RecommendationSnapshot.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        resumeVersionId: built.resumeVersionId,
        results: built.items,
        signals: built.signals,
        evaluated: built.evaluated,
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return { userId: String(userId), evaluated: built.evaluated };
};

let lastTick = 0;

/** Enqueue snapshot refreshes for eligible candidates (has ready resume, active in 60d). */
const tickRecommendationRefresh = async (force = false) => {
  const now = Date.now();
  if (!force && now - lastTick < 6 * 3600 * 1000) return { skipped: true };
  lastTick = now;
  try {
    const candidates = await ResumeVersion.distinct("candidate", { processingStatus: "ready" });
    const users = await User.find({
      _id: { $in: candidates },
      role: "candidate",
      isActive: true,
      updatedAt: { $gte: new Date(now - 60 * 24 * 3600 * 1000) },
    })
      .select("_id")
      .limit(300)
      .lean();
    const pending = await JobRun.find({
      type: "recommendations.refresh",
      status: { $in: ["queued", "processing"] },
    }).select("owner");
    const pendingOwners = new Set(pending.map((j) => String(j.owner)));
    let enqueued = 0;
    for (const u of users) {
      if (pendingOwners.has(String(u._id))) continue;
      await enqueue({
        type: "recommendations.refresh",
        owner: u._id,
        payload: { userId: String(u._id) },
        maxAttempts: 2,
      });
      pendingOwners.add(String(u._id));
      enqueued += 1;
    }
    if (enqueued)
      logger.info(
        `Recommendation refresh tick: ${enqueued} snapshots enqueued (${users.length} eligible)`,
      );
    return { enqueued, considered: users.length };
  } catch (error) {
    logger.error(`Recommendation refresh tick failed: ${error.message}`);
    return { error: error.message };
  }
};

module.exports = { buildRecommendations, refreshSnapshot, tickRecommendationRefresh };
