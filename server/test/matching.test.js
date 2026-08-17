process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
    calculateResumeJobMatch,
    rankCandidatesForJob,
    recommendJobsForCandidate,
} = require("../services/resumeMatchingService");

const {
    tokenize,
    normalizeSkill,
    cosineSimilarity,
    buildTfIdfVectors,
    extractYearsOfExperience,
} = require("../services/textAnalysis");

// A realistic resume for a candidate who genuinely fits a MERN role.
const STRONG_RESUME = `
Anas Tai - Full Stack Developer
Email: anas@example.com | Phone: +91 98765 43210
linkedin.com/in/anastai | github.com/anastai

SUMMARY
Full stack developer with 4 years of experience building production web
applications using React, Node.js, Express and MongoDB.

SKILLS
JavaScript, TypeScript, React.js, Redux, Node.js, Express.js, MongoDB,
PostgreSQL, Docker, AWS, Git, Jest, REST APIs, Tailwind CSS

EXPERIENCE
Software Engineer, Cloud Systems (2021-2025)
- Built a React and Node.js applicant tracking platform serving 50000 users
- Reduced API response time by 45% by adding Redis caching and query indexes
- Designed REST APIs with Express and MongoDB aggregation pipelines
- Automated deployment with Docker and GitHub Actions, cutting release time by 60%

EDUCATION
Master of Computer Applications, Pune University
`;

// A candidate from a completely different field.
const WEAK_RESUME = `
Priya Sharma - Graphic Designer
Email: priya@example.com | Phone: +91 91234 56789

SUMMARY
Creative graphic designer with 2 years of experience in branding and print.

SKILLS
Adobe Photoshop, Illustrator, InDesign, Figma, typography, colour theory

EXPERIENCE
Designer, Print House
- Designed brochures, posters and packaging for retail clients
- Managed brand guidelines across 12 accounts

EDUCATION
Bachelor of Fine Arts
`;

const MERN_JOB = {
    title: "Full Stack MERN Developer",
    description:
        "We are looking for a full stack developer to build scalable web applications using React, Node.js, Express and MongoDB. You will design REST APIs, write tests and deploy with Docker on AWS.",
    skills: ["React", "Node.js", "Express", "MongoDB", "JavaScript", "Docker", "REST API"],
    experience: "3+ years",
};

// ---------------------------------------------------------------------------
// Text analysis primitives
// ---------------------------------------------------------------------------

test("normalizeSkill maps different spellings onto one canonical token", () => {
    assert.equal(normalizeSkill("React.js"), "react");
    assert.equal(normalizeSkill("  REACTJS "), "react");
    assert.equal(normalizeSkill("Node.js"), "node");
    assert.equal(normalizeSkill("JS"), "javascript");
    assert.equal(normalizeSkill("Machine Learning"), "machinelearning");
});

test("tokenize removes stop words and stems related word forms together", () => {
    const tokens = tokenize("We are looking for someone who developed and develops APIs");

    assert.ok(!tokens.includes("we"), "stop words should be removed");
    assert.ok(!tokens.includes("are"), "stop words should be removed");
    assert.ok(!tokens.includes("looking"), "recruitment boilerplate should be removed");

    // "developed" and "develops" describe the same activity and must collapse
    // to a single shared stem so both count as the same evidence.
    const developTokens = tokens.filter((token) => token.startsWith("develop"));
    assert.equal(developTokens.length, 2, "both word forms should survive tokenising");
    assert.equal(new Set(developTokens).size, 1, "both forms should share one stem");

    // Note: we deliberately do NOT stem the agent suffix "-er", because doing so
    // would mangle technology names ("docker" -> "dock", "kubernetes" clusters).
    // Stemming stays conservative so skill tokens remain intact.
});

test("cosine similarity is highest for the most related document", () => {
    const [a, b, c] = buildTfIdfVectors([
        "react node express mongodb javascript developer",
        "react node express mongodb javascript engineer",
        "photoshop illustrator branding typography design",
    ]);

    const related = cosineSimilarity(a, b);
    const unrelated = cosineSimilarity(a, c);

    assert.ok(related > unrelated, "similar documents must score higher");
    assert.ok(related > 0.5, `expected a strong similarity, received ${related}`);
    assert.ok(unrelated < 0.2, `expected a weak similarity, received ${unrelated}`);
});

test("extractYearsOfExperience understands the common phrasings", () => {
    assert.equal(extractYearsOfExperience("5 years of experience"), 5);
    assert.equal(extractYearsOfExperience("3+ years"), 3);
    assert.equal(extractYearsOfExperience("2-4 years required"), 2);
    assert.equal(extractYearsOfExperience("at least 6 years"), 6);
    assert.equal(extractYearsOfExperience("fresher"), null);
});

// ---------------------------------------------------------------------------
// Scoring behaviour
// ---------------------------------------------------------------------------

