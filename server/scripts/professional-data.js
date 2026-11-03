/**
 * Professional end-to-end test data for HireSmart AI.
 *
 * What this script does:
 *
 *   1. Deletes legacy test data - ONLY accounts whose emails are explicitly
 *      listed in DELETE_EMAILS below (never a broad wipe):
 *        - the original npm-run-seed accounts (@hiresmart.ai)
 *        - the old demo set (demo-tech-solutions org + @hiresmart.dev accounts)
 *      along with everything those accounts/orgs own (jobs, applications,
 *      resumes, notes, interviews, sessions, consents, AI logs, ...).
 *
 *   2. Creates a realistic company world:
 *        - Meridian Cloud Technologies (Ahmedabad) with a 3-person team
 *        - 4 job postings (3 published, 1 draft you can publish yourself)
 *        - 7 candidates, each with a professionally written resume that is
 *          uploaded through the REAL pipeline (createVersion + processVersion)
 *          so it is "ready" without the background worker
 *        - a full pipeline spread across every stage:
 *          submitted / under_review / shortlisted / interview / offer /
 *          hired / rejected
 *        - a scheduled interview + a completed panel with evaluator feedback
 *        - hiring-team notes and saved jobs
 *
 *   3. Prints every credential and a full test guide.
 *
 * This script NEVER touches:
 *   - your admin account
 *   - any user whose email is not in DELETE_EMAILS
 *
 * Idempotent: running it again reuses what already exists.
 *
 * Usage:  cd server && npm run pro
 */
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const bcrypt = require("bcryptjs");
const { connectDB, disconnectDB } = require("../config/db");
const { validateEnvironment } = require("../config/env");
const User = require("../models/User");
const Organization = require("../models/Organization");
const { Membership } = require("../models/Membership");
const Job = require("../models/Job");
const Consent = require("../models/Consent");
const { Resume, ResumeVersion, ParsedResume } = require("../models/Resume");
const { Application } = require("../models/Application");
const Interview = require("../models/Interview");
const CandidateProfile = require("../models/CandidateProfile");
const { CandidateMatch, Note } = require("../models/Recruitment");
const AIAnalysis = require("../models/AIAnalysis");
const AuditLog = require("../models/AuditLog");
const AuthSession = require("../models/AuthSession");
const Notification = require("../models/Notification");
const SecurityEvent = require("../models/SecurityEvent");
const JobRun = require("../models/JobRun");
const IdempotencyRecord = require("../models/IdempotencyRecord");
const { createVersion, processVersion } = require("../services/resumeProcessingService");
const { deleteFile } = require("../services/storageService");

/* ------------------------------------------------------------------ *
 * 1) LEGACY DATA TO DELETE (explicit allow-list only)
 * ------------------------------------------------------------------ */
const DELETE_EMAILS = [
  // original "npm run seed" accounts
  "anastai.candidate@hiresmart.ai",
  "sarah.miller@hiresmart.ai",
  "alexander.recruiter@hiresmart.ai",
  "elena.recruiter@hiresmart.ai",
  // old demo set (npm run demo)
  "recruiter.demo@hiresmart.dev",
  "candidate.demo@hiresmart.dev",
];
const DELETE_ORG_SLUGS = ["demo-tech-solutions"];

/* ------------------------------------------------------------------ *
 * 2) PROFESSIONAL DATASET
 * ------------------------------------------------------------------ */
const ORG = {
  name: "Meridian Cloud Technologies",
  slug: "meridian-cloud-technologies",
  industry: "Cloud & SaaS",
  size: "51-200",
  website: "https://www.meridiancloud.in",
  timezone: "Asia/Kolkata",
};

const TEAM = [
  {
    name: "Kavya Mehta",
    email: "kavya.mehta@meridiancloud.in",
    password: "Kavya@123",
    membershipRole: "owner",
    headline: "Senior Talent Partner",
    location: "Ahmedabad, India",
    phone: "+91 98250 44117",
  },
  {
    name: "Rohit Deshmukh",
    email: "rohit.deshmukh@meridiancloud.in",
    password: "Rohit@123",
    membershipRole: "hiring_manager",
    headline: "Engineering Manager, Platform",
    location: "Pune, India",
    phone: "+91 98600 22831",
  },
  {
    name: "Aarav Gupta",
    email: "aarav.gupta@meridiancloud.in",
    password: "Aarav@123",
    membershipRole: "interviewer",
    headline: "Principal Engineer",
    location: "Ahmedabad, India",
    phone: "+91 97250 88462",
  },
];

