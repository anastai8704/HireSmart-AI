const crypto = require("node:crypto");
const { connectDB, disconnectDB } = require("../config/db");
const { validateEnvironment } = require("../config/env");
const User = require("../models/User");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const Organization = require("../models/Organization");
const { Membership } = require("../models/Membership");
const { Resume, ResumeVersion, ParsedResume } = require("../models/Resume");
const storage = require("../services/storageService");
const {
  analyzeResume,
  extractContactInfo,
  extractSkills,
} = require("../services/resumeAnalyzerService");
const { extractYearsOfExperience, normalizeSkill } = require("../services/textAnalysis");
const slugify = (value) =>
  String(value || "organization")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "organization";
const uniqueSlug = async (name, userId) => {
  const base = slugify(name);
  let slug = base;
  let n = 1;
  while (await Organization.exists({ slug })) {
    slug = `${base}-${String(userId).slice(-5)}-${n}`;
    n += 1;
  }
  return slug;
};
const readBuffer = async (key, provider) => {
  const stream = await storage.getFileStream(key, provider);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};
const run = async () => {
  validateEnvironment();
  await connectDB();
  const report = {
    organizations: 0,
    memberships: 0,
    jobs: 0,
    applications: 0,
    resumes: 0,
    skippedResumes: 0,
  };
  const recruiters = await User.find({ role: "recruiter" });
  for (const recruiter of recruiters) {
    let membership = await Membership.findOne({ user: recruiter._id, status: "active" });
    if (!membership) {
      const name = recruiter.companyName || `${recruiter.name}'s organization`;
      const organization = await Organization.create({
        name,
        slug: await uniqueSlug(name, recruiter._id),
        website: recruiter.companyWebsite || "",
      });
      report.organizations += 1;
      membership = await Membership.create({
        organization: organization._id,
        user: recruiter._id,
        role: "owner",
        status: "active",
      });
      report.memberships += 1;
    }
    const jobResult = await Job.updateMany(
      { recruiter: recruiter._id, organization: null },
      {
        $set: { organization: membership.organization },
        $addToSet: { hiringTeam: membership._id },
      },
    );
    report.jobs += jobResult.modifiedCount;
    const jobIds = await Job.find({ recruiter: recruiter._id }).distinct("_id");
    const appResult = await Application.updateMany(
      { job: { $in: jobIds }, organization: null },
      { organization: membership.organization },
    );
    report.applications += appResult.modifiedCount;
  }
  await User.updateMany(
    { isActive: true, accountStatus: "pending_verification", emailVerified: true },
    { accountStatus: "active" },
  );
  const candidates = await User.find({ role: "candidate", resume: { $ne: "" } });
  for (const candidate of candidates) {
    if (await Resume.exists({ candidate: candidate._id })) continue;
    if (
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(candidate.resumeMimeType)
    ) {
      report.skippedResumes += 1;
      continue;
    }
    try {
      const buffer = await readBuffer(candidate.resume, candidate.resumeProvider || "local");
      const resume = await Resume.create({
        candidate: candidate._id,
        label: "Migrated primary resume",
        isPrimary: true,
      });
      const text = candidate.resumeText || "";
      const version = await ResumeVersion.create({
        resume: resume._id,
        candidate: candidate._id,
        version: 1,
        originalName: candidate.resumeOriginalName || "resume",
        mimeType: candidate.resumeMimeType,
        size: candidate.resumeSize || buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        storageKey: candidate.resume,
        storageProvider: candidate.resumeProvider || "local",
        processingStatus: text.length >= 20 ? "ready" : "failed",
        processingStage: text.length >= 20 ? "complete" : "uploaded",
        failureCode: text.length >= 20 ? "" : "MIGRATED_TEXT_UNAVAILABLE",
        text,
        summary: candidate.resumeSummary || "",
        analyzedAt: text.length >= 20 ? new Date() : null,
      });
      resume.currentVersion = version._id;
      await resume.save();
      if (text.length >= 20) {
        const skills = extractSkills(text).all;
        await ParsedResume.create({
          resumeVersion: version._id,
          candidate: candidate._id,
          contact: extractContactInfo(text),
          skills: skills.map((name) => ({
            name,
            normalized: normalizeSkill(name),
            confidence: 0.65,
            evidence: `Migrated deterministic detection: ${name}`,
          })),
          experienceYears: extractYearsOfExperience(text),
          analysis: analyzeResume(text),
          confidence: 0.6,
          warnings: ["Migrated from the legacy resume record; candidate review is recommended"],
        });
      }
      report.resumes += 1;
    } catch (error) {
      report.skippedResumes += 1;
      console.warn(`Skipped resume for user ${candidate._id}: ${error.code || error.name}`);
    }
  }
  console.log(JSON.stringify(report, null, 2));
  await disconnectDB();
};
run().catch(async (error) => {
  console.error(error.stack || error.message);
  await disconnectDB();
  process.exitCode = 1;
});
