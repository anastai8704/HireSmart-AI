/**
 * HireSmart-AI — Fresh Demo Data Reset & System-Aligned Database Seeding
 *
 * Preserves ALL existing User accounts, credentials, IDs, roles, and password hashes.
 * Completely backs up the database to server/backups/<db>-<timestamp> before deletion.
 * Clears old demo data and inserts a clean, realistic, interconnected dataset aligned with current schemas.
 *
 * Usage:
 *   Dry-Run Mode:
 *     node scripts/seed-fresh-demo.js --dry-run
 *
 *   Execution Mode:
 *     node scripts/seed-fresh-demo.js --confirm-reset
 */

process.env.NODE_ENV = process.env.NODE_ENV || "development";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../config/db");
const { backupDatabase } = require("./backup-db");

// Models (with exact export signatures)
const User = require("../models/User");
const Organization = require("../models/Organization");
const { Membership } = require("../models/Membership");
const { CompanyVerificationCase } = require("../models/CompanyVerificationCase");
const Job = require("../models/Job");
const CandidateProfile = require("../models/CandidateProfile");
const { Resume, ResumeVersion, ParsedResume } = require("../models/Resume");
const { Application } = require("../models/Application");
const Interview = require("../models/Interview");
const { CandidateMatch } = require("../models/Recruitment");
const Consent = require("../models/Consent");
const { Placement } = require("../models/Placement");
const { Subscription } = require("../models/Subscription");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
const JobAlert = require("../models/JobAlert");
const { JobModerationEvent } = require("../models/JobModerationEvent");
const { CANDIDATE_PLANS, RECRUITER_PLANS } = require("../config/subscriptionPlans");

// Safety guards
if (String(process.env.NODE_ENV).trim().toLowerCase() === "production") {
  console.error("❌ Refusing to run: NODE_ENV is set to production.");
  process.exit(1);
}