const JOBS = [
  {
    title: "Senior React Developer",
    location: "Ahmedabad, India",
    salary: 2800000,
    compensation: { min: 2400000, max: 3200000, currency: "INR", period: "year" },
    experience: "5+ years",
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    requiredSkills: ["React", "TypeScript"],
    preferredSkills: ["Next.js", "GraphQL"],
    skills: ["React", "TypeScript", "Node.js", "GraphQL", "Jest", "CI/CD"],
    hiringTeamRoles: ["owner", "hiring_manager", "interviewer"],
    description:
      "Meridian Cloud Technologies is building the customer-facing analytics suite used by 400+ cloud teams across India. " +
      "We are looking for a senior frontend developer to own core React/TypeScript surfaces of the product.\n\n" +
      "What you will do:\n" +
      "- Own feature end-to-end: architecture, implementation, testing, performance.\n" +
      "- Lead the migration of legacy JavaScript modules to typed, componentized React.\n" +
      "- Integrate GraphQL APIs with an optimistic-update data layer.\n" +
      "- Raise the bar on accessibility, Lighthouse budgets and automated testing in CI.\n\n" +
      "What we are looking for:\n" +
      "- 5+ years of production React experience with TypeScript.\n" +
      "- Strong fundamentals of performance, state management and testing (Jest, Testing Library).\n" +
      "- Experience shipping in a CI/CD pipeline with code review culture.\n\n" +
      "Nice to have: Next.js, GraphQL federation, design-system ownership, mentoring juniors.",
  },
  {
    title: "Backend Engineer (Node.js)",
    location: "Remote (India)",
    salary: 2000000,
    compensation: { min: 1600000, max: 2400000, currency: "INR", period: "year" },
    experience: "3+ years",
    jobType: "Full-Time",
    workplaceMode: "remote",
    status: "published",
    requiredSkills: ["Node.js", "PostgreSQL"],
    preferredSkills: ["AWS", "Redis"],
    skills: ["Node.js", "MongoDB", "PostgreSQL", "Redis", "AWS", "REST APIs", "Docker"],
    hiringTeamRoles: ["owner", "interviewer"],
    description:
      "Our platform team runs the billing, usage-metering and integrations services that move 2M+ transactions a day. " +
      "We are hiring a backend engineer to design and scale these services with us.\n\n" +
      "What you will do:\n" +
      "- Design and build REST APIs and event-driven workers in Node.js on PostgreSQL and Redis.\n" +
      "- Own services end-to-end on AWS (ECS, RDS, SQS) with full observability.\n" +
      "- Tune slow queries and reduce p95 latency on hot paths.\n" +
      "- Write Dockerized services with CI pipelines and blue/green deploys.\n\n" +
      "What we are looking for:\n" +
      "- 3+ years of backend experience with Node.js and a SQL database (PostgreSQL preferred).\n" +
      "- Solid grasp of caching, queues, idempotency and failure handling.\n\n" +
      "Nice to have: MongoDB, microservices experience, open-source contributions.",
  },
  {
    title: "DevOps Engineer",
    location: "Ahmedabad, India",
    salary: 2200000,
    compensation: { min: 1800000, max: 2600000, currency: "INR", period: "year" },
    experience: "4+ years",
    jobType: "Full-Time",
    workplaceMode: "onsite",
    status: "published",
    requiredSkills: ["Kubernetes", "Terraform"],
    preferredSkills: ["Prometheus", "GitLab CI"],
    skills: ["Kubernetes", "Docker", "Terraform", "AWS", "Prometheus", "GitLab CI", "Linux"],
    hiringTeamRoles: ["owner", "hiring_manager", "interviewer"],
    description:
      "We run multi-cluster EKS infrastructure that serves 40+ microservices for 400+ enterprise customers, and we are " +
      "scaling it responsibly. Join a platform team that practices GitOps,Infrastructure-as-Code and blameless post-mortems.\n\n" +
      "What you will do:\n" +
      "- Own EKS cluster lifecycle, upgrades and capacity planning with Terraform modules.\n" +
      "- Maintain GitOps delivery (GitLab CI + ArgoCD) with progressive rollouts.\n" +
      "- Improve SLOs and alerting quality with Prometheus and Grafana.\n" +
      "- Automate everything: onboarding, security scanning, cost dashboards.\n\n" +
      "What we are looking for:\n" +
      "- 4+ years of DevOps/SRE experience in production Kubernetes environments.\n" +
      "- Strong Terraform and AWS fundamentals.\n" +
      "- Calm under incident pressure; clear written communication.\n\n" +
      "Nice to have: CKA certification, Helm/Argo expertise, cost-optimization track record.",
  },
  {
    title: "QA Automation Engineer",
    location: "Ahmedabad, India",
    salary: 1300000,
    compensation: { min: 1000000, max: 1600000, currency: "INR", period: "year" },
    experience: "2+ years",
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "draft",
    requiredSkills: ["Playwright", "API Testing"],
    preferredSkills: ["Cypress", "TypeScript"],
    skills: ["Playwright", "Cypress", "Jest", "API Testing", "TypeScript", "Postman"],
    hiringTeamRoles: ["owner"],
    description:
      "As we ship weekly releases across web and API surfaces, our QA practice is moving from manual regression to " +
      "automated, CI-integrated suites. We are hiring a QA automation engineer to own Playwright end-to-end suites " +
      "and API test coverage.\n\n" +
      "What you will do:\n" +
      "- Build and maintain Playwright suites for the core customer journey.\n" +
      "- Write API tests for billing and metering endpoints.\n" +
      "- Integrate suites into CI with failure triage and flake management.\n\n" +
      "What we are looking for:\n" +
      "- 2+ years of test automation with Playwright or Cypress.\n" +
      "- Comfort writing tests in JavaScript or TypeScript.\n" +
      "- Experience with API testing tools (Postman, REST clients).\n\n" +
      "Nice to have: Jest unit testing, performance testing, test-data management.",
  },
];

