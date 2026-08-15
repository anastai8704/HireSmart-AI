/**
 * resumeMatchingService.js
 * -----------------------------------------------------------------------------
 * The heart of "HireSmart AI": scoring how well a resume fits a job.
 *
 * HOW THE SCORE IS BUILT (total 100 points)
 *
 *   Skill match        55%  Do they have the specific skills the job lists?
 *   Semantic match     25%  Does the resume *read* like this job description?
 *                           (TF-IDF + cosine similarity, so wording differences
 *                           and synonyms still match.)
 *   Experience match   15%  Do their years of experience meet the requirement?
 *   Education/keyword  05%  Degrees, certifications and other signals.
 *
 * WHY WEIGHTED, NOT A SINGLE NUMBER?
 * Recruiters do not trust a black box. By keeping four separate, explainable
 * components we can show *why* a candidate scored 72 rather than 90 - which is
 * also what makes this defensible in a viva and useful in the UI.
 *
 * IMPORTANT: this module is pure and synchronous - no database, no network.
 * That makes it trivial to unit-test and impossible to break by losing wifi.
 */

const {
    normalizeSkill,
    tokenize,
    buildTfIdfVectors,
    cosineSimilarity,
    extractYearsOfExperience,
} = require("./textAnalysis");

/** How much each component contributes to the final score. Must sum to 1. */
const WEIGHTS = Object.freeze({
    skills: 0.55,
    semantic: 0.25,
    experience: 0.15,
    education: 0.05,
});

/** Recognised qualification keywords, used for the education component. */
const EDUCATION_KEYWORDS = [
    "bachelor", "master", "phd", "doctorate", "b.tech", "btech", "m.tech",
    "mtech", "bsc", "msc", "bca", "mca", "be", "me", "mba", "diploma",
    "certification", "certified", "engineering", "computer science",
];

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const toPercent = (ratio) => Math.round(clamp(ratio * 100));

/**
 * Compares the skills a job asks for against the skills we can evidence for
 * the candidate.
 *
 * A skill counts as "matched" when it appears either in the candidate's
 * declared skill list OR anywhere in their resume text. Checking the resume
 * text matters because candidates frequently forget to tick a skill in their
 * profile even though their projects clearly demonstrate it.
 */
const scoreSkills = ({ jobSkills, resumeSkills, resumeTokens }) => {
    const requiredSkills = [...new Set(jobSkills.map(normalizeSkill).filter(Boolean))];

    if (requiredSkills.length === 0) {
        return { score: 0, matchedSkills: [], missingSkills: [], applicable: false };
    }

    const declaredSkills = new Set(resumeSkills.map(normalizeSkill).filter(Boolean));
    const resumeTokenSet = new Set(resumeTokens);

    const matchedSkills = [];
    const missingSkills = [];

    for (const skill of requiredSkills) {
        // tokenize() applies the same stemming/synonym rules used on the resume,
        // so "Node.js" in a job matches "nodejs" in a CV.
        const skillTokens = tokenize(skill);

        const isDeclared = declaredSkills.has(skill);
        const isInResumeText =
            skillTokens.length > 0 &&
            skillTokens.every((token) => resumeTokenSet.has(token));

        if (isDeclared || isInResumeText) {
            matchedSkills.push(skill);
        } else {
            missingSkills.push(skill);
        }
    }

    return {
        score: toPercent(matchedSkills.length / requiredSkills.length),
        matchedSkills,
        missingSkills,
        applicable: true,
    };
};

/**
 * Measures overall textual similarity between the resume and the job advert.
 * This catches relevant experience the skill list never mentioned.
 */
