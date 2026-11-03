const { config } = require("../../config/env");
const { z } = require("zod");
const AIAnalysis = require("../../models/AIAnalysis");
const { schemas } = require("./schemas");
const { getProvider } = require("./provider");
const { BASE_SYSTEM_PROMPT, buildPrompt } = require("./prompts");
const { analyzeResume, extractContactInfo } = require("../resumeAnalyzerService");
const { extractSkills } = require("../resumeAnalyzerService");
const { extractYearsOfExperience } = require("../textAnalysis");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const deterministic = (feature, input) => {
  const text = String(input.text || input.resumeText || input.description || input.jobDescription || "");
  const report = analyzeResume(text);
  const common = { confidence: text.length > 200 ? 0.75 : 0.5 };
  const skills = Array.isArray(input.skills) && input.skills.length
    ? input.skills
    : report.skills?.all || [];

  if (feature === "resume_extraction") {
    const contact = extractContactInfo(text);
    return {
      ...common,
      contact,
      skills: skills.map((name) => ({
        name,
        confidence: 0.75,
        evidence: `Detected in resume text: ${name}`,
      })),
      experienceYears: extractYearsOfExperience(text),
      education: [],
      experiences: [],
      warnings: ["Deterministic extraction heuristics applied; review before saving."],
    };
  }

  if (feature === "resume_rewrite") {
    return {
      ...common,
      before: text,
      after: text,
      rationale: [
        "Deterministic fallback does not synthesize new text; configure an active AI provider for generated wording.",
      ],
      warnings: ["No text modifications were made by the deterministic engine. Maintain verifiable evidence."],
    };
  }

  if (feature === "resume_improvement") {
    return {
      ...common,
      suggestions: (report.suggestions || []).slice(0, 12).map((s) => ({ ...s, confidence: 0.75 })),
      strengths: skills.slice(0, 8).map((s) => `Evidence of ${s}`),
      uncertainties: text ? [] : ["Resume text is unavailable"],
    };
  }

  if (feature === "jd_generation") {
    const title = input.title || "Untitled role";
    const reqSkills = Array.isArray(input.skills) && input.skills.length
      ? input.skills
      : skills.slice(0, 10);
    return {
      ...common,
      title,
      description: `${title}\n\nOutcomes and responsibilities\n${text || "Define measurable outcomes, responsibilities, team context and candidate impact before publishing."}\n\nRequirements\nCandidates should provide verifiable evidence for the required skills and relevant experience.`,
      requiredSkills: reqSkills,
      preferredSkills: Array.isArray(input.preferredSkills) ? input.preferredSkills : [],
      uncertainties: ["Deterministic draft requires recruiter review before publication."],
    };
  }

  if (feature === "jd_parse") {
    return {
      ...common,
      title: input.title || text.split(/[.\n]/)[0].slice(0, 150) || "Untitled role",
      responsibilities: text
        .split(/[.\n]/)
        .map((x) => x.trim())
        .filter((x) => x.length > 20)
        .slice(0, 12),
      requiredSkills: extractSkills(text).all.slice(0, 30),
      preferredSkills: [],
      experienceYears: extractYearsOfExperience(text),
      uncertainties: [
        "Required versus preferred skills could not be reliably distinguished by the deterministic fallback",
      ],
    };
  }

  if (feature === "jd_improvement") {
    return {
      ...common,
      improvedDescription: text,
      suggestions: [
        {
          title: "Use measurable outcomes",
          detail:
            "Describe the outcomes expected in the first 90 and 180 days and distinguish required from preferred qualifications.",
          severity: "medium",
          confidence: 0.8,
        },
      ],
      biasWarnings: /young|rockstar|ninja/i.test(text)
        ? ["Potentially exclusionary or unclear wording detected"]
        : [],
      uncertainties: ["Fallback does not rewrite employer-authored content automatically"],
    };
  }

  if (feature === "interview_questions") {
    const targetSkills = skills.length ? skills.slice(0, 6) : ["Core technical competencies"];
    return {
      ...common,
      questions: targetSkills.map((skill) => ({
        competency: skill,
        question: `Describe a specific production scenario where you applied ${skill}. What was your direct contribution and measurable outcome?`,
        followUps: [
          "What technical trade-offs or constraints did you evaluate?",
          "How did you validate and monitor the outcome?",
        ],
        rubric: [
          "Provides specific, verifiable architectural or operational context",
          "Distinguishes individual work from team contributions",
          "Demonstrates technical depth and post-launch learnings",
        ],
      })),
      limitations: ["Standardized competency questions; review against role scorecard."],
    };
  }

  if (feature === "interview_preparation") {
    const targetSkills = skills.length ? skills.slice(0, 8) : ["Technical problem solving"];
    return {
      ...common,
      focusAreas: targetSkills.map((s) => `Demonstrated proficiency in ${s}`),
      practiceQuestions: targetSkills.map((s) => `Practice Question: Describe how you have implemented ${s} in a high-impact project.`),
      skillGaps: Array.isArray(input.missingSkills) ? input.missingSkills : [],
      limitations: ["Preparation questions are practice prompts based on supplied job requirements."],
    };
  }

  if (feature === "job_explanation") {
    const title = input.title || "Target Role";
    return {
      ...common,
      roleOverview: `This position (${title}) focuses on core domain responsibilities and team objectives described in the job specification.`,
      keyResponsibilities: text
        .split(/[.\n]/)
        .map((x) => x.trim())
        .filter((x) => x.length > 20)
        .slice(0, 6),
      requiredSkillsSummary: skills.slice(0, 8).map((s) => `Required proficiency in ${s}`),
      preferredSkillsSummary: (Array.isArray(input.preferredSkills) ? input.preferredSkills : []).map((s) => `Preferred experience with ${s}`),
      careerGrowthSignals: [
        "Offers opportunities to work with modern technical stacks and collaborative teams",
        "Direct impact on organizational product deliverables and milestones",
      ],
      limitations: ["Overview derived from published job specification."],
    };
  }

  if (feature === "skill_gap_analysis") {
    const candidateSkills = Array.isArray(input.candidateSkills) ? input.candidateSkills : [];
    const requiredSkills = Array.isArray(input.requiredSkills) ? input.requiredSkills : [];
    const preferredSkills = Array.isArray(input.preferredSkills) ? input.preferredSkills : [];
    const candSet = new Set(candidateSkills.map((s) => String(s).toLowerCase().trim()));
    const matched = requiredSkills.filter((s) => candSet.has(String(s).toLowerCase().trim()));
    const missing = requiredSkills.filter((s) => !candSet.has(String(s).toLowerCase().trim()));
    const missingPref = preferredSkills.filter((s) => !candSet.has(String(s).toLowerCase().trim()));
    return {
      ...common,
      matchedSkills: matched,
      missingSkills: [...missing, ...missingPref],
      learningRoadmap: [
        ...missing.map((s, idx) => ({
          skill: s,
          priority: idx < 2 ? "critical" : "high",
          recommendedActions: `Review documentation, complete practical exercises, and build a proof of concept applying ${s}.`,
        })),
        ...missingPref.map((s) => ({
          skill: s,
          priority: "medium",
          recommendedActions: `Explore introductory tutorials and best practices for ${s}.`,
        })),
      ],
      limitations: ["Skill gap analysis based on declared candidate skills and job requirements."],
    };
  }

  if (feature === "recommendation_explanation") {
    const title = input.jobTitle || "Recommended Role";
    const company = input.company || "Hiring Company";
    const score = Number(input.matchScore) || 75;
    return {
      ...common,
      summary: `${title} at ${company} was recommended with an estimated match of ${score}% based on your verified skills and professional background.`,
      alignmentFactors: (Array.isArray(input.matchedSkills) && input.matchedSkills.length ? input.matchedSkills : ["Core skills"]).slice(0, 5).map((s) => `Strong alignment with required skill: ${s}`),
      potentialGaps: (Array.isArray(input.missingSkills) && input.missingSkills.length ? input.missingSkills : []).slice(0, 4).map((s) => `Opportunity to develop: ${s}`),
      actionableAdvice: "Highlight evidence of relevant projects in your application and prepare discussion examples for key competencies.",
      limitations: ["Recommendation explanation is derived from deterministic match criteria."],
    };
  }

  if (feature === "candidate_summary") {
    const name = input.candidateName || "Candidate";
    const exp = input.experienceYears != null ? `${input.experienceYears} years` : "Unspecified";
    return {
      ...common,
      overview: `${name} has approximately ${exp} of professional experience with verified evidence across ${skills.slice(0, 5).join(", ") || "core technical areas"}.`,
      strengths: skills.slice(0, 6).map((s) => `Demonstrated skill in ${s}`),
      concerns: Array.isArray(input.missingSkills) && input.missingSkills.length
        ? input.missingSkills.slice(0, 5).map((s) => `Lacks verified evidence for ${s}`)
        : ["No critical qualification gaps identified in preliminary review"],
      suggestedInterviewQuestions: skills.slice(0, 4).map((s) => `Can you walk through a production system where you designed or maintained ${s}?`),
      evidenceGaps: input.experienceYears == null ? ["Exact total years of experience could not be verified from text"] : [],
      limitations: ["Summary synthesized strictly from uploaded resume evidence."],
    };
  }

  if (feature === "candidate_match_explanation") {
    const name = input.candidateName || "The candidate";
    const score = Number(input.overallScore) || 70;
    const title = input.jobTitle || "the role";
    const matched = Array.isArray(input.matchedSkills) ? input.matchedSkills : [];
    const missingReq = Array.isArray(input.missingRequiredSkills) ? input.missingRequiredSkills : [];
    return {
      ...common,
      narrative: `${name} achieved an overall match score of ${score}% for ${title}. Matching analysis identified ${matched.length} aligned skills and ${missingReq.length} requirement gaps.`,
      keyStrengths: matched.slice(0, 6).map((s) => `Meets required competency: ${s}`),
      keyGaps: missingReq.slice(0, 6).map((s) => `Missing required competency: ${s}`),
      hiringRecommendationSupport: score >= 75
        ? "Candidate demonstrates strong baseline qualifications for technical interview evaluation."
        : "Candidate has partial qualification overlap; review specific gap areas during screening.",
      limitations: ["Match narrative explains deterministic scoring signals; does not replace human evaluation."],
    };
  }

  if (feature === "candidate_comparison") {
    const candidates = Array.isArray(input.candidates) ? input.candidates : [];
    return {
      ...common,
      comparisonSummary: `Evaluated ${candidates.length} candidates against the role requirements based on verified skill overlap and experience signals.`,
      candidateProfiles: candidates.map((c) => ({
        candidateId: String(c.candidateId || c._id || "unknown"),
        keyStrengths: (Array.isArray(c.matchedSkills) ? c.matchedSkills : []).slice(0, 4).map((s) => `Proficient in ${s}`),
        potentialRisks: (Array.isArray(c.missingSkills) ? c.missingSkills : []).slice(0, 4).map((s) => `Lacks verified evidence for ${s}`),
        fitHighlights: `Overall match score: ${c.overallScore ?? "N/A"}% with ${(Array.isArray(c.skills) ? c.skills : []).length} recorded skills.`,
      })),
      tradeOffs: [
        "Candidates vary across specialized toolchain familiarity and total verified years of experience.",
      ],
      limitations: ["Comparison derived from structured candidate match signals."],
    };
  }

  if (feature === "recruiter_copilot") {
    return {
      ...common,
      answer:
        "I can summarize authorized candidate and job evidence, but no hiring action or stage transition is performed automatically.",
      citations: Array.isArray(input.citations) ? input.citations : [],
      proposedActions: [],
      limitations: ["Deterministic fallback provides heuristic guidance only."],
    };
  }

  if (feature === "career_copilot") {
    return {
      ...common,
      answer: "Focus on evidence-backed skills, measurable project outcomes, and preparing STAR examples for upcoming technical discussions.",
      recommendations: (report.suggestions || []).slice(0, 6).map((s) => s.detail || s.title),
      citations: Array.isArray(input.citations) ? input.citations : [],
      limitations: ["Deterministic guidance provides career best practices."],
    };
  }

  if (feature === "nl_job_search") {
    const raw = String(input.text || "");
    const lower = raw.toLowerCase();
    const filters = {};
    const cities = {
      mumbai: "Mumbai",
      pune: "Pune",
      delhi: "Delhi",
      "new delhi": "Delhi",
      bengaluru: "Bengaluru",
      bangalore: "Bengaluru",
      hyderabad: "Hyderabad",
      chennai: "Chennai",
      kolkata: "Kolkata",
      ahmedabad: "Ahmedabad",
      jaipur: "Jaipur",
      indore: "Indore",
      nagpur: "Nagpur",
      coimbatore: "Coimbatore",
      surat: "Surat",
    };
    const city = Object.keys(cities).find((c) => lower.includes(c));
    if (city) filters.location = cities[city];
    if (/\bremote\b/.test(lower)) filters.workplaceMode = "remote";
    else if (/\bhybrid\b/.test(lower)) filters.workplaceMode = "hybrid";
    else if (/\b(onsite|on-site|in office|office based)\b/.test(lower))
      filters.workplaceMode = "onsite";
    const lpa = lower.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lacs?|lakhs?)/);
    if (lpa) filters.minSalary = Math.round(parseFloat(lpa[1]) * 100000);
    else {
      const amount = lower.match(/₹\s?(\d[\d,]*)/);
      if (amount) filters.minSalary = parseInt(amount[1].replace(/,/g, ""), 10);
    }
    const knownSkills = [
      "react",
      "node.js",
      "node",
      "python",
      "java",
      "javascript",
      "typescript",
      "aws",
      "devops",
      "kubernetes",
      "docker",
      "mongodb",
      "sql",
      "machine learning",
      "data science",
      "frontend",
      "backend",
      "full stack",
      "full-stack",
      "product manager",
      "ui/ux",
      "design",
    ];
    const foundSkills = knownSkills.filter((s) => lower.includes(s));
    if (foundSkills.length) filters.skills = foundSkills.slice(0, 10);
    const typeMatch = lower.match(/\b(intern(?:ship)?|full[- ]time|part[- ]time|contract)\b/);
    if (typeMatch)
      filters.jobType = typeMatch[1].startsWith("intern")
        ? "Internship"
        : typeMatch[1] === "full-time"
          ? "Full-Time"
          : typeMatch[1] === "part-time"
            ? "Part-Time"
            : "Contract";
    if (
      !filters.location &&
      !filters.workplaceMode &&
      !filters.skills?.length &&
      !filters.minSalary &&
      !filters.jobType
    )
      filters.query = raw.slice(0, 100);
    return {
      ...common,
      filters,
      explanation:
        "Structured query parsed with heuristic rules (deterministic fallback).",
    };
  }

  return {
    ...common,
    answer: "Evidence-grounded insights generated.",
    recommendations: [],
    citations: [],
    limitations: ["Deterministic fallback applied."],
  };
};

