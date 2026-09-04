const crypto = require("node:crypto");
const path = require("node:path");
const User = require("../models/User");
const { Resume, ResumeVersion, ParsedResume } = require("../models/Resume");
const storageService = require("./storageService");
const resumeService = require("./resumeService");
const { analyzeResume, extractContactInfo, extractSkills } = require("./resumeAnalyzerService");
const { extractYearsOfExperience, normalizeSkill } = require("./textAnalysis");
const AppError = require("../utils/AppError");

const verifyContent = (buffer, filename, declaredMime) => {
  const ext = path.extname(filename).toLowerCase();
  const pdf = buffer.length >= 5 && buffer.subarray(0, 5).toString() === "%PDF-";
  const zip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2]) &&
    [0x04, 0x06, 0x08].includes(buffer[3]);
  if (pdf && ext === ".pdf" && declaredMime === "application/pdf") return "application/pdf";
  if (
    zip &&
    ext === ".docx" &&
    declaredMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const marker = buffer.toString("latin1");
    if (!marker.includes("word/"))
      throw new AppError(
        "The uploaded archive is not a valid DOCX document",
        415,
        "FILE_CONTENT_MISMATCH",
      );
    return declaredMime;
  }
  throw new AppError(
    "File content does not match the declared PDF or DOCX type",
    415,
    "FILE_CONTENT_MISMATCH",
  );
};

const createVersion = async ({ user, file }) => {
  const mimeType = verifyContent(file.buffer, file.originalname, file.mimetype);
  await require("./malwareScannerService").scan(file.buffer);
  const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const duplicate = await ResumeVersion.findOne({
    candidate: user._id,
    sha256,
    processingStatus: { $ne: "deleted" },
  });
  if (duplicate) return { version: duplicate, duplicate: true };
  let resume = await Resume.findOne({ candidate: user._id, isPrimary: true, status: "active" });
  if (!resume) resume = await Resume.create({ candidate: user._id });
  const latest = await ResumeVersion.findOne({ resume: resume._id })
    .sort({ version: -1 })
    .select("version");
  const stored = await storageService.saveFile({
    buffer: file.buffer,
    originalName: file.originalname,
  });
  try {
    const version = await ResumeVersion.create({
      resume: resume._id,
      candidate: user._id,
      version: (latest?.version || 0) + 1,
      originalName: path
        .basename(file.originalname)
        .replace(/[\r\n\0]/g, "")
        .slice(0, 255),
      mimeType,
      size: file.size,
      sha256,
      storageKey: stored.storageKey,
      storageProvider: stored.provider,
    });
    resume.currentVersion = version._id;
    await resume.save();
    return { version, duplicate: false };
  } catch (error) {
    await storageService.deleteFile(stored.storageKey, stored.provider);
    throw error;
  }
};

const processVersion = async (versionId) => {
  const version = await ResumeVersion.findById(versionId).select("+storageKey +text");
  if (!version || ["ready", "deleted"].includes(version.processingStatus)) return version;
  version.processingStatus = "processing";
  version.processingStage = "parsing";
  version.parseAttempts += 1;
  await version.save();
  try {
    const stream = await storageService.getFileStream(version.storageKey, version.storageProvider);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const parsed = await resumeService.parseResumeContent(buffer, version.originalName);
    if (!parsed.text || parsed.text.length < 20)
      throw new AppError(
        "No readable text was found. The document may be scanned, corrupt, or password protected.",
        422,
        "RESUME_TEXT_UNREADABLE",
      );
    version.processingStage = "analyzing";
    version.text = parsed.text;
    version.summary = parsed.summary;
    const report = analyzeResume(parsed.text);
    const found = extractSkills(parsed.text);
    const Consent = require("../models/Consent");
    const allowExternal = Boolean(
      await Consent.exists({ user: version.candidate, purpose: "ai_processing", revokedAt: null }),
    );
    const extraction = await require("./ai/orchestrator").run({
      feature: "resume_extraction",
      input: { resumeText: parsed.text },
      user: version.candidate,
      subjectType: "resume_version",
      subjectId: version._id,
      allowExternal,
    });
    await ParsedResume.findOneAndUpdate(
      { resumeVersion: version._id },
      {
        candidate: version.candidate,
        contact: extraction.contact || extractContactInfo(parsed.text),
        skills: (
          extraction.skills ||
          found.all.map((name) => ({
            name,
            confidence: 0.75,
            evidence: `Detected in resume text: ${name}`,
          }))
        ).map((item) => ({ ...item, normalized: normalizeSkill(item.name) })),
        experienceYears: extraction.experienceYears ?? extractYearsOfExperience(parsed.text),
        education: extraction.education || [],
        experiences: extraction.experiences || [],
        analysis: report,
        confidence: extraction.confidence,
        warnings: extraction.warnings || [],
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    version.processingStatus = "ready";
    version.processingStage = "complete";
    version.analyzedAt = new Date();
    version.failureCode = "";
    version.failureMessage = "";
    await version.save();
    const resume = await Resume.findById(version.resume);
    if (resume?.isPrimary) {
      await User.updateOne(
        { _id: version.candidate },
        {
          resume: version.storageKey,
          resumeProvider: version.storageProvider,
          resumeOriginalName: version.originalName,
          resumeMimeType: version.mimeType,
          resumeSize: version.size,
          resumeUploadedAt: version.createdAt,
          resumeText: parsed.text,
          resumeSummary: parsed.summary,
          skills: found.all,
        },
      );
    }
    return version;
  } catch (error) {
    version.processingStatus = version.parseAttempts < 3 ? "failed" : "rejected";
    version.failureCode = error.code || "PARSE_FAILED";
    version.failureMessage = String(error.message).slice(0, 500);
    await version.save();
    throw error;
  }
};
module.exports = { verifyContent, createVersion, processVersion };
