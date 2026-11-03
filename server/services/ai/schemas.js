const { z } = require("zod");

const strictObject = (shape) => z.object(shape).strict();

const suggestion = strictObject({
  title: z.string().min(3).max(200),
  detail: z.string().min(5).max(2000),
  severity: z.enum(["critical", "high", "medium", "low"]),
  evidence: z.string().max(1000).optional(),
  confidence: z.number().min(0).max(1),
});

const schemas = {
  resume_extraction: strictObject({
    confidence: z.number().min(0).max(1),
    contact: strictObject({
      email: z.string().nullable(),
      phone: z.string().nullable(),
      linkedin: z.string().nullable(),
      github: z.string().nullable(),
      portfolio: z.string().nullable(),
    }),
    skills: z
      .array(
        strictObject({
          name: z.string().max(100),
          confidence: z.number().min(0).max(1),
          evidence: z.string().max(500),
        }),
      )
      .max(100),
    experienceYears: z.number().min(0).max(80).nullable(),
    education: z
      .array(
        strictObject({
          degree: z.string().max(200),
          field: z.string().max(200),
          institution: z.string().max(300),
          evidence: z.string().max(500),
        }),
      )
      .max(30),
    experiences: z
      .array(
        strictObject({
          title: z.string().max(200),
          company: z.string().max(200),
          description: z.string().max(2000),
          evidence: z.string().max(500),
        }),
      )
      .max(50),
    warnings: z.array(z.string().max(500)).max(20),
  }),

  resume_rewrite: strictObject({
    confidence: z.number().min(0).max(1),
    before: z.string().max(5000),
    after: z.string().max(5000),
    rationale: z.array(z.string().max(500)).max(10),
    warnings: z.array(z.string().max(500)).max(10),
  }),

  resume_improvement: strictObject({
    confidence: z.number().min(0).max(1),
    suggestions: z.array(suggestion).max(20),
    strengths: z.array(z.string().max(500)).max(10),
    uncertainties: z.array(z.string().max(500)).max(10),
  }),

  jd_generation: strictObject({
    confidence: z.number().min(0).max(1),
    title: z.string().max(150),
    description: z.string().min(20).max(20000),
    requiredSkills: z.array(z.string().max(100)).max(50),
    preferredSkills: z.array(z.string().max(100)).max(50),
    uncertainties: z.array(z.string().max(500)).max(10),
  }),

  jd_parse: strictObject({
    confidence: z.number().min(0).max(1),
    title: z.string().max(150),
    responsibilities: z.array(z.string().max(1000)).max(30),
    requiredSkills: z.array(z.string().max(100)).max(50),
    preferredSkills: z.array(z.string().max(100)).max(50),
    experienceYears: z.number().min(0).max(50).nullable(),
    uncertainties: z.array(z.string().max(500)).max(10),
  }),

  jd_improvement: strictObject({
    confidence: z.number().min(0).max(1),
    improvedDescription: z.string().min(20).max(20000),
    suggestions: z.array(suggestion).max(20),
    biasWarnings: z.array(z.string().max(500)).max(20),
    uncertainties: z.array(z.string().max(500)).max(10),
  }),

  interview_questions: strictObject({
    confidence: z.number().min(0).max(1),
    questions: z
      .array(
        strictObject({
          competency: z.string().max(100),
          question: z.string().max(1000),
          followUps: z.array(z.string().max(500)).max(5),
          rubric: z.array(z.string().max(500)).max(5),
        }),
      )
      .min(1)
      .max(20),
    limitations: z.array(z.string().max(500)).max(10),
  }),

  interview_preparation: strictObject({
    confidence: z.number().min(0).max(1),
    focusAreas: z.array(z.string().max(500)).max(15),
    practiceQuestions: z.array(z.string().max(1000)).max(20),
    skillGaps: z.array(z.string().max(200)).max(20),
    limitations: z.array(z.string().max(500)).max(10),
  }),

  recruiter_copilot: strictObject({
    confidence: z.number().min(0).max(1),
    answer: z.string().max(5000),
    citations: z.array(z.string().max(200)).max(20),
    proposedActions: z
      .array(
        strictObject({
          type: z.string().max(100),
          description: z.string().max(500),
          requiresConfirmation: z.literal(true),
        }),
      )
      .max(10),
    limitations: z.array(z.string().max(500)).max(10),
  }),

  career_copilot: strictObject({
    confidence: z.number().min(0).max(1),
    answer: z.string().max(5000),
    recommendations: z.array(z.string().max(1000)).max(20),
    citations: z.array(z.string().max(200)).max(20),
    limitations: z.array(z.string().max(500)).max(10),
  }),

  nl_job_search: strictObject({
    confidence: z.number().min(0).max(1),
    filters: strictObject({
      query: z.string().max(100).optional(),
      location: z.string().max(150).optional(),
      workplaceMode: z.enum(["onsite", "hybrid", "remote"]).optional(),
      jobType: z.enum(["Full-Time", "Part-Time", "Internship", "Contract", "Remote"]).optional(),
      minSalary: z.number().int().min(0).optional(),
      maxSalary: z.number().int().min(0).optional(),
      maxExp: z.number().int().min(0).max(60).optional(),
      minExp: z.number().int().min(0).max(60).optional(),
      skills: z.array(z.string().max(50)).max(10).optional(),
      industry: z.string().max(100).optional(),
    }),
    explanation: z.string().max(300),
  }),

  job_explanation: strictObject({
    confidence: z.number().min(0).max(1),
    roleOverview: z.string().max(2000),
    keyResponsibilities: z.array(z.string().max(500)).max(15),
    requiredSkillsSummary: z.array(z.string().max(300)).max(15),
    preferredSkillsSummary: z.array(z.string().max(300)).max(15),
    careerGrowthSignals: z.array(z.string().max(500)).max(10),
    limitations: z.array(z.string().max(500)).max(10),
  }),

  skill_gap_analysis: strictObject({
    confidence: z.number().min(0).max(1),
    matchedSkills: z.array(z.string().max(100)).max(50),
    missingSkills: z.array(z.string().max(100)).max(50),
    learningRoadmap: z
      .array(
        strictObject({
          skill: z.string().max(100),
          priority: z.enum(["critical", "high", "medium", "low"]),
          recommendedActions: z.string().max(1000),
        }),
      )
      .max(20),
    limitations: z.array(z.string().max(500)).max(10),
  }),

  recommendation_explanation: strictObject({
    confidence: z.number().min(0).max(1),
    summary: z.string().max(2000),
    alignmentFactors: z.array(z.string().max(500)).max(10),
    potentialGaps: z.array(z.string().max(500)).max(10),
    actionableAdvice: z.string().max(2000),
    limitations: z.array(z.string().max(500)).max(10),
  }),

  candidate_summary: strictObject({
    confidence: z.number().min(0).max(1),
    overview: z.string().max(3000),
    strengths: z.array(z.string().max(500)).max(15),
    concerns: z.array(z.string().max(500)).max(15),
    suggestedInterviewQuestions: z.array(z.string().max(500)).max(10),
    evidenceGaps: z.array(z.string().max(500)).max(10),
    limitations: z.array(z.string().max(500)).max(10),
  }),

  candidate_match_explanation: strictObject({
    confidence: z.number().min(0).max(1),
    narrative: z.string().max(3000),
    keyStrengths: z.array(z.string().max(500)).max(10),
    keyGaps: z.array(z.string().max(500)).max(10),
    hiringRecommendationSupport: z.string().max(1000),
    limitations: z.array(z.string().max(500)).max(10),
  }),

  candidate_comparison: strictObject({
    confidence: z.number().min(0).max(1),
    comparisonSummary: z.string().max(4000),
    candidateProfiles: z
      .array(
        strictObject({
          candidateId: z.string().max(100),
          keyStrengths: z.array(z.string().max(500)).max(10),
          potentialRisks: z.array(z.string().max(500)).max(10),
          fitHighlights: z.string().max(1000),
        }),
      )
      .max(10),
    tradeOffs: z.array(z.string().max(1000)).max(10),
    limitations: z.array(z.string().max(500)).max(10),
  }),
};

module.exports = { schemas };
