// ATS-style resume health check: grades the resume, extracts contact data and
// skills, and returns actionable fixes. Works standalone or against a job.

const { normalizeSkill, tokenize, extractYearsOfExperience } = require("./textAnalysis");

/**
 * A curated dictionary of technical skills we can detect in free text.
 * Grouped by area so we can also tell the candidate which areas they are
 * strongest in, and suggest adjacent skills.
 */
const SKILL_DICTIONARY = Object.freeze({
  languages: [
    "javascript",
    "typescript",
    "python",
    "java",
    "csharp",
    "cplusplus",
    "c",
    "go",
    "rust",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "scala",
    "r",
    "dart",
  ],
  frontend: [
    "react",
    "angular",
    "vue",
    "next",
    "svelte",
    "html",
    "css",
    "tailwind",
    "bootstrap",
    "sass",
    "redux",
    "jquery",
    "webpack",
    "vite",
  ],
  backend: [
    "node",
    "express",
    "django",
    "flask",
    "fastapi",
    "spring",
    "laravel",
    "rails",
    "dotnet",
    "graphql",
    "restapi",
    "microservices",
    "grpc",
  ],
  database: [
    "mongodb",
    "postgresql",
    "mysql",
    "sqlite",
    "redis",
    "elasticsearch",
    "oracle",
    "cassandra",
    "dynamodb",
    "firebase",
    "sql",
    "nosql",
  ],
  devops: [
    "docker",
    "kubernetes",
    "amazonwebservices",
    "azure",
    "googlecloud",
    "jenkins",
    "cicd",
    "terraform",
    "ansible",
    "nginx",
    "linux",
    "git",
    "github",
    "gitlab",
  ],
  datascience: [
    "machinelearning",
    "deeplearning",
    "artificialintelligence",
    "tensorflow",
    "pytorch",
    "pandas",
    "numpy",
    "scikit",
    "keras",
    "opencv",
    "nlp",
    "tableau",
    "powerbi",
    "spark",
    "hadoop",
  ],
  testing: [
    "jest",
    "mocha",
    "cypress",
    "selenium",
    "playwright",
    "junit",
    "pytest",
    "vitest",
    "testing",
  ],
  mobile: ["android", "ios", "reactnative", "flutter", "xamarin"],
});

/** Flattened lookup: skill -> category. */
const SKILL_TO_CATEGORY = new Map();
for (const [category, skills] of Object.entries(SKILL_DICTIONARY)) {
  for (const skill of skills) {
    SKILL_TO_CATEGORY.set(skill, category);
  }
}

/**
 * Verbs that describe ownership and impact. ATS-friendly resumes lead bullet
 * points with these rather than "Responsible for..." or "Worked on...".
 */
const ACTION_VERBS = [
  "built",
  "designed",
  "developed",
  "implemented",
  "led",
  "created",
  "improved",
  "increased",
  "reduced",
  "optimized",
  "optimised",
  "automated",
  "launched",
  "delivered",
  "architected",
  "migrated",
  "scaled",
  "shipped",
  "engineered",
  "managed",
  "mentored",
  "collaborated",
  "resolved",
  "streamlined",
  "integrated",
  "deployed",
  "refactored",
  "achieved",
];

/** Phrases that signal vague, low-impact writing. */
const WEAK_PHRASES = [
  "responsible for",
  "worked on",
  "helped with",
  "involved in",
  "duties included",
  "familiar with",
  "exposure to",
  "team player",
  "hard worker",
  "go-getter",
  "think outside the box",
  "detail oriented",
];

/** Sections a complete resume is expected to contain. */
const EXPECTED_SECTIONS = [
  { name: "Contact", patterns: [/email|@|phone|mobile|contact|linkedin/i] },
  { name: "Summary", patterns: [/summary|objective|profile|about me/i] },
  { name: "Skills", patterns: [/skills|technolog|technical|competenc|expertise/i] },
  { name: "Experience", patterns: [/experience|employment|work history|internship/i] },
  { name: "Education", patterns: [/education|academic|qualification|degree|university|college/i] },
  { name: "Projects", patterns: [/projects?|portfolio/i] },
];

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

/**
 * Extracts contact details. Missing contact info is the single most common
 * reason an otherwise good resume is discarded automatically.
 */
