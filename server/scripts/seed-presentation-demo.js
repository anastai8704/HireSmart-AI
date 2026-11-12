/**
 * Presentation-Ready Demo Dataset & Idempotent Seeder for HireSmart-AI
 * 
 * Specially tailored for MCA Semester 3 Project Demonstration:
 *   - Primary Candidate: Anas Tai (tanastai5018@gmail.com / password from DEMO_PASSWORD)
 *       MCA Student @ SRIMCA, Surat, Gujarat (Fresher / MERN Stack)
 *       Projects: HireSmart-AI, HomeServeX, Travel Planner
 *       Ready PDF resume, 6 connected applications, scheduled interview, notifications
 *       Career Plus active subscription & confirmed placement record
 *   - Primary Recruiter: 2025mca150@gmail.com / password from DEMO_PASSWORD
 *       Talent Lead @ Apex Innovations (Surat/Ahmedabad)
 *       5 Job postings, applications to review, interview scheduled, notifications
 *       Growth Plan active subscription & verified company status
 *   - Admin: Preserves existing platform admin account without overwriting or deletion
 *   - Ecosystem: 8 candidates, 7 companies (including pending & rejected for moderation queue),
 *       12 realistic jobs, 22 applications, 5 interviews, subscriptions, payment transactions,
 *       placement lifecycle records, AI analysis logs, security events, audit logs, and notifications.
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

// This script creates demo accounts protected by one password supplied via DEMO_PASSWORD (min 12 chars).
// Passwords are bcrypt-hashed before storage and are never printed. It must never run against production.
if (String(process.env.NODE_ENV).trim().toLowerCase() === "production") {
  throw new Error("seed-presentation-demo refuses to run when NODE_ENV=production");
}

const bcrypt = require("bcryptjs");
const { connectDB, disconnectDB } = require("../config/db");
const { validateEnvironment } = require("../config/env");

const User = require("../models/User");
const Organization = require("../models/Organization");
const { Membership } = require("../models/Membership");
const Job = require("../models/Job");
const CandidateProfile = require("../models/CandidateProfile");
const { ResumeVersion } = require("../models/Resume");
const { Application } = require("../models/Application");
const Interview = require("../models/Interview");
const { CandidateMatch } = require("../models/Recruitment");
const Consent = require("../models/Consent");
const Placement = require("../models/Placement");
const Subscription = require("../models/Subscription");
const { CANDIDATE_PLANS, RECRUITER_PLANS } = require("../config/subscriptionPlans");
const SUBSCRIPTION_PLANS = { candidate: CANDIDATE_PLANS, recruiter: RECRUITER_PLANS };
const { createVersion, processVersion } = require("../services/resumeProcessingService");

const DEMO_PASSWORD = String(process.env.DEMO_PASSWORD || "");
if (DEMO_PASSWORD.length < 12) {
  throw new Error("Set DEMO_PASSWORD (at least 12 characters) in server/.env before seeding demo accounts");
}

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
    verificationStatus: "verified",
    verifiedAt: daysAgo(30),
    gstin: "24AAACA1234A1Z5",
    registrationNumber: "U72200GJ2020PTC012345",
    businessEmail: "careers@apexinnovations.io",
    phone: "+91 98980 12345",
    address: {
      street: "Plot 42, Silicon IT Park, Piplod",
      city: "Surat",
      state: "Gujarat",
      country: "India",
      pincode: "395007",
    },
    riskScore: 5,
    riskFlags: [],
    documents: [
      {
        type: "incorporation_certificate",
        fileUrl: "/demo/certs/apex-cin.pdf",
        fileName: "Apex_Certificate_of_Incorporation.pdf",
        uploadedAt: daysAgo(30),
      },
      {
        type: "gstin_certificate",
        fileUrl: "/demo/certs/apex-gst.pdf",
        fileName: "Apex_GST_Registration.pdf",
        uploadedAt: daysAgo(30),
      },
    ],
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
    verificationStatus: "verified",
    verifiedAt: daysAgo(25),
    gstin: "29AABCN4321D1Z8",
    registrationNumber: "U72200KA2019PTC098765",
    businessEmail: "talent@nexusbyte.io",
    phone: "+91 98450 66778",
    address: {
      street: "Tower B, Manyata Tech Park, Outer Ring Road",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      pincode: "560045",
    },
    riskScore: 8,
    riskFlags: [],
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
    verificationStatus: "verified",
    verifiedAt: daysAgo(20),
    gstin: "27AABCC8765E1Z1",
    registrationNumber: "U72200MH2021PTC112233",
    businessEmail: "recruiting@cloudforge.io",
    phone: "+91 98600 77889",
    address: {
      street: "Senapati Bapat Road, Shivajinagar",
      city: "Pune",
      state: "Maharashtra",
      country: "India",
      pincode: "411016",
    },
    riskScore: 12,
    riskFlags: [],
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
    verificationStatus: "verified",
    verifiedAt: daysAgo(15),
    gstin: "27AABCB9988F1Z3",
    registrationNumber: "U72200MH2018PTC445566",
    businessEmail: "careers@bytescale.tech",
    phone: "+91 98190 88990",
    address: {
      street: "Bandra Kurla Complex (BKC)",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      pincode: "400051",
    },
    riskScore: 6,
    riskFlags: [],
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
    verificationStatus: "verified",
    verifiedAt: daysAgo(10),
    gstin: "36AABCZ1122G1Z9",
    registrationNumber: "U72200TS2017PTC778899",
    businessEmail: "university@zenithlabs.in",
    phone: "+91 99080 99001",
    address: {
      street: "HITEC City, Madhapur",
      city: "Hyderabad",
      state: "Telangana",
      country: "India",
      pincode: "500081",
    },
    riskScore: 4,
    riskFlags: [],
  },
  {
    name: "CryptoPay Global Network",
    slug: "cryptopay-global",
    industry: "Crypto & Web3 Payouts",
    size: "1-10",
    website: "https://cryptopay-global.xyz",
    about: "Decentralized crypto payout processor and token disbursement network.",
    timezone: "Asia/Kolkata",
    verificationStatus: "pending",
    businessEmail: "hiring.cryptoglobal@gmail.com",
    phone: "+91 91234 56789",
    riskScore: 72,
    riskFlags: [
      {
        code: "FREE_WEBMAIL_DOMAIN",
        severity: "medium",
        message: "Company uses free public webmail (gmail.com)",
      },
      {
        code: "NO_GSTIN_CIN",
        severity: "high",
        message: "No valid GSTIN or Corporate CIN submitted for verification",
      },
    ],
  },
  {
    name: "QuickBucks Data Entry LLC",
    slug: "quickbucks-data",
    industry: "Data Entry & Freelance",
    size: "1-10",
    website: "https://quickbucks.fake",
    about: "Work from home simple data typing.",
    timezone: "Asia/Kolkata",
    verificationStatus: "rejected",
    rejectionReason: "Requires upfront security deposit from job applicants. Violates platform safety policy.",
    riskScore: 85,
    riskFlags: [
      {
        code: "SECURITY_DEPOSIT_REQUIRED",
        severity: "high",
        message: "Requires upfront deposit or training fee from applicants",
      },
    ],
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
      "- Eagerness to learn modern full stack architecture and build production-grade web applications.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "React Frontend Developer",
    location: "Surat, Gujarat, India",
    salary: 600000,
    compensation: { min: 450000, max: 750000, currency: "INR", period: "year" },
    experience: "1-3 years",
    minExpYears: 1,
    maxExpYears: 3,
    jobType: "Full-Time",
    workplaceMode: "onsite",
    status: "published",
    publishedDaysAgo: 16,
    requiredSkills: ["React", "JavaScript", "Tailwind CSS"],
    preferredSkills: ["Redux", "TypeScript", "REST APIs", "Jest"],
    skills: ["React", "JavaScript", "Tailwind CSS", "Redux", "TypeScript", "REST APIs", "Jest", "Git"],
    description:
      "Looking for a skilled React Frontend Developer with solid knowledge of state management, responsive UI design, and modern JavaScript.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Junior Full Stack Developer",
    location: "Ahmedabad, Gujarat, India",
    salary: 550000,
    compensation: { min: 400000, max: 700000, currency: "INR", period: "year" },
    experience: "0-2 years",
    minExpYears: 0,
    maxExpYears: 2,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 12,
    requiredSkills: ["Node.js", "React", "MongoDB"],
    preferredSkills: ["Express", "REST APIs", "Git"],
    skills: ["Node.js", "React", "MongoDB", "Express", "REST APIs", "Git", "JavaScript"],
    description:
      "Join our Ahmedabad development hub to build end-to-end full stack web applications using the MERN stack.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Node.js Backend Engineer",
    location: "Surat, Gujarat, India",
    salary: 750000,
    compensation: { min: 600000, max: 900000, currency: "INR", period: "year" },
    experience: "2-4 years",
    minExpYears: 2,
    maxExpYears: 4,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 8,
    requiredSkills: ["Node.js", "Express", "MongoDB", "REST APIs"],
    preferredSkills: ["Redis", "Docker", "AWS", "Microservices"],
    skills: ["Node.js", "Express", "MongoDB", "REST APIs", "Redis", "Docker", "AWS"],
    description:
      "Design and maintain scalable backend microservices, caching layers with Redis, and containerized deployments.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Cloud Infrastructure Engineer",
    location: "Surat, Gujarat, India",
    salary: 900000,
    compensation: { min: 700000, max: 1100000, currency: "INR", period: "year" },
    experience: "2-5 years",
    minExpYears: 2,
    maxExpYears: 5,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 4,
    requiredSkills: ["AWS", "Docker", "Linux"],
    preferredSkills: ["Kubernetes", "CI/CD", "Terraform", "GitHub Actions"],
    skills: ["AWS", "Docker", "Linux", "Kubernetes", "CI/CD", "Terraform", "GitHub Actions"],
    description:
      "Manage our cloud infrastructure on AWS, configure automated CI/CD pipelines, and maintain Dockerized production services.",
    moderation: { status: "approved" },
  },

  // Nexus Byte Solutions (Recruiter: rohit.sharma@nexusbyte.com)
  {
    orgSlug: "nexus-byte-solutions",
    recruiterEmail: "rohit.sharma@nexusbyte.com",
    title: "Backend Engineer (Node.js / Express)",
    location: "Bengaluru, Karnataka, India",
    salary: 950000,
    compensation: { min: 750000, max: 1200000, currency: "INR", period: "year" },
    experience: "2-4 years",
    minExpYears: 2,
    maxExpYears: 4,
    jobType: "Full-Time",
    workplaceMode: "remote",
    status: "published",
    publishedDaysAgo: 18,
    requiredSkills: ["Node.js", "Express", "PostgreSQL"],
    preferredSkills: ["Redis", "REST APIs", "Docker", "Git"],
    skills: ["Node.js", "Express", "PostgreSQL", "Redis", "REST APIs", "Docker", "Git"],
    description:
      "Build high-throughput backend APIs for enterprise data pipelines in Node.js and PostgreSQL with Redis caching.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "nexus-byte-solutions",
    recruiterEmail: "rohit.sharma@nexusbyte.com",
    title: "Full Stack Engineer (React + Python)",
    location: "Bengaluru, Karnataka, India",
    salary: 1050000,
    compensation: { min: 850000, max: 1300000, currency: "INR", period: "year" },
    experience: "2-5 years",
    minExpYears: 2,
    maxExpYears: 5,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 14,
    requiredSkills: ["React", "Python", "FastAPI"],
    preferredSkills: ["Docker", "MongoDB", "Tailwind CSS"],
    skills: ["React", "Python", "FastAPI", "Docker", "MongoDB", "Tailwind CSS"],
    description:
      "Develop responsive React frontends and Python FastAPI microservices integrating machine learning inference models.",
    moderation: { status: "approved" },
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
    moderation: { status: "approved" },
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
    moderation: { status: "approved" },
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
    moderation: { status: "approved" },
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
    requiredSkills: ["Playwright", "Jest", "JavaScript"],
    preferredSkills: ["Postman", "API Testing", "CI/CD", "TypeScript"],
    skills: ["Playwright", "Jest", "JavaScript", "Postman", "API Testing", "CI/CD", "TypeScript"],
    description:
      "Author robust Playwright and Jest test suites for our core financial checkout workflows and transaction ledger APIs.",
    moderation: { status: "approved" },
  },

  // Zenith Global Labs (Recruiter: kavya.nair@zenithlabs.in)
  {
    orgSlug: "zenith-global-labs",
    recruiterEmail: "kavya.nair@zenithlabs.in",
    title: "Graduate Software Trainee",
    location: "Hyderabad, Telangana, India",
    salary: 500000,
    compensation: { min: 400000, max: 600000, currency: "INR", period: "year" },
    experience: "Fresher / 0-1 years",
    minExpYears: 0,
    maxExpYears: 1,
    jobType: "Full-Time",
    workplaceMode: "onsite",
    status: "published",
    publishedDaysAgo: 28,
    requiredSkills: ["JavaScript", "Python", "SQL"],
    preferredSkills: ["React", "Git", "Problem Solving", "Data Structures"],
    skills: ["JavaScript", "Python", "SQL", "React", "Git", "Problem Solving", "Data Structures"],
    description:
      "Zenith Global Labs is hiring fresh graduates for our R&D training program in Hyderabad. Fast-track rotation through AI, Cloud, and Web engineering.",
    moderation: { status: "approved" },
  },
];

const CANDIDATES = [
  // Primary Candidate (Anas Tai - MCA Student @ SRIMCA)
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
    skills: [
      "React",
      "Node.js",
      "Express",
      "MongoDB",
      "JavaScript",
      "Tailwind CSS",
      "REST APIs",
      "Git",
      "Python",
      "JWT Auth",
      "PostgreSQL",
      "Redux",
    ],
    bio:
      "Passionate Master of Computer Applications (MCA) student at SRIMCA (Uka Tarsadia University), specialized in full stack web development using React, Node.js, Express, and MongoDB. " +
      "Experienced in designing RESTful architectures, JWT security flows, responsive UI design with Tailwind CSS, and AI-assisted workflows. " +
      "Author of production-ready full stack applications including HireSmart-AI, HomeServeX on-demand marketplace, and Travel Planner.",
    socialLinks: {
      github: "https://github.com/anastai8704",
      linkedin: "https://linkedin.com/in/anastai",
      portfolio: "https://anastai.dev",
      twitter: "https://twitter.com/anastai_dev",
    },
    education: [
      {
        institution: "SRIMCA - Uka Tarsadia University (UTU)",
        degree: "Master of Computer Applications (MCA)",
        fieldOfStudy: "Computer Science & Application Development",
        startYear: 2024,
        endYear: 2026,
        cgpa: 8.85,
      },
      {
        institution: "Veer Narmad South Gujarat University (VNSGU)",
        degree: "Bachelor of Computer Applications (BCA)",
        fieldOfStudy: "Computer Applications",
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
          "Developed responsive React frontend components and designed Node.js RESTful APIs with JWT authentication. Integrated MongoDB schemas and aggregation pipelines.",
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
        company: "PixelCode Studio",
        position: "React Frontend Developer",
        description: "Built customer-facing React SPA with Redux Toolkit and Tailwind CSS.",
        startDate: new Date("2021-07-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "Analytics Dashboard UI",
        description: "Modular React dashboard with charts, theme customization, and drag-and-drop widgets.",
        technologies: ["React", "Redux Toolkit", "Tailwind CSS"],
      },
    ],
    certifications: [{ name: "Meta Frontend Developer Professional Certificate", issuer: "Meta / Coursera" }],
    resumeLines: [
      "Priya Sharma - Frontend Engineer (React & Redux)",
      "Ahmedabad, Gujarat, India | priya.sharma@example.com | +91 98765 43210",
      "",
      "SKILLS: React, JavaScript, Redux, Tailwind CSS, HTML/CSS, REST APIs, Jest, Git",
      "",
      "EXPERIENCE",
      "React Frontend Developer, PixelCode Studio (2021 - Present): Developed high-traffic web applications in React.",
      "",
      "EDUCATION",
      "B.E. Computer Engineering, Gujarat Technological University (2017 - 2021)",
    ],
  },
  {
    name: "Vikram Nair",
    email: "vikram.nair@example.com",
    password: DEMO_PASSWORD,
    headline: "Backend Engineer (Node.js, PostgreSQL, Redis)",
    location: "Bengaluru, Karnataka, India",
    phone: "+91 98451 22334",
    gender: "Male",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    languages: ["English", "Hindi", "Malayalam"],
    skills: ["Node.js", "Express", "PostgreSQL", "Redis", "Docker", "REST APIs", "AWS", "Git"],
    bio: "Backend developer with 4 years building high-throughput microservices and distributed caching systems.",
    socialLinks: { github: "https://github.com/vikramnair-dev", linkedin: "https://linkedin.com/in/vikramnair-dev" },
    education: [
      {
        institution: "PES University",
        degree: "B.Tech Computer Science",
        fieldOfStudy: "Computer Science",
        startYear: 2016,
        endYear: 2020,
        cgpa: 8.1,
      },
    ],
    experience: [
      {
        company: "PayStream Systems",
        position: "Backend Software Engineer",
        description: "Architected transaction ledger APIs processing 1.2M events/day using Node.js and PostgreSQL.",
        startDate: new Date("2020-08-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "event-streamer",
        description: "Lightweight distributed job queue in Node.js backed by Redis streams.",
        technologies: ["Node.js", "Redis", "Docker"],
      },
    ],
    certifications: [{ name: "AWS Certified Developer - Associate", issuer: "Amazon Web Services" }],
    resumeLines: [
      "Vikram Nair - Backend Engineer (Node.js, PostgreSQL, Redis)",
      "Bengaluru, Karnataka, India | vikram.nair@example.com | +91 98451 22334",
      "",
      "SKILLS: Node.js, Express, PostgreSQL, Redis, Docker, REST APIs, AWS, Git",
      "",
      "EXPERIENCE",
      "Backend Software Engineer, PayStream Systems (2020 - Present): Engineered scalable payment APIs.",
      "",
      "EDUCATION",
      "B.Tech Computer Science, PES University (2016 - 2020)",
    ],
  },
  {
    name: "Sneha Kulkarni",
    email: "sneha.kulkarni@example.com",
    password: DEMO_PASSWORD,
    headline: "DevOps & Cloud Engineer (AWS & Kubernetes)",
    location: "Pune, Maharashtra, India",
    phone: "+91 98231 77654",
    gender: "Female",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    languages: ["English", "Hindi", "Marathi"],
    skills: ["AWS", "Kubernetes", "Docker", "Terraform", "CI/CD", "Linux", "Prometheus", "Git"],
    bio: "DevOps engineer with 4.5 years managing multi-cloud Kubernetes infrastructure, GitOps automation, and zero-downtime deployments.",
    socialLinks: { github: "https://github.com/snehak-ops", linkedin: "https://linkedin.com/in/snehak-ops" },
    education: [
      {
        institution: "COEP Technological University",
        degree: "B.Tech Information Technology",
        fieldOfStudy: "Information Technology",
        startYear: 2015,
        endYear: 2019,
        cgpa: 8.7,
      },
    ],
    experience: [
      {
        company: "InfraScale Technologies",
        position: "Senior DevOps Engineer",
        description: "Managed 18 Kubernetes clusters across AWS and automated infrastructure provisioning using Terraform.",
        startDate: new Date("2019-07-01"),
        endDate: null,
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "k8s-autoscale-operator",
        description: "Custom Kubernetes operator scaling workloads dynamically based on queue lag metrics.",
        technologies: ["Go", "Kubernetes", "Prometheus"],
      },
    ],
    certifications: [
      { name: "Certified Kubernetes Administrator (CKA)", issuer: "Cloud Native Computing Foundation" },
      { name: "AWS Solutions Architect Professional", issuer: "AWS" },
    ],
    resumeLines: [
      "Sneha Kulkarni - DevOps & Cloud Engineer (AWS & Kubernetes)",
      "Pune, Maharashtra, India | sneha.kulkarni@example.com | +91 98231 77654",
      "",
      "SKILLS: AWS, Kubernetes, Docker, Terraform, CI/CD, Linux, Prometheus, Git",
      "",
      "EXPERIENCE",
      "Senior DevOps Engineer, InfraScale Technologies (2019 - Present): Automated AWS infrastructure with Terraform.",
      "",
      "EDUCATION",
      "B.Tech Information Technology, COEP Pune (2015 - 2019)",
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

const APPLICATIONS_CONFIG = [
  // Anas Tai Applications
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
      componentScores: { requiredSkills: 98, preferredSkills: 90, experience: 85, education: 95, semantic: 96 },
      strengths: ["Strong MERN stack project portfolio", "Hands-on JWT authentication & REST design", "Surat based local candidate"],
      concerns: ["Fresher graduating in 2026 (available for immediate internship + full time conversion)"],
      recommendation: "Strongly recommended for technical interview round.",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Junior Full Stack Developer",
    orgSlug: "apex-innovations",
    status: "shortlisted",
    appliedDaysAgo: 10,
    tags: ["mca-fresher"],
    history: [
      ["submitted", "candidate", "Application submitted", 10],
      ["under_review", "recruiter", "Resume reviewed by talent team.", 8],
      ["shortlisted", "recruiter", "Shortlisted for Junior Full Stack pool.", 4],
    ],
    notes: ["Good candidate for the full stack team; shortlisted alongside internship track."],
    match: {
      overallScore: 91,
      confidence: 0.93,
      matchedSkills: ["Node.js", "React", "MongoDB", "Express", "REST APIs", "Git", "JavaScript"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 95, preferredSkills: 88, experience: 82, education: 95, semantic: 92 },
      strengths: ["Clean codebase in HomeServeX", "MCA student at SRIMCA"],
      concerns: [],
      recommendation: "Shortlisted for direct technical round",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Junior MERN Stack Engineer",
    orgSlug: "bytescale-technologies",
    status: "hired",
    appliedDaysAgo: 22,
    tags: ["offer-accepted"],
    history: [
      ["submitted", "candidate", "Applied for Junior MERN role", 22],
      ["under_review", "recruiter", "Screened portfolio and live GitHub demos.", 18],
      ["shortlisted", "recruiter", "Shortlisted for remote technical panel.", 14],
      ["interview", "recruiter", "Live coding round completed with 95/100 score.", 10],
      ["offer", "recruiter", "Official Offer Letter extended: INR 6.5 LPA.", 6],
      ["hired", "recruiter", "Offer accepted; confirmed joining for upcoming cohort.", 2],
    ],
    notes: [
      "Offered and joined! Outstanding performance on React state patterns and Express error middleware.",
    ],
    match: {
      overallScore: 95,
      confidence: 0.96,
      matchedSkills: ["MongoDB", "Express", "React", "Node.js", "REST APIs", "Tailwind CSS", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 98, preferredSkills: 95, experience: 88, education: 95, semantic: 96 },
      strengths: ["Excellent MERN architecture knowledge", "Proven GitHub projects"],
      concerns: [],
      recommendation: "Hired",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Backend Engineer (Node.js / Express)",
    orgSlug: "nexus-byte-solutions",
    status: "under_review",
    appliedDaysAgo: 5,
    tags: [],
    history: [
      ["submitted", "candidate", "Application submitted", 5],
      ["under_review", "recruiter", "Profile under review for backend microservices opening.", 2],
    ],
    notes: [],
    match: {
      overallScore: 88,
      confidence: 0.90,
      matchedSkills: ["Node.js", "Express", "REST APIs", "Docker", "Git", "PostgreSQL"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["Redis"],
      componentScores: { requiredSkills: 90, preferredSkills: 82, experience: 82, education: 95, semantic: 89 },
      strengths: ["Solid Node.js REST fundamentals", "JWT Auth implementation"],
      concerns: ["Needs more Redis production exposure"],
      recommendation: "Proceed to screening",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Frontend Engineer (React & TypeScript)",
    orgSlug: "cloudforge-systems",
    status: "submitted",
    appliedDaysAgo: 2,
    tags: [],
    history: [["submitted", "candidate", "Application submitted with ready resume", 2]],
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

  // Other Candidates
  {
    candidateEmail: "priya.sharma@example.com",
    jobTitle: "React Frontend Developer",
    orgSlug: "apex-innovations",
    status: "hired",
    appliedDaysAgo: 25,
    tags: ["priority"],
    history: [
      ["submitted", "candidate", "Applied for React Frontend role", 25],
      ["under_review", "recruiter", "Reviewing 3 years frontend experience.", 20],
      ["shortlisted", "recruiter", "Shortlisted for technical rounds.", 16],
      ["interview", "recruiter", "Technical round completed with great score.", 10],
      ["offer", "recruiter", "Offer extended at INR 6.0 LPA.", 6],
      ["hired", "recruiter", "Offer accepted; onboarding completed.", 2],
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
      recommendation: "Hired",
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
      ["offer", "recruiter", "Offer extended at INR 11 LPA.", 8],
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
    // 1. Check Platform Admin
    const existingAdmin = await User.findOne({ role: "admin" }).select("+password");
    if (existingAdmin) {
      console.log(`[ADMIN] Preserved existing platform admin account: ${existingAdmin.email} (${existingAdmin.name})`);
    }

    // 1b. Demo platform admin: create-only. An existing account is never changed (role, password, status).
    const demoAdminEmail = String(process.env.DEMO_ADMIN_EMAIL || "tofu1180@gmail.com").trim().toLowerCase();
    const demoAdmin = await User.findOne({ email: demoAdminEmail }).lean();
    if (!demoAdmin) {
      await User.create({
        name: "Platform Admin (Demo)",
        email: demoAdminEmail,
        password: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: "admin",
        accountStatus: "active",
        emailVerified: true,
        onboardingCompleted: true,
        timezone: "Asia/Kolkata",
      });
      console.log(`  + Created demo Platform Admin: <${demoAdminEmail}>`);
    } else if (demoAdmin.role !== "admin") {
      console.log(`  ! <${demoAdminEmail}> exists with role "${demoAdmin.role}". Not changed: grant admin manually if intended.`);
    } else {
      console.log(`  ✓ Demo Platform Admin present: <${demoAdminEmail}>`);
    }

    // 2. Organizations
    console.log("\n[1/8] Seeding Verified Organizations & Moderation Queue...");
    const orgMap = {};
    for (const orgSpec of ORGANIZATIONS) {
      let org = await Organization.findOne({ slug: orgSpec.slug });
      if (!org) {
        org = await Organization.create(orgSpec);
        console.log(`  + Created Organization: ${org.name} [${org.verificationStatus}] (${org.slug})`);
      } else {
        Object.assign(org, orgSpec);
        await org.save();
        console.log(`  ✓ Synced Organization: ${org.name} [${org.verificationStatus}] (${org.slug})`);
      }
      orgMap[orgSpec.slug] = org;
    }

    // 3. Recruiters & Memberships
    console.log("\n[2/8] Seeding Recruiter Profiles & Company Memberships...");
    const recruiterMap = {};
    for (const rec of RECRUITERS) {
      let user = await User.findOne({ email: rec.email });
      const org = orgMap[rec.orgSlug];
      const passwordHash = await bcrypt.hash(rec.password, 10);

      const userData = {
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
      };

      if (!user) {
        user = await User.create(userData);
        console.log(`  + Created Recruiter: ${user.name} <${user.email}>`);
      } else {
        // Repeated seeding never replaces an existing password (Requirement 11).
        delete userData.password;
        Object.assign(user, userData);
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
    console.log("\n[3/8] Seeding Job Postings...");
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
        moderation: jobSpec.moderation || { status: "approved" },
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

    // 5. Candidates, Profiles & Resumes
    console.log("\n[4/8] Seeding Candidate Accounts, Resumes & Profile Details...");
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
        // Repeated seeding never replaces an existing password (Requirement 11).
        delete userData.password;
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

      // Resume
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

    // 6. Applications & Pipeline
    console.log("\n[5/8] Seeding Applications Pipeline & Hybrid Match Scores...");
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

    // 7. Subscriptions & Transactions (Monetization Engine)
    console.log("\n[6/8] Seeding Subscriptions, Invoices & Historical Revenue...");
    const apexOrg = orgMap["apex-innovations"];
    const anas = candidateMap["tanastai5018@gmail.com"];
    const primaryRecruiter = recruiterMap["2025mca150@gmail.com"];

    // Recruiter Subscriptions
    const RECRUITER_SUBS = [
      {
        orgSlug: "apex-innovations",
        tier: "recruiter_enterprise",
        usage: { activeJobsCount: 5, teamMembersCount: 3, aiAnalysesUsedThisMonth: 28 },
      },
      {
        orgSlug: "bytescale-technologies",
        tier: "recruiter_enterprise",
        usage: { activeJobsCount: 2, teamMembersCount: 1, aiAnalysesUsedThisMonth: 85 },
      },
      {
        orgSlug: "nexus-byte-solutions",
        tier: "recruiter_growth",
        usage: { activeJobsCount: 2, teamMembersCount: 1, aiAnalysesUsedThisMonth: 34 },
      },
      {
        orgSlug: "cloudforge-systems",
        tier: "recruiter_starter",
        usage: { activeJobsCount: 2, teamMembersCount: 1, aiAnalysesUsedThisMonth: 12 },
      },
      {
        orgSlug: "zenith-global-labs",
        tier: "recruiter_growth",
        usage: { activeJobsCount: 1, teamMembersCount: 1, aiAnalysesUsedThisMonth: 19 },
      },
    ];

    for (const item of RECRUITER_SUBS) {
      const org = orgMap[item.orgSlug];
      if (!org) continue;
      const planDef = SUBSCRIPTION_PLANS.recruiter[item.tier];

      await Subscription.findOneAndUpdate(
        { subscriberType: "organization", subscriberId: org._id },
        {
          subscriberType: "organization",
          subscriberId: org._id,
          planTier: item.tier,
          source: "demo_seed",
          isDemo: true,
          status: "active",
          currentPeriodStart: daysAgo(5),
          currentPeriodEnd: inDays(25),
          billingCycle: "monthly",
          limits: { ...planDef.limits },
          usage: { ...item.usage },
        },
        { upsert: true, returnDocument: "after" },
      );
    }

    // Candidate Plus Subscription for Anas Tai
    if (anas) {
      const planDef = SUBSCRIPTION_PLANS.candidate.candidate_plus;
      await Subscription.findOneAndUpdate(
        { subscriberType: "candidate", subscriberId: anas._id },
        {
          subscriberType: "candidate",
          subscriberId: anas._id,
          planTier: "candidate_plus",
          source: "demo_seed",
          isDemo: true,
          status: "active",
          currentPeriodStart: daysAgo(10),
          currentPeriodEnd: inDays(20),
          billingCycle: "monthly",
          limits: { ...planDef.limits },
          usage: { activeApplicationsCount: 6, aiResumesUsedThisMonth: 2 },
        },
        { upsert: true, returnDocument: "after" },
      );
    }

    // No PaymentTransaction records are created: demo subscriptions are complimentary and labelled as such.

    // 8. Placements & Employment Lifecycle Tracking
    console.log("\n[7/8] Seeding Verified Placements & Employment Records...");
    const PLACEMENTS_SPEC = [
      {
        candEmail: "tanastai5018@gmail.com",
        jobKey: "bytescale-technologies|Junior MERN Stack Engineer",
        status: "joining_confirmed",
        offeredSalary: 650000,
        joiningDate: inDays(14),
      },
      {
        candEmail: "priya.sharma@example.com",
        jobKey: "apex-innovations|React Frontend Developer",
        status: "placement_verified",
        offeredSalary: 600000,
        joiningDate: daysAgo(15),
        confirmedJoinedAt: daysAgo(15),
        verifiedAt: daysAgo(10),
      },
      {
        candEmail: "sneha.kulkarni@example.com",
        jobKey: "cloudforge-systems|DevOps / Cloud Engineer",
        status: "currently_working",
        offeredSalary: 1100000,
        joiningDate: daysAgo(30),
        confirmedJoinedAt: daysAgo(30),
        verifiedAt: daysAgo(20),
      },
    ];

    for (const ps of PLACEMENTS_SPEC) {
      const cand = candidateMap[ps.candEmail];
      const job = jobMap[ps.jobKey];
      if (!cand || !job) continue;

      const app = applicationMap[`${cand.email}|${job._id}`];
      if (!app) continue;

      let placement = await Placement.findOne({ candidate: cand._id, job: job._id });
      const placementData = {
        organization: job.organization,
        job: job._id,
        application: app._id,
        candidate: cand._id,
        status: ps.status,
        offeredSalary: ps.offeredSalary,
        currency: "INR",
        designation: job.title,
        joiningDate: ps.joiningDate,
        confirmedJoinedAt: ps.confirmedJoinedAt || null,
        verifiedAt: ps.verifiedAt || null,
        notes: `Placed through HireSmart-AI automated match and recruitment pipeline.`,
      };

      if (!placement) {
        placement = await Placement.create(placementData);
        console.log(`  + Placement Created: ${cand.name} at ${job.company} [${placement.status}]`);
      } else {
        Object.assign(placement, placementData);
        await placement.save();
        console.log(`  ✓ Synced Placement: ${cand.name} at ${job.company} [${placement.status}]`);
      }

      // Sync CandidateProfile employmentStatus
      await CandidateProfile.updateOne(
        { user: cand._id },
        {
          $set: {
            employmentStatus:
              ps.status === "currently_working" || ps.status === "placement_verified"
                ? "employed"
                : ps.status === "joining_confirmed" || ps.status === "offer_accepted"
                  ? "placed"
                  : "seeking",
          },
        },
      );
    }

    // 9. Interviews & Meeting Schedules
    console.log("\n[8/8] Seeding Interviews & Meeting Schedules...");
    const interviewSpecs = [
      {
        candidate: anas._id,
        organization: apexOrg._id,
        job: jobMap["apex-innovations|Software Engineer Intern (MERN)"]?._id,
        title: "Technical Round: React Hooks & Node REST Architecture",
        round: "technical",
        scheduledAt: inDays(2, 15, 0),
        durationMinutes: 45,
        locationType: "google_meet",
        meetingUrl: "https://meet.google.com/hsm-apex-mca",
        status: "scheduled",
        interviewers: [primaryRecruiter._id],
        candidateNotes: "Please be ready to review your HireSmart-AI and HomeServeX projects.",
      },
    ];

    for (const spec of interviewSpecs) {
      if (!spec.job) continue;
      let interview = await Interview.findOne({ candidate: spec.candidate, job: spec.job, round: spec.round });
      if (!interview) {
        interview = await Interview.create(spec);
        console.log(`  + Scheduled Interview: ${spec.title} with Anas Tai`);
      } else {
        Object.assign(interview, spec);
        await interview.save();
        console.log(`  ✓ Synced Interview: ${spec.title} with Anas Tai`);
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
    console.log(`            Password: <value of DEMO_PASSWORD in server/.env>`);
    console.log(`            Features: 100% Profile, Ready Resume, Career Plus Membership,`);
    console.log(`                      6 Applications, Scheduled Google Meet, Confirmed Placement`);
    console.log("");
    console.log(`[RECRUITER]  Demo Recruiter (Talent Lead @ Apex Innovations, Surat)`);
    console.log(`            Email   : 2025mca150@gmail.com`);
    console.log(`            Password: <value of DEMO_PASSWORD in server/.env>`);
    console.log(`            Features: Verified Company Status (GSTIN: 24AAACA1234A1Z5), Growth Plan,`);
    console.log(`                      5 Jobs, Review Pipelines, Interviews, In-App Notifications`);
    console.log("");
    if (existingAdmin) {
      console.log(`[ADMIN]      ${existingAdmin.name} (Platform Admin Console)`);
      console.log(`            Email   : ${existingAdmin.email}`);
      console.log(`            Features: Company Verification & Risk Assessment, Moderation,`);
      console.log(`                      Financial Revenue & MRR Dashboard, 12-Month Analytics`);
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
