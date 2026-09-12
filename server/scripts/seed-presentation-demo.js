/**
 * Presentation-Ready Demo Dataset & Idempotent Seeder for HireSmart-AI
 * 
 * Specially tailored for MCA Semester 3 Project Demonstration:
 *   - Primary Candidate: Anas Tai (tanastai5018@gmail.com / hiresmart8704)
 *       MCA Student @ SRIMCA, Surat, Gujarat (Fresher / MERN Stack)
 *       Projects: HireSmart-AI, HomeServeX, Travel Planner
 *       Ready PDF resume, 6 connected applications, scheduled interview, notifications
 *   - Primary Recruiter: 2025mca150@gmail.com / hiresmart8704
 *       Talent Lead @ Apex Innovations (Surat/Ahmedabad)
 *       5 Job postings, applications to review, interview scheduled, notifications
 *   - Admin: Preserves existing platform admin account without overwriting or deletion
 *   - Ecosystem: 8 candidates, 5 companies, 12 realistic jobs, 22 applications,
 *       5 interviews (upcoming + completed with rubric feedback), notes, hybrid matches,
 *       AI analysis logs, security events, audit logs, and in-app notifications.
 *
 * Safe, idempotent, non-destructive.
 *
 * Usage:
 *   cd server && node scripts/seed-presentation-demo.js
 *   or: cd server && npm run demo
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
const CandidateProfile = require("../models/CandidateProfile");
const { Resume, ResumeVersion, ParsedResume } = require("../models/Resume");
const { Application } = require("../models/Application");
const Interview = require("../models/Interview");
const { CandidateMatch, Note } = require("../models/Recruitment");
const AIAnalysis = require("../models/AIAnalysis");
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
const Consent = require("../models/Consent");
const JobAlert = require("../models/JobAlert");
const Notification = require("../models/Notification");
const { createVersion, processVersion } = require("../services/resumeProcessingService");

const DEMO_PASSWORD = "hiresmart8704";

/* ------------------------------------------------------------------ *
 * Helper functions
 * ------------------------------------------------------------------ */
const escapePdf = (value) =>
  String(value || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Build a minimal but valid single-page PDF (Helvetica, standard xref table). */
const buildPdf = (lines) => {
  const content = lines
    .map((line, index) => `BT /F1 10.5 Tf 50 ${780 - index * 17} Td (${escapePdf(line)}) Tj ET`)
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
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
};

const daysAgo = (days) => new Date(Date.now() - days * 86400000);
const inDays = (days, hour = 14, minute = 0) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/* ------------------------------------------------------------------ *
 * Demo World Data Definitions
 * ------------------------------------------------------------------ */

const ORGANIZATIONS = [
  {
    name: "Apex Innovations",
    slug: "apex-innovations",
    industry: "Software & Cloud Solutions",
    size: "51-200",
    website: "https://www.apexinnovations.in",
    about:
      "Apex Innovations is a premier software engineering and cloud consulting firm building enterprise SaaS, scalable web platforms, and intelligent AI tools.",
    timezone: "Asia/Kolkata",
  },
  {
    name: "Nexus Byte Solutions",
    slug: "nexus-byte-solutions",
    industry: "Enterprise Software & AI",
    size: "201-500",
    website: "https://www.nexusbyte.io",
    about:
      "Nexus Byte Solutions creates high-throughput data platforms, cloud-native services, and AI-driven automation for global enterprise clients.",
    timezone: "Asia/Kolkata",
  },
  {
    name: "CloudForge Systems",
    slug: "cloudforge-systems",
    industry: "Cloud Infrastructure & DevOps",
    size: "11-50",
    website: "https://www.cloudforge.io",
    about:
      "CloudForge Systems specializes in resilient cloud platforms, Kubernetes multi-cluster management, GitOps pipelines, and Site Reliability Engineering.",
    timezone: "Asia/Kolkata",
  },
  {
    name: "ByteScale Technologies",
    slug: "bytescale-technologies",
    industry: "FinTech & Payments",
    size: "51-200",
    website: "https://www.bytescale.tech",
    about:
      "ByteScale Technologies operates low-latency payment processing, digital banking APIs, and financial microservices handling millions of transactions daily.",
    timezone: "Asia/Kolkata",
  },
  {
    name: "Zenith Global Labs",
    slug: "zenith-global-labs",
    industry: "Research & Development",
    size: "501-1000",
    website: "https://www.zenithlabs.in",
    about:
      "Zenith Global Labs is a deep-tech research hub creating next-gen software architectures, machine learning models, and developer tooling.",
    timezone: "Asia/Kolkata",
  },
];

const RECRUITERS = [
  {
    name: "Demo Recruiter",
    email: "2025mca150@gmail.com",
    password: DEMO_PASSWORD,
    orgSlug: "apex-innovations",
    membershipRole: "owner",
    headline: "Senior Talent Acquisition & Technical Hiring Lead",
    location: "Surat, Gujarat, India",
    phone: "+91 98980 12345",
  },
  {
    name: "Suresh Patel",
    email: "suresh.patel@apexinnovations.in",
    password: DEMO_PASSWORD,
    orgSlug: "apex-innovations",
    membershipRole: "hiring_manager",
    headline: "Engineering Director - Web & Cloud",
    location: "Surat, Gujarat, India",
    phone: "+91 98250 11223",
  },
  {
    name: "Deepak Shah",
    email: "deepak.shah@apexinnovations.in",
    password: DEMO_PASSWORD,
    orgSlug: "apex-innovations",
    membershipRole: "interviewer",
    headline: "Principal Full Stack Architect",
    location: "Ahmedabad, Gujarat, India",
    phone: "+91 97250 33445",
  },
  {
    name: "Rohit Sharma",
    email: "rohit.sharma@nexusbyte.com",
    password: DEMO_PASSWORD,
    orgSlug: "nexus-byte-solutions",
    membershipRole: "owner",
    headline: "Head of Engineering & Talent",
    location: "Bengaluru, Karnataka, India",
    phone: "+91 98450 66778",
  },
  {
    name: "Neha Patel",
    email: "neha.patel@cloudforge.io",
    password: DEMO_PASSWORD,
    orgSlug: "cloudforge-systems",
    membershipRole: "owner",
    headline: "Lead Technical Recruiter",
    location: "Pune, Maharashtra, India",
    phone: "+91 98600 77889",
  },
  {
    name: "Amit Verma",
    email: "amit.verma@bytescale.tech",
    password: DEMO_PASSWORD,
    orgSlug: "bytescale-technologies",
    membershipRole: "owner",
    headline: "Talent Acquisition Manager - FinTech",
    location: "Mumbai, Maharashtra, India",
    phone: "+91 98190 88990",
  },
  {
    name: "Kavya Nair",
    email: "kavya.nair@zenithlabs.in",
    password: DEMO_PASSWORD,
    orgSlug: "zenith-global-labs",
    membershipRole: "owner",
    headline: "Campus Talent & University Relations Lead",
    location: "Hyderabad, Telangana, India",
    phone: "+91 99080 99001",
  },
];

const JOBS = [
  // Apex Innovations (Primary Recruiter: 2025mca150@gmail.com)
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Software Engineer Intern (MERN)",
    location: "Surat, Gujarat, India",
    salary: 420000,
    compensation: { min: 350000, max: 500000, currency: "INR", period: "year" },
    experience: "Fresher / 0-1 years",
    minExpYears: 0,
    maxExpYears: 1,
    jobType: "Internship",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 20,
    requiredSkills: ["React", "Node.js", "Express", "MongoDB"],
    preferredSkills: ["Tailwind CSS", "REST APIs", "Git", "JWT Auth"],
    skills: ["React", "Node.js", "Express", "MongoDB", "Tailwind CSS", "JavaScript", "REST APIs", "Git", "JWT Auth"],
    description:
      "Apex Innovations is seeking enthusiastic Software Engineer Interns to join our core web product engineering team in Surat. " +
      "You will work alongside senior architects building responsive frontend interfaces and high-performance backend microservices.\n\n" +
      "What You Will Do:\n" +
      "- Build dynamic, responsive user interface components using React and Tailwind CSS.\n" +
      "- Develop robust RESTful APIs in Node.js and Express with JWT authentication.\n" +
      "- Design and optimize MongoDB schemas and aggregation pipelines.\n" +
      "- Collaborate on Git workflows, code reviews, and continuous deployment pipelines.\n\n" +
      "What We Are Looking For:\n" +
      "- Hands-on academic or internship projects using React, Node.js, and MongoDB.\n" +
      "- Solid understanding of JavaScript (ES6+), asynchronous programming, and REST principles.\n" +
      "- Eagerness to learn modern full stack architectures and best coding practices.",
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Junior Full Stack Developer",
    location: "Surat, Gujarat, India",
    salary: 650000,
    compensation: { min: 500000, max: 800000, currency: "INR", period: "year" },
    experience: "0-2 years",
    minExpYears: 0,
    maxExpYears: 2,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 16,
    requiredSkills: ["React", "Node.js", "JavaScript"],
    preferredSkills: ["MongoDB", "Express", "Tailwind CSS", "TypeScript"],
    skills: ["React", "Node.js", "JavaScript", "MongoDB", "Express", "REST APIs", "Tailwind CSS", "Git"],
    description:
      "We are hiring a Junior Full Stack Developer to help build our client-facing web portals and SaaS dashboards. " +
      "You will have ownership of end-to-end features spanning React web applications and Node.js microservices.\n\n" +
      "Key Responsibilities:\n" +
      "- Develop clean, maintainable, and well-tested React components.\n" +
      "- Build and maintain secure backend REST APIs with Node.js and Express.\n" +
      "- Integrate relational and NoSQL databases with efficient queries.\n" +
      "- Participate in agile sprints, daily standups, and code reviews.\n\n" +
      "Qualifications:\n" +
      "- Bachelor's or Master's in Computer Applications / Computer Science or equivalent experience.\n" +
      "- Demonstrated proficiency in React, JavaScript, Node.js, and MongoDB.",
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "React Frontend Developer",
    location: "Ahmedabad, Gujarat, India",
    salary: 750000,
    compensation: { min: 600000, max: 900000, currency: "INR", period: "year" },
    experience: "1-3 years",
    minExpYears: 1,
    maxExpYears: 3,
    jobType: "Full-Time",
    workplaceMode: "remote",
    status: "published",
    publishedDaysAgo: 12,
    requiredSkills: ["React", "JavaScript", "HTML/CSS"],
    preferredSkills: ["Tailwind CSS", "Redux", "REST APIs", "Next.js"],
    skills: ["React", "JavaScript", "Tailwind CSS", "HTML/CSS", "Redux", "REST APIs", "Git"],
    description:
      "Join Apex Innovations as a Frontend Developer focusing on modern React web applications. " +
      "You will turn UI/UX wireframes into responsive, accessible, and blazing-fast user interfaces.\n\n" +
      "Requirements:\n" +
      "- 1+ years experience building production React applications.\n" +
      "- Strong command over modern JavaScript, state management, and Tailwind CSS.\n" +
      "- Experience integrating REST APIs and handling async states gracefully.",
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Backend Developer (Node.js & Microservices)",
    location: "Surat, Gujarat, India",
    salary: 900000,
    compensation: { min: 700000, max: 1100000, currency: "INR", period: "year" },
    experience: "2-4 years",
    minExpYears: 2,
    maxExpYears: 4,
    jobType: "Full-Time",
    workplaceMode: "onsite",
    status: "draft",
    publishedDaysAgo: 0,
    requiredSkills: ["Node.js", "PostgreSQL", "Redis"],
    preferredSkills: ["Docker", "AWS", "Microservices", "MongoDB"],
    skills: ["Node.js", "PostgreSQL", "MongoDB", "Redis", "Docker", "REST APIs", "Express"],
    description:
      "Draft job posting for upcoming platform team expansion. " +
      "The role involves designing scalable Node.js microservices, caching architectures with Redis, and PostgreSQL query tuning.",
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Cloud Infrastructure Engineer",
    location: "Surat, Gujarat, India",
    salary: 1050000,
    compensation: { min: 800000, max: 1300000, currency: "INR", period: "year" },
    experience: "2-4 years",
    minExpYears: 2,
    maxExpYears: 4,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 5,
    moderation: { status: "pending", reason: "" },
    requiredSkills: ["Docker", "Kubernetes", "AWS"],
    preferredSkills: ["Terraform", "CI/CD", "Linux", "Prometheus"],
    skills: ["Docker", "Kubernetes", "AWS", "Terraform", "Linux", "CI/CD", "Git"],
    description:
      "We are seeking a Cloud Infrastructure Engineer to manage our containerized workloads and CI/CD automation pipelines. " +
      "This position is pending platform admin moderation.",
  },

  // Nexus Byte Solutions (Recruiter: rohit.sharma@nexusbyte.com)
  {
    orgSlug: "nexus-byte-solutions",
    recruiterEmail: "rohit.sharma@nexusbyte.com",
    title: "Associate Software Engineer",
    location: "Bengaluru, Karnataka, India",
    salary: 800000,
    compensation: { min: 600000, max: 1000000, currency: "INR", period: "year" },
    experience: "0-2 years",
    minExpYears: 0,
    maxExpYears: 2,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 18,
    requiredSkills: ["JavaScript", "React", "Node.js"],
    preferredSkills: ["MongoDB", "REST APIs", "SQL", "Git"],
    skills: ["JavaScript", "React", "Node.js", "MongoDB", "SQL", "REST APIs", "Git"],
    description:
      "Nexus Byte Solutions is hiring Associate Software Engineers to contribute across our enterprise product suites. " +
      "Great opportunity for fast-learning graduates and junior developers.",
  },
  {
    orgSlug: "nexus-byte-solutions",
    recruiterEmail: "rohit.sharma@nexusbyte.com",
    title: "Backend Engineer (Node.js / Express)",
    location: "Bengaluru, Karnataka, India",
    salary: 950000,
    compensation: { min: 700000, max: 1200000, currency: "INR", period: "year" },
    experience: "2-4 years",
    minExpYears: 2,
    maxExpYears: 4,
    jobType: "Full-Time",
    workplaceMode: "remote",
    status: "published",
    publishedDaysAgo: 14,
    requiredSkills: ["Node.js", "Express", "PostgreSQL"],
    preferredSkills: ["Redis", "REST APIs", "Docker"],
    skills: ["Node.js", "Express", "PostgreSQL", "Redis", "REST APIs", "Docker", "Git"],
    description:
      "Looking for a skilled backend developer to build high-throughput data APIs and transaction processing pipelines in Node.js.",
  },

  // CloudForge Systems (Recruiter: neha.patel@cloudforge.io)
  {
    orgSlug: "cloudforge-systems",
    recruiterEmail: "neha.patel@cloudforge.io",
    title: "Frontend Engineer (React & TypeScript)",
    location: "Pune, Maharashtra, India",
    salary: 800000,
    compensation: { min: 600000, max: 1000000, currency: "INR", period: "year" },
    experience: "1-3 years",
    minExpYears: 1,
    maxExpYears: 3,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 15,
    requiredSkills: ["React", "TypeScript", "Tailwind CSS"],
    preferredSkills: ["Next.js", "Jest", "Git"],
    skills: ["React", "TypeScript", "Tailwind CSS", "Next.js", "Jest", "Git", "REST APIs"],
    description:
      "Join our product engineering team to build scalable, component-driven interfaces using React, TypeScript, and modern styling libraries.",
  },
  {
    orgSlug: "cloudforge-systems",
    recruiterEmail: "neha.patel@cloudforge.io",
    title: "DevOps / Cloud Engineer",
    location: "Pune, Maharashtra, India",
    salary: 1100000,
    compensation: { min: 800000, max: 1400000, currency: "INR", period: "year" },
    experience: "3-5 years",
    minExpYears: 3,
    maxExpYears: 5,
    jobType: "Full-Time",
    workplaceMode: "onsite",
    status: "published",
    publishedDaysAgo: 22,
    requiredSkills: ["AWS", "Docker", "Kubernetes"],
    preferredSkills: ["Terraform", "CI/CD", "Linux", "Prometheus"],
    skills: ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "Prometheus"],
    description:
      "Manage cloud infrastructure across AWS, manage multi-node Kubernetes clusters, and automate deployment workflows with ArgoCD and Terraform.",
  },

  // ByteScale Technologies (Recruiter: amit.verma@bytescale.tech)
  {
    orgSlug: "bytescale-technologies",
    recruiterEmail: "amit.verma@bytescale.tech",
    title: "Junior MERN Stack Engineer",
    location: "Mumbai, Maharashtra, India",
    salary: 650000,
    compensation: { min: 500000, max: 800000, currency: "INR", period: "year" },
    experience: "0-2 years",
    minExpYears: 0,
    maxExpYears: 2,
    jobType: "Full-Time",
    workplaceMode: "remote",
    status: "published",
    publishedDaysAgo: 25,
    requiredSkills: ["MongoDB", "Express", "React", "Node.js"],
    preferredSkills: ["REST APIs", "Tailwind CSS", "Git"],
    skills: ["MongoDB", "Express", "React", "Node.js", "REST APIs", "Tailwind CSS", "Git"],
    description:
      "ByteScale is hiring junior MERN stack developers to help scale our FinTech integration platform and merchant dashboards.",
  },
  {
    orgSlug: "bytescale-technologies",
    recruiterEmail: "amit.verma@bytescale.tech",
    title: "QA Automation Specialist",
    location: "Mumbai, Maharashtra, India",
    salary: 650000,
    compensation: { min: 500000, max: 800000, currency: "INR", period: "year" },
    experience: "1-3 years",
    minExpYears: 1,
    maxExpYears: 3,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 10,
    requiredSkills: ["Playwright", "JavaScript", "API Testing"],
    preferredSkills: ["Jest", "Cypress", "Postman"],
    skills: ["Playwright", "JavaScript", "API Testing", "Jest", "Cypress", "Postman", "Git"],
    description:
      "Automate end-to-end regression test suites with Playwright and integrate automated API tests into CI/CD build pipelines.",
  },

  // Zenith Global Labs (Recruiter: kavya.nair@zenithlabs.in)
  {
    orgSlug: "zenith-global-labs",
    recruiterEmail: "kavya.nair@zenithlabs.in",
    title: "Graduate Software Trainee",
    location: "Hyderabad, Telangana, India",
    salary: 550000,
    compensation: { min: 450000, max: 650000, currency: "INR", period: "year" },
    experience: "Fresher / 0-1 years",
    minExpYears: 0,
    maxExpYears: 1,
    jobType: "Full-Time",
    workplaceMode: "onsite",
    status: "published",
    publishedDaysAgo: 21,
    requiredSkills: ["JavaScript", "Python", "SQL"],
    preferredSkills: ["React", "Git", "Data Structures"],
    skills: ["JavaScript", "Python", "SQL", "React", "Git", "Data Structures"],
    description:
      "Graduate Trainee program for passionate Computer Applications and Engineering graduates looking to build a career in software product engineering.",
  },
];

