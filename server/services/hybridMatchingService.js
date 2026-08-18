const { config } = require("../config/env");
const { calculateResumeJobMatch } = require("./resumeMatchingService");
const { normalizeSkill, buildTfIdfVectors, cosineSimilarity, extractYearsOfExperience } = require("./textAnalysis");
const { getProvider } = require("./ai/provider");

const percent = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
const sanitizeProfessionalText = (text) => String(text || "")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ")
    .replace(/(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3,5}[\s-]?\d{3,5}(?:[\s-]?\d{2,4})?/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .split(/\n/)
    .filter((line, index) => !/^\s*(name|gender|sex|date of birth|dob|age|marital status|nationality|religion)\s*:/i.test(line) && !(index === 0 && line.trim().split(/\s+/).length <= 5 && !/experience|engineer|developer|manager|analyst|summary/i.test(line)))
    .join("\n");
const semanticScore = async (resumeText, jobText, allowExternalEmbeddings = false) => {
    if (!resumeText || !jobText) return { score: 0, confidence: 0, method: "none", evidence: "Insufficient text" };
    if (allowExternalEmbeddings && config.embeddingsProvider !== "deterministic") {
        try {
            const provider = getProvider(config.embeddingsProvider, "embeddings"); const [a, b] = await Promise.all([provider.embed(resumeText), provider.embed(jobText)]);
            if (a.vector.length && a.vector.length === b.vector.length) {
                const dot = a.vector.reduce((sum, value, i) => sum + value * b.vector[i], 0); const ma = Math.sqrt(a.vector.reduce((s, v) => s + v * v, 0)); const mb = Math.sqrt(b.vector.reduce((s, v) => s + v * v, 0));
                return { score: percent(ma && mb ? dot / (ma * mb) : 0), confidence: 0.82, method: "embeddings", model: a.model, evidence: "Similarity of protected-attribute-redacted professional text embeddings" };
            }
        } catch { /* deterministic fallback below */ }
    }
    const [a, b] = buildTfIdfVectors([resumeText, jobText]); const raw = cosineSimilarity(a, b);
    return { score: percent(Math.min(1, raw / 0.45)), confidence: 0.62, method: "tfidf", model: "tfidf-v1", evidence: "Lexical similarity fallback" };
};
const calculateHybridMatch = async ({ resumeText = "", candidateSkills = [], job, candidatePreferences = {}, allowExternalEmbeddings = false }) => {
    // Ranking input deliberately excludes names, contact details, DOB, gender and photographs.
    const sanitizedResumeText = sanitizeProfessionalText(resumeText);
    const required = (job.requiredSkills?.length ? job.requiredSkills : job.skills || []).map(normalizeSkill).filter(Boolean);
    const preferred = (job.preferredSkills || []).map(normalizeSkill).filter(Boolean);
    const present = new Set(candidateSkills.map(normalizeSkill).filter(Boolean));
    const lowerText = sanitizedResumeText.toLowerCase();
    const has = (skill) => present.has(skill) || lowerText.replace(/[\s._-]/g, "").includes(skill);
    const matchedRequired = required.filter(has); const missingRequired = required.filter((s) => !has(s));
    const matchedPreferred = preferred.filter(has); const missingPreferred = preferred.filter((s) => !has(s));
    const requiredScore = required.length ? percent(matchedRequired.length / required.length) : 100;
    const preferredScore = preferred.length ? percent(matchedPreferred.length / preferred.length) : 100;
    const requiredYears = extractYearsOfExperience(job.experience || ""); const candidateYears = extractYearsOfExperience(sanitizedResumeText);
    const experienceScore = requiredYears ? (candidateYears == null ? 0 : percent(Math.min(1, candidateYears / requiredYears))) : 100;
    const educationRequired = /degree|bachelor|master|phd|b\.?tech|m\.?tech/i.test(job.description || "");
    const educationFound = /degree|bachelor|master|phd|university|college|b\.?tech|m\.?tech/i.test(sanitizedResumeText);
    const educationScore = educationRequired ? (educationFound ? 100 : 0) : 100;
    const semantic = await semanticScore(sanitizedResumeText, `${job.title} ${job.description} ${(job.skills || []).join(" ")}`, allowExternalEmbeddings);
    let preferenceScore = 100; const preferenceConcerns = [];
    if (candidatePreferences.workplaceModes?.length && job.workplaceMode && !candidatePreferences.workplaceModes.includes(job.workplaceMode)) { preferenceScore -= 50; preferenceConcerns.push("Workplace preference may not align"); }
    if (candidatePreferences.locations?.length && job.location && !candidatePreferences.locations.some((l) => job.location.toLowerCase().includes(l.toLowerCase()))) { preferenceScore -= 25; preferenceConcerns.push("Location preference may not align"); }
    const applicable = { requiredSkills: required.length > 0, preferredSkills: preferred.length > 0, experience: requiredYears !== null, education: educationRequired, semantic: Boolean(sanitizedResumeText && job.description), preferences: Boolean(candidatePreferences.workplaceModes?.length || candidatePreferences.locations?.length) };
    const components = { requiredSkills: requiredScore, preferredSkills: preferredScore, experience: experienceScore, education: educationScore, semantic: semantic.score, preferences: preferenceScore };
    const w = config.matchingWeights; const used = Object.keys(components).filter((key) => applicable[key]); const usedWeight = used.reduce((sum, key) => sum + w[key], 0); const overallScore = usedWeight ? Math.round(used.reduce((sum, key) => sum + components[key] * w[key], 0) / usedWeight) : 0;
    const evidenceQuality = sanitizedResumeText.length > 500 ? 0.9 : sanitizedResumeText.length > 100 ? 0.7 : 0.4;
    const confidence = Number(((semantic.confidence * 0.35) + (evidenceQuality * 0.65)).toFixed(2));
    const legacy = calculateResumeJobMatch({ resumeText: sanitizedResumeText, resumeSkills: candidateSkills, jobSkills: job.skills || [], jobDescription: job.description, jobTitle: job.title, jobExperience: job.experience });
    return { overallScore, confidence, componentScores: { requiredSkills: { score: requiredScore, weight: w.requiredSkills, applicable: applicable.requiredSkills }, preferredSkills: { score: preferredScore, weight: w.preferredSkills, applicable: applicable.preferredSkills }, experience: { score: experienceScore, weight: w.experience, applicable: applicable.experience }, education: { score: educationScore, weight: w.education, applicable: applicable.education }, semantic: { score: semantic.score, weight: w.semantic, applicable: applicable.semantic, method: semantic.method }, preferences: { score: preferenceScore, weight: w.preferences, applicable: applicable.preferences } }, matchedSkills: [...new Set([...matchedRequired, ...matchedPreferred])], missingRequiredSkills: missingRequired, missingPreferredSkills: missingPreferred, experienceEvidence: { requiredYears, candidateYears, sufficient: !requiredYears || candidateYears >= requiredYears }, educationEvidence: { explicitlyRequired: educationRequired, evidenceFound: educationFound }, semanticEvidence: semantic, strengths: [matchedRequired.length ? `${matchedRequired.length} required skills have evidence` : null, experienceScore === 100 ? "Experience requirement appears satisfied" : null].filter(Boolean), concerns: [missingRequired.length ? `${missingRequired.length} required skills lack evidence` : null, candidateYears == null && requiredYears ? "Experience duration is uncertain" : null, ...preferenceConcerns].filter(Boolean), recommendation: overallScore >= 80 ? "strong_match" : overallScore >= 65 ? "review" : overallScore >= 45 ? "possible_match" : "weak_match", limitations: ["Decision-support score, not a hiring decision", semantic.method === "tfidf" ? "Embedding provider unavailable; lexical fallback used" : null, evidenceQuality < 0.7 ? "Limited resume evidence reduces confidence" : null].filter(Boolean), deterministicFallback: legacy };
};
module.exports = { calculateHybridMatch, sanitizeProfessionalText };