const daysAgo = (days) => new Date(Date.now() - days * 86400000);
const inDays = (days, hour = 14, minute = 0) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const escapePdf = (val) =>
  String(val || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

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

/* =========================================================================
   FRESH DATASET DEFINITIONS
   ========================================================================= */

const ORGANIZATIONS_DATA = [
  {
    name: "Apex Innovations",
    slug: "apex-innovations",
    industry: "Software & Cloud Solutions",
    size: "51-200",
    website: "https://www.apexinnovations.in",
    about:
      "Apex Innovations is a premier software engineering and cloud consulting firm building enterprise SaaS, scalable web platforms, and intelligent AI decision-support tools.",
    timezone: "Asia/Kolkata",
    status: "active",
    verificationStatus: "verified",
    verifiedAt: daysAgo(35),
    gstin: "24AAACA1234A1Z5",
    registrationNumber: "U72200GJ2020PTC012345",
    businessEmail: "careers@apexinnovations.io",
    businessEmailVerifiedAt: daysAgo(35),
    phone: "+91 98980 12345",
    businessType: "private_limited",
    authorizedRepresentative: {
      name: "Zaid Malek",
      designation: "Talent Acquisition Lead",
    },
    consent: {
      acceptedAt: daysAgo(35),
      version: "2026-v1",
    },
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
        fileName: "Apex_Certificate_of_Incorporation.pdf",
        mimeType: "application/pdf",
        size: 142050,
        uploadedAt: daysAgo(35),
      },
      {
        type: "gstin_certificate",
        fileName: "Apex_GSTIN_Registration.pdf",
        mimeType: "application/pdf",
        size: 98400,
        uploadedAt: daysAgo(35),
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
      "Nexus Byte Solutions creates high-throughput data platforms, cloud-native services, and AI-driven automation systems for global enterprise clients.",
    timezone: "Asia/Kolkata",
    status: "active",
    verificationStatus: "verified",
    verifiedAt: daysAgo(28),
    gstin: "29AABCN4321D1Z8",
    registrationNumber: "U72200KA2019PTC098765",
    businessEmail: "talent@nexusbyte.io",
    businessEmailVerifiedAt: daysAgo(28),
    phone: "+91 98450 66778",
    businessType: "private_limited",
    authorizedRepresentative: {
      name: "Rohit Sharma",
      designation: "VP of Engineering & Talent",
    },
    consent: {
      acceptedAt: daysAgo(28),
      version: "2026-v1",
    },
    address: {
      street: "Tower B, Manyata Tech Park, Outer Ring Road",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      pincode: "560045",
    },
    riskScore: 8,
    riskFlags: [],
    documents: [
      {
        type: "incorporation_certificate",
        fileName: "NexusByte_CIN_Certificate.pdf",
        mimeType: "application/pdf",
        size: 165000,
        uploadedAt: daysAgo(28),
      },
    ],
  },
  {
    name: "Zenith Technologies",
    slug: "zenith-technologies",
    industry: "Fintech & Digital Banking",
    size: "51-200",
    website: "https://www.zenithlabs.in",
    about:
      "Zenith Technologies builds next-generation digital banking rails, real-time transaction gateways, and automated compliance microservices.",
    timezone: "Asia/Kolkata",
    status: "active",
    verificationStatus: "verified",
    verifiedAt: daysAgo(22),
    gstin: "27AABCZ9876F1Z2",
    registrationNumber: "U67190MH2021PTC123456",
    businessEmail: "careers@zenithlabs.in",
    businessEmailVerifiedAt: daysAgo(22),
    phone: "+91 99080 99001",
    businessType: "private_limited",
    authorizedRepresentative: {
      name: "Kavya Nair",
      designation: "Lead Technical Recruiter",
    },
    consent: {
      acceptedAt: daysAgo(22),
      version: "2026-v1",
    },
    address: {
      street: "BKC Complex, Bandra East",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      pincode: "400051",
    },
    riskScore: 6,
    riskFlags: [],
    documents: [
      {
        type: "incorporation_certificate",
        fileName: "Zenith_Incorporation.pdf",
        mimeType: "application/pdf",
        size: 112000,
        uploadedAt: daysAgo(22),
      },
    ],
  },
  {
    name: "CloudNova Systems",
    slug: "cloudnova-systems",
    industry: "Cloud Infrastructure & DevOps",
    size: "11-50",
    website: "https://www.cloudnova.io",
    about:
      "CloudNova Systems specializes in resilient cloud platforms, Kubernetes multi-cluster management, GitOps pipelines, and Site Reliability Engineering.",
    timezone: "Asia/Kolkata",
    status: "active",
    verificationStatus: "under_review",
    gstin: "27AABCC8765E1Z1",
    registrationNumber: "U72200MH2021PTC112233",
    businessEmail: "recruiting@cloudnova.io",
    phone: "+91 98600 77889",
    businessType: "private_limited",
    authorizedRepresentative: {
      name: "Neha Patel",
      designation: "Head of Talent & Co-Founder",
    },
    consent: {
      acceptedAt: daysAgo(5),
      version: "2026-v1",
    },
    address: {
      street: "Senapati Bapat Road, Shivajinagar",
      city: "Pune",
      state: "Maharashtra",
      country: "India",
      pincode: "411016",
    },
    riskScore: 12,
    riskFlags: [],
    documents: [
      {
        type: "incorporation_certificate",
        fileName: "CloudNova_CIN_Document.pdf",
        mimeType: "application/pdf",
        size: 130000,
        uploadedAt: daysAgo(5),
      },
    ],
  },
  {
    name: "ByteScale Technologies",
    slug: "bytescale-technologies",
    industry: "Big Data & Analytics",
    size: "11-50",
    website: "https://www.bytescale.tech",
    about:
      "ByteScale Technologies provides low-latency data streaming pipelines, distributed compute frameworks, and analytics microservices.",
    timezone: "Asia/Kolkata",
    status: "active",
    verificationStatus: "verified",
    verifiedAt: daysAgo(18),
    gstin: "36AABCB9988F1Z3",
    registrationNumber: "U72200TG2018PTC445566",
    businessEmail: "careers@bytescale.tech",
    businessEmailVerifiedAt: daysAgo(18),
    phone: "+91 98190 88990",
    businessType: "private_limited",
    authorizedRepresentative: {
      name: "Amit Verma",
      designation: "Founder & Talent Director",
    },
    consent: {
      acceptedAt: daysAgo(18),
      version: "2026-v1",
    },
    address: {
      street: "HITEC City, Madhapur",
      city: "Hyderabad",
      state: "Telangana",
      country: "India",
      pincode: "500081",
    },
    riskScore: 7,
    riskFlags: [],
    documents: [
      {
        type: "gstin_certificate",
        fileName: "ByteScale_GSTIN.pdf",
        mimeType: "application/pdf",
        size: 95000,
        uploadedAt: daysAgo(18),
      },
    ],
  },
  {
    name: "Vanguard Mobility",
    slug: "vanguard-mobility",
    industry: "EV & Autonomous Transportation",
    size: "51-200",
    website: "https://vanguard-mobility.demo",
    about:
      "Next-generation urban electric fleet management and telematics infrastructure.",
    timezone: "Asia/Kolkata",
    status: "active",
    verificationStatus: "rejected",
    rejectionReason:
      "Corporate CIN and registered address could not be verified on the MCA portal. Discrepancy in authorized representative designation.",
    businessEmail: "contact@vanguard-mobility.demo",
    phone: "+91 91234 56789",
    businessType: "other",
    address: {
      street: "SG Highway",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
      pincode: "380015",
    },
    riskScore: 82,
    riskFlags: [
      {
        code: "CIN_NOT_FOUND",
        severity: "high",
        message: "Corporate CIN could not be matched against official registry",
      },
      {
        code: "INCONSISTENT_REPRESENTATIVE",
        severity: "medium",
        message: "Authorized representative not found on MCA directors list",
      },
    ],
  },
];

const RECRUITER_MAPPINGS = [
  { email: "2025mca150@gmail.com", orgSlug: "apex-innovations", role: "owner" },
  { email: "suresh.patel@apexinnovations.in", orgSlug: "apex-innovations", role: "hiring_manager" },
  { email: "deepak.shah@apexinnovations.in", orgSlug: "apex-innovations", role: "interviewer" },
  { email: "rohit.sharma@nexusbyte.com", orgSlug: "nexus-byte-solutions", role: "owner" },
  { email: "kavya.nair@zenithlabs.in", orgSlug: "zenith-technologies", role: "owner" },
  { email: "neha.patel@cloudforge.io", orgSlug: "cloudnova-systems", role: "owner" },
  { email: "amit.verma@bytescale.tech", orgSlug: "bytescale-technologies", role: "owner" },
];

const CANDIDATE_PROFILES_DATA = [
  {
    email: "tanastai5018@gmail.com",
    name: "Anas Tai",
    headline: "Full-Stack Developer | MCA Graduate (MERN, Cloud & AI Tools)",
    location: "Surat, Gujarat, India",
    phone: "+91 97234 56789",
    city: "Surat",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    employmentStatus: "employed",
    skills: [
      "React",
      "Node.js",
      "Express",
      "MongoDB",
      "JavaScript",
      "TypeScript",
      "Tailwind CSS",
      "REST APIs",
      "Git",
      "Python",
      "Docker",
      "JWT Auth",
    ],
    bio:
      "Master of Computer Applications (MCA) student at SRIMCA (Uka Tarsadia University), specialized in full-stack web development using React, Node.js, Express, and MongoDB. " +
      "Experienced in designing RESTful architectures, JWT security flows, responsive UI design with Tailwind CSS, and AI-assisted workflows. " +
      "Author of production-ready full-stack applications including HireSmart-AI, HomeServeX on-demand marketplace, and Travel Planner.",
    socialLinks: {
      github: "https://github.com/anastai8704",
      linkedin: "https://linkedin.com/in/anastai",
      portfolio: "https://anastai.dev",
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
        company: "Apex Innovations",
        position: "Full Stack Engineer",
        description:
          "Developing responsive React frontend components and designing Node.js RESTful APIs with JWT authentication. Integrated MongoDB schemas and aggregation pipelines.",
        startDate: new Date("2026-06-01"),
        currentlyWorking: true,
      },
      {
        company: "TechCraft Solutions",
        position: "Full Stack Developer Intern",
        description:
          "Built responsive web UI components in React and wrote Node.js backend services.",
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
        technologies: ["React", "Node.js", "Express", "MongoDB", "Tailwind CSS", "JWT Auth"],
        githubUrl: "https://github.com/anastai8704/HireSmart-AI",
        liveUrl: "https://hiresmart-ai.dev",
      },
      {
        title: "HomeServeX",
        description:
          "On-demand home services booking marketplace featuring real-time provider dispatch, booking calendar, and secure payment flows.",
        technologies: ["React", "Node.js", "MongoDB", "Express", "Tailwind CSS"],
        githubUrl: "https://github.com/anastai8704/HomeServeX",
        liveUrl: "https://homeservex.dev",
      },
    ],
    certifications: [
      {
        name: "Full Stack Web Development Certification",
        issuer: "freeCodeCamp",
        issueDate: new Date("2024-03-15"),
      },
      {
        name: "MongoDB Certified Developer Associate",
        issuer: "MongoDB University",
        issueDate: new Date("2024-06-20"),
      },
    ],
    resumeLines: [
      "Anas Tai - Full-Stack Developer | MCA Graduate",
      "Surat, Gujarat, India | tanastai5018@gmail.com | +91 97234 56789 | github.com/anastai8704",
      "",
      "PROFESSIONAL SUMMARY",
      "MCA graduate with strong expertise in full-stack MERN development, REST APIs, and modern web architectures.",
      "",
      "TECHNICAL SKILLS",
      "React, Node.js, Express, MongoDB, JavaScript, TypeScript, Tailwind CSS, REST APIs, Git, Python, Docker, JWT Auth",
      "",
      "PROJECTS",
      "HireSmart-AI: AI-powered hiring platform with hybrid semantic matching, interview scheduling, and recruiter pipeline.",
      "HomeServeX: On-demand home services booking marketplace with provider dispatch, calendar, and payment flows.",
      "",
      "EDUCATION",
      "Master of Computer Applications (MCA), SRIMCA - Uka Tarsadia University (2024 - 2026, CGPA: 8.85)",
      "Bachelor of Computer Applications (BCA), Veer Narmad South Gujarat University (2021 - 2024, CGPA: 8.52)",
    ],
  },
  {
    email: "priya.sharma@example.com",
    name: "Priya Sharma",
    headline: "Senior Frontend Engineer (React, Redux, Next.js)",
    location: "Surat, Gujarat, India",
    phone: "+91 98765 43210",
    city: "Surat",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    employmentStatus: "employed",
    skills: ["React", "JavaScript", "Redux", "Tailwind CSS", "Next.js", "REST APIs", "Jest", "Git"],
    bio: "Frontend engineer with 3+ years experience building responsive, component-driven React applications and stateful dashboards.",
    education: [
      {
        institution: "Gujarat Technological University",
        degree: "B.E. Computer Engineering",
        startYear: 2018,
        endYear: 2022,
        cgpa: 8.4,
      },
    ],
    experience: [
      {
        company: "Apex Innovations",
        position: "React Frontend Developer",
        description: "Building production React interfaces and dashboard features.",
        startDate: new Date("2025-10-01"),
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "Enterprise Analytics UI",
        description: "Modular React dashboard with charts and real-time metric streams.",
        technologies: ["React", "Redux Toolkit", "Tailwind CSS"],
      },
    ],
    certifications: [{ name: "Meta Frontend Developer Professional Certificate", issuer: "Meta" }],
    resumeLines: [
      "Priya Sharma - Frontend Engineer (React & Redux)",
      "Surat, Gujarat, India | priya.sharma@example.com | +91 98765 43210",
      "",
      "SKILLS: React, JavaScript, Redux, Tailwind CSS, Next.js, REST APIs, Jest, Git",
      "",
      "EXPERIENCE: React Frontend Developer, Apex Innovations (2025 - Present)",
      "EDUCATION: B.E. Computer Engineering, GTU (2018 - 2022)",
    ],
  },
  {
    email: "vikram.nair@example.com",
    name: "Vikram Nair",
    headline: "Cloud & DevOps Engineer (AWS, Kubernetes, Terraform)",
    location: "Bengaluru, Karnataka, India",
    phone: "+91 98451 22334",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    languages: ["English", "Hindi", "Malayalam"],
    employmentStatus: "employed",
    skills: ["AWS", "Kubernetes", "Docker", "Terraform", "CI/CD", "Linux", "Node.js", "Git"],
    bio: "DevOps engineer with 4 years managing cloud infrastructure, automated CI/CD pipelines, and Kubernetes clusters.",
    education: [
      {
        institution: "PES University",
        degree: "B.Tech Computer Science",
        startYear: 2017,
        endYear: 2021,
        cgpa: 8.2,
      },
    ],
    experience: [
      {
        company: "CloudNova Systems",
        position: "Site Reliability Engineer",
        description: "Automated AWS infrastructure and configured multi-stage GitHub Actions workflows.",
        startDate: new Date("2021-08-01"),
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "k8s-multi-cluster-deploy",
        description: "ArgoCD and Terraform automated deployment across staging and prod.",
        technologies: ["Kubernetes", "Terraform", "ArgoCD"],
      },
    ],
    certifications: [{ name: "AWS Certified Solutions Architect", issuer: "AWS" }],
    resumeLines: [
      "Vikram Nair - Cloud & DevOps Engineer",
      "Bengaluru, Karnataka, India | vikram.nair@example.com | +91 98451 22334",
      "",
      "SKILLS: AWS, Kubernetes, Docker, Terraform, CI/CD, Linux, Node.js, Git",
    ],
  },
  {
    email: "sneha.kulkarni@example.com",
    name: "Sneha Kulkarni",
    headline: "Backend & Systems Engineer (Node.js, PostgreSQL, Redis)",
    location: "Pune, Maharashtra, India",
    phone: "+91 98231 77654",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    languages: ["English", "Hindi", "Marathi"],
    employmentStatus: "employed",
    skills: ["Node.js", "Express", "PostgreSQL", "Redis", "Docker", "REST APIs", "AWS", "Git"],
    bio: "Backend developer with 4 years building high-throughput microservices and distributed caching systems.",
    education: [
      {
        institution: "COEP Technological University",
        degree: "B.Tech Information Technology",
        startYear: 2016,
        endYear: 2020,
        cgpa: 8.6,
      },
    ],
    experience: [
      {
        company: "PayStream Systems",
        position: "Senior Backend Engineer",
        description: "Architected transaction ledger APIs processing 1.5M events/day.",
        startDate: new Date("2020-07-01"),
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
    certifications: [{ name: "AWS Certified Developer", issuer: "AWS" }],
    resumeLines: [
      "Sneha Kulkarni - Backend & Systems Engineer",
      "Pune, Maharashtra, India | sneha.kulkarni@example.com | +91 98231 77654",
      "",
      "SKILLS: Node.js, Express, PostgreSQL, Redis, Docker, REST APIs, AWS, Git",
    ],
  },
  {
    email: "arjun.mehta@example.com",
    name: "Arjun Mehta",
    headline: "Frontend Developer (React & JavaScript)",
    location: "Surat, Gujarat, India",
    phone: "+91 97260 41285",
    city: "Surat",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    employmentStatus: "employed",
    skills: ["React", "JavaScript", "HTML/CSS", "Tailwind CSS", "Jest", "Git", "REST APIs"],
    bio: "Junior developer with 1.5 years experience crafting interactive UI components in React and modern Tailwind CSS.",
    education: [
      {
        institution: "L.D. College of Engineering",
        degree: "B.E. Computer Engineering",
        startYear: 2020,
        endYear: 2024,
        cgpa: 8.3,
      },
    ],
    experience: [
      {
        company: "WebCraft Studio",
        position: "Frontend Developer",
        description: "Implemented responsive web UI components in React.",
        startDate: new Date("2024-07-01"),
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "eCommerce Storefront",
        description: "Responsive e-commerce UI built in React with shopping cart.",
        technologies: ["React", "Tailwind CSS", "JavaScript"],
      },
    ],
    certifications: [{ name: "JavaScript Algorithms & Data Structures", issuer: "freeCodeCamp" }],
    resumeLines: [
      "Arjun Mehta - Frontend Developer",
      "Surat, Gujarat, India | arjun.mehta@example.com | +91 97260 41285",
      "",
      "SKILLS: React, JavaScript, HTML/CSS, Tailwind CSS, Jest, Git, REST APIs",
    ],
  },
  {
    email: "ishita.verma@example.com",
    name: "Ishita Verma",
    headline: "QA Automation Engineer (Playwright & Jest)",
    location: "Indore, Madhya Pradesh, India",
    phone: "+91 98930 66412",
    city: "Indore",
    state: "Madhya Pradesh",
    country: "India",
    languages: ["English", "Hindi"],
    employmentStatus: "employed",
    skills: ["Playwright", "Cypress", "JavaScript", "TypeScript", "Postman", "Jest", "Git"],
    bio: "QA engineer with 3 years specializing in automated end-to-end testing, Playwright suites, and CI/CD quality gates.",
    education: [
      {
        institution: "Symbiosis Institute of Technology",
        degree: "B.Tech Computer Science",
        startYear: 2018,
        endYear: 2022,
        cgpa: 8.0,
      },
    ],
    experience: [
      {
        company: "TestNova Systems",
        position: "QA Automation Engineer",
        description: "Built 150+ Playwright automated test scripts for cloud SaaS dashboards.",
        startDate: new Date("2022-08-01"),
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "playwright-reporter",
        description: "Custom Playwright test reporter posting instant test summaries.",
        technologies: ["TypeScript", "Playwright"],
      },
    ],
    certifications: [{ name: "ISTQB Certified Tester", issuer: "ISTQB" }],
    resumeLines: [
      "Ishita Verma - QA Automation Engineer",
      "Indore, Madhya Pradesh, India | ishita.verma@example.com | +91 98930 66412",
      "",
      "SKILLS: Playwright, Cypress, JavaScript, TypeScript, Postman, Jest, Git",
    ],
  },
  {
    email: "karan.patel@example.com",
    name: "Karan Patel",
    headline: "Full Stack Engineer (React, Node.js & Java)",
    location: "Ahmedabad, Gujarat, India",
    phone: "+91 99086 20347",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    employmentStatus: "employed",
    skills: ["React", "Node.js", "Express", "MongoDB", "Java", "Spring Boot", "REST APIs", "AWS"],
    bio: "Full stack developer with 3.5 years building scalable web applications and enterprise microservices.",
    education: [
      {
        institution: "Nirma University",
        degree: "B.Tech Computer Science",
        startYear: 2017,
        endYear: 2021,
        cgpa: 8.0,
      },
    ],
    experience: [
      {
        company: "NexBank Digital",
        position: "Full Stack Engineer",
        description: "Built React portal and Node.js microservices.",
        startDate: new Date("2021-07-01"),
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "taskflow-realtime",
        description: "Collaborative project management board with live WebSocket updates.",
        technologies: ["React", "Node.js", "MongoDB"],
      },
    ],
    certifications: [{ name: "AWS Certified Solutions Architect", issuer: "AWS" }],
    resumeLines: [
      "Karan Patel - Full Stack Engineer",
      "Ahmedabad, Gujarat, India | karan.patel@example.com | +91 99086 20347",
      "",
      "SKILLS: React, Node.js, Express, MongoDB, Java, Spring Boot, REST APIs, AWS",
    ],
  },
  {
    email: "ananya.iyer@example.com",
    name: "Ananya Iyer",
    headline: "Mobile & Frontend Engineer (React Native & Flutter)",
    location: "Ahmedabad, Gujarat, India",
    phone: "+91 99090 12301",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi", "Gujarati"],
    employmentStatus: "employed",
    skills: ["React", "React Native", "Flutter", "TypeScript", "Tailwind CSS", "Jest", "Git"],
    bio: "Mobile engineer with 3 years experience creating cross-platform iOS/Android apps in React Native and Flutter.",
    education: [
      {
        institution: "Nirma University",
        degree: "B.E. Computer Engineering",
        startYear: 2018,
        endYear: 2022,
        cgpa: 8.4,
      },
    ],
    experience: [
      {
        company: "AppSphere Technologies",
        position: "Mobile Engineer",
        description: "Built cross-platform mobile apps using React Native and Flutter.",
        startDate: new Date("2022-07-01"),
        currentlyWorking: true,
      },
    ],
    projects: [
      {
        title: "fin-tracker-mobile",
        description: "Personal expense tracking mobile app with biometric auth.",
        technologies: ["React Native", "TypeScript", "Redux"],
      },
    ],
    certifications: [{ name: "Flutter Certified Application Developer", issuer: "Google" }],
    resumeLines: [
      "Ananya Iyer - Mobile & Frontend Engineer",
      "Ahmedabad, Gujarat, India | ananya.iyer@example.com | +91 99090 12301",
      "",
      "SKILLS: React, React Native, Flutter, TypeScript, Tailwind CSS, Jest, Git",
    ],
  },
  {
    email: "candidate.selenium.1794060204532@example.test",
    name: "Selenium Test Candidate",
    headline: "QA Automation & Integration Specialist",
    location: "Surat, Gujarat, India",
    phone: "+91 98000 00001",
    city: "Surat",
    state: "Gujarat",
    country: "India",
    languages: ["English", "Hindi"],
    employmentStatus: "student",
    skills: ["Selenium", "Playwright", "JavaScript", "Python", "REST APIs", "Jest", "Git"],
    bio: "Automated testing and QA specialist focused on end-to-end regression suites and continuous quality gates.",
    education: [
      {
        institution: "SRIMCA - Uka Tarsadia University",
        degree: "Master of Computer Applications",
        startYear: 2024,
        endYear: 2026,
        cgpa: 8.5,
      },
    ],
    experience: [],
    projects: [
      {
        title: "e2e-test-suite",
        description: "Automated regression testing pipeline with Selenium and Playwright.",
        technologies: ["Selenium", "JavaScript", "Jest"],
      },
    ],
    certifications: [],
    resumeLines: [
      "Selenium Test Candidate - QA Automation Specialist",
      "Surat, Gujarat, India | candidate.selenium.1794060204532@example.test",
      "",
      "SKILLS: Selenium, Playwright, JavaScript, Python, REST APIs, Jest, Git",
    ],
  },
];

const JOBS_DATA = [
  // Apex Innovations (Surat)
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Senior Full Stack Engineer (MERN)",
    location: "Pune, Maharashtra, India",
    salary: 1600000,
    compensation: { min: 1400000, max: 2200000, currency: "INR", period: "year" },
    experience: "3-6 years",
    minExpYears: 3,
    maxExpYears: 6,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 20,
    requiredSkills: ["React", "Node.js", "Express", "MongoDB", "REST APIs"],
    preferredSkills: ["TypeScript", "Docker", "Tailwind CSS", "Redis"],
    skills: ["React", "Node.js", "Express", "MongoDB", "REST APIs", "TypeScript", "Docker", "Tailwind CSS", "Redis"],
    description:
      "Apex Innovations is seeking an experienced Senior Full Stack Engineer to build next-generation cloud SaaS applications using the MERN stack. " +
      "You will lead feature architecture, optimize database queries, design secure authentication flows, and mentor junior engineers.\n\n" +
      "Requirements:\n" +
      "- 3+ years hands-on production experience in Node.js, Express, React, and MongoDB.\n" +
      "- Deep understanding of asynchronous programming, RESTful API design, and JWT security.\n" +
      "- Familiarity with Docker, Redis caching, and CI/CD pipelines.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "React Frontend Developer",
    location: "Surat, Gujarat, India",
    salary: 750000,
    compensation: { min: 600000, max: 1000000, currency: "INR", period: "year" },
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
      "Join our Surat engineering hub to create modern, responsive user interfaces in React and Tailwind CSS for enterprise clients.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Cloud Infrastructure Engineer",
    location: "Surat, Gujarat, India",
    salary: 1400000,
    compensation: { min: 1200000, max: 1800000, currency: "INR", period: "year" },
    experience: "2-5 years",
    minExpYears: 2,
    maxExpYears: 5,
    jobType: "Full-Time",
    workplaceMode: "remote",
    status: "published",
    publishedDaysAgo: 10,
    requiredSkills: ["AWS", "Docker", "Linux"],
    preferredSkills: ["Kubernetes", "CI/CD", "Terraform", "GitHub Actions"],
    skills: ["AWS", "Docker", "Linux", "Kubernetes", "CI/CD", "Terraform", "GitHub Actions"],
    description:
      "Manage scalable cloud infrastructure on AWS, configure multi-environment CI/CD workflows, and maintain containerized workloads.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "QA Automation Specialist",
    location: "Surat, Gujarat, India",
    salary: 650000,
    compensation: { min: 500000, max: 850000, currency: "INR", period: "year" },
    experience: "1-3 years",
    minExpYears: 1,
    maxExpYears: 3,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 8,
    requiredSkills: ["Playwright", "Jest", "JavaScript"],
    preferredSkills: ["Postman", "CI/CD", "TypeScript"],
    skills: ["Playwright", "Jest", "JavaScript", "Postman", "CI/CD", "TypeScript", "Git"],
    description:
      "Develop end-to-end regression test suites using Playwright and Jest for our web and API platforms.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "apex-innovations",
    recruiterEmail: "2025mca150@gmail.com",
    title: "Junior MERN Stack Developer",
    location: "Surat, Gujarat, India",
    salary: 500000,
    compensation: { min: 400000, max: 650000, currency: "INR", period: "year" },
    experience: "0-2 years",
    minExpYears: 0,
    maxExpYears: 2,
    jobType: "Full-Time",
    workplaceMode: "onsite",
    status: "published",
    publishedDaysAgo: 5,
    requiredSkills: ["React", "Node.js", "Express", "MongoDB"],
    preferredSkills: ["Tailwind CSS", "REST APIs", "Git"],
    skills: ["React", "Node.js", "Express", "MongoDB", "Tailwind CSS", "REST APIs", "Git"],
    description:
      "Ideal role for energetic freshers and junior developers looking to build robust web features on the MERN stack.",
    moderation: { status: "approved" },
  },

  // Nexus Byte Solutions (Bengaluru)
  {
    orgSlug: "nexus-byte-solutions",
    recruiterEmail: "rohit.sharma@nexusbyte.com",
    title: "Staff Distributed Systems Engineer",
    location: "Bengaluru, Karnataka, India",
    salary: 3200000,
    compensation: { min: 2800000, max: 4000000, currency: "INR", period: "year" },
    experience: "5-8 years",
    minExpYears: 5,
    maxExpYears: 8,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 25,
    requiredSkills: ["Node.js", "PostgreSQL", "Redis", "Distributed Systems"],
    preferredSkills: ["Kafka", "Docker", "Kubernetes", "AWS"],
    skills: ["Node.js", "PostgreSQL", "Redis", "Distributed Systems", "Kafka", "Docker", "Kubernetes", "AWS"],
    description:
      "Lead architectural design for high-throughput distributed transaction engines handling millions of daily events.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "nexus-byte-solutions",
    recruiterEmail: "rohit.sharma@nexusbyte.com",
    title: "Senior DevOps & Platform Engineer",
    location: "Bengaluru, Karnataka, India",
    salary: 2200000,
    compensation: { min: 1800000, max: 2600000, currency: "INR", period: "year" },
    experience: "3-6 years",
    minExpYears: 3,
    maxExpYears: 6,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 18,
    requiredSkills: ["Kubernetes", "AWS", "Terraform"],
    preferredSkills: ["Prometheus", "CI/CD", "Linux", "Docker"],
    skills: ["Kubernetes", "AWS", "Terraform", "Prometheus", "CI/CD", "Linux", "Docker"],
    description:
      "Architect and maintain multi-region Kubernetes clusters, automated GitOps pipelines, and cloud observability.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "nexus-byte-solutions",
    recruiterEmail: "rohit.sharma@nexusbyte.com",
    title: "Data Platform Architect",
    location: "Bengaluru, Karnataka, India",
    salary: 3000000,
    compensation: { min: 2500000, max: 3600000, currency: "INR", period: "year" },
    experience: "5-10 years",
    minExpYears: 5,
    maxExpYears: 10,
    jobType: "Full-Time",
    workplaceMode: "remote",
    status: "published",
    publishedDaysAgo: 14,
    requiredSkills: ["Python", "PostgreSQL", "Kafka"],
    preferredSkills: ["Spark", "Airflow", "AWS", "Snowflake"],
    skills: ["Python", "PostgreSQL", "Kafka", "Spark", "Airflow", "AWS", "Snowflake"],
    description:
      "Design real-time analytics data warehouses and ETL pipelines feeding downstream ML models.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "nexus-byte-solutions",
    recruiterEmail: "rohit.sharma@nexusbyte.com",
    title: "AI Solutions Engineer",
    location: "Bengaluru, Karnataka, India",
    salary: 2400000,
    compensation: { min: 2000000, max: 3000000, currency: "INR", period: "year" },
    experience: "2-5 years",
    minExpYears: 2,
    maxExpYears: 5,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "draft",
    publishedDaysAgo: 0,
    requiredSkills: ["Python", "FastAPI", "React"],
    preferredSkills: ["LLM Orchestration", "Vector Databases", "Docker"],
    skills: ["Python", "FastAPI", "React", "LLM Orchestration", "Vector Databases", "Docker"],
    description:
      "Develop internal LLM copilot workflows and vector search pipelines for our enterprise analytics suite.",
    moderation: { status: "pending" },
  },

  // Zenith Technologies (Mumbai)
  {
    orgSlug: "zenith-technologies",
    recruiterEmail: "kavya.nair@zenithlabs.in",
    title: "Lead Fintech Security Engineer",
    location: "Mumbai, Maharashtra, India",
    salary: 2600000,
    compensation: { min: 2200000, max: 3200000, currency: "INR", period: "year" },
    experience: "4-8 years",
    minExpYears: 4,
    maxExpYears: 8,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 15,
    requiredSkills: ["Node.js", "JWT Auth", "PostgreSQL"],
    preferredSkills: ["PCI-DSS", "OAuth2", "Security Auditing", "AWS"],
    skills: ["Node.js", "JWT Auth", "PostgreSQL", "PCI-DSS", "OAuth2", "Security Auditing", "AWS"],
    description:
      "Ensure compliance and robust security across our core financial disbursement and payment gateway infrastructure.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "zenith-technologies",
    recruiterEmail: "kavya.nair@zenithlabs.in",
    title: "Senior Backend Java Engineer",
    location: "Mumbai, Maharashtra, India",
    salary: 1900000,
    compensation: { min: 1600000, max: 2400000, currency: "INR", period: "year" },
    experience: "3-6 years",
    minExpYears: 3,
    maxExpYears: 6,
    jobType: "Full-Time",
    workplaceMode: "onsite",
    status: "published",
    publishedDaysAgo: 12,
    requiredSkills: ["Java", "Spring Boot", "PostgreSQL"],
    preferredSkills: ["Microservices", "Kafka", "Docker", "Redis"],
    skills: ["Java", "Spring Boot", "PostgreSQL", "Microservices", "Kafka", "Docker", "Redis"],
    description:
      "Develop low-latency digital banking microservices handling core banking accounting transactions.",
    moderation: { status: "approved" },
  },
  {
    orgSlug: "zenith-technologies",
    recruiterEmail: "kavya.nair@zenithlabs.in",
    title: "Mobile Banking Lead (Flutter & React Native)",
    location: "Mumbai, Maharashtra, India",
    salary: 1800000,
    compensation: { min: 1500000, max: 2200000, currency: "INR", period: "year" },
    experience: "3-5 years",
    minExpYears: 3,
    maxExpYears: 5,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 9,
    requiredSkills: ["Flutter", "React Native", "TypeScript"],
    preferredSkills: ["Mobile Security", "Biometric Auth", "REST APIs", "Jest"],
    skills: ["Flutter", "React Native", "TypeScript", "Mobile Security", "Biometric Auth", "REST APIs", "Jest"],
    description:
      "Lead cross-platform mobile app development for our consumer banking and digital payment applications.",
    moderation: { status: "approved" },
  },

  // CloudNova Systems (Pune)
  {
    orgSlug: "cloudnova-systems",
    recruiterEmail: "neha.patel@cloudforge.io",
    title: "Site Reliability Engineer",
    location: "Pune, Maharashtra, India",
    salary: 1400000,
    compensation: { min: 1200000, max: 1800000, currency: "INR", period: "year" },
    experience: "2-5 years",
    minExpYears: 2,
    maxExpYears: 5,
    jobType: "Full-Time",
    workplaceMode: "remote",
    status: "published",
    publishedDaysAgo: 7,
    requiredSkills: ["AWS", "Kubernetes", "Linux"],
    preferredSkills: ["Prometheus", "Terraform", "CI/CD", "Docker"],
    skills: ["AWS", "Kubernetes", "Linux", "Prometheus", "Terraform", "CI/CD", "Docker"],
    description:
      "Maintain 99.95% uptime SLA for multi-tenant SaaS services on Kubernetes and AWS.",
    moderation: { status: "approved" },
  },

  // ByteScale Technologies (Hyderabad)
  {
    orgSlug: "bytescale-technologies",
    recruiterEmail: "amit.verma@bytescale.tech",
    title: "Big Data Pipeline Engineer",
    location: "Hyderabad, Telangana, India",
    salary: 1300000,
    compensation: { min: 1000000, max: 1600000, currency: "INR", period: "year" },
    experience: "2-4 years",
    minExpYears: 2,
    maxExpYears: 4,
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    publishedDaysAgo: 11,
    requiredSkills: ["Python", "PostgreSQL", "Node.js"],
    preferredSkills: ["Kafka", "Spark", "Docker", "REST APIs"],
    skills: ["Python", "PostgreSQL", "Node.js", "Kafka", "Spark", "Docker", "REST APIs"],
    description:
      "Build scalable streaming ingestion pipelines and merchant transaction aggregators in Python and Node.js.",
    moderation: { status: "approved" },
  },
];

const APPLICATIONS_DATA = [
  // Anas Tai Applications
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Senior Full Stack Engineer (MERN)",
    orgSlug: "apex-innovations",
    status: "hired",
    appliedDaysAgo: 24,
    tags: ["top-candidate", "mca-lead"],
    offer: {
      status: "accepted",
      designation: "Full Stack Engineer",
      ctc: 1600000,
      currency: "INR",
      payFrequency: "annual",
      baseSalary: 1400000,
      bonus: 200000,
      joiningDate: inDays(15),
      expiresAt: daysAgo(5),
      employmentType: "full_time",
      notes: "Congratulations! We are delighted to offer you the Full Stack Engineer role at Apex Innovations.",
    },
    history: [
      ["submitted", "candidate", "Applied with resume and GitHub portfolio", 24],
      ["under_review", "recruiter", "Impressive MERN stack codebase in HireSmart-AI.", 20],
      ["shortlisted", "recruiter", "Shortlisted for technical evaluation round.", 16],
      ["interview", "recruiter", "Technical round completed with 96/100 score.", 10],
      ["offer", "recruiter", "Official offer letter issued: ₹16.0 LPA CTC.", 6],
      ["hired", "candidate", "Offer accepted; confirmed joining in 15 days.", 2],
    ],
    notes: "Outstanding candidate with proven MERN architecture mastery and clear system design thinking.",
    match: {
      overallScore: 96,
      confidence: 0.96,
      matchedSkills: ["React", "Node.js", "Express", "MongoDB", "REST APIs", "Tailwind CSS", "Git", "JWT Auth"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["Redis"],
      componentScores: { requiredSkills: 98, preferredSkills: 92, experience: 88, education: 95, semantic: 96 },
      strengths: ["Strong MERN portfolio", "Surat based local talent", "Clean REST and JWT implementation"],
      recommendation: "Strongly Recommended",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "React Frontend Developer",
    orgSlug: "apex-innovations",
    status: "offer",
    appliedDaysAgo: 14,
    tags: ["offer-issued"],
    offer: {
      status: "issued",
      designation: "React Frontend Developer",
      ctc: 750000,
      currency: "INR",
      payFrequency: "annual",
      baseSalary: 700000,
      bonus: 50000,
      joiningDate: inDays(30),
      expiresAt: inDays(7),
      employmentType: "full_time",
      notes: "Offer extended based on excellent React UI live coding round.",
    },
    history: [
      ["submitted", "candidate", "Application submitted", 14],
      ["under_review", "recruiter", "Portfolio UI projects evaluated.", 11],
      ["shortlisted", "recruiter", "Selected for direct frontend interview.", 8],
      ["interview", "recruiter", "Live component design round completed with strong_yes.", 4],
      ["offer", "recruiter", "Official offer extended at ₹7.5 LPA CTC.", 1],
    ],
    notes: "Demonstrated strong knowledge of React hooks, Tailwind CSS, and state management.",
    match: {
      overallScore: 94,
      confidence: 0.95,
      matchedSkills: ["React", "JavaScript", "Tailwind CSS", "REST APIs", "Jest", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 96, preferredSkills: 90, experience: 85, education: 95, semantic: 94 },
      strengths: ["Fast UI prototyping", "Clean Tailwind CSS mastery"],
      recommendation: "Recommended",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Staff Distributed Systems Engineer",
    orgSlug: "nexus-byte-solutions",
    status: "interview",
    appliedDaysAgo: 8,
    tags: ["interview-scheduled"],
    history: [
      ["submitted", "candidate", "Application submitted", 8],
      ["under_review", "recruiter", "Backend architecture review.", 6],
      ["shortlisted", "recruiter", "Shortlisted for distributed systems technical round.", 4],
      ["interview", "recruiter", "Interview scheduled with VP of Engineering.", 1],
    ],
    notes: "Shortlisted for live architecture discussion.",
    match: {
      overallScore: 89,
      confidence: 0.91,
      matchedSkills: ["Node.js", "REST APIs", "Docker", "Git", "PostgreSQL"],
      missingRequiredSkills: ["Distributed Systems"],
      missingPreferredSkills: ["Kafka"],
      componentScores: { requiredSkills: 88, preferredSkills: 85, experience: 82, education: 95, semantic: 90 },
      strengths: ["Strong Node.js fundamentals", "High enthusiasm"],
      recommendation: "Proceed to Interview",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Lead Fintech Security Engineer",
    orgSlug: "zenith-technologies",
    status: "shortlisted",
    appliedDaysAgo: 12,
    tags: [],
    history: [
      ["submitted", "candidate", "Application submitted", 12],
      ["under_review", "recruiter", "JWT authentication and security practices evaluated.", 9],
      ["shortlisted", "recruiter", "Shortlisted for security assessment round.", 5],
    ],
    notes: "Good candidate for security & auth implementation.",
    match: {
      overallScore: 87,
      confidence: 0.89,
      matchedSkills: ["Node.js", "JWT Auth", "REST APIs", "PostgreSQL", "Git"],
      missingRequiredSkills: ["PCI-DSS"],
      missingPreferredSkills: ["OAuth2"],
      componentScores: { requiredSkills: 86, preferredSkills: 82, experience: 80, education: 95, semantic: 88 },
      strengths: ["Solid JWT authentication practices in HireSmart-AI"],
      recommendation: "Shortlisted",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Cloud Infrastructure Engineer",
    orgSlug: "apex-innovations",
    status: "under_review",
    appliedDaysAgo: 5,
    tags: [],
    history: [
      ["submitted", "candidate", "Application submitted", 5],
      ["under_review", "recruiter", "Evaluating cloud deployment experience.", 2],
    ],
    notes: [],
    match: {
      overallScore: 84,
      confidence: 0.88,
      matchedSkills: ["AWS", "Docker", "Linux", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["Kubernetes", "Terraform"],
      componentScores: { requiredSkills: 85, preferredSkills: 80, experience: 80, education: 95, semantic: 84 },
      strengths: ["Hands-on Docker containerization experience"],
      recommendation: "Under Review",
    },
  },
  {
    candidateEmail: "tanastai5018@gmail.com",
    jobTitle: "Site Reliability Engineer",
    orgSlug: "cloudnova-systems",
    status: "submitted",
    appliedDaysAgo: 2,
    tags: [],
    history: [["submitted", "candidate", "Application submitted with verified resume", 2]],
    notes: [],
    match: {
      overallScore: 81,
      confidence: 0.85,
      matchedSkills: ["AWS", "Docker", "Linux", "Git"],
      missingRequiredSkills: ["Kubernetes"],
      missingPreferredSkills: ["Prometheus"],
      componentScores: { requiredSkills: 78, preferredSkills: 78, experience: 78, education: 90, semantic: 82 },
      strengths: ["Quick learner"],
      recommendation: "Under Review",
    },
  },

  // Priya Sharma Applications
  {
    candidateEmail: "priya.sharma@example.com",
    jobTitle: "React Frontend Developer",
    orgSlug: "apex-innovations",
    status: "hired",
    appliedDaysAgo: 28,
    tags: ["placed"],
    offer: {
      status: "accepted",
      designation: "React Frontend Developer",
      ctc: 750000,
      currency: "INR",
      payFrequency: "annual",
      baseSalary: 700000,
      bonus: 50000,
      joiningDate: daysAgo(10),
      employmentType: "full_time",
      notes: "Offer accepted; onboarding completed.",
    },
    history: [
      ["submitted", "candidate", "Applied for React Frontend role", 28],
      ["under_review", "recruiter", "Screened 3 years frontend experience.", 24],
      ["shortlisted", "recruiter", "Shortlisted for technical rounds.", 18],
      ["interview", "recruiter", "Technical round completed with great score.", 12],
      ["offer", "recruiter", "Offer extended at ₹7.5 LPA CTC.", 8],
      ["hired", "candidate", "Offer accepted; active on the team.", 4],
    ],
    notes: "Solid Redux and state management fundamentals.",
    match: {
      overallScore: 93,
      confidence: 0.95,
      matchedSkills: ["React", "JavaScript", "Tailwind CSS", "Redux", "REST APIs", "Jest", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["TypeScript"],
      componentScores: { requiredSkills: 95, preferredSkills: 90, experience: 92, education: 90, semantic: 94 },
      strengths: ["3 years production React experience"],
      recommendation: "Hired",
    },
  },

  // Vikram Nair Applications
  {
    candidateEmail: "vikram.nair@example.com",
    jobTitle: "Senior DevOps & Platform Engineer",
    orgSlug: "nexus-byte-solutions",
    status: "interview",
    appliedDaysAgo: 10,
    tags: ["k8s-expert"],
    history: [
      ["submitted", "candidate", "Applied for Senior DevOps role", 10],
      ["under_review", "recruiter", "Verified CKA certification and AWS experience.", 7],
      ["shortlisted", "recruiter", "Shortlisted for panel interview.", 4],
      ["interview", "recruiter", "Technical panel interview scheduled.", 1],
    ],
    notes: "Demonstrates deep knowledge of multi-region Kubernetes clusters.",
    match: {
      overallScore: 95,
      confidence: 0.96,
      matchedSkills: ["Kubernetes", "AWS", "Terraform", "Docker", "Linux", "CI/CD"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 98, preferredSkills: 94, experience: 94, education: 90, semantic: 95 },
      strengths: ["CKA Certified", "Extensive Terraform automation"],
      recommendation: "Strongly Recommended",
    },
  },

  // Sneha Kulkarni Applications
  {
    candidateEmail: "sneha.kulkarni@example.com",
    jobTitle: "Site Reliability Engineer",
    orgSlug: "cloudnova-systems",
    status: "hired",
    appliedDaysAgo: 30,
    tags: ["placed"],
    offer: {
      status: "accepted",
      designation: "Site Reliability Engineer",
      ctc: 1400000,
      currency: "INR",
      payFrequency: "annual",
      baseSalary: 1300000,
      bonus: 100000,
      joiningDate: daysAgo(12),
      employmentType: "full_time",
      notes: "Welcome to the CloudNova Systems team!",
    },
    history: [
      ["submitted", "candidate", "Applied for SRE role", 30],
      ["under_review", "recruiter", "Reviewing AWS and Kubernetes background.", 25],
      ["shortlisted", "recruiter", "Shortlisted for technical round.", 20],
      ["interview", "recruiter", "Panel interview completed with strong_yes.", 15],
      ["offer", "recruiter", "Offer extended at ₹14.0 LPA CTC.", 10],
      ["hired", "candidate", "Offer accepted; active on duty.", 5],
    ],
    notes: "Calm incident management and great Kubernetes troubleshooting.",
    match: {
      overallScore: 96,
      confidence: 0.97,
      matchedSkills: ["AWS", "Kubernetes", "Linux", "Docker", "Terraform", "CI/CD"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 98, preferredSkills: 96, experience: 95, education: 92, semantic: 96 },
      strengths: ["Exceptional Kubernetes troubleshooting", "Calm incident management"],
      recommendation: "Hired",
    },
  },

  // Arjun Mehta Applications
  {
    candidateEmail: "arjun.mehta@example.com",
    jobTitle: "Junior MERN Stack Developer",
    orgSlug: "apex-innovations",
    status: "shortlisted",
    appliedDaysAgo: 6,
    tags: ["fresher"],
    history: [
      ["submitted", "candidate", "Applied for Junior MERN role", 6],
      ["under_review", "recruiter", "Reviewing React and Tailwind portfolio.", 4],
      ["shortlisted", "recruiter", "Shortlisted for technical round.", 2],
    ],
    notes: "Good UI skills; ready for technical screening.",
    match: {
      overallScore: 88,
      confidence: 0.90,
      matchedSkills: ["React", "JavaScript", "Tailwind CSS", "REST APIs", "Git"],
      missingRequiredSkills: ["Node.js", "Express", "MongoDB"],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 82, preferredSkills: 90, experience: 80, education: 92, semantic: 88 },
      strengths: ["Clean React component structure"],
      recommendation: "Shortlisted",
    },
  },

  // Ishita Verma Applications
  {
    candidateEmail: "ishita.verma@example.com",
    jobTitle: "QA Automation Specialist",
    orgSlug: "apex-innovations",
    status: "interview",
    appliedDaysAgo: 7,
    tags: ["automation"],
    history: [
      ["submitted", "candidate", "Applied for QA Automation opening", 7],
      ["under_review", "recruiter", "Evaluating Playwright experience.", 5],
      ["shortlisted", "recruiter", "Shortlisted for automation coding round.", 3],
      ["interview", "recruiter", "Technical interview scheduled.", 1],
    ],
    notes: "Extensive Playwright test automation experience.",
    match: {
      overallScore: 92,
      confidence: 0.94,
      matchedSkills: ["Playwright", "Jest", "JavaScript", "Postman", "CI/CD", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      componentScores: { requiredSkills: 95, preferredSkills: 92, experience: 90, education: 88, semantic: 92 },
      strengths: ["Author of 150+ automated Playwright scripts"],
      recommendation: "Proceed to Interview",
    },
  },

  // Karan Patel Applications
  {
    candidateEmail: "karan.patel@example.com",
    jobTitle: "Senior Backend Java Engineer",
    orgSlug: "zenith-technologies",
    status: "shortlisted",
    appliedDaysAgo: 9,
    tags: [],
    history: [
      ["submitted", "candidate", "Applied for Java Backend position", 9],
      ["under_review", "recruiter", "Reviewing Spring Boot and microservices.", 6],
      ["shortlisted", "recruiter", "Shortlisted for system architecture round.", 2],
    ],
    notes: "Strong enterprise Java background.",
    match: {
      overallScore: 91,
      confidence: 0.93,
      matchedSkills: ["Java", "Spring Boot", "PostgreSQL", "Microservices", "Docker"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["Kafka"],
      componentScores: { requiredSkills: 94, preferredSkills: 88, experience: 90, education: 88, semantic: 91 },
      strengths: ["3.5 years Java Spring Boot experience"],
      recommendation: "Shortlisted",
    },
  },

  // Ananya Iyer Applications
  {
    candidateEmail: "ananya.iyer@example.com",
    jobTitle: "Mobile Banking Lead (Flutter & React Native)",
    orgSlug: "zenith-technologies",
    status: "interview",
    appliedDaysAgo: 8,
    tags: ["mobile-expert"],
    history: [
      ["submitted", "candidate", "Applied for Mobile Banking Lead", 8],
      ["under_review", "recruiter", "Reviewing React Native and Flutter apps.", 5],
      ["shortlisted", "recruiter", "Shortlisted for mobile architecture interview.", 3],
      ["interview", "recruiter", "Interview scheduled.", 1],
    ],
    notes: "Impressive cross-platform mobile architecture.",
    match: {
      overallScore: 94,
      confidence: 0.95,
      matchedSkills: ["Flutter", "React Native", "TypeScript", "REST APIs", "Jest"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["Biometric Auth"],
      componentScores: { requiredSkills: 96, preferredSkills: 90, experience: 92, education: 90, semantic: 94 },
      strengths: ["Dual Flutter and React Native expertise"],
      recommendation: "Proceed to Interview",
    },
  },

  // Selenium Candidate Application
  {
    candidateEmail: "candidate.selenium.1794060204532@example.test",
    jobTitle: "QA Automation Specialist",
    orgSlug: "apex-innovations",
    status: "under_review",
    appliedDaysAgo: 4,
    tags: ["qa-pool"],
    history: [
      ["submitted", "candidate", "Application submitted", 4],
      ["under_review", "recruiter", "Evaluating Selenium and automation scripts.", 1],
    ],
    notes: "Testing candidate account for integration runs.",
    match: {
      overallScore: 86,
      confidence: 0.88,
      matchedSkills: ["Playwright", "JavaScript", "Jest", "Git"],
      missingRequiredSkills: [],
      missingPreferredSkills: ["Postman"],
      componentScores: { requiredSkills: 88, preferredSkills: 82, experience: 80, education: 88, semantic: 86 },
      strengths: ["Solid automated test fundamentals"],
      recommendation: "Under Review",
    },
  },
];

/* =========================================================================
   SEED FUNCTION
   ========================================================================= */

async function runSeed({ dryRun = false, confirmReset = false }) {
  await connectDB();
  const db = mongoose.connection.db;

  console.log("================================================================================");
  console.log("       HIRESMART-AI: FRESH DEMO RESET & SYSTEM-ALIGNED SEEDER                   ");
  console.log("================================================================================");
  console.log(`Connected Database: "${db.databaseName}"`);
  console.log(`Environment:        "${process.env.NODE_ENV}"`);
  console.log(`Mode:               ${dryRun ? "DRY-RUN (No changes applied)" : "EXECUTION"}`);
  console.log("================================================================================\n");

  // Step 1: Inspect and verify existing users (PRESERVE ALL)
  const existingUsers = await User.find({}).select("+password").lean();
  console.log(`[SAFETY CHECK] Existing User Accounts: ${existingUsers.length}`);
  if (existingUsers.length === 0) {
    throw new Error("No existing user accounts found. Aborting safety reset.");
  }

  console.log("\nPreserved Accounts:");
  existingUsers.forEach((u, i) => {
    console.log(
      `  ${i + 1}. [${u.role.toUpperCase()}] ${u.email} (ID: ${u._id}) - Password Hash Intact (len: ${
        (u.password || "").length
      })`
    );
  });

  // Step 2: Collection Counts
  const collections = await db.listCollections().toArray();
  const currentCounts = {};
  for (const c of collections) {
    currentCounts[c.name] = await db.collection(c.name).countDocuments();
  }

  console.log("\nCurrent Database Collections & Document Counts:");
  console.log(JSON.stringify(currentCounts, null, 2));

  if (dryRun) {
    console.log("\n================================================================================");
    console.log("DRY-RUN COMPLETE. No data was deleted or inserted.");
    console.log("To execute the fresh reset and seed, run:");
    console.log("  node scripts/seed-fresh-demo.js --confirm-reset");
    console.log("================================================================================");
    await disconnectDB();
    return;
  }

  if (!confirmReset) {
    throw new Error(
      "Safety rule: --confirm-reset flag is required to perform the reset. Nothing was deleted."
    );
  }

  // Step 3: Complete Verified Backup
  console.log("\n>>> CREATING COMPLETE DATABASE BACKUP BEFORE ANY DELETION...");
  await disconnectDB();
  const { dir: backupDir, manifest } = await backupDatabase();
  console.log(`✓ Backup confirmed at: ${backupDir}`);
  console.log(`✓ Total documents backed up: ${manifest.totalDocuments}\n`);

  await connectDB();
  const activeDb = mongoose.connection.db;

  // Step 4: Clear Obsolete Application Records (PRESERVE users, platformsettings, razorpayplans)
  const COLLECTIONS_TO_CLEAR = [
    "placements",
    "candidatematches",
    "parsedresumes",
    "aianalyses",
    "googlecalendarconnections",
    "paymenttransactions",
    "notes",
    "resumes",
    "resumeversions",
    "organizations",
    "recommendationsnapshots",
    "interviews",
    "jobalerts",
    "searchhistories",
    "jobruns",
    "securityevents",
    "idempotencyrecords",
    "subscriptions",
    "candidateprofiles",
    "auditlogs",
    "jobs",
    "companyverificationcases",
    "jobmoderationevents",
    "invites",
    "notifications",
    "paymentwebhookevents",
    "memberships",
    "applications",
    "authsessions",
    "consents",
  ];

  console.log(">>> REMOVING OBSOLETE BUSINESS/APPLICATION DATA (PRESERVING USERS & CONFIG)...");
  for (const colName of COLLECTIONS_TO_CLEAR) {
    const exists = collections.some((c) => c.name === colName);
    if (exists) {
      const res = await activeDb.collection(colName).deleteMany({});
      console.log(`  - Cleared "${colName}": ${res.deletedCount} documents removed.`);
    }
  }

  // Ensure all existing users are set to active and emailVerified: true (preserving passwords intact)
  await User.updateMany(
    {},
    {
      $set: {
        accountStatus: "active",
        emailVerified: true,
        isActive: true,
        onboardingCompleted: true,
      },
    }
  );
  console.log(`✓ Verified and ensured active login status for all ${existingUsers.length} user accounts.`);

  const admin = existingUsers.find((u) => u.role === "admin");

  // Step 5: Seed Fresh Verified Organizations
  console.log("\n>>> SEEDING FRESH ORGANIZATIONS & COMPANY VERIFICATION CASES...");
  const orgMap = {};
  for (const orgData of ORGANIZATIONS_DATA) {
    const org = await Organization.create(orgData);
    orgMap[orgData.slug] = org;
    console.log(`  + Created Organization: "${org.name}" [${org.verificationStatus}] (${org.slug})`);

    // Create CompanyVerificationCase
    const isVerified = org.verificationStatus === "verified";
    const isRejected = org.verificationStatus === "rejected";
    const assessment = isVerified
      ? "verified_evidence"
      : isRejected
      ? "suspicious_indicators"
      : "manual_review";

    await CompanyVerificationCase.create({
      organization: org._id,
      status: org.verificationStatus,
      assessment,
      decision: {
        by: isVerified || isRejected ? (admin ? admin._id : null) : null,
        at: isVerified ? org.verifiedAt : isRejected ? daysAgo(2) : null,
        reason: isRejected
          ? (org.rejectionReason || "Verification failed.")
          : "Verified against official MCA and GST registries.",
      },
      evidence: (org.documents || []).map((doc) => ({
        type: doc.type === "gstin_certificate" ? "business_registration" : "document_review",
        value: doc.fileName,
        source: "recruiter_upload",
        method: "manual_review",
        result: isVerified ? "match" : isRejected ? "mismatch" : "not_checked",
        note: `Document inspected: ${doc.fileName}`,
        verified: isVerified,
      })),
      statusHistory: [
        {
          from: "pending",
          to: org.verificationStatus,
          action: "status_change",
          by: admin ? admin._id : null,
          reason: org.rejectionReason || "Initial review completed.",
          at: org.verifiedAt || new Date(),
        },
      ],
    });
  }

  // Step 6: Seed Recruiter Memberships
  console.log("\n>>> LINKING RECRUITER USERS TO ORGANIZATIONS...");
  const userMap = {};
  for (const u of existingUsers) {
    userMap[u.email] = u;
  }

  for (const map of RECRUITER_MAPPINGS) {
    const user = userMap[map.email];
    const org = orgMap[map.orgSlug];
    if (user && org) {
      await Membership.create({
        organization: org._id,
        user: user._id,
        role: map.role,
        status: "active",
      });
      console.log(`  + Membership: ${user.email} -> ${org.name} [${map.role}]`);
    }
  }

  // Step 7: Seed Candidate Profiles, Consents & Resumes
  console.log("\n>>> SEEDING CANDIDATE PROFILES, CONSENTS & RESUMES...");
  for (const cand of CANDIDATE_PROFILES_DATA) {
    const user = userMap[cand.email];
    if (!user) continue;

    // Consents
    for (const purpose of ["terms", "privacy", "ai_processing"]) {
      await Consent.create({
        user: user._id,
        purpose,
        policyVersion: "2026-v1",
        source: "settings",
        grantedAt: daysAgo(30),
      });
    }

    // Candidate Profile
    await CandidateProfile.create({
      user: user._id,
      headline: cand.headline,
      location: cand.location,
      phone: cand.phone,
      bio: cand.bio,
      gender: "Other",
      city: cand.city,
      state: cand.state,
      country: cand.country,
      languages: cand.languages,
      employmentStatus: cand.employmentStatus,
      skills: cand.skills,
      socialLinks: cand.socialLinks || {},
      education: cand.education || [],
      experience: cand.experience || [],
      projects: cand.projects || [],
      certifications: cand.certifications || [],
    });

    // Create Resume & ResumeVersion
    const pdfBuffer = buildPdf(cand.resumeLines || [`${cand.name} - Resume`, `Email: ${cand.email}`]);
    const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    const resume = await Resume.create({
      candidate: user._id,
      label: "Primary resume",
      isPrimary: true,
      status: "active",
    });

    const resumeVersion = await ResumeVersion.create({
      resume: resume._id,
      candidate: user._id,
      version: 1,
      originalName: `${cand.name.replace(/ /g, "_")}_Resume.pdf`,
      mimeType: "application/pdf",
      size: pdfBuffer.length,
      sha256,
      storageKey: `demo-resumes/${user._id}/v1.pdf`,
      storageProvider: "local",
      processingStatus: "ready",
      text: (cand.resumeLines || []).join("\n"),
    });

    resume.currentVersion = resumeVersion._id;
    await resume.save();

    await ParsedResume.create({
      candidate: user._id,
      resumeVersion: resumeVersion._id,
      contact: {
        email: cand.email,
        phone: cand.phone,
        linkedin: cand.socialLinks?.linkedin || "",
        github: cand.socialLinks?.github || "",
        portfolio: cand.socialLinks?.portfolio || "",
      },
      skills: (cand.skills || []).map((s) => ({
        name: s,
        normalized: s.toLowerCase().trim(),
        confidence: 0.9,
        evidence: `Extracted from resume skills section: ${s}`,
      })),
      experiences: (cand.experience || []).map((e) => ({
        title: e.position || e.title || "Software Engineer",
        company: e.company || "",
        startDate: e.startDate || null,
        endDate: e.endDate || null,
        description: e.description || "",
        evidence: `${e.position || e.title} at ${e.company}`,
      })),
      education: (cand.education || []).map((edu) => ({
        degree: edu.degree || "",
        field: "Computer Science",
        institution: edu.institution || "",
        evidence: `${edu.degree} from ${edu.institution}`,
      })),
      experienceYears: cand.experience && cand.experience.length ? cand.experience.length * 2 : 1,
      confidence: 0.92,
    });

    user._resumeVersion = resumeVersion;
    console.log(`  + Candidate Profile & Resume: ${cand.name} (${cand.email})`);
  }

  // Step 8: Seed Jobs
  console.log("\n>>> SEEDING JOBS & REQUISITIONS...");
  const jobMap = {};
  for (const jobSpec of JOBS_DATA) {
    const org = orgMap[jobSpec.orgSlug];
    const recruiter = userMap[jobSpec.recruiterEmail];
    if (!org || !recruiter) continue;

    const job = await Job.create({
      organization: org._id,
      recruiter: recruiter._id,
      title: jobSpec.title,
      company: org.name,
      location: jobSpec.location,
      salary: jobSpec.salary,
      compensation: jobSpec.compensation,
      experience: jobSpec.experience,
      minExpYears: jobSpec.minExpYears,
      maxExpYears: jobSpec.maxExpYears,
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
    });

    jobMap[`${jobSpec.orgSlug}|${jobSpec.title}`] = job;
    console.log(`  + Created Job: "${job.title}" [${job.status}] at ${org.name}`);

    // Create JobModerationEvents following state machine (none -> pending -> approved)
    await JobModerationEvent.create({
      job: job._id,
      organization: org._id,
      area: "moderation",
      fromStatus: "",
      toStatus: "pending",
      actor: recruiter._id,
      reason: "Job submitted for platform review.",
    });

    if (job.moderation.status === "approved") {
      await JobModerationEvent.create({
        job: job._id,
        organization: org._id,
        area: "moderation",
        fromStatus: "pending",
        toStatus: "approved",
        actor: admin ? admin._id : recruiter._id,
        reason: "Job meets platform standards and was approved by administrator.",
      });
    }
  }

  // Step 9: Seed Applications, Offers & Candidate Matches
  console.log("\n>>> SEEDING APPLICATIONS, PIPELINE STAGES & OFFERS...");
  const applicationMap = {};
  for (const appSpec of APPLICATIONS_DATA) {
    const cand = userMap[appSpec.candidateEmail];
    const org = orgMap[appSpec.orgSlug];
    const job = jobMap[`${appSpec.orgSlug}|${appSpec.jobTitle}`];
    if (!cand || !org || !job) continue;

    const recruiter = userMap["2025mca150@gmail.com"] || cand;

    const app = await Application.create({
      organization: org._id,
      job: job._id,
      jobVersion: 1,
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
      offer: appSpec.offer || { status: "none" },
      resumeSnapshot: {
        storageKey: cand._resumeVersion?.storageKey || `demo-resumes/${cand._id}/v1.pdf`,
        provider: "local",
        originalName: cand._resumeVersion?.originalName || `${cand.name || "Candidate"}_Resume.pdf`,
        mimeType: "application/pdf",
        size: cand._resumeVersion?.size || 1024,
        text: cand._resumeVersion?.text || "",
      },
      resumeVersion: cand._resumeVersion ? cand._resumeVersion._id : null,
      source: "direct",
      tags: appSpec.tags || [],
      statusHistory: (appSpec.history || []).map((h, idx, arr) => ({
        status: h[0],
        fromStatus: idx > 0 ? arr[idx - 1][0] : "",
        changedAt: daysAgo(appSpec.appliedDaysAgo - (h[3] || 0)),
        changedBy: h[1] === "candidate" ? cand._id : recruiter._id,
        note: h[2] || "",
      })),
    });

    applicationMap[`${cand.email}|${job._id}`] = app;
    console.log(`  + Application: ${cand.email} -> "${job.title}" [${app.status}]`);

    // CandidateMatch score
    if (appSpec.match) {
      await CandidateMatch.create({
        organization: org._id,
        application: app._id,
        candidate: cand._id,
        job: job._id,
        jobVersion: 1,
        resumeVersion: cand._resumeVersion ? cand._resumeVersion._id : null,
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
      });
    }
  }

  // Step 10: Seed Interviews
  console.log("\n>>> SEEDING INTERVIEWS & SCORECARDS...");
  const apexRecruiter = userMap["2025mca150@gmail.com"];
  const anas = userMap["tanastai5018@gmail.com"];
  const priya = userMap["priya.sharma@example.com"];

  const apexInternJob = jobMap["apex-innovations|Senior Full Stack Engineer (MERN)"];
  const anasApexApp = apexInternJob ? applicationMap[`${anas.email}|${apexInternJob._id}`] : null;

  if (anas && apexInternJob && anasApexApp) {
    // Completed technical interview with scorecards
    await Interview.create({
      organization: apexInternJob.organization,
      application: anasApexApp._id,
      job: apexInternJob._id,
      candidate: anas._id,
      round: 1,
      title: "Technical Round: MERN Stack Architecture & REST APIs",
      type: "technical",
      status: "completed",
      scheduledStart: daysAgo(10),
      scheduledEnd: new Date(daysAgo(10).getTime() + 45 * 60 * 1000),
      timezone: "Asia/Kolkata",
      meetingProvider: "manual",
      meetingUrl: "https://meet.example.com/hsm-technical-round",
      participants: [apexRecruiter._id],
      createdBy: apexRecruiter._id,
      instructions: "Technical coding and architecture discussion.",
      feedback: [
        {
          evaluator: apexRecruiter._id,
          ratings: [
            { criterion: "React & State Management", score: 5, evidence: "Excellent grasp of custom hooks" },
            { criterion: "Node.js REST Design", score: 5, evidence: "Clean Express architecture" },
            { criterion: "Database Modeling", score: 4, evidence: "Good MongoDB schema design" },
          ],
          recommendation: "strong_yes",
          summary: "Outstanding full-stack engineering fundamentals. Highly recommended.",
          submittedAt: daysAgo(10),
        },
      ],
    });
    console.log(`  + Completed Technical Interview: Anas Tai at Apex Innovations`);
  }

  // Scheduled upcoming video interview for Anas Tai at Nexus Byte
  const nexusJob = jobMap["nexus-byte-solutions|Staff Distributed Systems Engineer"];
  const anasNexusApp = nexusJob ? applicationMap[`${anas.email}|${nexusJob._id}`] : null;
  const nexusRecruiter = userMap["rohit.sharma@nexusbyte.com"];

  if (anas && nexusJob && anasNexusApp && nexusRecruiter) {
    const interviewTime = inDays(3, 14, 0);
    await Interview.create({
      organization: nexusJob.organization,
      application: anasNexusApp._id,
      job: nexusJob._id,
      candidate: anas._id,
      round: 1,
      title: "Distributed Systems Architecture Interview",
      type: "video",
      status: "confirmed",
      scheduledStart: interviewTime,
      scheduledEnd: new Date(interviewTime.getTime() + 45 * 60 * 1000),
      timezone: "Asia/Kolkata",
      meetingProvider: "manual",
      meetingUrl: "https://meet.example.com/hsm-nexus-round",
      participants: [nexusRecruiter._id],
      createdBy: nexusRecruiter._id,
      instructions: "Please be ready to review distributed caching, indexing, and high-throughput API designs.",
    });
    console.log(`  + Scheduled Confirmed Interview: Anas Tai at Nexus Byte Solutions`);
  }

  // Step 11: Seed Placements & Employment
  console.log("\n>>> SEEDING PLACEMENTS & EMPLOYMENT RECORDS...");
  const PLACEMENTS_TO_SEED = [
    {
      candidate: anas,
      jobKey: "apex-innovations|Senior Full Stack Engineer (MERN)",
      status: "hired",
      employmentStatus: "pending_joining",
      salary: 1600000,
      joiningDate: inDays(15),
      designation: "Full Stack Engineer",
    },
    {
      candidate: priya,
      jobKey: "apex-innovations|React Frontend Developer",
      status: "placement_verified",
      employmentStatus: "active_verified",
      salary: 750000,
      joiningDate: daysAgo(10),
      confirmedJoinedAt: daysAgo(10),
      verifiedAt: daysAgo(5),
      designation: "React Frontend Developer",
    },
    {
      candidate: userMap["sneha.kulkarni@example.com"],
      jobKey: "cloudnova-systems|Site Reliability Engineer",
      status: "currently_working",
      employmentStatus: "active_verified",
      salary: 1400000,
      joiningDate: daysAgo(12),
      confirmedJoinedAt: daysAgo(12),
      verifiedAt: daysAgo(6),
      designation: "Site Reliability Engineer",
    },
  ];

  for (const pl of PLACEMENTS_TO_SEED) {
    if (!pl.candidate) continue;
    const job = jobMap[pl.jobKey];
    if (!job) continue;
    const app = applicationMap[`${pl.candidate.email}|${job._id}`];
    if (!app) continue;

    await Placement.create({
      organization: job.organization,
      job: job._id,
      application: app._id,
      candidate: pl.candidate._id,
      status: pl.status,
      offerDetails: {
        designation: pl.designation,
        ctc: pl.salary,
        currency: "INR",
        offerDate: daysAgo(20),
        offeredJoiningDate: pl.joiningDate,
        acceptedAt: daysAgo(10),
      },
      joiningConfirmation: {
        confirmedByCandidate: Boolean(pl.confirmedJoinedAt),
        actualJoiningDate: pl.confirmedJoinedAt || null,
        confirmedAt: pl.confirmedJoinedAt || null,
      },
      verification: {
        isVerified: Boolean(pl.verifiedAt),
        verifiedAt: pl.verifiedAt || null,
        verifiedBy: pl.verifiedAt ? (admin ? admin._id : null) : null,
      },
      employment: {
        status: pl.employmentStatus,
        lastVerifiedStatus: pl.employmentStatus,
        lastStatusChangeAt: new Date(),
      },
      notes: "Placed through HireSmart-AI verified talent pipeline.",
    });

    console.log(`  + Placement: ${pl.candidate.name} at ${job.company} [${pl.status}]`);
  }

  // Step 12: Seed Subscriptions & Simulated Payment Transactions
  console.log("\n>>> SEEDING SUBSCRIPTIONS & SIMULATED PAYMENTS...");
  const SUB_CONFIGS = [
    { type: "organization", id: orgMap["apex-innovations"]._id, tier: "recruiter_enterprise", price: 7999 },
    { type: "organization", id: orgMap["nexus-byte-solutions"]._id, tier: "recruiter_growth", price: 4999 },
    { type: "organization", id: orgMap["zenith-technologies"]._id, tier: "recruiter_starter", price: 999 },
    { type: "organization", id: orgMap["cloudnova-systems"]._id, tier: "recruiter_starter", price: 999 },
    { type: "organization", id: orgMap["bytescale-technologies"]._id, tier: "recruiter_free", price: 0 },
    { type: "candidate", id: anas._id, tier: "candidate_plus", price: 149 },
  ];

  for (const sc of SUB_CONFIGS) {
    const planDef =
      sc.type === "candidate"
        ? CANDIDATE_PLANS[sc.tier]
        : RECRUITER_PLANS[sc.tier];

    const sub = await Subscription.create({
      subscriberType: sc.type,
      subscriberId: sc.id,
      planTier: sc.tier,
      status: "active",
      source: "demo_seed",
      isDemo: true,
      billingCycle: "monthly",
      priceInr: sc.price,
      currentPeriodStart: daysAgo(10),
      currentPeriodEnd: inDays(20),
      limits: planDef?.limits || {},
      usage: { activeJobsCount: 2, teamMembersCount: 1, aiAnalysesUsedThisMonth: 10 },
    });

    if (sc.price > 0) {
      // Create strictly simulated demo transaction (zero live Razorpay calls)
      await PaymentTransaction.create({
        transactionNumber: `TXN-DEMO-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        subscriberType: sc.type,
        subscriberId: sc.id,
        subscription: sub._id,
        planTier: sc.tier,
        amount: sc.price,
        currency: "INR",
        status: "captured",
        gateway: "simulation",
        mode: "simulation",
        invoiceNumber: `INV-DEMO-${Date.now()}`,
      });
    }
    console.log(`  + Subscription: [${sc.type}] ${sc.tier} (₹${sc.price}/mo)`);
  }

  // Step 13: Seed Saved Job Alerts
  console.log("\n>>> SEEDING SAVED JOB ALERTS...");
  await JobAlert.create({
    user: anas._id,
    name: "MERN Full Stack Roles",
    query: "React Node Express MongoDB",
    location: "Surat, Pune, Remote",
    workplaceMode: "hybrid",
    cadence: "weekly",
    active: true,
    lastRunAt: daysAgo(1),
  });

  await JobAlert.create({
    user: anas._id,
    name: "Senior Frontend Engineering",
    query: "React TypeScript Tailwind",
    location: "Remote",
    workplaceMode: "remote",
    cadence: "daily",
    active: true,
    lastRunAt: daysAgo(2),
  });
  console.log(`  + Created 2 persistent Job Alerts for Anas Tai`);

  // Step 14: Seed Notifications
  console.log("\n>>> SEEDING IN-APP NOTIFICATIONS...");
  const NOTIFICATIONS_DATA = [
    {
      user: anas._id,
      type: "offer_received",
      category: "application",
      title: "Job Offer Extended!",
      message: "Apex Innovations has extended an official offer for React Frontend Developer (₹7.5 LPA CTC).",
      readAt: null,
    },
    {
      user: anas._id,
      type: "interview_confirmed",
      category: "interview",
      title: "Interview Scheduled",
      message: "Nexus Byte Solutions confirmed your Distributed Systems Interview.",
      readAt: daysAgo(1),
    },
    {
      user: apexRecruiter._id,
      type: "application_received",
      category: "recruitment",
      title: "New Application Received",
      message: "Anas Tai applied for Senior Full Stack Engineer (MERN).",
      readAt: daysAgo(3),
    },
  ];

  if (admin) {
    NOTIFICATIONS_DATA.push({
      user: admin._id,
      type: "company_verification_pending",
      category: "moderation",
      title: "New Organization Submitted",
      message: "CloudNova Systems submitted verification documents for platform review.",
      readAt: null,
    });
  }

  for (const n of NOTIFICATIONS_DATA) {
    await Notification.create({
      ...n,
      idempotencyKey: `notif-${crypto.randomUUID()}`,
      delivery: { email: "not_requested", push: "not_requested" },
    });
  }
  console.log(`  + Created ${NOTIFICATIONS_DATA.length} in-app notifications`);

  // Step 15: Seed Audit Logs & Security Events
  console.log("\n>>> SEEDING AUDIT LOGS & SECURITY EVENTS...");
  await AuditLog.create({
    actor: admin ? admin._id : apexRecruiter._id,
    action: "organization.verified",
    resourceType: "organization",
    resourceId: String(orgMap["apex-innovations"]._id),
    outcome: "success",
    metadata: { orgName: "Apex Innovations", gstin: "24AAACA1234A1Z5" },
    reason: "Document verification confirmed on MCA & GST portal.",
  });

  await AuditLog.create({
    actor: apexRecruiter._id,
    action: "offer.issued",
    resourceType: "application",
    resourceId: String(anasApexApp?._id || ""),
    outcome: "success",
    metadata: { designation: "React Frontend Developer", ctc: 750000 },
    reason: "Candidate demonstrated superior technical skills.",
  });

  await SecurityEvent.create({
    user: anas._id,
    type: "session.login_success",
    severity: "info",
    status: "resolved",
    details: { authMethod: "password", ip: "127.0.0.1", userAgent: "HireSmart-Web" },
  });

  console.log("  + Created governance Audit Logs & Security Events");

  // Step 16: Verification & Final Report
  console.log("\n================================================================================");
  console.log("                     DATABASE SEEDING COMPLETED SUCCESSFULLY                    ");
  console.log("================================================================================");

  const finalCollections = await activeDb.listCollections().toArray();
  const finalCounts = {};
  for (const c of finalCollections) {
    finalCounts[c.name] = await activeDb.collection(c.name).countDocuments();
  }

  console.log("\nNew Document Counts by Collection:");
  console.log(JSON.stringify(finalCounts, null, 2));

  // Verify all 17 users preserved
  const verifyUsers = await User.find({}).select("+password").lean();
  console.log(`\nPreserved Users Count: ${verifyUsers.length} (Expected: ${existingUsers.length})`);
  let passwordMatches = 0;
  for (const u of verifyUsers) {
    const original = existingUsers.find((o) => String(o._id) === String(u._id));
    if (original && original.password === u.password) {
      passwordMatches++;
    }
  }
  console.log(`Password Hash Integrity Check: ${passwordMatches}/${existingUsers.length} exact matches.`);

  console.log("\nSeeded Summary:");
  console.log(`- Organizations:          ${Object.keys(orgMap).length}`);
  console.log(`- Recruiter Memberships:  ${RECRUITER_MAPPINGS.length}`);
  console.log(`- Jobs & Requisitions:    ${Object.keys(jobMap).length}`);
  console.log(`- Candidate Profiles:     ${CANDIDATE_PROFILES_DATA.length}`);
  console.log(`- Applications:           ${APPLICATIONS_DATA.length}`);
  console.log(`- Placements:             ${PLACEMENTS_TO_SEED.length}`);
  console.log(`- Subscriptions:          ${SUB_CONFIGS.length}`);
  console.log(`- Backup Location:        ${backupDir}`);
  console.log("================================================================================\n");

  await disconnectDB();
}

// CLI Execution
if (require.main === module) {
  const isDryRun = process.argv.includes("--dry-run");
  const isConfirmReset = process.argv.includes("--confirm-reset");

  if (!isDryRun && !isConfirmReset) {
    console.log("Usage:");
    console.log("  Dry-run:   node scripts/seed-fresh-demo.js --dry-run");
    console.log("  Execution: node scripts/seed-fresh-demo.js --confirm-reset");
    process.exit(0);
  }

  runSeed({ dryRun: isDryRun, confirmReset: isConfirmReset }).catch(async (err) => {
    console.error("\n❌ Seeding stopped with error:", err.message);
    process.exitCode = 1;
    await disconnectDB().catch(() => {});
  });
}

module.exports = { runSeed };