const run = async ({
  feature,
  input,
  user,
  organization = null,
  subjectType = "ad_hoc",
  subjectId = "ad_hoc",
  allowExternal = true,
}) => {
  const schema = schemas[feature];
  if (!schema) throw new Error(`Unsupported AI feature: ${feature}`);

  let jsonSchemaHint = "";
  try {
    jsonSchemaHint = JSON.stringify(z.toJSONSchema(schema));
  } catch {
    /* prompt-only hint */
  }

  const system = jsonSchemaHint
    ? `${BASE_SYSTEM_PROMPT}\nThe response MUST be a single JSON object that exactly matches this JSON Schema:\n${jsonSchemaHint}`
    : BASE_SYSTEM_PROMPT;

  const prompt = buildPrompt(feature, input);

  let result;
  let fallbackUsed = false;
  let lastError;
  const configuredProviders = allowExternal
    ? [config.aiPrimaryProvider, config.aiFallbackProvider]
    : ["deterministic"];
  const providers = configuredProviders.filter((v, i, a) => v && a.indexOf(v) === i);

  for (const [providerIndex, providerName] of providers.entries()) {
    if (providerName === "deterministic") {
      result = {
        output: deterministic(feature, input),
        provider: "deterministic",
        model: "rules-v1",
        usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: 0 },
      };
      fallbackUsed = providers[0] !== "deterministic";
      break;
    }

    const provider = getProvider(providerName, providerIndex === 0 ? "primary" : "fallback");
    for (let attempt = 0; attempt <= config.aiMaxRetries; attempt += 1) {
      try {
        result = await provider.generateStructured({
          system,
          prompt,
          schemaName: feature,
        });
        break;
      } catch (error) {
        lastError = error;
        console.error(
          `[ai] provider "${providerName}" attempt ${attempt + 1} failed:`,
          error.message,
        );
        if (!error.retryable || attempt === config.aiMaxRetries) break;
        await sleep(250 * 2 ** attempt);
      }
    }
    if (result) break;
    fallbackUsed = true;
  }

  if (!result) {
    const failure = lastError || new Error("No AI provider is available");
    await AIAnalysis.create({
      organization,
      user,
      feature,
      subjectType,
      subjectId: String(subjectId),
      provider: providers.join("->") || "none",
      model: config.aiModel,
      promptVersion: `${feature}-v1`,
      output: { failure: { code: failure.name || "AI_UNAVAILABLE" } },
      fallbackUsed: providers.length > 1,
      status: "failed",
    });
    throw failure;
  }

  let validated = schema.safeParse(result.output);
  if (!validated.success && result.provider !== "deterministic") {
    fallbackUsed = true;
    result = {
      output: deterministic(feature, input),
      provider: "deterministic",
      model: "rules-v1",
      usage: { latencyMs: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    };
    validated = schema.safeParse(result.output);
  }

  if (!validated.success) {
    await AIAnalysis.create({
      organization,
      user,
      feature,
      subjectType,
      subjectId: String(subjectId),
      provider: result.provider,
      model: result.model,
      promptVersion: `${feature}-v1`,
      output: { failure: { code: "AI_SCHEMA_INVALID" } },
      fallbackUsed,
      usage: result.usage,
      status: "failed",
    });
    throw new Error(`AI output failed schema validation: ${validated.error.issues[0]?.message}`);
  }

  const analysis = await AIAnalysis.create({
    organization,
    user,
    feature,
    subjectType,
    subjectId: String(subjectId),
    provider: result.provider,
    model: result.model,
    promptVersion: `${feature}-v1`,
    output: validated.data,
    confidence: validated.data.confidence,
    fallbackUsed,
    usage: result.usage,
  });

  return {
    analysisId: analysis._id,
    ...validated.data,
    metadata: {
      provider: result.provider,
      model: result.model,
      promptVersion: `${feature}-v1`,
      fallbackUsed,
      isLLM: result.provider !== "deterministic" && !fallbackUsed,
      usage: result.usage,
      generatedAt: analysis.createdAt,
    },
  };
};

module.exports = { run, deterministic };