const scoreSemantic = ({ resumeText, jobText }) => {
    if (!resumeText.trim() || !jobText.trim()) {
        return { score: 0, applicable: false };
    }

    const [resumeVector, jobVector] = buildTfIdfVectors([resumeText, jobText]);
    const similarity = cosineSimilarity(resumeVector, jobVector);

    // Real-world resume/JD cosine similarity rarely exceeds ~0.45 even for an
    // excellent match, because a CV contains a lot of text a job advert never
    // does. We rescale so that 0.45+ reads as ~100% rather than a harsh 45%.
    const CALIBRATION_CEILING = 0.45;

    return {
        score: toPercent(Math.min(1, similarity / CALIBRATION_CEILING)),
        rawSimilarity: Number(similarity.toFixed(4)),
        applicable: true,
    };
};

/**
 * Compares required years of experience with what the resume claims.
 * Meeting or exceeding the requirement scores 100; falling short scores
 * proportionally, so 3 years against a 4-year ask still earns 75.
 */
const scoreExperience = ({ jobExperience, resumeText, candidateYears }) => {
    const required = extractYearsOfExperience(jobExperience);

    if (required === null || required === 0) {
        return { score: 0, applicable: false, requiredYears: required, candidateYears: null };
    }

    const actual =
        typeof candidateYears === "number"
            ? candidateYears
            : extractYearsOfExperience(resumeText);

    if (actual === null) {
        return { score: 0, applicable: false, requiredYears: required, candidateYears: null };
    }

    return {
        score: toPercent(Math.min(1, actual / required)),
        applicable: true,
        requiredYears: required,
        candidateYears: actual,
    };
};

/**
 * Looks for qualification signals. A small component, but it separates two
 * otherwise identical candidates.
 */
const scoreEducation = ({ resumeText }) => {
    const haystack = resumeText.toLowerCase();
    const found = EDUCATION_KEYWORDS.filter((keyword) => haystack.includes(keyword));

    if (!haystack.trim()) {
        return { score: 0, applicable: false, signals: [] };
    }

    // Three or more qualification signals is treated as a full score.
    return {
        score: toPercent(Math.min(1, found.length / 3)),
        applicable: true,
        signals: found.slice(0, 6),
    };
};

/**
 * Converts a numeric score into the label recruiters actually act on.
 */
const toVerdict = (score) => {
    if (score >= 80) return "Excellent match";
    if (score >= 65) return "Strong match";
    if (score >= 50) return "Moderate match";
    if (score >= 30) return "Weak match";
    return "Not a match";
};

/**
 * Produces short, human-readable reasons for the score. These are what we show
 * in the UI so the number never feels arbitrary.
 */
const buildExplanation = ({ skills, semantic, experience, education }) => {
    const reasons = [];

    if (skills.applicable) {
        const total = skills.matchedSkills.length + skills.missingSkills.length;
        reasons.push(
            `Matched ${skills.matchedSkills.length} of ${total} required skills.`
        );

        if (skills.missingSkills.length > 0) {
            reasons.push(
                `Missing: ${skills.missingSkills.slice(0, 5).join(", ")}${
                    skills.missingSkills.length > 5 ? ", ..." : ""
                }.`
            );
        }
    }

    if (semantic.applicable) {
        const quality =
            semantic.score >= 70 ? "closely" : semantic.score >= 40 ? "partly" : "loosely";
        reasons.push(`Resume content aligns ${quality} with the job description.`);
    }

    if (experience.applicable) {
        reasons.push(
            experience.candidateYears >= experience.requiredYears
                ? `Meets the ${experience.requiredYears}+ year experience requirement.`
                : `Has about ${experience.candidateYears} years against ${experience.requiredYears} required.`
        );
    }

    if (education.applicable && education.signals.length > 0) {
        reasons.push(`Education signals found: ${education.signals.slice(0, 3).join(", ")}.`);
    }

    return reasons;
};

/**
 * Main entry point.
 *
 * @param {object}   input
 * @param {string}   input.resumeText      Plain text extracted from the resume.
 * @param {string[]} input.resumeSkills    Skills declared on the candidate profile.
 * @param {string[]} input.jobSkills       Skills the job requires.
 * @param {string}   input.jobDescription  Full job description text.
 * @param {string}   input.jobTitle        Job title (adds useful signal).
 * @param {string}   input.jobExperience   e.g. "3+ years".
 * @param {number}   [input.candidateYears] Known years of experience, if any.
 *
 * @returns {object} score, verdict, matched/missing skills and a breakdown.
 */