const CANDIDATES = [
  {
    name: "Ananya Iyer",
    email: "ananya.iyer.dev@gmail.com",
    password: "Ananya@123",
    headline: "Senior Frontend Engineer",
    location: "Ahmedabad, India",
    phone: "+91 99090 12301",
    gender: "Female",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    skills: ["React", "TypeScript", "Node.js", "GraphQL", "Jest", "Next.js", "Redux", "HTML/CSS"],
    bio: "Frontend engineer with 6 years of experience shipping high-traffic SaaS products. I care about performance budgets, accessibility and clean component APIs.",
    educationLine: "B.E. Computer Engineering, Nirma University (2015 - 2019)",
    education: [
      {
        institution: "Nirma University",
        degree: "B.E.",
        fieldOfStudy: "Computer Engineering",
        startYear: 2015,
        endYear: 2019,
        cgpa: 8.4,
      },
    ],
    jobs: [
      {
        company: "Zycus",
        position: "Senior Frontend Engineer",
        from: "2022-04",
        to: null,
        note: "Lead React/TypeScript frontend for a SaaS billing platform used by 120000 monthly active users; reduced bundle size 38% and raised Lighthouse performance from 61 to 94.",
      },
      {
        company: "Infinitable",
        position: "Frontend Developer",
        from: "2019-06",
        to: "2022-03",
        note: "Built design-system components in React and Storybook; shipped a GraphQL-based analytics dashboard used by 30+ enterprise clients.",
      },
    ],
    projects: [
      {
        title: "OpenCart UI Kit",
        description:
          "Open-source React component library with 2.1k GitHub stars, full accessibility and theming support.",
        technologies: ["React", "TypeScript", "Storybook"],
      },
    ],
    certifications: [{ name: "AWS Certified Cloud Practitioner", issuer: "AWS" }],
  },
  {
    name: "Vikram Nair",
    email: "vikram.nair.dev@gmail.com",
    password: "Vikram@123",
    headline: "Backend Engineer",
    location: "Bengaluru, India",
    phone: "+91 98450 77620",
    gender: "Male",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    languages: ["English", "Hindi", "Kannada"],
    skills: [
      "Node.js",
      "PostgreSQL",
      "MongoDB",
      "Redis",
      "AWS",
      "REST APIs",
      "Docker",
      "Microservices",
    ],
    bio: "Backend engineer who likes hard scaling problems. 4 years building payment and data services on Node.js + PostgreSQL at high volume.",
    educationLine:
      "B.Tech Information Technology, Visvesvaraya Technological University (2016 - 2020)",
    education: [
      {
        institution: "Visvesvaraya Technological University",
        degree: "B.Tech",
        fieldOfStudy: "Information Technology",
        startYear: 2016,
        endYear: 2020,
        cgpa: 8.1,
      },
    ],
    jobs: [
      {
        company: "PayStream Technologies",
        position: "Backend Engineer",
        from: "2022-01",
        to: null,
        note: "Designed a Node.js payment webhook service handling 2M transactions per day on PostgreSQL and Redis; cut p95 latency from 850ms to 240ms.",
      },
      {
        company: "FinEdge Solutions",
        position: "Software Developer",
        from: "2020-06",
        to: "2021-12",
        note: "Built REST APIs and Dockerized microservices for a lending platform; introduced CI pipelines that cut release time from 2 days to 30 minutes.",
      },
    ],
    projects: [
      {
        title: "ledger-sync",
        description:
          "Open-source idempotent ledger reconciliation worker for Node.js (800 GitHub stars).",
        technologies: ["Node.js", "PostgreSQL", "Redis"],
      },
    ],
    certifications: [{ name: "AWS Solutions Architect - Associate", issuer: "AWS" }],
  },
  {
    name: "Sneha Kulkarni",
    email: "sneha.kulkarni.dev@gmail.com",
    password: "Sneha@123",
    headline: "DevOps Engineer",
    location: "Pune, India",
    phone: "+91 98220 35914",
    gender: "Female",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    languages: ["English", "Hindi", "Marathi"],
    skills: ["Kubernetes", "Docker", "Terraform", "AWS", "Prometheus", "GitLab CI", "Linux"],
    bio: "DevOps engineer with 5 years running multi-cluster Kubernetes in production. GitOps, Terraform and SLO-driven alerting are my daily tools.",
    educationLine: "B.E. Computer Science, COEP Pune (2015 - 2019)",
    education: [
      {
        institution: "COEP Pune",
        degree: "B.E.",
        fieldOfStudy: "Computer Science",
        startYear: 2015,
        endYear: 2019,
        cgpa: 7.9,
      },
    ],
    jobs: [
      {
        company: "CloudSprint Technologies",
        position: "DevOps Engineer",
        from: "2021-08",
        to: null,
        note: "Own multi-cluster EKS infrastructure (14 nodes, 40+ services) with GitOps delivery via ArgoCD; drive 99.95% uptime with Prometheus alerting.",
      },
      {
        company: "Vantage Labs",
        position: "Systems Engineer",
        from: "2019-04",
        to: "2021-07",
        note: "Managed Linux fleets and Docker containerization for 200+ internal services; introduced Terraform modules that cut environment setup from 3 days to 40 minutes.",
      },
    ],
    projects: [
      {
        title: "cluster-doctor",
        description:
          "CLI that audits EKS cluster health (node pressure, storage, cert expiry) and posts a Grafana snapshot.",
        technologies: ["Go", "Kubernetes", "Grafana"],
      },
    ],
    certifications: [
      { name: "CKA: Certified Kubernetes Administrator", issuer: "CNCF" },
      { name: "HashiCorp Certified: Terraform Associate", issuer: "HashiCorp" },
    ],
  },
  {
    name: "Arjun Mehta",
    email: "arjun.mehta.dev@gmail.com",
    password: "Arjun@123",
    headline: "Frontend Developer",
    location: "Surat, India",
    phone: "+91 97260 41285",
    gender: "Male",
    city: "Surat",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    skills: ["React", "JavaScript", "HTML/CSS", "Tailwind", "Jest", "Git"],
    bio: "Frontend developer with 2 years of experience building e-commerce interfaces. Currently deepening React performance and testing skills.",
    educationLine:
      "B.E. Computer Engineering, L.D. College of Engineering, Ahmedabad (2020 - 2024)",
    education: [
      {
        institution: "L.D. College of Engineering",
        degree: "B.E.",
        fieldOfStudy: "Computer Engineering",
        startYear: 2020,
        endYear: 2024,
        cgpa: 8.8,
      },
    ],
    jobs: [
      {
        company: "WebCraft Studio",
        position: "Frontend Developer",
        from: "2023-07",
        to: null,
        note: "Develop React components for 12+ client e-commerce builds; wrote Jest tests that raised coverage from 40% to 78%.",
      },
      {
        company: "DigitalBridge",
        position: "Web Development Intern",
        from: "2022-05",
        to: "2023-06",
        note: "Built responsive marketing sites with HTML, CSS and JavaScript; shipped a Tailwind-based component library used across 8 projects.",
      },
    ],
    projects: [
      {
        title: "shopfront-kit",
        description:
          "Collection of accessible e-commerce React components (cart, filters, product grid) with docs site.",
        technologies: ["React", "Tailwind", "Jest"],
      },
    ],
    certifications: [],
  },
  {
    name: "Ishita Verma",
    email: "ishita.verma.dev@gmail.com",
    password: "Ishita@123",
    headline: "Software Engineer (QA)",
    location: "Indore, India",
    phone: "+91 98930 66412",
    gender: "Female",
    city: "Indore",
    state: "Madhya Pradesh",
    country: "India",
    languages: ["English", "Hindi"],
    skills: ["Playwright", "Cypress", "JavaScript", "TypeScript", "API Testing", "Postman", "Jest"],
    bio: "QA engineer transitioning toward engineering automation. 3 years of test automation with Playwright and Cypress, plus API testing experience.",
    educationLine: "B.Tech Computer Science, Symbiosis Institute of Technology, Pune (2017 - 2021)",
    education: [
      {
        institution: "Symbiosis Institute of Technology",
        degree: "B.Tech",
        fieldOfStudy: "Computer Science",
        startYear: 2017,
        endYear: 2021,
        cgpa: 8.0,
      },
    ],
    jobs: [
      {
        company: "TestNova Systems",
        position: "QA Automation Engineer",
        from: "2022-10",
        to: null,
        note: "Built Playwright end-to-end suites for a fintech dashboard (180+ scenarios); cut the regression cycle from 3 days to 4 hours.",
      },
      {
        company: "AppMint Labs",
        position: "Software Engineer",
        from: "2021-01",
        to: "2022-09",
        note: "Wrote API tests with Postman and JavaScript; maintained Cypress suites for a React storefront serving 50000 monthly shoppers.",
      },
    ],
    projects: [
      {
        title: "flaky-triage",
        description:
          "Playwright reporter plugin that groups flaky tests and links them to CI logs.",
        technologies: ["Playwright", "TypeScript"],
      },
    ],
    certifications: [{ name: "ISTQB Foundation Level", issuer: "ISTQB" }],
  },
  {
    name: "Karan Patel",
    email: "karan.patel.dev@gmail.com",
    password: "Karan@123",
    headline: "Backend Engineer",
    location: "Ahmedabad, India",
    phone: "+91 99086 20347",
    gender: "Male",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    skills: ["Node.js", "PostgreSQL", "MongoDB", "AWS", "Microservices", "Docker", "Redis"],
    bio: "Backend engineer with 5 years in fintech. I have built and scaled Node.js microservices on AWS and enjoy owning services end-to-end.",
    educationLine: "B.E. Computer Engineering, GUJCET University (2015 - 2019)",
    education: [
      {
        institution: "GUJCET University",
        degree: "B.E.",
        fieldOfStudy: "Computer Engineering",
        startYear: 2015,
        endYear: 2019,
        cgpa: 7.7,
      },
    ],
    jobs: [
      {
        company: "NexBank Digital",
        position: "Senior Software Engineer",
        from: "2021-03",
        to: null,
        note: "Built Node.js microservices for a digital banking platform handling 500000 API calls per day on AWS (ECS, RDS PostgreSQL).",
      },
      {
        company: "Infowave Technologies",
        position: "Software Developer",
        from: "2019-01",
        to: "2021-02",
        note: "Developed REST APIs and MongoDB services for an e-commerce platform; led the on-prem to AWS migration, cutting infrastructure cost 25%.",
      },
    ],
    projects: [
      {
        title: "billpay-cli",
        description:
          "Internal CLI that queries billing state across services with a single command.",
        technologies: ["Node.js", "TypeScript"],
      },
    ],
    certifications: [{ name: "AWS Certified Developer - Associate", issuer: "AWS" }],
  },
  {
    name: "Divya Singh",
    email: "divya.singh.dev@gmail.com",
    password: "Divya@123",
    headline: "DevOps / Site Reliability Engineer",
    location: "Mumbai, India",
    phone: "+91 98190 55273",
    gender: "Female",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    languages: ["English", "Hindi"],
    skills: ["Kubernetes", "Docker", "AWS", "Linux", "Prometheus", "Jenkins", "Python"],
    bio: "SRE with 4 years keeping CDNs and Kubernetes clusters healthy. Strong on monitoring, incident response and automation in Python.",
    educationLine: "B.E. Computer Science, Mumbai University (2016 - 2020)",
    education: [
      {
        institution: "Mumbai University",
        degree: "B.E.",
        fieldOfStudy: "Computer Science",
        startYear: 2016,
        endYear: 2020,
        cgpa: 7.5,
      },
    ],
    jobs: [
      {
        company: "Uplink Networks",
        position: "Site Reliability Engineer",
        from: "2022-02",
        to: null,
        note: "Maintain Kubernetes clusters (8 nodes) serving a CDN for 2M daily requests; wrote Python tooling for log aggregation and alerting.",
      },
      {
        company: "CloudPort Systems",
        position: "DevOps Engineer",
        from: "2020-08",
        to: "2022-01",
        note: "Managed AWS deployments with Jenkins pipelines; containerized 30+ legacy services with Docker.",
      },
    ],
    projects: [
      {
        title: "slo-report",
        description: "Weekly SLO report generator pulling Prometheus metrics into Slack digests.",
        technologies: ["Python", "Prometheus", "Slack API"],
      },
    ],
    certifications: [{ name: "AWS Certified SysOps Administrator - Associate", issuer: "AWS" }],
  },
];