test("a genuinely matching resume scores far higher than an unrelated one", () => {
    const strong = calculateResumeJobMatch({
        resumeText: STRONG_RESUME,
        resumeSkills: ["React", "Node.js", "Express", "MongoDB", "JavaScript", "Docker"],
        jobSkills: MERN_JOB.skills,
        jobDescription: MERN_JOB.description,
        jobTitle: MERN_JOB.title,
        jobExperience: MERN_JOB.experience,
    });

    const weak = calculateResumeJobMatch({
        resumeText: WEAK_RESUME,
        resumeSkills: ["Photoshop", "Illustrator", "Figma"],
        jobSkills: MERN_JOB.skills,
        jobDescription: MERN_JOB.description,
        jobTitle: MERN_JOB.title,
        jobExperience: MERN_JOB.experience,
    });

    assert.ok(strong.matchScore >= 70, `strong resume scored only ${strong.matchScore}`);
    assert.ok(weak.matchScore <= 30, `weak resume scored too high at ${weak.matchScore}`);
    assert.ok(strong.matchScore - weak.matchScore > 40, "the gap should be decisive");
});

test("the score is always explainable and bounded", () => {
    const result = calculateResumeJobMatch({
        resumeText: STRONG_RESUME,
        resumeSkills: ["React", "Node.js"],
        jobSkills: MERN_JOB.skills,
        jobDescription: MERN_JOB.description,
        jobTitle: MERN_JOB.title,
        jobExperience: MERN_JOB.experience,
    });

    assert.ok(result.matchScore >= 0 && result.matchScore <= 100);
    assert.ok(typeof result.verdict === "string" && result.verdict.length > 0);
    assert.ok(Array.isArray(result.explanation) && result.explanation.length > 0);

    // Every component must be reported so the UI can show the breakdown.
    for (const key of ["skills", "semantic", "experience", "education"]) {
        assert.ok(result.breakdown[key], `missing breakdown for ${key}`);
        assert.ok(result.breakdown[key].score >= 0 && result.breakdown[key].score <= 100);
    }
});

test("skills are credited from the resume text even when not declared", () => {
    // The candidate declares nothing, but the resume clearly mentions the stack.
    const result = calculateResumeJobMatch({
        resumeText: STRONG_RESUME,
        resumeSkills: [],
        jobSkills: ["React", "MongoDB", "Docker"],
        jobDescription: MERN_JOB.description,
        jobTitle: MERN_JOB.title,
    });

    assert.ok(
        result.matchedSkills.includes("react"),
        `expected react to be matched, got ${JSON.stringify(result.matchedSkills)}`
    );
    assert.ok(result.matchedSkills.includes("mongodb"));
});

test("missing skills are reported so the candidate knows the gap", () => {
    const result = calculateResumeJobMatch({
        resumeText: STRONG_RESUME,
        resumeSkills: ["React", "Node.js"],
        jobSkills: ["React", "Kubernetes", "Rust"],
        jobDescription: "We need Kubernetes and Rust experience.",
        jobTitle: "Platform Engineer",
    });

    assert.ok(result.missingSkills.includes("kubernetes"));
    assert.ok(result.missingSkills.includes("rust"));
    assert.ok(!result.missingSkills.includes("react"));
});

test("an empty resume scores zero rather than crashing", () => {
    const result = calculateResumeJobMatch({
        resumeText: "",
        resumeSkills: [],
        jobSkills: MERN_JOB.skills,
        jobDescription: MERN_JOB.description,
    });

    assert.equal(result.matchScore, 0);
    assert.equal(result.verdict, "Not a match");
});

test("a job with no listed skills still produces a sensible score", () => {
    const result = calculateResumeJobMatch({
        resumeText: STRONG_RESUME,
        resumeSkills: ["React"],
        jobSkills: [],
        jobDescription: "Build React and Node applications for our platform.",
        jobTitle: "Frontend Developer",
    });

    assert.ok(result.matchScore > 0, "semantic similarity alone should still score");
    assert.equal(result.breakdown.skills.applicable, false);
});

// ---------------------------------------------------------------------------
// Ranking helpers
// ---------------------------------------------------------------------------

test("rankCandidatesForJob orders the best fit first", () => {
    const ranked = rankCandidatesForJob({
        job: MERN_JOB,
        candidates: [
            { id: "weak", resumeText: WEAK_RESUME, skills: ["Photoshop"] },
            { id: "strong", resumeText: STRONG_RESUME, skills: ["React", "Node.js", "MongoDB"] },
        ],
    });

    assert.equal(ranked[0].id, "strong");
    assert.ok(ranked[0].match.matchScore > ranked[1].match.matchScore);
});

test("recommendJobsForCandidate surfaces the most relevant job first", () => {
    const designJob = {
        title: "Graphic Designer",
        description: "Design brochures and branding using Photoshop and Illustrator.",
        skills: ["Photoshop", "Illustrator"],
        experience: "2+ years",
    };

    const recommendations = recommendJobsForCandidate({
        resumeText: STRONG_RESUME,
        skills: ["React", "Node.js", "MongoDB"],
        jobs: [designJob, MERN_JOB],
    });

    assert.equal(recommendations[0].job.title, MERN_JOB.title);
});