const calculateResumeJobMatch = ({
    resumeText = "",
    resumeSkills = [],
    jobSkills = [],
    jobDescription = "",
    jobTitle = "",
    jobExperience = "",
    candidateYears = null,
} = {}) => {
    const safeResumeText = String(resumeText || "");
    const resumeTokens = tokenize(`${safeResumeText} ${resumeSkills.join(" ")}`);

    // The title is repeated because a title match is a strong relevance signal.
    const jobText = `${jobTitle} ${jobTitle} ${jobDescription} ${jobSkills.join(" ")}`;

    const skills = scoreSkills({ jobSkills, resumeSkills, resumeTokens });
    const semantic = scoreSemantic({ resumeText: safeResumeText, jobText });
    const experience = scoreExperience({ jobExperience, resumeText: safeResumeText, candidateYears });
    const education = scoreEducation({ resumeText: safeResumeText });

    const components = { skills, semantic, experience, education };

    // Only components we could actually evaluate take part in the average, and
    // we re-normalise their weights. Otherwise a job with no stated experience
    // requirement would cap every candidate at 85%.
    let weightedTotal = 0;
    let usedWeight = 0;

    for (const [name, weight] of Object.entries(WEIGHTS)) {
        if (components[name].applicable) {
            weightedTotal += components[name].score * weight;
            usedWeight += weight;
        }
    }

    const matchScore = usedWeight > 0 ? Math.round(weightedTotal / usedWeight) : 0;

    return {
        matchScore: clamp(matchScore),
        verdict: toVerdict(matchScore),
        matchedSkills: skills.matchedSkills,
        missingSkills: skills.missingSkills,
        breakdown: {
            skills: {
                score: skills.score,
                weight: WEIGHTS.skills,
                applicable: skills.applicable,
            },
            semantic: {
                score: semantic.score,
                weight: WEIGHTS.semantic,
                applicable: semantic.applicable,
                rawSimilarity: semantic.rawSimilarity ?? null,
            },
            experience: {
                score: experience.score,
                weight: WEIGHTS.experience,
                applicable: experience.applicable,
                requiredYears: experience.requiredYears ?? null,
                candidateYears: experience.candidateYears ?? null,
            },
            education: {
                score: education.score,
                weight: WEIGHTS.education,
                applicable: education.applicable,
                signals: education.signals,
            },
        },
        explanation: buildExplanation(components),
    };
};

/**
 * Ranks many candidates against one job, best first.
 * Used by the recruiter "AI Ranking" screen.
 */
const rankCandidatesForJob = ({ job, candidates = [] }) =>
    candidates
        .map((candidate) => ({
            ...candidate,
            match: calculateResumeJobMatch({
                resumeText: candidate.resumeText,
                resumeSkills: candidate.skills || [],
                jobSkills: job.skills || [],
                jobDescription: job.description || "",
                jobTitle: job.title || "",
                jobExperience: job.experience || "",
            }),
        }))
        .sort((a, b) => b.match.matchScore - a.match.matchScore);

/**
 * Ranks many jobs for one candidate, best first.
 * Used by the candidate "Recommended for you" screen.
 */
const recommendJobsForCandidate = ({ resumeText, skills = [], jobs = [] }) =>
    jobs
        .map((job) => ({
            job,
            match: calculateResumeJobMatch({
                resumeText,
                resumeSkills: skills,
                jobSkills: job.skills || [],
                jobDescription: job.description || "",
                jobTitle: job.title || "",
                jobExperience: job.experience || "",
            }),
        }))
        .sort((a, b) => b.match.matchScore - a.match.matchScore);

module.exports = {
    WEIGHTS,
    calculateResumeJobMatch,
    rankCandidatesForJob,
    recommendJobsForCandidate,
    toVerdict,
};