/**
 * Pipeline: candidate -> job -> final status.
 * history entries: [status, who, note, daysBeforeApplied]
 *   who = "candidate" | "kavya" | "rohit" | "aarav"
 */
const APPLICATIONS = [
  {
    candidate: "Ananya Iyer",
    job: "Senior React Developer",
    status: "shortlisted",
    appliedAgoDays: 10,
    tags: ["priority"],
    history: [
      ["submitted", "candidate", "", 10],
      ["under_review", "kavya", "Strong React portfolio with measurable performance wins.", 8],
      ["shortlisted", "kavya", "Matches the senior requirement; moving to technical round.", 6],
    ],
    notes: [
      [
        "kavya",
        "Hands-on with GraphQL and testing. Salary expectation 30 LPA - within band.",
        ["compensation"],
      ],
    ],
  },
  {
    candidate: "Arjun Mehta",
    job: "Senior React Developer",
    status: "submitted",
    appliedAgoDays: 1,
    tags: [],
    history: [["submitted", "candidate", "", 1]],
    notes: [],
  },
  {
    candidate: "Ishita Verma",
    job: "Senior React Developer",
    status: "under_review",
    appliedAgoDays: 5,
    tags: [],
    history: [
      ["submitted", "candidate", "", 5],
      [
        "under_review",
        "kavya",
        "QA background but strong JavaScript fundamentals; reviewing for fit.",
        3,
      ],
    ],
    notes: [],
  },
  {
    candidate: "Vikram Nair",
    job: "Backend Engineer (Node.js)",
    status: "interview",
    appliedAgoDays: 18,
    tags: ["fast-track"],
    history: [
      ["submitted", "candidate", "", 18],
      ["under_review", "kavya", "Solid Node + PostgreSQL depth; webhook service at scale.", 16],
      ["shortlisted", "kavya", "Great AWS experience; shortlisted for technical round.", 14],
      ["interview", "kavya", "Technical round scheduled with Aarav.", 11],
    ],
    notes: [
      [
        "kavya",
        "Prepare system-design questions around idempotency and queues.",
        ["interview-prep"],
      ],
    ],
  },
  {
    candidate: "Sneha Kulkarni",
    job: "DevOps Engineer",
    status: "offer",
    appliedAgoDays: 24,
    tags: ["priority"],
    history: [
      ["submitted", "candidate", "", 24],
      [
        "under_review",
        "kavya",
        "CKA + Terraform Associate with real multi-cluster experience.",
        22,
      ],
      ["shortlisted", "kavya", "Excellent Kubernetes + Terraform depth.", 20],
      ["interview", "kavya", "Panel interview completed - strong feedback.", 17],
      ["offer", "kavya", "Offer extended at 24 LPA; proposed joining 2026-09-21.", 12],
    ],
    notes: [["rohit", "Panel consensus: strong_yes. Clear to make the offer.", ["panel"]]],
  },
  {
    candidate: "Karan Patel",
    job: "Backend Engineer (Node.js)",
    status: "hired",
    appliedAgoDays: 40,
    tags: ["priority"],
    history: [
      ["submitted", "candidate", "", 40],
      ["under_review", "kavya", "Fintech scale experience; clean system design background.", 38],
      ["shortlisted", "kavya", "Shortlisted after screening call.", 35],
      ["interview", "kavya", "Two rounds completed.", 30],
      ["offer", "kavya", "Offer at 22 LPA; candidate negotiating start date.", 25],
      ["hired", "kavya", "Accepted offer; joined the platform team.", 20],
    ],
    notes: [],
  },
  {
    candidate: "Divya Singh",
    job: "DevOps Engineer",
    status: "rejected",
    appliedAgoDays: 15,
    tags: ["talent-pool"],
    history: [
      ["submitted", "candidate", "", 15],
      [
        "under_review",
        "kavya",
        "Good SRE instincts, but needs deeper Terraform experience for current scope.",
        13,
      ],
      [
        "rejected",
        "kavya",
        "Not a fit this cycle; added to talent pool for future IAC-heavy roles.",
        10,
      ],
    ],
    notes: [],
  },
];

