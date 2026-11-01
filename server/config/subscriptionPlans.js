/**
 * Official HireSmart-AI Subscription Plans, Pricing & Quota Specifications
 */

const CANDIDATE_PLANS = Object.freeze({
  candidate_free: {
    id: "candidate_free",
    name: "Free",
    tier: "candidate_free",
    role: "candidate",
    priceInr: 0,
    billingCycle: "monthly",
    description: "Essential career tools to discover jobs, upload resumes and apply to companies.",
    limits: {
      activeJobs: 0,
      teamMembers: 0,
      aiAnalysesPerMonth: 5,
    },
    features: [
      "Standard Candidate Profile",
      "PDF Resume Upload & Auto-Parsing",
      "Public Job Discovery & Search",
      "Standard Applications Tracking",
      "Basic Keyword Fit Score",
    ],
    highlight: false,
  },
  candidate_plus: {
    id: "candidate_plus",
    name: "Career Plus",
    tier: "candidate_plus",
    role: "candidate",
    priceInr: 149,
    billingCycle: "monthly",
    description: "Supercharge your job hunt with AI-powered resume enhancement, interview prep, and priority ranking.",
    limits: {
      activeJobs: 0,
      teamMembers: 0,
      aiAnalysesPerMonth: 500,
    },
    features: [
      "AI Resume Rewrite & Content Improver",
      "Unlimited Job-Specific Tailoring",
      "Interactive AI Interview Copilot",
      "Actionable Skill-Gap Analysis & Roadmaps",
      "Priority Candidate Ranking in Recruiter Matches",
      "Direct Application Insights & Status Alerts",
    ],
    highlight: true,
  },
});

const RECRUITER_PLANS = Object.freeze({
  recruiter_starter: {
    id: "recruiter_starter",
    name: "Starter",
    tier: "recruiter_starter",
    role: "recruiter",
    priceInr: 999,
    billingCycle: "monthly",
    description: "Perfect for early-stage startups and small teams kicking off their technical hiring.",
    limits: {
      activeJobs: 3,
      teamMembers: 2,
      aiAnalysesPerMonth: 50,
    },
    features: [
      "Up to 3 Active Job Postings",
      "Up to 2 Hiring Team Members",
      "Standard Hybrid AI Candidate Matching",
      "Recruitment Pipeline Funnel",
      "Structured Interview Scheduling",
      "Email & In-App Notifications",
    ],
    highlight: false,
  },
  recruiter_growth: {
    id: "recruiter_growth",
    name: "Growth",
    tier: "recruiter_growth",
    role: "recruiter",
    priceInr: 2499,
    billingCycle: "monthly",
    description: "Designed for scaling businesses with active multi-role hiring pipelines.",
    limits: {
      activeJobs: 10,
      teamMembers: 5,
      aiAnalysesPerMonth: 250,
    },
    features: [
      "Up to 10 Active Job Postings",
      "Up to 5 Hiring Team Members",
      "Advanced Semantic AI Match & Gap Analysis",
      "Side-by-Side Candidate Comparison",
      "Pipeline Data Export (CSV/JSON)",
      "Multi-Evaluator Interview Scorecards",
      "Priority Job Listing Verification",
    ],
    highlight: true,
  },
  recruiter_enterprise: {
    id: "recruiter_enterprise",
    name: "Enterprise",
    tier: "recruiter_enterprise",
    role: "recruiter",
    priceInr: 7999,
    billingCycle: "monthly",
    description: "Uncapped hiring capacity with comprehensive telemetry, custom governance, and dedicated support.",
    limits: {
      activeJobs: 100,
      teamMembers: 50,
      aiAnalysesPerMonth: 2000,
    },
    features: [
      "Unlimited Active Job Postings",
      "Unlimited Hiring Team Members",
      "Enterprise ATS & Webhook Integrations",
      "Full Platform AI Telemetry & Usage Logs",
      "Custom Interview Rubrics & Scorecards",
      "Dedicated Account Manager & 24/7 Support",
      "Custom Invoice & PO Billing Support",
    ],
    highlight: false,
  },
});

const ALL_PLANS = Object.freeze({
  ...CANDIDATE_PLANS,
  ...RECRUITER_PLANS,
});

module.exports = {
  CANDIDATE_PLANS,
  RECRUITER_PLANS,
  ALL_PLANS,
};
