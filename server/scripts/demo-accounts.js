/**
 * Demo test data setup (idempotent, non-destructive).
 *
 * Adds a demo company, a recruiter, a candidate, a published job and a fully
 * processed candidate resume, so the whole product can be tested end to end:
 *
 *   candidate login -> resume ready -> discover jobs -> analyze fit -> apply
 *   recruiter login -> review applicant -> shortlist / note / interview
 *   admin login     -> /app/admin
 *
 * Nothing that already exists is deleted or modified. Running it again is
 * safe: whatever it already created is reused.
 *
 * Usage:  cd server && npm run demo
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
const { ResumeVersion } = require("../models/Resume");
const { createVersion, processVersion } = require("../services/resumeProcessingService");

const DEMO = {
    org: {
        name: "Demo Tech Solutions",
        slug: "demo-tech-solutions",
        industry: "Software & IT",
        size: "11-50",
        website: "https://demo-tech.example.com",
        timezone: "Asia/Kolkata",
    },
    recruiter: {
        name: "Demo Recruiter",
        email: "recruiter.demo@hiresmart.dev",
        password: "Recruiter@123",
    },
    candidate: {
        name: "Priya Sharma",
        email: "candidate.demo@hiresmart.dev",
        password: "Candidate@123",
    },
    job: {
        title: "Senior Frontend Developer (React)",
        company: "Demo Tech Solutions",
        location: "Ahmedabad, India",
        salary: 2400000,
        experience: "3-5 years",
        jobType: "Full-Time",
        workplaceMode: "hybrid",
        description:
            "We are looking for a senior frontend developer to build accessible, high-performance React applications. " +
            "You will own features end to end, work closely with designers and backend engineers, and care deeply about evidence in your decisions.",
        skills: ["React", "JavaScript", "Node.js", "MongoDB", "TypeScript", "REST APIs", "Git"],
        requiredSkills: ["React", "JavaScript", "Node.js"],
        preferredSkills: ["TypeScript", "GraphQL"],
        compensation: { min: 2000000, max: 2800000, currency: "INR", period: "year" },
    },
};

const escapePdf = (value) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

// Builds a minimal, spec-valid single-page PDF (Helvetica, one Tj per line).
// Good enough for pdf-parse to extract every line of text.
const buildPdf = (lines) => {
    const content = lines
        .map((line, index) => `BT /F1 11 Tf 50 ${780 - index * 18} Td (${escapePdf(line)}) Tj ET`)
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

const RESUME_LINES = [
    "Priya Sharma - Full Stack Developer",
    "Ahmedabad, Gujarat | priya.sharma@example.com | +91 98765 43210",
    "",
    "SKILLS: React, JavaScript, Node.js, MongoDB, Express, TypeScript, REST APIs, Git, Jest",
    "",
    "EXPERIENCE",
    "Full Stack Developer, TechNova (2023 - present): Built React dashboards and Node.js APIs used by 40000 users; improved page load time by 35 percent.",
    "Backend Developer, CloudWorks (2021 - 2023): Designed MongoDB schemas and REST services for an e-commerce platform with 1 million monthly orders.",
    "",
    "EDUCATION",
    "B.E. Computer Science, Gujarat Technological University (2017 - 2021)",
];

const main = async () => {
    validateEnvironment();
    await connectDB();

    try {
        // 1) Company (organization)
        let org = await Organization.findOne({ slug: DEMO.org.slug });
        const orgNew = !org;
        if (!org) org = await Organization.create(DEMO.org);

        // 2) Recruiter + ownership of the company
        let recruiter = await User.findOne({ email: DEMO.recruiter.email });
        const recruiterNew = !recruiter;
        if (!recruiter) {
            recruiter = await User.create({
                name: DEMO.recruiter.name,
                email: DEMO.recruiter.email,
                password: await bcrypt.hash(DEMO.recruiter.password, 10),
                role: "recruiter",
                accountStatus: "active",
                emailVerified: true,
            });
        }
        if (!(await Membership.findOne({ organization: org._id, user: recruiter._id }))) {
            await Membership.create({ organization: org._id, user: recruiter._id, role: "owner", status: "active" });
        }

        // 3) Published job posting
        let job = await Job.findOne({ organization: org._id, title: DEMO.job.title });
        const jobNew = !job;
        if (!job) {
            job = await Job.create({
                organization: org._id,
                recruiter: recruiter._id,
                status: "published",
                publishedAt: new Date(),
                ...DEMO.job,
            });
        }

        // 4) Candidate
        let candidate = await User.findOne({ email: DEMO.candidate.email });
        const candidateNew = !candidate;
        if (!candidate) {
            candidate = await User.create({
                name: DEMO.candidate.name,
                email: DEMO.candidate.email,
                password: await bcrypt.hash(DEMO.candidate.password, 10),
                role: "candidate",
                accountStatus: "active",
                emailVerified: true,
            });
        }
        for (const purpose of ["terms", "privacy"]) {
            if (!(await Consent.exists({ user: candidate._id, purpose, policyVersion: "2026-08" }))) {
                await Consent.create({ user: candidate._id, purpose, policyVersion: "2026-08", source: "registration" });
            }
        }

        // 5) Candidate resume - goes through the exact same pipeline as a UI
        //    upload (createVersion), then is processed inline (processVersion)
        //    so it is "ready" without needing the background worker.
        let resumeLine;
        const existingReady = await ResumeVersion.findOne({ candidate: candidate._id, processingStatus: "ready" });
        if (existingReady) {
            resumeLine = `Resume v${existingReady.version} "${existingReady.originalName}" (already ready - reused)`;
        } else {
            const buffer = buildPdf(RESUME_LINES);
            const file = {
                originalname: "Priya_Sharma_Resume.pdf",
                mimetype: "application/pdf",
                buffer,
                size: buffer.length,
            };
            const { version } = await createVersion({ user: candidate, file });
            await processVersion(version._id);
            resumeLine = `Resume v${version.version} "${file.originalname}" (uploaded + processed)`;
        }

        console.log("");
        console.log("================ DEMO TEST DATA READY ================");
        console.log(`Company        : ${org.name} (slug: ${org.slug})${orgNew ? "  [created]" : "  [reused]"}`);
        console.log(`Recruiter login: ${DEMO.recruiter.email}  /  ${DEMO.recruiter.password}${recruiterNew ? "  [created]" : "  [reused]"}`);
        console.log(`Job posted     : ${job.title} - ${job.location}${jobNew ? "  [created]" : "  [reused]"}`);
        console.log(`Candidate login: ${DEMO.candidate.email}  /  ${DEMO.candidate.password}${candidateNew ? "  [created]" : "  [reused]"}`);
        console.log(`Candidate data : ${resumeLine}`);
        console.log("=======================================================");
        console.log("");
        console.log("Suggested test order:");
        console.log("1. Log in as candidate -> Resumes (ready) -> Discover -> open the job -> Analyze fit -> Apply");
        console.log("2. Log in as recruiter -> the applicant appears -> shortlist / add note / schedule interview");
        console.log("3. Log in as admin     -> /app/admin for users, organizations, AI usage");
    } finally {
        await disconnectDB();
    }
};

main().catch((error) => {
    console.error("Demo setup failed:", error.message);
    process.exit(1);
});