const CANDIDATES = [
  // Primary Candidate: Anas Tai (Fresher / MCA Student @ SRIMCA)
  {
    name: "Anas Tai",
    email: "tanastai5018@gmail.com",
    password: DEMO_PASSWORD,
    headline: "Full-Stack Developer | MCA Student at SRIMCA",
    location: "Surat, Gujarat, India",
    phone: "+91 97234 56789",
    gender: "Male",
    city: "Surat",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    skills: ["React", "Node.js", "Express", "MongoDB", "JavaScript", "Tailwind CSS", "REST APIs", "Git", "Python", "JWT Auth", "PostgreSQL", "Redux"],
    bio: "MCA final-year student at SRIMCA (Uka Tarsadia University) passionate about building scalable web applications. Proficient in MERN stack (MongoDB, Express, React, Node.js), REST APIs, Tailwind CSS, and AI integrations. Creator of HireSmart-AI, HomeServeX, and Travel Planner.",
    socialLinks: {
      github: "https://github.com/anastai8704",
      linkedin: "https://linkedin.com/in/anastai",
      portfolio: "https://anastai.dev",
      website: "https://anastai.dev",
    },
    education: [
      {
        institution: "Shrimad Rajchandra Institute of Management and Computer Application (SRIMCA), UTU",
        degree: "Master of Computer Applications (MCA)",
        fieldOfStudy: "Computer Applications & Software Development",
        startYear: 2024,
        endYear: 2026,
        cgpa: 8.85,
      },
      {
        institution: "Veer Narmad South Gujarat University (VNSGU)",
        degree: "Bachelor of Computer Applications (BCA)",
        fieldOfStudy: "Computer Science & Application Development",
        startYear: 2021,
        endYear: 2024,
        cgpa: 8.52,
      },
    ],
    experience: [
      {
        company: "TechCraft Solutions",
        position: "Full Stack Developer Intern",
        description:
          "Developed responsive frontend interfaces with React and Tailwind CSS; built secure Node.js & Express REST APIs with JWT authentication, request validation, and MongoDB aggregation pipelines.",
        startDate: new Date("2024-05-01"),
        endDate: new Date("2024-08-31"),
        currentlyWorking: false,
      },
    ],
    projects: [
      {
        title: "HireSmart-AI",
        description:
          "AI-powered recruitment and application management platform with hybrid semantic resume matching, automated interview scheduling, and interactive hiring pipelines.",
        technologies: ["React", "Node.js", "Express", "MongoDB", "Tailwind CSS", "JWT Auth", "AI Integrations"],
        githubUrl: "https://github.com/anastai8704/HireSmart-AI",
        liveUrl: "https://hiresmart-ai.dev",
      },
      {
        title: "HomeServeX",
        description:
          "On-demand home services booking marketplace featuring real-time provider dispatch, booking calendar, secure payment flows, and user rating system.",
        technologies: ["React", "Node.js", "MongoDB", "Express", "Tailwind CSS"],
        githubUrl: "https://github.com/anastai8704/HomeServeX",
        liveUrl: "https://homeservex.dev",
      },
      {
        title: "Travel Planner",
        description:
          "Personalized travel itinerary generator offering multi-city route mapping, budget forecasting, and weather forecasting integration.",
        technologies: ["React", "Node.js", "OpenWeather API", "Leaflet Maps"],
        githubUrl: "https://github.com/anastai8704/TravelPlanner",
        liveUrl: "https://travelplanner.dev",
      },
    ],
    certifications: [
      {
        name: "Full Stack Web Development Certification",
        issuer: "freeCodeCamp",
        issueDate: new Date("2024-03-15"),
        certificateUrl: "https://freecodecamp.org/certification/anastai/full-stack",
      },
      {
        name: "MongoDB Certified Developer Associate",
        issuer: "MongoDB University",
        issueDate: new Date("2024-06-20"),
        certificateUrl: "https://learn.mongodb.com/certificates/anastai",
      },
      {
        name: "Postman API Fundamentals Student Expert",
        issuer: "Postman",
        issueDate: new Date("2024-07-10"),
        certificateUrl: "https://badgr.com/public/badges/postman-anastai",
      },
    ],
    resumeLines: [
      "Anas Tai - Full-Stack Developer | MCA Student at SRIMCA",
      "Surat, Gujarat, India | tanastai5018@gmail.com | +91 97234 56789 | github.com/anastai8704",
      "",
      "PROFESSIONAL SUMMARY",
      "MCA student at SRIMCA (UTU) with strong expertise in full stack MERN development, REST APIs, and modern web architectures.",
      "",
      "TECHNICAL SKILLS",
      "React, Node.js, Express, MongoDB, JavaScript, Tailwind CSS, REST APIs, Git, Python, JWT Auth, PostgreSQL, Redux",
      "",
      "FEATURED PROJECTS",
      "HireSmart-AI: AI-powered hiring platform with hybrid semantic matching, interview scheduling, and recruiter pipeline.",
      "HomeServeX: On-demand home services booking marketplace with provider dispatch, calendar, and payment flows.",
      "Travel Planner: Personalized travel itinerary planner with multi-city route mapping and weather integration.",
      "",
      "EXPERIENCE",
      "Full Stack Developer Intern, TechCraft Solutions (May 2024 - Aug 2024): Built React components and Node.js REST APIs with JWT auth.",
      "",
      "EDUCATION",
      "Master of Computer Applications (MCA), SRIMCA - Uka Tarsadia University (2024 - 2026, CGPA: 8.85)",
      "Bachelor of Computer Applications (BCA), Veer Narmad South Gujarat University (2021 - 2024, CGPA: 8.52)",
      "",
      "CERTIFICATIONS",
      "freeCodeCamp Full Stack Web Development | MongoDB Certified Associate | Postman API Student Expert",
    ],
  },

  // 7 Additional Fictional Candidates
  {
    name: "Priya Sharma",
    email: "priya.sharma@example.com",
    password: DEMO_PASSWORD,
    headline: "Frontend Engineer (React & Redux)",
    location: "Ahmedabad, Gujarat, India",
    phone: "+91 98765 43210",
    gender: "Female",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    skills: ["React", "JavaScript", "Redux", "Tailwind CSS", "HTML/CSS", "REST APIs", "Jest", "Git"],
    bio: "Frontend engineer with 3 years experience building responsive, component-driven React applications and stateful dashboards.",
    socialLinks: { github: "https://github.com/priyasharma-dev", linkedin: "https://linkedin.com/in/priyasharma-dev" },
    education: [
      {
        institution: "Gujarat Technological University",
        degree: "B.E. Computer Engineering",
        fieldOfStudy: "Computer Engineering",
        startYear: 2017,
        endYear: 2021,
        cgpa: 8.3,
      },
    ],
    experience: [
      {
        company: "TechNova Solutions",
        position: "Frontend Developer",
        description: "Built modular React dashboards and Redux state stores used by 50,000 monthly active users.",
        startDate: new Date("2021-07-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "React Component Library",
        description: "Accessible, themeable component library published on npm with 500+ weekly downloads.",
        technologies: ["React", "Tailwind CSS", "Storybook"],
      },
    ],
    certifications: [{ name: "Meta Frontend Developer Professional Certificate", issuer: "Meta" }],
    resumeLines: [
      "Priya Sharma - Frontend Engineer (React & Redux)",
      "Ahmedabad, Gujarat, India | priya.sharma@example.com | +91 98765 43210",
      "",
      "SKILLS: React, JavaScript, Redux, Tailwind CSS, HTML/CSS, REST APIs, Jest, Git",
      "",
      "EXPERIENCE",
      "Frontend Developer, TechNova Solutions (2021 - Present): Built modular React dashboards with Redux state stores.",
      "",
      "EDUCATION",
      "B.E. Computer Engineering, Gujarat Technological University (2017 - 2021)",
    ],
  },
  {
    name: "Vikram Nair",
    email: "vikram.nair@example.com",
    password: DEMO_PASSWORD,
    headline: "Backend Engineer (Node.js & PostgreSQL)",
    location: "Bengaluru, Karnataka, India",
    phone: "+91 98450 77620",
    gender: "Male",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    languages: ["English", "Hindi", "Kannada"],
    skills: ["Node.js", "Express", "PostgreSQL", "MongoDB", "Redis", "Docker", "REST APIs", "AWS"],
    bio: "Backend engineer with 4 years building high-throughput payment webhooks, microservices, and database optimizations.",
    socialLinks: { github: "https://github.com/vikramnair-dev", linkedin: "https://linkedin.com/in/vikramnair-dev" },
    education: [
      {
        institution: "Visvesvaraya Technological University",
        degree: "B.Tech Information Technology",
        fieldOfStudy: "Information Technology",
        startYear: 2016,
        endYear: 2020,
        cgpa: 8.1,
      },
    ],
    experience: [
      {
        company: "PayStream Technologies",
        position: "Backend Engineer",
        description: "Architected payment processing webhooks handling 2M transactions daily with PostgreSQL and Redis caching.",
        startDate: new Date("2020-08-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "ledger-reconcile",
        description: "Open-source distributed transaction reconciliation service built in Node.js and PostgreSQL.",
        technologies: ["Node.js", "PostgreSQL", "Redis"],
      },
    ],
    certifications: [{ name: "AWS Certified Developer - Associate", issuer: "AWS" }],
    resumeLines: [
      "Vikram Nair - Backend Engineer (Node.js & PostgreSQL)",
      "Bengaluru, Karnataka, India | vikram.nair@example.com | +91 98450 77620",
      "",
      "SKILLS: Node.js, Express, PostgreSQL, MongoDB, Redis, Docker, REST APIs, AWS",
      "",
      "EXPERIENCE",
      "Backend Engineer, PayStream Technologies (2020 - Present): Architected payment webhooks handling 2M daily events.",
      "",
      "EDUCATION",
      "B.Tech Information Technology, VTU (2016 - 2020)",
    ],
  },
  {
    name: "Sneha Kulkarni",
    email: "sneha.kulkarni@example.com",
    password: DEMO_PASSWORD,
    headline: "DevOps & Cloud SRE Engineer",
    location: "Pune, Maharashtra, India",
    phone: "+91 98220 35914",
    gender: "Female",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    languages: ["English", "Hindi", "Marathi"],
    skills: ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "Prometheus", "GitLab CI"],
    bio: "DevOps engineer with 4 years managing multi-cluster EKS infrastructure, GitOps pipelines, and SLO monitoring.",
    socialLinks: { github: "https://github.com/snehak-devops", linkedin: "https://linkedin.com/in/snehak-devops" },
    education: [
      {
        institution: "College of Engineering Pune (COEP)",
        degree: "B.E. Computer Science",
        fieldOfStudy: "Computer Science",
        startYear: 2016,
        endYear: 2020,
        cgpa: 8.0,
      },
    ],
    experience: [
      {
        company: "CloudSprint Technologies",
        position: "DevOps Engineer",
        description: "Managed 20-node Kubernetes clusters on AWS EKS; automated deployment pipelines with Terraform and ArgoCD.",
        startDate: new Date("2020-09-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "cluster-audit-cli",
        description: "Automated health and resource auditing tool for Kubernetes clusters.",
        technologies: ["Go", "Kubernetes", "Prometheus"],
      },
    ],
    certifications: [
      { name: "Certified Kubernetes Administrator (CKA)", issuer: "CNCF" },
      { name: "HashiCorp Certified: Terraform Associate", issuer: "HashiCorp" },
    ],
    resumeLines: [
      "Sneha Kulkarni - DevOps & Cloud SRE Engineer",
      "Pune, Maharashtra, India | sneha.kulkarni@example.com | +91 98220 35914",
      "",
      "SKILLS: AWS, Docker, Kubernetes, Terraform, CI/CD, Linux, Prometheus, GitLab CI",
      "",
      "EXPERIENCE",
      "DevOps Engineer, CloudSprint Technologies (2020 - Present): Managed AWS EKS clusters with Terraform and GitOps.",
      "",
      "EDUCATION",
      "B.E. Computer Science, COEP Pune (2016 - 2020)",
    ],
  },
  {
    name: "Arjun Mehta",
    email: "arjun.mehta@example.com",
    password: DEMO_PASSWORD,
    headline: "Junior Frontend Developer (React & JavaScript)",
    location: "Surat, Gujarat, India",
    phone: "+91 97260 41285",
    gender: "Male",
    city: "Surat",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    skills: ["React", "JavaScript", "HTML/CSS", "Tailwind CSS", "Jest", "Git", "REST APIs"],
    bio: "Junior developer with 1.5 years experience crafting interactive UI components in React and modern Tailwind CSS.",
    socialLinks: { github: "https://github.com/arjunmehta-web", linkedin: "https://linkedin.com/in/arjunmehta-web" },
    education: [
      {
        institution: "L.D. College of Engineering",
        degree: "B.E. Computer Engineering",
        fieldOfStudy: "Computer Engineering",
        startYear: 2019,
        endYear: 2023,
        cgpa: 8.4,
      },
    ],
    experience: [
      {
        company: "WebCraft Studio",
        position: "Junior Frontend Developer",
        description: "Implemented responsive web UI components in React and wrote unit tests with Jest.",
        startDate: new Date("2023-07-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "eCommerce Storefront",
        description: "Responsive e-commerce UI built in React with shopping cart and payment integration.",
        technologies: ["React", "Tailwind CSS", "JavaScript"],
      },
    ],
    certifications: [{ name: "JavaScript Algorithms and Data Structures", issuer: "freeCodeCamp" }],
    resumeLines: [
      "Arjun Mehta - Junior Frontend Developer",
      "Surat, Gujarat, India | arjun.mehta@example.com | +91 97260 41285",
      "",
      "SKILLS: React, JavaScript, HTML/CSS, Tailwind CSS, Jest, Git, REST APIs",
      "",
      "EXPERIENCE",
      "Junior Frontend Developer, WebCraft Studio (2023 - Present): Built React components and Jest test suites.",
      "",
      "EDUCATION",
      "B.E. Computer Engineering, L.D. College of Engineering (2019 - 2023)",
    ],
  },
  {
    name: "Ishita Verma",
    email: "ishita.verma@example.com",
    password: DEMO_PASSWORD,
    headline: "QA Automation Engineer (Playwright & Jest)",
    location: "Indore, Madhya Pradesh, India",
    phone: "+91 98930 66412",
    gender: "Female",
    city: "Indore",
    state: "Madhya Pradesh",
    country: "India",
    languages: ["English", "Hindi"],
    skills: ["Playwright", "Cypress", "JavaScript", "TypeScript", "API Testing", "Postman", "Jest", "Git"],
    bio: "QA engineer with 3 years specializing in automated end-to-end testing, Playwright suites, and CI/CD quality gates.",
    socialLinks: { github: "https://github.com/ishita-qa", linkedin: "https://linkedin.com/in/ishita-qa" },
    education: [
      {
        institution: "Symbiosis Institute of Technology",
        degree: "B.Tech Computer Science",
        fieldOfStudy: "Computer Science",
        startYear: 2017,
        endYear: 2021,
        cgpa: 8.0,
      },
    ],
    experience: [
      {
        company: "TestNova Systems",
        position: "QA Automation Engineer",
        description: "Built 150+ Playwright automated test scripts for cloud SaaS dashboards, reducing regression cycle by 70%.",
        startDate: new Date("2021-08-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "playwright-reporter-slack",
        description: "Custom Playwright test reporter posting instant test summaries and failure screenshots to Slack.",
        technologies: ["TypeScript", "Playwright", "Slack API"],
      },
    ],
    certifications: [{ name: "ISTQB Certified Tester - Foundation Level", issuer: "ISTQB" }],
    resumeLines: [
      "Ishita Verma - QA Automation Engineer",
      "Indore, Madhya Pradesh, India | ishita.verma@example.com | +91 98930 66412",
      "",
      "SKILLS: Playwright, Cypress, JavaScript, TypeScript, API Testing, Postman, Jest, Git",
      "",
      "EXPERIENCE",
      "QA Automation Engineer, TestNova Systems (2021 - Present): Built 150+ Playwright automated tests.",
      "",
      "EDUCATION",
      "B.Tech Computer Science, Symbiosis Institute of Technology (2017 - 2021)",
    ],
  },
  {
    name: "Karan Patel",
    email: "karan.patel@example.com",
    password: DEMO_PASSWORD,
    headline: "Full Stack Engineer (MERN & PostgreSQL)",
    location: "Ahmedabad, Gujarat, India",
    phone: "+91 99086 20347",
    gender: "Male",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    skills: ["React", "Node.js", "Express", "MongoDB", "PostgreSQL", "Redis", "Docker", "REST APIs", "AWS"],
    bio: "Full stack developer with 4 years building scalable web applications, real-time messaging, and microservices.",
    socialLinks: { github: "https://github.com/karanpatel-fullstack", linkedin: "https://linkedin.com/in/karanpatel-fullstack" },
    education: [
      {
        institution: "Nirma University",
        degree: "B.Tech Computer Science",
        fieldOfStudy: "Computer Science",
        startYear: 2016,
        endYear: 2020,
        cgpa: 7.9,
      },
    ],
    experience: [
      {
        company: "NexBank Digital",
        position: "Full Stack Engineer",
        description: "Built React portal and Node.js microservices handling 500,000 API requests daily on AWS ECS and RDS.",
        startDate: new Date("2020-07-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "taskflow-realtime",
        description: "Collaborative project management board with live WebSocket updates and audit logging.",
        technologies: ["React", "Node.js", "MongoDB", "Socket.io"],
      },
    ],
    certifications: [{ name: "AWS Certified Solutions Architect - Associate", issuer: "AWS" }],
    resumeLines: [
      "Karan Patel - Full Stack Engineer",
      "Ahmedabad, Gujarat, India | karan.patel@example.com | +91 99086 20347",
      "",
      "SKILLS: React, Node.js, Express, MongoDB, PostgreSQL, Redis, Docker, REST APIs, AWS",
      "",
      "EXPERIENCE",
      "Full Stack Engineer, NexBank Digital (2020 - Present): Developed React portals and Node.js microservices.",
      "",
      "EDUCATION",
      "B.Tech Computer Science, Nirma University (2016 - 2020)",
    ],
  },
  {
    name: "Ananya Iyer",
    email: "ananya.iyer@example.com",
    password: DEMO_PASSWORD,
    headline: "Senior Frontend Architect (React & TypeScript)",
    location: "Ahmedabad, Gujarat, India",
    phone: "+91 99090 12301",
    gender: "Female",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    skills: ["React", "TypeScript", "Next.js", "GraphQL", "Tailwind CSS", "Jest", "CI/CD", "Node.js"],
    bio: "Senior frontend architect with 5 years experience creating high-performance web applications and enterprise design systems.",
    socialLinks: { github: "https://github.com/ananyaiyer-dev", linkedin: "https://linkedin.com/in/ananyaiyer-dev" },
    education: [
      {
        institution: "Nirma University",
        degree: "B.E. Computer Engineering",
        fieldOfStudy: "Computer Engineering",
        startYear: 2015,
        endYear: 2019,
        cgpa: 8.5,
      },
    ],
    experience: [
      {
        company: "Zycus Software",
        position: "Senior Frontend Engineer",
        description: "Led React and TypeScript architecture for analytics suite; reduced bundle size 40% and improved Lighthouse score to 95.",
        startDate: new Date("2019-06-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "nexus-design-tokens",
        description: "Enterprise design system component library with full accessibility and theme tokens.",
        technologies: ["React", "TypeScript", "Tailwind CSS", "Storybook"],
      },
    ],
    certifications: [{ name: "AWS Certified Cloud Practitioner", issuer: "AWS" }],
    resumeLines: [
      "Ananya Iyer - Senior Frontend Architect",
      "Ahmedabad, Gujarat, India | ananya.iyer@example.com | +91 99090 12301",
      "",
      "SKILLS: React, TypeScript, Next.js, GraphQL, Tailwind CSS, Jest, CI/CD, Node.js",
      "",
      "EXPERIENCE",
      "Senior Frontend Engineer, Zycus Software (2019 - Present): Led React architecture and design systems.",
      "",
      "EDUCATION",
      "B.E. Computer Engineering, Nirma University (2015 - 2019)",
    ],
  },
];

/**
 * Connected Applications Pipeline:
 * [candidateEmail, jobTitle, companySlug, status, appliedDaysAgo, historyEntries, notes]
 */
const APPLICATIONS_CONFIG = [
  // Anas Tai Applications (6 total, demonstrating all major lifecycle states)
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Software Engineer Intern (MERN)",
    orgSlug: "apex-innovations",
    status: "interview",
    appliedDaysAgo: 14,
    tags: ["priority", "mca-fresher"],
    history: [
      ["submitted", "candidate", "Application submitted with resume and GitHub portfolio", 14],
      ["under_review", "recruiter", "Strong MERN stack portfolio with HireSmart-AI and HomeServeX projects.", 11],
      ["shortlisted", "recruiter", "Shortlisted for technical round based on impressive React & Node.js skills.", 7],
      ["interview", "recruiter", "Technical Round scheduled with Recruiter & Engineering Director.", 3],
    ],
    notes: [
      "Candidate demonstrates solid understanding of React hooks, Node.js REST design, and MongoDB schemas. HireSmart-AI project shows comprehensive full stack architecture.",
    ],
    match: {
      overallScore: 94,
      confidence: 0.95,
      matchedSkills: ["React", "Node.js", "Express", "MongoDB", "Tailwind CSS", "REST APIs", "Git", "JWT Auth", "JavaScript"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 98, preferredSkills: 95, experience: 88, education: 95, semantic: 94 },
      strengths: ["Strong MERN stack alignment", "High project relevance (HireSmart-AI, HomeServeX)", "MCA background with strong academic record"],
      concerns: [],
      recommendation: "Strong hire for MERN internship / junior engineer role",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Junior Full Stack Developer",
    orgSlug: "apex-innovations",
    status: "under_review",
    appliedDaysAgo: 9,
    tags: ["fresher-talent"],
    history: [
      ["submitted", "candidate", "Application submitted", 9],
      ["under_review", "recruiter", "Profile under technical team review for junior full stack opening.", 5],
    ],
    notes: [
      "Reviewing project codebases on GitHub. Clean repository structure and sensible commit history.",
    ],
    match: {
      overallScore: 89,
      confidence: 0.91,
      matchedSkills: ["React", "Node.js", "JavaScript", "MongoDB", "Express", "REST APIs", "Tailwind CSS", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["TypeScript"],
      componentScores: { requiredSkills: 95, preferredSkills: 82, experience: 82, education: 92, semantic: 90 },
      strengths: ["Complete JavaScript & Node.js fundamentals", "Production-style full stack project builds"],
      concerns: ["Limited production TypeScript exposure"],
      recommendation: "Proceed with technical screening",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "React Frontend Developer",
    orgSlug: "apex-innovations",
    status: "shortlisted",
    appliedDaysAgo: 16,
    tags: ["frontend-focus"],
    history: [
      ["submitted", "candidate", "Application submitted", 16],
      ["under_review", "recruiter", "Reviewing frontend skills and Tailwind CSS proficiency.", 12],
      ["shortlisted", "recruiter", "Shortlisted for frontend track. Great UI aesthetics in project portfolio.", 6],
    ],
    notes: [
      "Demonstrated strong CSS/Tailwind skills and responsive layout design.",
    ],
    match: {
      overallScore: 88,
      confidence: 0.90,
      matchedSkills: ["React", "JavaScript", "Tailwind CSS", "HTML/CSS", "Redux", "REST APIs", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["Next.js"],
      componentScores: { requiredSkills: 96, preferredSkills: 80, experience: 80, education: 90, semantic: 88 },
      strengths: ["Responsive UI building", "Clean component separation"],
      concerns: [],
      recommendation: "Shortlist for technical assessment",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Junior MERN Stack Engineer",
    orgSlug: "bytescale-technologies",
    status: "offer",
    appliedDaysAgo: 22,
    tags: ["top-candidate"],
    history: [
      ["submitted", "candidate", "Applied for remote MERN position", 22],
      ["under_review", "recruiter", "Technical team reviewed HomeServeX and HireSmart-AI repos.", 18],
      ["shortlisted", "recruiter", "Shortlisted based on MERN project depth.", 14],
      ["interview", "recruiter", "Technical interview cleared with 5/5 score on MERN fundamentals.", 8],
      ["offer", "recruiter", "Offer extended at INR 6.5 LPA. Joining date discussed for upcoming cycle.", 2],
    ],
    notes: [
      "Outstanding performance in the technical coding round. Highly articulate explanation of database schema design.",
    ],
    match: {
      overallScore: 95,
      confidence: 0.96,
      matchedSkills: ["MongoDB", "Express", "React", "Node.js", "REST APIs", "Tailwind CSS", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 98, preferredSkills: 95, experience: 89, education: 95, semantic: 96 },
      strengths: ["Flawless MERN stack alignment", "Strong REST API design skills"],
      concerns: [],
      recommendation: "Extend offer letter",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Frontend Engineer (React & TypeScript)",
    orgSlug: "cloudforge-systems",
    status: "submitted",
    appliedDaysAgo: 2,
    tags: [],
    history: [
      ["submitted", "candidate", "Application submitted online", 2],
    ],
    notes: [],
    match: {
      overallScore: 82,
      confidence: 0.86,
      matchedSkills: ["React", "Tailwind CSS", "Jest", "Git", "REST APIs"],
      missingRequiredSkills: ["TypeScript"],
      missingPreferredSkills: ["Next.js"],
      componentScores: { requiredSkills: 75, preferredSkills: 80, experience: 80, education: 90, semantic: 85 },
      strengths: ["Solid React fundamentals", "Fast learner"],
      concerns: ["Needs TypeScript ramp up"],
      recommendation: "Under review",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Graduate Software Trainee",
    orgSlug: "zenith-global-labs",
    status: "rejected",
    appliedDaysAgo: 18,
    tags: ["campus-pool"],
    history: [
      ["submitted", "candidate", "Campus trainee application submitted", 18],
      ["under_review", "recruiter", "Profile screened for Hyderabad on-site trainee batch.", 14],
      ["rejected", "recruiter", "Selected local on-site batch candidates; retained in talent network.", 8],
    ],
    notes: [
      "Good profile, but role required immediate on-site relocation to Hyderabad. Retained for remote/Gujarat opportunities.",
    ],
    match: {
      overallScore: 85,
      confidence: 0.88,
      matchedSkills: ["JavaScript", "Python", "SQL", "React", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 88, preferredSkills: 85, experience: 80, education: 90, semantic: 85 },
      strengths: ["Strong academic background"],
      concerns: ["Relocation mismatch"],
      recommendation: "Keep in talent network",
    },
  },

  // Other Candidates' Applications across the ecosystem
  {
    candidateEmail: "priya.sharma@example.com",
    jobTitle: "React Frontend Developer",
    orgSlug: "apex-innovations",
    status: "offer",
    appliedDaysAgo: 20,
    tags: ["priority"],
    history: [
      ["submitted", "candidate", "Applied for React Frontend role", 20],
      ["under_review", "recruiter", "Reviewing 3 years frontend experience.", 16],
      ["shortlisted", "recruiter", "Shortlisted for technical rounds.", 12],
      ["interview", "recruiter", "Technical round completed with great score.", 7],
      ["offer", "recruiter", "Offer extended at INR 8.5 LPA.", 3],
    ],
    notes: ["Strong Redux and state architecture knowledge."],
    match: {
      overallScore: 92,
      confidence: 0.94,
      matchedSkills: ["React", "JavaScript", "HTML/CSS", "Tailwind CSS", "Redux", "REST APIs", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["Next.js"],
      componentScores: { requiredSkills: 95, preferredSkills: 88, experience: 92, education: 88, semantic: 92 },
      strengths: ["3 years production React experience", "Redux mastery"],
      concerns: [],
      recommendation: "Offer extended",
    },
  },
  {
    candidateEmail: "priya.sharma@example.com",
    jobTitle: "Junior Full Stack Developer",
    orgSlug: "apex-innovations",
    status: "under_review",
    appliedDaysAgo: 6,
    tags: [],
    history: [
      ["submitted", "candidate", "Application submitted", 6],
      ["under_review", "recruiter", "Evaluating for potential mid-level opening.", 3],
    ],
    notes: [],
  },
  {
    candidateEmail: "vikram.nair@example.com",
    jobTitle: "Backend Engineer (Node.js / Express)",
    orgSlug: "nexus-byte-solutions",
    status: "interview",
    appliedDaysAgo: 16,
    tags: ["fast-track"],
    history: [
      ["submitted", "candidate", "Application submitted", 16],
      ["under_review", "recruiter", "Solid PostgreSQL and Node depth.", 12],
      ["shortlisted", "recruiter", "Shortlisted for technical design round.", 8],
      ["interview", "recruiter", "System Design Round scheduled.", 4],
    ],
    notes: ["Strong high-volume payment processing experience."],
    match: {
      overallScore: 94,
      confidence: 0.95,
      matchedSkills: ["Node.js", "Express", "PostgreSQL", "Redis", "REST APIs", "Docker", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 98, preferredSkills: 92, experience: 94, education: 90, semantic: 94 },
      strengths: ["High-throughput transaction processing", "Clean PostgreSQL schema design"],
      concerns: [],
      recommendation: "Proceed to final interview",
    },
  },
  {
    candidateEmail: "sneha.kulkarni@example.com",
    jobTitle: "DevOps / Cloud Engineer",
    orgSlug: "cloudforge-systems",
    status: "hired",
    appliedDaysAgo: 30,
    tags: ["top-hire"],
    history: [
      ["submitted", "candidate", "Applied for DevOps role", 30],
      ["under_review", "recruiter", "CKA certified with multi-cluster experience.", 26],
      ["shortlisted", "recruiter", "Shortlisted for infrastructure panel.", 20],
      ["interview", "recruiter", "Panel interview completed - unanimous strong_yes.", 14],
      ["offer", "recruiter", "Offer extended at INR 13 LPA.", 8],
      ["hired", "recruiter", "Offer accepted; onboarding completed.", 3],
    ],
    notes: ["Panel consensus: exceptional Kubernetes troubleshooting depth."],
    match: {
      overallScore: 96,
      confidence: 0.97,
      matchedSkills: ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "Prometheus"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 98, preferredSkills: 96, experience: 95, education: 92, semantic: 96 },
      strengths: ["CKA certified", "Extensive Terraform automation", "Calm incident management"],
      concerns: [],
      recommendation: "Hired",
    },
  },
  {
    candidateEmail: "sneha.kulkarni@example.com",
    jobTitle: "Cloud Infrastructure Engineer",
    orgSlug: "apex-innovations",
    status: "submitted",
    appliedDaysAgo: 3,
    tags: [],
    history: [["submitted", "candidate", "Application submitted", 3]],
    notes: [],
  },
  {
    candidateEmail: "arjun.mehta@example.com",
    jobTitle: "Software Engineer Intern (MERN)",
    orgSlug: "apex-innovations",
    status: "shortlisted",
    appliedDaysAgo: 11,
    tags: ["surat-local"],
    history: [
      ["submitted", "candidate", "Application received", 11],
      ["under_review", "recruiter", "Reviewing React e-commerce projects.", 8],
      ["shortlisted", "recruiter", "Shortlisted for internship assessment.", 4],
    ],
    notes: ["Surat resident, good React fundamentals."],
    match: {
      overallScore: 84,
      confidence: 0.88,
      matchedSkills: ["React", "JavaScript", "Tailwind CSS", "HTML/CSS", "REST APIs", "Git"],
      missingRequiredSkills: ["Node.js", "Express", "MongoDB"],
      missingPreferredSkills: ["JWT Auth"],
      componentScores: { requiredSkills: 75, preferredSkills: 88, experience: 85, education: 90, semantic: 84 },
      strengths: ["Strong frontend foundation", "Local candidate"],
      concerns: ["Needs backend training"],
      recommendation: "Shortlist for frontend-focused internship",
    },
  },
  {
    candidateEmail: "arjun.mehta@example.com",
    jobTitle: "Junior MERN Stack Engineer",
    orgSlug: "bytescale-technologies",
    status: "submitted",
    appliedDaysAgo: 4,
    tags: [],
    history: [["submitted", "candidate", "Applied online", 4]],
    notes: [],
  },
  {
    candidateEmail: "ishita.verma@example.com",
    jobTitle: "QA Automation Specialist",
    orgSlug: "bytescale-technologies",
    status: "interview",
    appliedDaysAgo: 14,
    tags: ["qa-specialist"],
    history: [
      ["submitted", "candidate", "Application submitted", 14],
      ["under_review", "recruiter", "Reviewing Playwright test automation framework.", 10],
      ["shortlisted", "recruiter", "Shortlisted for QA coding round.", 6],
      ["interview", "recruiter", "QA technical round scheduled.", 2],
    ],
    notes: ["Strong test framework design and CI pipeline integration experience."],
    match: {
      overallScore: 93,
      confidence: 0.94,
      matchedSkills: ["Playwright", "JavaScript", "API Testing", "Jest", "Cypress", "Postman", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 96, preferredSkills: 92, experience: 92, education: 90, semantic: 93 },
      strengths: ["Playwright automation framework expert", "API test coverage"],
      concerns: [],
      recommendation: "Proceed with technical interview",
    },
  },
  {
    candidateEmail: "ishita.verma@example.com",
    jobTitle: "Software Engineer Intern (MERN)",
    orgSlug: "apex-innovations",
    status: "rejected",
    appliedDaysAgo: 13,
    tags: [],
    history: [
      ["submitted", "candidate", "Applied online", 13],
      ["under_review", "recruiter", "Profile screened.", 10],
      ["rejected", "recruiter", "Profile aligned towards QA automation rather than full stack development.", 6],
    ],
    notes: ["Recommended for QA roles instead."],
  },
  {
    candidateEmail: "karan.patel@example.com",
    jobTitle: "Junior Full Stack Developer",
    orgSlug: "apex-innovations",
    status: "submitted",
    appliedDaysAgo: 5,
    tags: [],
    history: [["submitted", "candidate", "Application submitted", 5]],
    notes: [],
  },
  {
    candidateEmail: "karan.patel@example.com",
    jobTitle: "Junior MERN Stack Engineer",
    orgSlug: "bytescale-technologies",
    status: "shortlisted",
    appliedDaysAgo: 12,
    tags: ["experienced-fullstack"],
    history: [
      ["submitted", "candidate", "Applied for MERN role", 12],
      ["under_review", "recruiter", "Reviewing 4 years MERN & AWS experience.", 8],
      ["shortlisted", "recruiter", "Shortlisted for technical screening.", 4],
    ],
    notes: ["Very experienced with microservices and AWS."],
  },
  {
    candidateEmail: "ananya.iyer@example.com",
    jobTitle: "React Frontend Developer",
    orgSlug: "apex-innovations",
    status: "interview",
    appliedDaysAgo: 15,
    tags: ["senior-talent"],
    history: [
      ["submitted", "candidate", "Application submitted", 15],
      ["under_review", "recruiter", "Reviewing 5 years frontend architecture experience.", 11],
      ["shortlisted", "recruiter", "Shortlisted for lead frontend discussion.", 7],
      ["interview", "recruiter", "Architectural round scheduled.", 3],
    ],
    notes: ["Exceptional design systems and performance optimization background."],
  },
  {
    candidateEmail: "ananya.iyer@example.com",
    jobTitle: "Frontend Engineer (React & TypeScript)",
    orgSlug: "cloudforge-systems",
    status: "hired",
    appliedDaysAgo: 28,
    tags: ["lead-hire"],
    history: [
      ["submitted", "candidate", "Applied online", 28],
      ["under_review", "recruiter", "Screened portfolio and open-source tokens.", 24],
      ["shortlisted", "recruiter", "Shortlisted for panel interview.", 18],
      ["interview", "recruiter", "System design panel completed with strong_yes.", 12],
      ["offer", "recruiter", "Offer extended at INR 10 LPA.", 7],
      ["hired", "recruiter", "Offer accepted.", 2],
    ],
    notes: ["Hired as Lead Frontend Engineer."],
  },
];

/* ------------------------------------------------------------------ *
 * Main Seeder Logic (Safe, Idempotent, Non-Destructive)
 * ------------------------------------------------------------------ */
const seedPresentationData = async () => {
  validateEnvironment();
  await connectDB();

  console.log("");
  console.log("================================================================================");
  console.log("     HIRESMART-AI: PRESENTATION DEMO DATASET SEEDER (IDEMPOTENT & SAFE)         ");
  console.log("================================================================================");

  try {
    // 1. Check & Protect Platform Admin
    const adminCount = await User.countDocuments({ role: "admin" });
    const existingAdmin = await User.findOne({ role: "admin" }).select("+password");
    if (existingAdmin) {
      console.log(`[ADMIN] Preserved existing platform admin account: ${existingAdmin.email} (${existingAdmin.name})`);
    } else {
      console.log(`[ADMIN] No admin account currently found. You can run 'npm run bootstrap:admin' if needed.`);
    }

    // 2. Organizations
    console.log("\n[1/7] Seeding Organizations...");
    const orgMap = {};
    for (const orgSpec of ORGANIZATIONS) {
      let org = await Organization.findOne({ slug: orgSpec.slug });
      if (!org) {
        org = await Organization.create(orgSpec);
        console.log(`  + Created Organization: ${org.name} (${org.slug})`);
      } else {
        Object.assign(org, orgSpec);
        await org.save();
        console.log(`  ✓ Synced Organization: ${org.name} (${org.slug})`);
      }
      orgMap[orgSpec.slug] = org;
    }

    // 3. Recruiters & Memberships
    console.log("\n[2/7] Seeding Recruiter Profiles & Company Memberships...");
    const recruiterMap = {};
    for (const rec of RECRUITERS) {
      let user = await User.findOne({ email: rec.email });
      const org = orgMap[rec.orgSlug];
      const passwordHash = await bcrypt.hash(rec.password, 10);

      if (!user) {
        user = await User.create({
          name: rec.name,
          email: rec.email,
          password: passwordHash,
          role: "recruiter",
          accountStatus: "active",
          emailVerified: true,
          headline: rec.headline,
          location: rec.location,
          phone: rec.phone,
          companyName: org ? org.name : "",
          timezone: "Asia/Kolkata",
          onboardingCompleted: true,
        });
        console.log(`  + Created Recruiter: ${user.name} <${user.email}>`);
      } else {
        user.name = rec.name;
        user.role = "recruiter";
        user.accountStatus = "active";
        user.emailVerified = true;
        user.headline = rec.headline;
        user.location = rec.location;
        user.phone = rec.phone;
        user.companyName = org ? org.name : user.companyName;
        user.password = passwordHash;
        user.onboardingCompleted = true;
        await user.save();
        console.log(`  ✓ Updated Recruiter: ${user.name} <${user.email}>`);
      }

      recruiterMap[rec.email] = user;

      if (org) {
        let membership = await Membership.findOne({ organization: org._id, user: user._id });
        if (!membership) {
          membership = await Membership.create({
            organization: org._id,
            user: user._id,
            role: rec.membershipRole,
            status: "active",
          });
        } else if (membership.role !== rec.membershipRole) {
          membership.role = rec.membershipRole;
          membership.status = "active";
          await membership.save();
        }
      }
    }

    // 4. Job Postings
    console.log("\n[3/7] Seeding Job Postings...");
    const jobMap = {};
    for (const jobSpec of JOBS) {
      const org = orgMap[jobSpec.orgSlug];
      const recruiter = recruiterMap[jobSpec.recruiterEmail];
      if (!org || !recruiter) continue;

      let job = await Job.findOne({ organization: org._id, title: jobSpec.title });
      const jobData = {
        organization: org._id,
        recruiter: recruiter._id,
        title: jobSpec.title,
        company: org.name,
        location: jobSpec.location,
        salary: jobSpec.salary,
        compensation: jobSpec.compensation,
        experience: jobSpec.experience,
        minExpYears: jobSpec.minExpYears || 0,
        maxExpYears: jobSpec.maxExpYears || 0,
        jobType: jobSpec.jobType,
        workplaceMode: jobSpec.workplaceMode,
        status: jobSpec.status,
        publishedAt: jobSpec.status === "published" ? daysAgo(jobSpec.publishedDaysAgo || 10) : null,
        requiredSkills: jobSpec.requiredSkills,
        preferredSkills: jobSpec.preferredSkills,
        skills: jobSpec.skills,
        description: jobSpec.description,
        moderation: jobSpec.moderation || { status: "none", reason: "" },
        source: "direct",
        version: 1,
      };

      if (!job) {
        job = await Job.create(jobData);
        console.log(`  + Created Job: "${job.title}" [${job.status}] at ${org.name}`);
      } else {
        Object.assign(job, jobData);
        await job.save();
        console.log(`  ✓ Synced Job: "${job.title}" [${job.status}] at ${org.name}`);
      }

      jobMap[`${jobSpec.orgSlug}|${jobSpec.title}`] = job;
    }

    // 5. Candidates & Profiles
    console.log("\n[4/7] Seeding Candidate Accounts, Resumes & Profile Details...");
    const candidateMap = {};
    for (const cand of CANDIDATES) {
      let user = await User.findOne({ email: cand.email });
      const passwordHash = await bcrypt.hash(cand.password, 10);

      const userData = {
        name: cand.name,
        email: cand.email,
        password: passwordHash,
        role: "candidate",
        accountStatus: "active",
        emailVerified: true,
        headline: cand.headline,
        location: cand.location,
        phone: cand.phone,
        bio: cand.bio,
        skills: cand.skills,
        socialLinks: cand.socialLinks || {},
        timezone: "Asia/Kolkata",
        onboardingCompleted: true,
      };

      if (!user) {
        user = await User.create(userData);
        console.log(`  + Created Candidate: ${user.name} <${user.email}>`);
      } else {
        Object.assign(user, userData);
        await user.save();
        console.log(`  ✓ Synced Candidate: ${user.name} <${user.email}>`);
      }

      candidateMap[cand.email] = user;

      // Consents
      for (const purpose of ["terms", "privacy", "ai_processing"]) {
        if (!(await Consent.exists({ user: user._id, purpose, revokedAt: null }))) {
          await Consent.create({
            user: user._id,
            purpose,
            policyVersion: "2026-08",
            source: "registration",
          });
        }
      }

      // Candidate Profile
      let profile = await CandidateProfile.findOne({ user: user._id });
      const profileData = {
        user: user._id,
        gender: cand.gender || "Other",
        city: cand.city,
        state: cand.state,
        country: cand.country,
        languages: cand.languages || ["English", "Hindi"],
        socialLinks: cand.socialLinks || {},
        education: cand.education || [],
        experience: cand.experience || [],
        projects: cand.projects || [],
        certifications: cand.certifications || [],
      };

      if (!profile) {
        profile = await CandidateProfile.create(profileData);
      } else {
        Object.assign(profile, profileData);
        await profile.save();
      }

      // Candidate PDF Resume Processing (Upload & Parse Inline)
      let version = await ResumeVersion.findOne({
        candidate: user._id,
        processingStatus: "ready",
      }).select("+storageKey +text");

      if (!version) {
        const buffer = buildPdf(cand.resumeLines);
        const file = {
          originalname: `${cand.name.replace(/ /g, "_")}_Resume.pdf`,
          mimetype: "application/pdf",
          buffer,
          size: buffer.length,
        };

        const created = await createVersion({ user, file });
        await processVersion(created.version._id);
        version = await ResumeVersion.findById(created.version._id).select("+storageKey +text");
        console.log(`    -> Processed & Ready Resume PDF: ${file.originalname}`);
      }

      candidateMap[cand.email]._version = version;
    }

    // 6. Saved Jobs & Job Alerts
    console.log("\n[5/7] Seeding Candidate Saved Jobs & Alerts...");
    const anas = candidateMap["tanastai5018@gmail.com"];
    if (anas) {
      const savedJobTitles = [
        "apex-innovations|Junior Full Stack Developer",
        "cloudforge-systems|Frontend Engineer (React & TypeScript)",
      ];
      const savedJobIds = savedJobTitles.map((key) => jobMap[key]?._id).filter(Boolean);
      await User.updateOne({ _id: anas._id }, { $set: { savedJobs: savedJobIds } });

      // Create Job Alert for Anas
      if (!(await JobAlert.findOne({ user: anas._id }))) {
        await JobAlert.create({
          user: anas._id,
          name: "MERN & Full Stack Developer Alerts",
          query: "MERN React Node",
          location: "Surat, Gujarat",
          workplaceMode: "hybrid",
          minSalary: 400000,
          skills: ["React", "Node.js", "MongoDB", "Express"],
          cadence: "daily",
          active: true,
          lastRunAt: daysAgo(1),
        });
      }
    }

    // 7. Applications, Matches, Notes & Status Histories
    console.log("\n[6/7] Seeding Applications Pipeline & Hybrid Match Scores...");
    const applicationMap = {};
    for (const appSpec of APPLICATIONS_CONFIG) {
      const cand = candidateMap[appSpec.candidateEmail];
      const org = orgMap[appSpec.orgSlug];
      const job = jobMap[`${appSpec.orgSlug}|${appSpec.jobTitle}`];
      if (!cand || !org || !job) continue;

      let app = await Application.findOne({ job: job._id, candidate: cand._id });
      const version = cand._version;

      const appData = {
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
        status: appSpec.status,
        appliedAt: daysAgo(appSpec.appliedDaysAgo),
        resumeSnapshot: {
          storageKey: version ? version.storageKey : "default-key",
          provider: version ? version.storageProvider : "local",
          originalName: version ? version.originalName : `${cand.name}_Resume.pdf`,
          mimeType: version ? version.mimeType : "application/pdf",
          size: version ? version.size : 1024,
          text: version ? (version.text || "") : "",
        },
        resumeVersion: version ? version._id : null,
        source: "direct",
        tags: appSpec.tags || [],
        statusHistory: (appSpec.history || []).map((h) => {
          const changedBy = h[1] === "candidate" ? cand._id : (recruiterMap["2025mca150@gmail.com"]?._id || cand._id);
          return {
            status: h[0],
            changedAt: daysAgo(appSpec.appliedDaysAgo - (h[3] || 0)),
            changedBy,
            note: h[2] || "",
          };
        }),
      };

      if (!app) {
        app = await Application.create(appData);
        console.log(`  + Application: ${cand.name} -> "${job.title}" [${app.status}]`);
      } else {
        Object.assign(app, appData);
        await app.save();
        console.log(`  ✓ Synced Application: ${cand.name} -> "${job.title}" [${app.status}]`);
      }

      applicationMap[`${cand.email}|${job._id}`] = app;

      // Seed Notes
      for (const noteText of appSpec.notes || []) {
        let note = await Note.findOne({ organization: org._id, targetType: "application", targetId: app._id, body: noteText });
        if (!note) {
          await Note.create({
            organization: org._id,
            targetType: "application",
            targetId: app._id,
            author: recruiterMap["2025mca150@gmail.com"]?._id || cand._id,
            body: noteText,
            visibility: "hiring_team",
            tags: ["review", "presentation"],
          });
        }
      }

      // Seed Candidate Match Score
      if (appSpec.match) {
        await CandidateMatch.findOneAndUpdate(
          { application: app._id },
          {
            organization: org._id,
            application: app._id,
            candidate: cand._id,
            job: job._id,
            jobVersion: job.version,
            resumeVersion: version ? version._id : null,
            scorePolicyVersion: "hybrid-v1",
            overallScore: appSpec.match.overallScore,
            confidence: appSpec.match.confidence,
            componentScores: appSpec.match.componentScores,
            matchedSkills: appSpec.match.matchedSkills,
            missingRequiredSkills: appSpec.match.missingRequiredSkills || [],
            missingPreferredSkills: appSpec.match.missingPreferredSkills || [],
            strengths: appSpec.match.strengths || [],
            concerns: appSpec.match.concerns || [],
            recommendation: appSpec.match.recommendation || "Recommended",
            status: "completed",
          },
          { upsert: true, returnDocument: "after" },
        );
      }
    }

    // 8. Interviews & Evaluator Feedback
    console.log("\n[7/7] Seeding Interviews & Meeting Schedules...");
    const primaryRecruiter = recruiterMap["2025mca150@gmail.com"];
    const apexOrg = orgMap["apex-innovations"];

    const INTERVIEWS_CONFIG = [
      // 1. Anas Tai - Confirmed Upcoming Technical Round with Apex Innovations
      {
        candidateEmail: "tanastai5018@gmail.com",
        jobTitle: "Software Engineer Intern (MERN)",
        orgSlug: "apex-innovations",
        title: "Technical Round - Full Stack & MERN Architecture",
        type: "technical",
        status: "confirmed",
        scheduledStart: inDays(2, 14, 0),
        scheduledEnd: inDays(2, 15, 0),
        timezone: "Asia/Kolkata",
        meetingUrl: "https://meet.google.com/hsm-anas-tech",
        location: "Google Meet (Online)",
        participants: [primaryRecruiter?._id, recruiterMap["deepak.shah@apexinnovations.in"]?._id].filter(Boolean),
        createdBy: primaryRecruiter?._id,
        candidateConfirmedAt: daysAgo(1),
        feedback: [],
      },
      // 2. Vikram Nair - Confirmed Upcoming Technical Round with Nexus Byte Solutions
      {
        candidateEmail: "vikram.nair@example.com",
        jobTitle: "Backend Engineer (Node.js / Express)",
        orgSlug: "nexus-byte-solutions",
        title: "System Design & Distributed Data Round",
        type: "technical",
        status: "confirmed",
        scheduledStart: inDays(3, 15, 30),
        scheduledEnd: inDays(3, 16, 30),
        timezone: "Asia/Kolkata",
        meetingUrl: "https://meet.google.com/nxb-vikram-tech",
        location: "Google Meet",
        participants: [recruiterMap["rohit.sharma@nexusbyte.com"]?._id].filter(Boolean),
        createdBy: recruiterMap["rohit.sharma@nexusbyte.com"]?._id,
        candidateConfirmedAt: daysAgo(2),
        feedback: [],
      },
      // 3. Ishita Verma - Invited Technical Round with ByteScale Technologies
      {
        candidateEmail: "ishita.verma@example.com",
        jobTitle: "QA Automation Specialist",
        orgSlug: "bytescale-technologies",
        title: "Playwright Automation & API Testing Deep Dive",
        type: "technical",
        status: "invited",
        scheduledStart: inDays(4, 11, 0),
        scheduledEnd: inDays(4, 12, 0),
        timezone: "Asia/Kolkata",
        meetingUrl: "https://meet.google.com/bts-ishita-qa",
        location: "Google Meet",
        participants: [recruiterMap["amit.verma@bytescale.tech"]?._id].filter(Boolean),
        createdBy: recruiterMap["amit.verma@bytescale.tech"]?._id,
        candidateConfirmedAt: null,
        feedback: [],
      },
      // 4. Sneha Kulkarni - Completed DevOps Panel Interview with CloudForge Systems
      {
        candidateEmail: "sneha.kulkarni@example.com",
        jobTitle: "DevOps / Cloud Engineer",
        orgSlug: "cloudforge-systems",
        title: "Kubernetes & Cloud Infrastructure Panel",
        type: "panel",
        status: "completed",
        scheduledStart: daysAgo(8),
        scheduledEnd: daysAgo(8),
        timezone: "Asia/Kolkata",
        meetingUrl: "https://meet.google.com/cfs-sneha-devops",
        location: "Google Meet",
        participants: [recruiterMap["neha.patel@cloudforge.io"]?._id].filter(Boolean),
        createdBy: recruiterMap["neha.patel@cloudforge.io"]?._id,
        candidateConfirmedAt: daysAgo(9),
        feedback: [
          {
            evaluator: recruiterMap["neha.patel@cloudforge.io"]?._id,
            recommendation: "strong_yes",
            summary: "Excellent multi-cluster Kubernetes and Terraform module design. Solved incident troubleshooting scenario flawlessly.",
            ratings: [
              { criterion: "Kubernetes & Containers", score: 5, evidence: "Runs multi-node EKS with ArgoCD GitOps" },
              { criterion: "Terraform & IaC", score: 5, evidence: "Demonstrated modular Terraform code" },
              { criterion: "Monitoring & Observability", score: 4, evidence: "Prometheus alerts and Grafana dashboards" },
              { criterion: "Communication", score: 5, evidence: "Crisp and structured explanations" },
            ],
            submittedAt: daysAgo(8),
          },
        ],
      },
      // 5. Ananya Iyer - Completed Frontend System Design with CloudForge Systems
      {
        candidateEmail: "ananya.iyer@example.com",
        jobTitle: "Frontend Engineer (React & TypeScript)",
        orgSlug: "cloudforge-systems",
        title: "Frontend Architecture & Design Systems Discussion",
        type: "technical",
        status: "completed",
        scheduledStart: daysAgo(12),
        scheduledEnd: daysAgo(12),
        timezone: "Asia/Kolkata",
        meetingUrl: "https://meet.google.com/cfs-ananya-frontend",
        location: "Google Meet",
        participants: [recruiterMap["neha.patel@cloudforge.io"]?._id].filter(Boolean),
        createdBy: recruiterMap["neha.patel@cloudforge.io"]?._id,
        candidateConfirmedAt: daysAgo(13),
        feedback: [
          {
            evaluator: recruiterMap["neha.patel@cloudforge.io"]?._id,
            recommendation: "strong_yes",
            summary: "Outstanding frontend architect. Deep mastery of React internals, TypeScript typing, and accessibility.",
            ratings: [
              { criterion: "React & Architecture", score: 5, evidence: "Reduced bundle sizes by 40% in prior roles" },
              { criterion: "TypeScript", score: 5, evidence: "Strict typing and generics mastery" },
              { criterion: "Performance Optimization", score: 5, evidence: "Lighthouse 95+ score track record" },
            ],
            submittedAt: daysAgo(12),
          },
        ],
      },
    ];

    for (const item of INTERVIEWS_CONFIG) {
      const cand = candidateMap[item.candidateEmail];
      const org = orgMap[item.orgSlug];
      const job = jobMap[`${item.orgSlug}|${item.jobTitle}`];
      if (!cand || !org || !job) continue;

      const app = applicationMap[`${cand.email}|${job._id}`];
      if (!app) continue;

      let interview = await Interview.findOne({ application: app._id, title: item.title });
      const interviewData = {
        organization: org._id,
        application: app._id,
        createdBy: item.createdBy || cand._id,
        title: item.title,
        type: item.type,
        status: item.status,
        scheduledStart: item.scheduledStart,
        scheduledEnd: item.scheduledEnd,
        timezone: item.timezone || "Asia/Kolkata",
        meetingUrl: item.meetingUrl,
        location: item.location || "Google Meet",
        participants: item.participants,
        candidateConfirmedAt: item.candidateConfirmedAt,
        feedback: item.feedback || [],
      };

      if (!interview) {
        interview = await Interview.create(interviewData);
        console.log(`  + Created Interview: "${interview.title}" [${interview.status}] for ${cand.name}`);
      } else {
        Object.assign(interview, interviewData);
        await interview.save();
        console.log(`  ✓ Synced Interview: "${interview.title}" [${interview.status}] for ${cand.name}`);
      }
    }

    // 9. Notifications (Candidates, Recruiters, Admin)
    console.log("\n[Notifications] Seeding In-App Notifications...");
    const NOTIFICATIONS_CONFIG = [
      // Anas Tai Notifications
      {
        user: anas._id,
        organization: apexOrg?._id,
        type: "application_acknowledged",
        category: "applications",
        recipientRole: "candidate",
        title: "Application Received: Software Engineer Intern (MERN)",
        message: "Your application for Software Engineer Intern (MERN) at Apex Innovations has been received and is being reviewed.",
        readAt: daysAgo(10),
      },
      {
        user: anas._id,
        organization: apexOrg?._id,
        type: "application_status_changed",
        category: "applications",
        recipientRole: "candidate",
        title: "Application Shortlisted: React Frontend Developer",
        message: "Great news! Apex Innovations has shortlisted your application for React Frontend Developer.",
        readAt: daysAgo(4),
      },
      {
        user: anas._id,
        organization: apexOrg?._id,
        type: "interview_invitation",
        category: "interviews",
        recipientRole: "candidate",
        title: "Interview Invitation: Technical Round with Apex Innovations",
        message: "You have been invited to a Technical Round on Google Meet for Software Engineer Intern (MERN).",
        readAt: daysAgo(1),
      },
      {
        user: anas._id,
        organization: orgMap["bytescale-technologies"]?._id,
        type: "application_status_changed",
        category: "applications",
        recipientRole: "candidate",
        title: "Offer Extended: Junior MERN Stack Engineer",
        message: "Congratulations! ByteScale Technologies has extended an official offer for the Junior MERN Stack Engineer role.",
        readAt: null, // Unread notification for live demo
      },
      {
        user: anas._id,
        organization: apexOrg?._id,
        type: "resume_processed",
        category: "ai_career",
        recipientRole: "candidate",
        title: "AI Resume Analysis Complete (94% Fit Score)",
        message: "HireSmart AI completed your resume parsing and match indexing with exceptional scores for Full Stack roles.",
        readAt: daysAgo(5),
      },

      // Primary Recruiter Notifications
      {
        user: primaryRecruiter._id,
        organization: apexOrg?._id,
        type: "new_application",
        category: "candidates",
        recipientRole: "recruiter",
        title: "New Application: Anas Tai applied for Software Engineer Intern",
        message: "Anas Tai (MCA Student at SRIMCA) submitted an application with a 94% AI hybrid match score.",
        readAt: daysAgo(12),
      },
      {
        user: primaryRecruiter._id,
        organization: apexOrg?._id,
        type: "interview_confirmed",
        category: "interviews",
        recipientRole: "recruiter",
        title: "Interview Confirmed: Anas Tai for Technical Round",
        message: "Anas Tai confirmed attendance for the Technical Round on Google Meet.",
        readAt: null, // Unread notification for live demo
      },
      {
        user: primaryRecruiter._id,
        organization: apexOrg?._id,
        type: "new_application",
        category: "candidates",
        recipientRole: "recruiter",
        title: "New Application: Priya Sharma applied for React Frontend Developer",
        message: "Priya Sharma submitted an application with a 92% AI hybrid match score.",
        readAt: daysAgo(15),
      },
    ];

    for (const notif of NOTIFICATIONS_CONFIG) {
      const exists = await Notification.findOne({ user: notif.user, title: notif.title });
      if (!exists) {
        await Notification.create(notif);
      }
    }

    // 10. AI Analysis Records (For Admin AI Usage Dashboard)
    console.log("\n[AI Activity] Seeding AI Analysis telemetry records...");
    const AI_RECORDS = [
      {
        organization: apexOrg?._id,
        user: anas._id,
        feature: "resume_extraction",
        subjectType: "resume_version",
        subjectId: String(anas._version?._id || anas._id),
        provider: "deterministic",
        model: "text-embedding-3-small",
        promptVersion: "1.0",
        output: { skills: anas.skills, experienceYears: 1, confidence: 0.94 },
        confidence: 0.94,
        fallbackUsed: false,
        usage: { inputTokens: 520, outputTokens: 210, estimatedCostUsd: 0.0004, latencyMs: 240 },
        status: "completed",
      },
      {
        organization: apexOrg?._id,
        user: anas._id,
        feature: "resume_improvement",
        subjectType: "resume_version",
        subjectId: String(anas._version?._id || anas._id),
        provider: "deterministic",
        model: "gpt-4o-mini",
        promptVersion: "1.0",
        output: { suggestions: ["Quantify impact in HomeServeX project", "Highlight JWT Auth security implementation"] },
        confidence: 0.90,
        fallbackUsed: false,
        usage: { inputTokens: 780, outputTokens: 340, estimatedCostUsd: 0.0008, latencyMs: 380 },
        status: "completed",
      },
      {
        organization: apexOrg?._id,
        user: primaryRecruiter._id,
        feature: "jd_generation",
        subjectType: "job",
        subjectId: String(jobMap["apex-innovations|Software Engineer Intern (MERN)"]?._id || ""),
        provider: "deterministic",
        model: "gpt-4o-mini",
        promptVersion: "1.0",
        output: { title: "Software Engineer Intern (MERN)", confidence: 0.95 },
        confidence: 0.95,
        fallbackUsed: false,
        usage: { inputTokens: 450, outputTokens: 280, estimatedCostUsd: 0.0005, latencyMs: 310 },
        status: "completed",
      },
      {
        organization: apexOrg?._id,
        user: primaryRecruiter._id,
        feature: "interview_preparation",
        subjectType: "interview",
        subjectId: "interview-prep-demo",
        provider: "deterministic",
        model: "gpt-4o-mini",
        promptVersion: "1.0",
        output: { questions: ["Explain MERN data flow", "How do you handle JWT token invalidation in Express?"] },
        confidence: 0.92,
        fallbackUsed: false,
        usage: { inputTokens: 620, outputTokens: 310, estimatedCostUsd: 0.0007, latencyMs: 290 },
        status: "completed",
      },
    ];

    for (const record of AI_RECORDS) {
      if (!(await AIAnalysis.findOne({ user: record.user, feature: record.feature, subjectId: record.subjectId }))) {
        await AIAnalysis.create(record);
      }
    }

    // 11. Security Events & Audit Logs (For Admin Console)
    console.log("\n[Security & Audit] Seeding Audit Logs and Security Events...");
    const AUDIT_LOGS = [
      {
        organization: apexOrg?._id,
        actor: primaryRecruiter._id,
        action: "job.create",
        resourceType: "job",
        resourceId: String(jobMap["apex-innovations|Software Engineer Intern (MERN)"]?._id || ""),
        outcome: "success",
        metadata: { title: "Software Engineer Intern (MERN)", location: "Surat, Gujarat" },
      },
      {
        organization: apexOrg?._id,
        actor: primaryRecruiter._id,
        action: "application.status_update",
        resourceType: "application",
        resourceId: String(applicationMap[`tanastai5018@gmail.com|${jobMap["apex-innovations|Software Engineer Intern (MERN)"]?._id}`]?._id || ""),
        outcome: "success",
        metadata: { from: "under_review", to: "interview", candidate: "Anas Tai" },
      },
      {
        organization: apexOrg?._id,
        actor: anas._id,
        action: "auth.login",
        resourceType: "user",
        resourceId: String(anas._id),
        outcome: "success",
        metadata: { email: anas.email, client: "HireSmart-AI Web" },
      },
    ];

    for (const log of AUDIT_LOGS) {
      if (!(await AuditLog.findOne({ actor: log.actor, action: log.action, resourceId: log.resourceId }))) {
        await AuditLog.create(log);
      }
    }

    const SECURITY_EVENTS = [
      {
        user: anas._id,
        organization: apexOrg?._id,
        type: "sign_in_success",
        severity: "info",
        details: { ip: "127.0.0.1", userAgent: "Mozilla/5.0 (HireSmart Demo Client)" },
      },
      {
        user: primaryRecruiter._id,
        organization: apexOrg?._id,
        type: "sign_in_success",
        severity: "info",
        details: { ip: "127.0.0.1", userAgent: "Mozilla/5.0 (HireSmart Demo Recruiter)" },
      },
    ];

    for (const ev of SECURITY_EVENTS) {
      if (!(await SecurityEvent.findOne({ user: ev.user, type: ev.type }))) {
        await SecurityEvent.create(ev);
      }
    }

    console.log("\n================================================================================");
    console.log("             PRESENTATION DEMO DATASET SEED COMPLETE & READY                   ");
    console.log("================================================================================");
    console.log("");
    console.log("PRIMARY DEMO ACCOUNTS:");
    console.log("--------------------------------------------------------------------------------");
    console.log(`[CANDIDATE] Anas Tai (MCA Student @ SRIMCA, Surat, Gujarat)`);
    console.log(`            Email   : tanastai5018@gmail.com`);
    console.log(`            Password: ${DEMO_PASSWORD}`);
    console.log(`            Features: 100% Profile, Processed PDF Resume, 6 Applications,`);
    console.log(`                      Scheduled Technical Interview, In-App Notifications, Saved Jobs`);
    console.log("");
    console.log(`[RECRUITER]  Demo Recruiter (Talent Lead @ Apex Innovations, Surat)`);
    console.log(`            Email   : 2025mca150@gmail.com`);
    console.log(`            Password: ${DEMO_PASSWORD}`);
    console.log(`            Features: 5 Job Postings, Review Applications, Interview Management,`);
    console.log(`                      Team Members, In-App Notifications`);
    console.log("");
    if (existingAdmin) {
      console.log(`[ADMIN]      ${existingAdmin.name} (Platform Admin Console)`);
      console.log(`            Email   : ${existingAdmin.email}`);
      console.log(`            Password: (Existing password preserved)`);
      console.log(`            Features: User & Org Moderation, AI Usage Telemetry, Security Logs`);
    }
    console.log("--------------------------------------------------------------------------------");
    console.log("");
    console.log("ADDITIONAL CANDIDATE LOGINS (All passwords: " + DEMO_PASSWORD + "):");
    for (const c of CANDIDATES.filter((x) => x.email !== "tanastai5018@gmail.com")) {
      console.log(`  - ${c.name.padEnd(16)} : ${c.email} (${c.headline})`);
    }
    console.log("");
    console.log("ADDITIONAL RECRUITER LOGINS (All passwords: " + DEMO_PASSWORD + "):");
    for (const r of RECRUITERS.filter((x) => x.email !== "2025mca150@gmail.com")) {
      console.log(`  - ${r.name.padEnd(16)} : ${r.email} [${r.orgSlug}]`);
    }
    console.log("================================================================================");
  } finally {
    await disconnectDB();
  }
};

if (require.main === module) {
  seedPresentationData().catch((err) => {
    console.error("\n❌ Seed execution failed:", err.message);
    process.exitCode = 1;
  });
}

module.exports = { seedPresentationData };