/**
 * Saved jobs for candidate-side "Saved" tab testing.
 */
const SAVED_JOBS = [
  { candidate: "Arjun Mehta", job: "QA Automation Engineer" },
  { candidate: "Ishita Verma", job: "QA Automation Engineer" },
  { candidate: "Vikram Nair", job: "DevOps Engineer" },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
const escapePdf = (value) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Build a minimal but valid single-page PDF from lines of text. */
const buildPdf = (lines) => {
  const content = lines
    .map((line, i) => `BT /F1 11 Tf 50 ${780 - i * 18} Td (${escapePdf(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
};

const resumeLinesFor = (c) => [
  `${c.name} - ${c.headline}`,
  `${c.location} | ${c.email} | ${c.phone}`,
  "",
  `SKILLS: ${c.skills.join(", ")}`,
  "",
  "EXPERIENCE",
  ...c.jobs.map(
    (j) =>
      `${j.position}, ${j.company} (${j.from.slice(0, 4)} - ${j.to ? j.to.slice(0, 4) : "present"}): ${j.note}`,
  ),
  "",
  "EDUCATION",
  c.educationLine,
];

const TEAM_BY_KEY = { kavya: "Kavya Mehta", rohit: "Rohit Deshmukh", aarav: "Aarav Gupta" };
const daysAgo = (days) => new Date(Date.now() - days * 86400000);
const inDays = (days, hour, minute = 0) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/* ------------------------------------------------------------------ *
 * Phase 1: delete legacy test data (explicit allow-list only)
 * ------------------------------------------------------------------ */
const cleanupLegacy = async () => {
  const targets = await User.find({ email: { $in: DELETE_EMAILS } });
  const userIds = targets.map((u) => u._id);
  const emailFound = targets.map((u) => u.email);

  let orgs = await Organization.find({ slug: { $in: DELETE_ORG_SLUGS } });
  if (userIds.length) {
    const extra = await Membership.find({ user: { $in: userIds } }).distinct("organization");
    const extraOrgs = await Organization.find({ _id: { $in: extra } });
    orgs = orgs.concat(extraOrgs.filter((o) => !orgs.some((x) => x._id.equals(o._id))));
  }
  const orgIds = orgs.map((o) => o._id);

  if (!userIds.length && !orgIds.length) {
    console.log("Legacy cleanup: nothing to delete (no legacy accounts found).");
    return { emailFound: [], deleted: {} };
  }

  // collect dependent document ids
  const apps = await Application.find({
    $or: [{ candidate: { $in: userIds } }, { organization: { $in: orgIds } }],
  });
  const appIds = apps.map((a) => a._id);
  const jobs = await Job.find({
    $or: [{ recruiter: { $in: userIds } }, { organization: { $in: orgIds } }],
  });
  const jobIds = jobs.map((j) => j._id);
  const versions = await ResumeVersion.find({ candidate: { $in: userIds } }).select("+storageKey");
  const versionIds = versions.map((v) => v._id);

  // storage files (best effort)
  let files = 0;
  for (const v of versions) {
    try {
      await deleteFile(v.storageKey, v.storageProvider);
      files += 1;
    } catch (_error) {
      /* file may already be gone */
    }
  }

  const counts = {};
  const run = async (label, fn) => {
    const r = await fn();
    counts[label] = r.deletedCount ?? 0;
    return r;
  };

  await run("CandidateMatch", () =>
    CandidateMatch.deleteMany({
      $or: [
        { organization: { $in: orgIds } },
        { application: { $in: appIds } },
        { job: { $in: jobIds } },
      ],
    }),
  );
  await run("Note", () =>
    Note.deleteMany({
      $or: [
        { organization: { $in: orgIds } },
        { author: { $in: userIds } },
        { targetType: "application", targetId: { $in: appIds } },
      ],
    }),
  );
  await run("Interview", () =>
    Interview.deleteMany({
      $or: [{ organization: { $in: orgIds } }, { application: { $in: appIds } }],
    }),
  );
  await run("JobRun", () => JobRun.deleteMany({ organization: { $in: orgIds } }));
  await run("AIAnalysis", () =>
    AIAnalysis.deleteMany({ $or: [{ organization: { $in: orgIds } }, { user: { $in: userIds } }] }),
  );
  await run("Notification", () =>
    Notification.deleteMany({
      $or: [{ organization: { $in: orgIds } }, { user: { $in: userIds } }],
    }),
  );
  await run("SecurityEvent", () =>
    SecurityEvent.deleteMany({
      $or: [{ organization: { $in: orgIds } }, { user: { $in: userIds } }],
    }),
  );
  await run("AuditLog", () =>
    AuditLog.deleteMany({ $or: [{ organization: { $in: orgIds } }, { actor: { $in: userIds } }] }),
  );
  await run("IdempotencyRecord", () => IdempotencyRecord.deleteMany({ actor: { $in: userIds } }));
  await run("AuthSession", () => AuthSession.deleteMany({ user: { $in: userIds } }));
  await run("Consent", () => Consent.deleteMany({ user: { $in: userIds } }));
  await run("ParsedResume", () => ParsedResume.deleteMany({ resumeVersion: { $in: versionIds } }));
  await run("ResumeVersion", () => ResumeVersion.deleteMany({ candidate: { $in: userIds } }));
  await run("Resume", () => Resume.deleteMany({ candidate: { $in: userIds } }));
  await run("Application", () => Application.deleteMany({ _id: { $in: appIds } }));
  await run("Job", () => Job.deleteMany({ _id: { $in: jobIds } }));
  await run("CandidateProfile", () => CandidateProfile.deleteMany({ user: { $in: userIds } }));
  await run("Membership", () =>
    Membership.deleteMany({ $or: [{ user: { $in: userIds } }, { organization: { $in: orgIds } }] }),
  );
  await run("Organization", () => Organization.deleteMany({ _id: { $in: orgIds } }));
  await run("User", () => User.deleteMany({ _id: { $in: userIds } }));

  console.log("Legacy cleanup complete:");
  console.log(`  Accounts deleted : ${emailFound.join(", ") || "(none found)"}`);
  console.log(`  Orgs deleted     : ${orgs.map((o) => o.name).join(", ") || "(none)"}`);
  console.log(
    `  Removed documents: ${
      Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}=${n}`)
        .join(", ") || "none"
    }`,
  );
  console.log(`  Resume files     : ${files} deleted from disk`);
  if (orgs.some((o) => o.slug === "demo-tech-solutions")) {
    console.log(
      "  NOTE: 'Demo Tech Solutions' was removed - any manual members you added there (e.g. your own account) lost that membership. Your user accounts are untouched.",
    );
  }
  return { emailFound, deleted: counts };
};

/* ------------------------------------------------------------------ *
 * Phase 2: create the professional dataset (idempotent)
 * ------------------------------------------------------------------ */
const createWorld = async () => {
  // 1) Organization
  let org = await Organization.findOne({ slug: ORG.slug });
  if (!org) org = await Organization.create(ORG);

  // 2) Team users + memberships
  const teamUsers = {};
  const memberships = {};
  for (const t of TEAM) {
    let u = await User.findOne({ email: t.email });
    const isNew = !u;
    if (!u) {
      u = await User.create({
        name: t.name,
        email: t.email,
        password: await bcrypt.hash(t.password, 10),
        role: "recruiter",
        accountStatus: "active",
        emailVerified: true,
        headline: t.headline,
        location: t.location,
        phone: t.phone,
        companyName: ORG.name,
        timezone: "Asia/Kolkata",
      });
    }
    teamUsers[t.name] = u;
    let m = await Membership.findOne({ organization: org._id, user: u._id });
    if (!m) {
      m = await Membership.create({
        organization: org._id,
        user: u._id,
        role: t.membershipRole,
        status: "active",
      });
    } else if (m.role !== t.membershipRole) {
      m.role = t.membershipRole;
      await m.save();
    }
    memberships[t.membershipRole] = m;
    if (isNew) console.log(`  + ${u.name} (${t.membershipRole})`);
  }

  // 3) Jobs
  const jobDocs = {};
  for (const j of JOBS) {
    let job = await Job.findOne({ organization: org._id, title: j.title });
    const isNew = !job;
    const hiringTeam = (j.hiringTeamRoles || [])
      .map((r) => memberships[r])
      .filter(Boolean)
      .map((m) => m._id);
    if (!job) {
      job = await Job.create({
        organization: org._id,
        recruiter: teamUsers["Kavya Mehta"]._id,
        status: j.status,
        publishedAt: j.status === "published" ? daysAgo(20) : null,
        title: j.title,
        company: ORG.name,
        location: j.location,
        salary: j.salary,
        experience: j.experience,
        jobType: j.jobType,
        workplaceMode: j.workplaceMode,
        description: j.description,
        skills: j.skills,
        requiredSkills: j.requiredSkills,
        preferredSkills: j.preferredSkills,
        compensation: j.compensation,
        source: "direct",
        hiringTeam,
        version: 1,
      });
    }
    jobDocs[j.title] = job;
    if (isNew) console.log(`  + Job: ${j.title} [${j.status}]`);
  }

  // 4) Candidates (user + consent + profile)
  const candUsers = {};
  for (const c of CANDIDATES) {
    let u = await User.findOne({ email: c.email });
    const isNew = !u;
    if (!u) {
      u = await User.create({
        name: c.name,
        email: c.email,
        password: await bcrypt.hash(c.password, 10),
        role: "candidate",
        accountStatus: "active",
        emailVerified: true,
        headline: c.headline,
        location: c.location,
        phone: c.phone,
        bio: c.bio,
        skills: c.skills,
        timezone: "Asia/Kolkata",
        onboardingCompleted: true,
      });
    }
    for (const purpose of ["terms", "privacy", "ai_processing"]) {
      if (!(await Consent.exists({ user: u._id, purpose, policyVersion: "2026-08" }))) {
        await Consent.create({
          user: u._id,
          purpose,
          policyVersion: "2026-08",
          source: "registration",
        });
      }
    }
    if (!(await CandidateProfile.findOne({ user: u._id }))) {
      await CandidateProfile.create({
        user: u._id,
        gender: c.gender,
        city: c.city,
        state: c.state,
        country: c.country,
        languages: c.languages,
        education: c.education,
        experience: c.jobs.map((j) => ({
          company: j.company,
          position: j.position,
          description: j.note,
          startDate: j.from ? new Date(`${j.from}-01`) : null,
          endDate: j.to ? new Date(`${j.to}-01`) : null,
          currentlyWorking: !j.to,
        })),
        projects: c.projects,
        certifications: c.certifications,
      });
    }
    candUsers[c.name] = u;
    if (isNew) console.log(`  + Candidate: ${u.name}`);
  }

  // 5) Resumes - through the exact same pipeline as a UI upload
  for (const c of CANDIDATES) {
    const u = candUsers[c.name];
    let version = await ResumeVersion.findOne({
      candidate: u._id,
      processingStatus: "ready",
    }).select("+storageKey");
    if (!version) {
      const buffer = buildPdf(resumeLinesFor(c));
      const file = {
        originalname: `${c.name.replace(/ /g, "_")}_Resume.pdf`,
        mimetype: "application/pdf",
        buffer,
        size: buffer.length,
      };
      const created = await createVersion({ user: u, file });
      await processVersion(created.version._id);
      version = await ResumeVersion.findById(created.version._id).select("+storageKey");
      console.log(`  + Resume: ${c.name} -> ${file.originalname} (ready)`);
    }
    candUsers[c.name]._version = version;
  }

  // 6) Saved jobs
  for (const s of SAVED_JOBS) {
    const u = candUsers[s.candidate];
    const job = jobDocs[s.job];
    if (u && job && !(u.savedJobs || []).some((id) => id.equals(job._id))) {
      await User.updateOne({ _id: u._id }, { $addToSet: { savedJobs: job._id } });
    }
  }

  // 7) Applications (with status history) - idempotent per (job, candidate)
  const appDocs = {};
  for (const a of APPLICATIONS) {
    const cand = candUsers[a.candidate];
    const job = jobDocs[a.job];
    const existing = await Application.findOne({ job: job._id, candidate: cand._id });
    if (existing) {
      appDocs[`${a.candidate}|${a.job}`] = existing;
      continue;
    }
    const version = cand._version;
    const app = await Application.create({
      organization: org._id,
      job: job._id,
      jobVersion: job.version,
      jobSnapshot: {
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        experience: job.experience,
        workplaceMode: job.workplaceMode,
      },
      candidate: cand._id,
      status: a.status,
      appliedAt: daysAgo(a.appliedAgoDays),
      resumeSnapshot: {
        storageKey: version.storageKey,
        provider: version.storageProvider,
        originalName: version.originalName,
        mimeType: version.mimeType,
        size: version.size,
        text: version.text || "",
      },
      resumeVersion: version._id,
      source: "direct",
      tags: a.tags,
      statusHistory: a.history.map((h) => ({
        status: h[0],
        changedAt: daysAgo(a.appliedAgoDays - h[3]),
        changedBy: h[1] === "candidate" ? cand._id : teamUsers[TEAM_BY_KEY[h[1]]]._id,
        note: h[2],
      })),
    });
    appDocs[`${a.candidate}|${a.job}`] = app;
    console.log(`  + Application: ${a.candidate} -> ${a.job} [${a.status}]`);
  }

  // 8) Notes
  for (const a of APPLICATIONS) {
    const app = appDocs[`${a.candidate}|${a.job}`];
    for (const n of a.notes) {
      const exists = await Note.findOne({
        organization: org._id,
        targetType: "application",
        targetId: app._id,
        body: n[1],
      });
      if (!exists) {
        await Note.create({
          organization: org._id,
          targetType: "application",
          targetId: app._id,
          author:
            teamUsers[
              n[0] === "kavya" ? "Kavya Mehta" : n[0] === "rohit" ? "Rohit Deshmukh" : "Aarav Gupta"
            ]._id,
          body: n[1],
          visibility: "hiring_team",
          tags: n[2],
        });
      }
    }
  }

  // 9) Interviews
  const interviewSpecs = [
    {
      key: "Vikram Nair|Backend Engineer (Node.js)",
      title: "Technical Round - Backend Engineer",
      type: "technical",
      status: "confirmed",
      start: inDays(3, 15, 0),
      end: inDays(3, 16, 30),
      meetingUrl: "https://meet.meridiancloud.in/vikram-backend-round-1",
      participants: ["Aarav Gupta"],
      feedback: [],
    },
    {
      key: "Sneha Kulkarni|DevOps Engineer",
      title: "Panel Interview - DevOps Engineer",
      type: "panel",
      status: "completed",
      start: inDays(-7, 11, 0),
      end: inDays(-7, 12, 0),
      meetingUrl: "https://meet.meridiancloud.in/sneha-devops-panel",
      participants: ["Aarav Gupta", "Rohit Deshmukh"],
      feedback: [
        {
          evaluator: "Aarav Gupta",
          recommendation: "strong_yes",
          summary:
            "Strong production Kubernetes experience; walked through a real incident calmly and thoroughly. Would definitely like to work with her.",
          ratings: [
            {
              criterion: "Kubernetes",
              score: 5,
              evidence: "Runs multi-cluster EKS with GitOps rollouts and HPA tuning",
            },
            {
              criterion: "Terraform",
              score: 4,
              evidence: "Solid module design; limited exposure to remote state backends",
            },
            {
              criterion: "AWS",
              score: 4,
              evidence: "Deep EC2/RDS/CloudFront experience, comfortable with IAM design",
            },
            {
              criterion: "Communication",
              score: 4,
              evidence: "Structured answers, concise incident narration",
            },
          ],
        },
        {
          evaluator: "Rohit Deshmukh",
          recommendation: "yes",
          summary:
            "Great fit for the platform team. Recommend offer at 24 LPA with a joining date in 3 weeks.",
          ratings: [
            {
              criterion: "Terraform",
              score: 4,
              evidence: "Real module libraries with CI validation",
            },
            { criterion: "CI/CD", score: 4, evidence: "GitLab + ArgoCD progressive delivery" },
            {
              criterion: "Troubleshooting",
              score: 5,
              evidence: "Led a 45-minute outage diagnosis end-to-end",
            },
            {
              criterion: "Communication",
              score: 4,
              evidence: "Clear, no fluff; asks good clarifying questions",
            },
          ],
        },
      ],
    },
  ];
  for (const spec of interviewSpecs) {
    const app = appDocs[spec.key];
    if (!app) continue;
    const existing = await Interview.findOne({ application: app._id, title: spec.title });
    if (existing) continue;
    await Interview.create({
      organization: org._id,
      application: app._id,
      createdBy: teamUsers["Kavya Mehta"]._id,
      title: spec.title,
      type: spec.type,
      status: spec.status,
      scheduledStart: spec.start,
      scheduledEnd: spec.end,
      timezone: "Asia/Kolkata",
      meetingUrl: spec.meetingUrl,
      participants: spec.participants.map((p) => teamUsers[p]._id),
      candidateConfirmedAt: spec.status === "confirmed" ? daysAgo(1) : null,
      feedback: spec.feedback.map((f) => ({
        evaluator: teamUsers[f.evaluator]._id,
        ratings: f.ratings,
        recommendation: f.recommendation,
        summary: f.summary,
        submittedAt: spec.start,
      })),
    });
    console.log(`  + Interview: ${spec.title} [${spec.status}]`);
  }

  return { org };
};

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
const main = async () => {
  validateEnvironment();
  await connectDB();

  try {
    console.log("");
    console.log("=== PHASE 1: LEGACY CLEANUP ===");
    await cleanupLegacy();

    console.log("");
    console.log("=== PHASE 2: PROFESSIONAL DATA ===");
    await createWorld();

    console.log("");
    console.log("==========================================================");
    console.log("          MERIDIAN CLOUD TECHNOLOGIES - READY            ");
    console.log("==========================================================");
    console.log("");
    console.log("RECRUITER-SIDE LOGINS");
    console.log("----------------------------------------------------------");
    for (const t of TEAM) {
      console.log(`  ${t.membershipRole.padEnd(15)} ${t.name} (${t.headline})`);
      console.log(`                    ${t.email}  /  ${t.password}`);
    }
    console.log("");
    console.log("CANDIDATE LOGINS (each has a processed, READY resume)");
    console.log("----------------------------------------------------------");
    for (const c of CANDIDATES) {
      console.log(`  ${c.name.padEnd(16)} ${c.email}  /  ${c.password}`);
    }
    console.log("");
    console.log("JOBS");
    console.log("----------------------------------------------------------");
    for (const j of JOBS) {
      console.log(
        `  [${j.status.padEnd(9)}] ${j.title} - ${j.location} - INR ${Math.round(j.compensation.min / 100000)}-${Math.round(j.compensation.max / 100000)} LPA`,
      );
    }
    console.log("");
    console.log("PIPELINE STATE");
    console.log("----------------------------------------------------------");
    for (const a of APPLICATIONS) {
      console.log(`  ${a.status.padEnd(13)} ${a.candidate} -> ${a.job}`);
    }
    console.log("");
    console.log("SUGGESTED START-TO-END TEST ORDER");
    console.log("----------------------------------------------------------");
    console.log("1. Candidate: log in (any candidate above) -> Resumes (ready)");
    console.log("   -> Discover -> open a job -> Analyze fit -> Apply / save");
    console.log("2. Candidate: Profile page (education, projects, certs)");
    console.log("3. Recruiter: log in as Kavya (owner) -> Overview analytics");
    console.log("   -> Applicants (filter by stage) -> score / compare / notes");
    console.log("   -> open Vikram: interview scheduled; open Sneha: completed");
    console.log("   -> Interviews page: view the scheduled + completed rounds, feedback");
    console.log("4. Recruiter: Jobs -> publish the DRAFT 'QA Automation' job");
    console.log("5. Recruiter: Team -> add a member (your own email), then Remove it");
    console.log("6. Recruiter: Recruiter copilot (needs AI key) + Analytics");
    console.log("7. Admin: /app/admin -> Users, Organizations, AI Usage, Security");
    console.log("8. Try a NEW signup (candidate) -> upload a real resume PDF");
    console.log("==========================================================");
  } finally {
    await disconnectDB();
  }
};

main().catch((error) => {
  console.error("Professional data setup failed:", error.message);
  process.exit(1);
});