const extractContactInfo = (text) => {
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  // Handles +91 98765 43210, (555) 123-4567, 9876543210, etc.
  const phone = text.match(
    /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3,5}[\s-]?\d{3,5}(?:[\s-]?\d{2,4})?/,
  );
  const linkedin = text.match(/linkedin\.com\/[\w\-/]+/i);
  const github = text.match(/github\.com\/[\w\-/]+/i);
  const portfolio = text.match(/https?:\/\/(?!.*(?:linkedin|github))[\w.-]+\.[a-z]{2,}[\w/-]*/i);

  return {
    email: email ? email[0] : null,
    phone: phone && phone[0].replace(/\D/g, "").length >= 8 ? phone[0].trim() : null,
    linkedin: linkedin ? linkedin[0] : null,
    github: github ? github[0] : null,
    portfolio: portfolio ? portfolio[0] : null,
  };
};

/**
 * Finds every known technical skill mentioned anywhere in the resume,
 * grouped by category.
 */
const extractSkills = (text) => {
  const tokens = new Set(tokenize(text));
  const lowerText = text.toLowerCase();
  const byCategory = {};
  const all = [];

  // Skills whose names are substrings of other words. Matching these with a
  // plain `includes()` produced false positives: "javascript" contains "java",
  // "github" contains "git", and the letters c / r / go appear everywhere.
  // For these we require a real word boundary.
  const AMBIGUOUS = new Set(["c", "r", "go", "java", "git", "be", "me", "spark"]);

  const mentionedAsWord = (skill) => {
    // Escape regex metacharacters such as + and # in "c++" / "c#".
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?:[^a-z0-9+#]|$)`, "i").test(lowerText);
  };

  for (const [category, skills] of Object.entries(SKILL_DICTIONARY)) {
    const found = skills.filter((skill) => {
      if (AMBIGUOUS.has(skill)) {
        return mentionedAsWord(skill);
      }

      if (tokens.has(skill)) return true;

      // Multi-word / punctuated skills that tokenising may have split.
      return lowerText.includes(skill);
    });

    if (found.length > 0) {
      byCategory[category] = found;
      all.push(...found);
    }
  }

  return { all: [...new Set(all)], byCategory };
};

/**
 * Detects which standard resume sections are present.
 */
const detectSections = (text) => {
  const present = [];
  const missing = [];

  for (const section of EXPECTED_SECTIONS) {
    if (section.patterns.some((pattern) => pattern.test(text))) {
      present.push(section.name);
    } else {
      missing.push(section.name);
    }
  }

  return { present, missing };
};

/**
 * Counts quantified achievements - bullet points containing a number, percentage
 * or currency amount. "Reduced load time by 40%" beats "Improved performance"
 * every time, with both recruiters and ATS keyword scoring.
 */
const findQuantifiedAchievements = (text) => {
  const lines = text
    .split(/[\n\r•·▪]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 15);

  const quantified = lines.filter((line) =>
    /\d+\s*%|\d+\s*x\b|\$\s*\d|₹\s*\d|\b\d{2,}\s*(?:users|customers|requests|records|hours|days|ms|seconds|k\b|million|lakh|crore)/i.test(
      line,
    ),
  );

  return {
    totalLines: lines.length,
    quantified: quantified.slice(0, 10),
    count: quantified.length,
  };
};

/** Finds strong action verbs used to open achievements. */
const findActionVerbs = (text) => {
  const lower = text.toLowerCase();
  return ACTION_VERBS.filter((verb) => new RegExp(`\\b${verb}\\b`).test(lower));
};

/** Finds vague filler phrases that weaken a resume. */
const findWeakPhrases = (text) => {
  const lower = text.toLowerCase();
  return WEAK_PHRASES.filter((phrase) => lower.includes(phrase));
};

/**
 * Individual scoring checks. Each returns 0-100 and carries its own weight,
 * mirroring how an ATS grades structure, keywords and readability.
 */
const runChecks = (text) => {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const contact = extractContactInfo(text);
  const sections = detectSections(text);
  const skills = extractSkills(text);
  const achievements = findQuantifiedAchievements(text);
  const actionVerbs = findActionVerbs(text);
  const weakPhrases = findWeakPhrases(text);

  // 1. Contact completeness - email and phone are mandatory, links are bonus.
  const contactPoints =
    (contact.email ? 40 : 0) +
    (contact.phone ? 30 : 0) +
    (contact.linkedin ? 15 : 0) +
    (contact.github || contact.portfolio ? 15 : 0);

  // 2. Section coverage.
  const sectionScore = (sections.present.length / EXPECTED_SECTIONS.length) * 100;

  // 3. Skill density - roughly 12+ recognised skills reads as a full profile.
  const skillScore = Math.min(100, (skills.all.length / 12) * 100);

  // 4. Quantified impact - 5+ measurable bullet points is excellent.
  const achievementScore = Math.min(100, (achievements.count / 5) * 100);

  // 5. Strong writing - action verbs present, filler phrases absent.
  const verbScore = Math.min(100, (actionVerbs.length / 8) * 100);
  const penalty = Math.min(40, weakPhrases.length * 10);
  const writingScore = clamp(verbScore - penalty);

  // 6. Length - 400-900 words is the sweet spot for 1-2 pages.
  let lengthScore = 100;
  if (wordCount < 200) lengthScore = 30;
  else if (wordCount < 400) lengthScore = 70;
  else if (wordCount > 1200) lengthScore = 60;
  else if (wordCount > 900) lengthScore = 85;

  return {
    wordCount,
    contact,
    sections,
    skills,
    achievements,
    actionVerbs,
    weakPhrases,
    checks: [
      { key: "contact", label: "Contact information", score: clamp(contactPoints), weight: 0.15 },
      { key: "sections", label: "Resume structure", score: clamp(sectionScore), weight: 0.2 },
      { key: "skills", label: "Skill coverage", score: clamp(skillScore), weight: 0.25 },
      {
        key: "achievements",
        label: "Quantified achievements",
        score: clamp(achievementScore),
        weight: 0.2,
      },
      { key: "writing", label: "Impactful writing", score: clamp(writingScore), weight: 0.15 },
      { key: "length", label: "Appropriate length", score: clamp(lengthScore), weight: 0.05 },
    ],
  };
};

/**
 * Turns the raw checks into prioritised, specific advice.
 * Every suggestion says what to do, not just what is wrong.
 */
const buildSuggestions = (analysis) => {
  const suggestions = [];
  const { contact, sections, skills, achievements, actionVerbs, weakPhrases, wordCount } = analysis;

  if (!contact.email) {
    suggestions.push({
      severity: "critical",
      title: "Add a professional email address",
      detail:
        "No email was found. An ATS cannot forward your application without one. Put it in the top three lines of the resume.",
    });
  }

  if (!contact.phone) {
    suggestions.push({
      severity: "critical",
      title: "Add a phone number",
      detail:
        "Recruiters shortlist by phone first. Include your number with the country code, for example +91 98765 43210.",
    });
  }

  if (!contact.linkedin) {
    suggestions.push({
      severity: "medium",
      title: "Add your LinkedIn profile",
      detail:
        "Around 87% of recruiters check LinkedIn. Add the full URL so it stays clickable after PDF export.",
    });
  }

  if (!contact.github && !contact.portfolio) {
    suggestions.push({
      severity: "high",
      title: "Link your GitHub or portfolio",
      detail:
        "For a developer role, working code is the strongest proof of skill. Link a GitHub profile with pinned projects.",
    });
  }

  for (const missing of sections.missing) {
    suggestions.push({
      severity: missing === "Experience" || missing === "Education" ? "high" : "medium",
      title: `Add a "${missing}" section`,
      detail: `Parsers look for a clearly titled "${missing}" heading. Without it this information may be ignored entirely.`,
    });
  }

  if (skills.all.length < 8) {
    suggestions.push({
      severity: "high",
      title: "List more relevant technical skills",
      detail: `Only ${skills.all.length} recognisable technical skills were detected. Add a dedicated Skills section naming languages, frameworks, databases and tools explicitly.`,
    });
  }

  if (achievements.count < 3) {
    suggestions.push({
      severity: "high",
      title: "Quantify your achievements",
      detail: `Only ${achievements.count} bullet points contain measurable results. Rewrite duties as outcomes, for example "Reduced API response time by 40% by adding Redis caching".`,
    });
  }

  if (actionVerbs.length < 5) {
    suggestions.push({
      severity: "medium",
      title: "Start bullet points with strong action verbs",
      detail:
        "Open each bullet with verbs such as Built, Designed, Automated, Reduced or Led instead of passive descriptions.",
    });
  }

  if (weakPhrases.length > 0) {
    suggestions.push({
      severity: "medium",
      title: "Remove vague filler phrases",
      detail: `Found: "${weakPhrases.slice(0, 4).join('", "')}". Replace them with the specific thing you built and its result.`,
    });
  }

  if (wordCount < 300) {
    suggestions.push({
      severity: "high",
      title: "Your resume is too short",
      detail: `At ${wordCount} words it looks sparse. Expand your projects with the problem, your approach, the tech used and the outcome.`,
    });
  } else if (wordCount > 1200) {
    suggestions.push({
      severity: "medium",
      title: "Your resume is too long",
      detail: `At ${wordCount} words it likely exceeds two pages. Keep only the most recent and most relevant achievements.`,
    });
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return suggestions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
};

/** Converts a numeric ATS score into a letter grade. */
const toGrade = (score) => {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
};

/**
 * Main entry point: a full ATS health report for a resume.
 *
 * @param {string} resumeText  Plain text extracted from the uploaded file.
 * @returns {object} score, grade, extracted data, per-check breakdown, advice.
 */
const analyzeResume = (resumeText = "") => {
  const text = String(resumeText || "");

  if (text.trim().length < 50) {
    return {
      atsScore: 0,
      grade: "F",
      wordCount: 0,
      summary:
        "We could not read enough text from this resume. If it is a scanned image or uses an unusual layout, export a text-based PDF and upload it again.",
      contact: { email: null, phone: null, linkedin: null, github: null, portfolio: null },
      sections: { present: [], missing: EXPECTED_SECTIONS.map((s) => s.name) },
      skills: { all: [], byCategory: {} },
      experienceYears: null,
      checks: [],
      suggestions: [
        {
          severity: "critical",
          title: "Resume text could not be extracted",
          detail: "Upload a text-based PDF or DOCX file rather than a scanned image or screenshot.",
        },
      ],
    };
  }

  const analysis = runChecks(text);

  const atsScore = Math.round(
    analysis.checks.reduce((total, check) => total + check.score * check.weight, 0),
  );

  const strongestCategory =
    Object.entries(analysis.skills.byCategory).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ||
    null;

  return {
    atsScore: clamp(atsScore),
    grade: toGrade(atsScore),
    wordCount: analysis.wordCount,
    summary:
      atsScore >= 80
        ? "Strong, ATS-friendly resume. Fine-tune the details below to push it further."
        : atsScore >= 60
          ? "A solid base, but several fixable issues are costing you interviews."
          : "This resume will likely be filtered out before a human sees it. Work through the critical items first.",
    contact: analysis.contact,
    sections: analysis.sections,
    skills: analysis.skills,
    strongestCategory,
    experienceYears: extractYearsOfExperience(text),
    achievements: {
      count: analysis.achievements.count,
      examples: analysis.achievements.quantified.slice(0, 3),
    },
    actionVerbs: analysis.actionVerbs,
    weakPhrases: analysis.weakPhrases,
    checks: analysis.checks.map(({ key, label, score, weight }) => ({
      key,
      label,
      score,
      weight,
    })),
    suggestions: buildSuggestions(analysis),
  };
};

/**
 * Compares a resume against one specific job and reports the concrete gaps.
 * This powers the candidate-facing "how do I improve for THIS job" view.
 */
const analyzeResumeAgainstJob = ({ resumeText = "", job = {} }) => {
  const report = analyzeResume(resumeText);
  const { calculateResumeJobMatch } = require("./resumeMatchingService");

  const match = calculateResumeJobMatch({
    resumeText,
    resumeSkills: report.skills.all,
    jobSkills: job.skills || [],
    jobDescription: job.description || "",
    jobTitle: job.title || "",
    jobExperience: job.experience || "",
  });

  const keywordGaps = (job.skills || [])
    .map(normalizeSkill)
    .filter(Boolean)
    .filter((skill) => !report.skills.all.includes(skill));

  return {
    ...report,
    job: { id: job._id, title: job.title, company: job.company },
    match,
    keywordGaps,
    tailoringTips: keywordGaps.slice(0, 6).map((skill) => ({
      severity: "high",
      title: `Add evidence of "${skill}"`,
      detail: `This job explicitly asks for ${skill} but it does not appear in your resume. If you have used it, name it in your Skills section and in the project bullet where you applied it.`,
    })),
  };
};

module.exports = {
  SKILL_DICTIONARY,
  ACTION_VERBS,
  extractContactInfo,
  extractSkills,
  detectSections,
  analyzeResume,
  analyzeResumeAgainstJob,
};
