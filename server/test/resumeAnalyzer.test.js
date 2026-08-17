process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
    analyzeResume,
    analyzeResumeAgainstJob,
    extractContactInfo,
    extractSkills,
    detectSections,
} = require("../services/resumeAnalyzerService");

const GOOD_RESUME = `
Anas Tai - Full Stack Developer
Email: anas.tai@example.com | Phone: +91 98765 43210
linkedin.com/in/anastai | github.com/anastai

SUMMARY
Full stack developer with 4 years of experience building production web
applications with React, Node.js and MongoDB.

SKILLS
JavaScript, TypeScript, React, Redux, Node.js, Express, MongoDB, PostgreSQL,
Docker, Kubernetes, AWS, Git, Jest, Cypress, Tailwind CSS, REST API

EXPERIENCE
Software Engineer, Cloud Systems (2021 - 2025)
- Built an applicant tracking platform in React and Node.js serving 50000 users
- Reduced API response time by 45% by introducing Redis caching
- Automated CI/CD with Docker and GitHub Actions, cutting release time by 60%
- Led a team of 4 engineers and mentored 2 interns
- Migrated 120000 records from MySQL to MongoDB with zero downtime

PROJECTS
HireSmart AI - An AI powered applicant tracking system. Designed the resume
scoring engine using TF-IDF and cosine similarity, improving shortlisting
accuracy by 35%.

EDUCATION
Master of Computer Applications, Pune University, 2025
`;

const POOR_RESUME = `
John Doe

I am a hard worker and a team player looking for a job.

I was responsible for some tasks at my previous company.
I worked on a few things and helped with projects.
I am familiar with computers.

I studied at a college.
`;

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

test("extractContactInfo finds email, phone and profile links", () => {
    const contact = extractContactInfo(GOOD_RESUME);

    assert.equal(contact.email, "anas.tai@example.com");
    assert.ok(contact.phone, "a phone number should be detected");
    assert.ok(contact.linkedin.includes("linkedin.com"));
    assert.ok(contact.github.includes("github.com"));
});

test("extractContactInfo returns nulls rather than throwing on sparse text", () => {
    const contact = extractContactInfo(POOR_RESUME);

    assert.equal(contact.email, null);
    assert.equal(contact.linkedin, null);
});

test("extractSkills groups detected technologies by category", () => {
    const skills = extractSkills(GOOD_RESUME);

    assert.ok(skills.all.includes("react"));
    assert.ok(skills.all.includes("mongodb"));
    assert.ok(skills.all.includes("docker"));
    assert.ok(skills.byCategory.frontend.includes("react"));
    assert.ok(skills.byCategory.database.includes("mongodb"));
    assert.ok(skills.byCategory.devops.includes("docker"));
});

test("detectSections reports which standard headings exist", () => {
    const sections = detectSections(GOOD_RESUME);

    assert.ok(sections.present.includes("Skills"));
    assert.ok(sections.present.includes("Experience"));
    assert.ok(sections.present.includes("Education"));
    assert.ok(sections.present.includes("Projects"));
    assert.equal(sections.missing.length, 0);
});

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

test("a well-written resume earns a high ATS score", () => {
    const report = analyzeResume(GOOD_RESUME);

    assert.ok(report.atsScore >= 75, `expected a high score, received ${report.atsScore}`);
    assert.ok(["A+", "A", "B"].includes(report.grade), `unexpected grade ${report.grade}`);
    assert.equal(report.experienceYears, 4);
    assert.ok(report.achievements.count >= 3, "quantified achievements should be detected");
});

test("a weak resume scores low and receives critical, actionable advice", () => {
    const report = analyzeResume(POOR_RESUME);

    assert.ok(report.atsScore < 50, `expected a low score, received ${report.atsScore}`);

    const critical = report.suggestions.filter((s) => s.severity === "critical");
    assert.ok(critical.length > 0, "missing contact details must be flagged as critical");

    // Vague phrasing must be called out explicitly.
    assert.ok(report.weakPhrases.includes("hard worker"));
    assert.ok(report.weakPhrases.includes("responsible for"));

    // Every suggestion must tell the candidate what to actually do.
    for (const suggestion of report.suggestions) {
        assert.ok(suggestion.title.length > 5);
        assert.ok(suggestion.detail.length > 20, "advice must be specific, not a label");
    }
});

test("suggestions are ordered by severity so the biggest wins come first", () => {
    const report = analyzeResume(POOR_RESUME);
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };

    for (let i = 1; i < report.suggestions.length; i += 1) {
        assert.ok(
            rank[report.suggestions[i - 1].severity] <= rank[report.suggestions[i].severity],
            "suggestions must be sorted by severity"
        );
    }
});

test("unreadable or empty resumes fail gracefully with guidance", () => {
    const report = analyzeResume("");

    assert.equal(report.atsScore, 0);
    assert.equal(report.grade, "F");
    assert.equal(report.suggestions[0].severity, "critical");
    assert.ok(report.summary.length > 0);
});

test("every check reports a bounded score and its weight", () => {
    const report = analyzeResume(GOOD_RESUME);

    const totalWeight = report.checks.reduce((sum, check) => sum + check.weight, 0);
    assert.ok(Math.abs(totalWeight - 1) < 0.001, "check weights must sum to 1");

    for (const check of report.checks) {
        assert.ok(check.score >= 0 && check.score <= 100);
        assert.ok(check.label.length > 0);
    }
});

// ---------------------------------------------------------------------------
// Job-targeted analysis
// ---------------------------------------------------------------------------

test("analyzing against a job reports the exact keyword gaps to fix", () => {
    const result = analyzeResumeAgainstJob({
        resumeText: GOOD_RESUME,
        job: {
            _id: "job1",
            title: "Site Reliability Engineer",
            company: "Acme",
            description: "You will run Terraform and Ansible across our fleet.",
            skills: ["Terraform", "Ansible", "Docker"],
            experience: "3+ years",
        },
    });

    // Docker is present in the resume, the other two are genuinely missing.
    assert.ok(result.keywordGaps.includes("terraform"));
    assert.ok(result.keywordGaps.includes("ansible"));
    assert.ok(!result.keywordGaps.includes("docker"));

    assert.equal(result.tailoringTips.length, result.keywordGaps.length);
    assert.ok(result.match.matchScore >= 0 && result.match.matchScore <= 100);
    assert.equal(result.job.title, "Site Reliability Engineer");
});

test("skill detection does not produce substring false positives", () => {
    // "javascript" must not also register "java"; "github" must not register
    // "git"; and stray letters must not be read as the C / R languages.
    const skills = extractSkills(
        "Skilled in JavaScript and React. Portfolio at github.com/someone."
    );

    assert.ok(skills.all.includes("javascript"));
    assert.ok(skills.all.includes("react"));
    assert.ok(!skills.all.includes("java"), "java must not match inside javascript");
    assert.ok(!skills.all.includes("c"), "the letter c must not match as a language");
    assert.ok(!skills.all.includes("r"), "the letter r must not match as a language");
    assert.ok(!skills.all.includes("go"), "go must not match inside other words");
});

test("genuinely mentioned ambiguous languages are still detected", () => {
    const skills = extractSkills("Languages: Java, C, Go, R and Python. Tools: Git.");

    assert.ok(skills.all.includes("java"));
    assert.ok(skills.all.includes("c"));
    assert.ok(skills.all.includes("go"));
    assert.ok(skills.all.includes("r"));
    assert.ok(skills.all.includes("python"));
    assert.ok(skills.all.includes("git"));
});
