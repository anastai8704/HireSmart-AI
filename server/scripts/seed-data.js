const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { config, validateEnvironment } = require("../config/env");

const User = require("../models/User");
const Job = require("../models/Job");
const CandidateProfile = require("../models/CandidateProfile");
const { Application } = require("../models/Application");

const genToken = (id, role) => jwt.sign({ id, role }, config.jwtSecret, { expiresIn: "30d" });

const seedFreshData = async () => {
  validateEnvironment();
  await connectDB();

  console.log("\n=========================================");
  console.log("CREATING BRAND NEW FRESH DATABASE SEED...");
  console.log("=========================================");

  // 1. Clean old data completely
  await Promise.all([
    User.deleteMany({}),
    Job.deleteMany({}),
    CandidateProfile.deleteMany({}),
    Application.deleteMany({}),
  ]);
  console.log("✓ Cleared all previous data from database.");

  const defaultPasswordHash = await bcrypt.hash("Password@123", 8);
  const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Password@123", 8);

  // 2. Generate New User IDs
  const adminId = new mongoose.Types.ObjectId();
  const candidate1Id = new mongoose.Types.ObjectId();
  const candidate2Id = new mongoose.Types.ObjectId();
  const recruiter1Id = new mongoose.Types.ObjectId();
  const recruiter2Id = new mongoose.Types.ObjectId();

  // 3. Create Users
  const users = [
    {
      _id: adminId,
      name: process.env.ADMIN_NAME || "Platform Admin",
      email: process.env.ADMIN_EMAIL || "admin@example.com",
      password: adminPasswordHash,
      role: "admin",
      isActive: true,
      emailVerified: true,
    },
    {
      _id: candidate1Id,
      name: "Anas Tai (Full Stack Lead)",
      email: "anastai.candidate@hiresmart.ai",
      password: defaultPasswordHash,
      role: "candidate",
      isActive: true,
      emailVerified: true,
      headline: "Senior Full Stack & Cloud Developer",
      location: "Mumbai, India",
      bio: "Experienced developer building modern web apps, cloud native systems, and mobile applications with MERN, Kotlin, Swift, and Flutter.",
      skills: [
        "React",
        "Node.js",
        "MongoDB",
        "Express",
        "JavaScript",
        "TypeScript",
        "Android",
        "Kotlin",
        "Java",
        "Flutter",
        "Dart",
        "Swift",
        "iOS",
        "Docker",
        "Kubernetes",
        "AWS",
        "CI/CD",
        "Python",
        "Machine Learning",
        "PyTorch",
      ],
      resume: "resumes/candidate1_resume.pdf",
      resumeOriginalName: "Anas_Resume_FullStack.pdf",
      resumeMimeType: "application/pdf",
      resumeSize: 1048576,
      resumeUploadedAt: new Date(),
      resumeText:
        "Anas Tai. Senior Full Stack Engineer with 4+ years expertise in React, Node.js, Express, MongoDB, TypeScript, Android Kotlin development, iOS Swift, Flutter Dart, Docker, Kubernetes, AWS Cloud architecture, and Python ML pipelines.",
    },
    {
      _id: candidate2Id,
      name: "Sarah Miller (AI/ML Specialist)",
      email: "sarah.miller@hiresmart.ai",
      password: defaultPasswordHash,
      role: "candidate",
      isActive: true,
      emailVerified: true,
      headline: "AI / ML & NLP Research Engineer",
      location: "Bangalore, India",
      bio: "AI Specialist experienced with Deep Learning, PyTorch, Large Language Models, NLP, TensorFlow, and FastAPI services.",
      skills: [
        "Python",
        "Machine Learning",
        "TensorFlow",
        "PyTorch",
        "NLP",
        "Pandas",
        "NumPy",
        "Scikit-Learn",
        "FastAPI",
        "Docker",
      ],
      resume: "resumes/candidate2_resume.pdf",
      resumeOriginalName: "Sarah_Miller_AI_Resume.pdf",
      resumeMimeType: "application/pdf",
      resumeSize: 856000,
      resumeUploadedAt: new Date(),
      resumeText:
        "Sarah Miller. AI/ML Research Engineer specialized in Python, Deep Learning, PyTorch, TensorFlow, NLP pipelines, vector databases, high-performance inference APIs with FastAPI and Docker containers.",
    },
    {
      _id: recruiter1Id,
      name: "Alexander Reed (Tech Innovators)",
      email: "alexander.recruiter@hiresmart.ai",
      password: defaultPasswordHash,
      role: "recruiter",
      isActive: true,
      emailVerified: true,
      companyName: "Tech Innovators Global",
      companyWebsite: "https://techinnovators.global",
      companyDescription:
        "Leading global software engineering firm building scalable web & mobile platforms.",
    },
    {
      _id: recruiter2Id,
      name: "Elena Rostova (Cloud Systems)",
      email: "elena.recruiter@hiresmart.ai",
      password: defaultPasswordHash,
      role: "recruiter",
      isActive: true,
      emailVerified: true,
      companyName: "Cloud Systems AI",
      companyWebsite: "https://cloudsystems.ai",
      companyDescription: "Enterprise cloud, DevOps, and next-gen AI automation solutions.",
    },
  ];

  await User.insertMany(users);
  console.log("✓ Created 5 Users (Admin, 2 Candidates, 2 Recruiters)");

  // 4. Create Candidate 1 Profile with sub-document IDs
  const educationId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const certificationId = new mongoose.Types.ObjectId();
  const experienceId = new mongoose.Types.ObjectId();
  const profileId = new mongoose.Types.ObjectId();

  const candidate1Profile = {
    _id: profileId,
    user: candidate1Id,
    address: "Andheri West, Link Road",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    languages: ["English", "Hindi"],
    socialLinks: {
      github: "https://github.com/anastai",
      linkedin: "https://linkedin.com/in/anastai",
      portfolio: "https://anastai.dev",
    },
    education: [
      {
        _id: educationId,
        institution: "Mumbai University Institute of Technology",
        degree: "B.Tech in Computer Engineering",
        fieldOfStudy: "Computer Science & Engineering",
        startYear: 2020,
        endYear: 2024,
        cgpa: 9.2,
      },
    ],
    projects: [
      {
        _id: projectId,
        title: "HireSmart AI Recruitment Engine",
        description:
          "Built full-stack AI recruitment portal featuring real-time candidate scoring, automated matching algorithm, and workflow management.",
        technologies: ["React", "Node.js", "Express", "MongoDB", "Tailwind CSS"],
        githubUrl: "https://github.com/anastai/hiresmart-ai",
        liveUrl: "https://hiresmart.ai",
      },
    ],
    certifications: [
      {
        _id: certificationId,
        name: "AWS Certified Solutions Architect",
        issuer: "Amazon Web Services",
        issueDate: new Date("2024-01-15"),
        certificateUrl: "https://aws.amazon.com/certification",
      },
    ],
    experience: [
      {
        _id: experienceId,
        company: "Tech Innovators Global",
        position: "Senior Full Stack Engineer",
        description:
          "Designed scalable microservices with Node.js, Express, MongoDB, and modern React responsive frontends.",
        startDate: new Date("2023-01-01"),
        currentlyWorking: true,
      },
    ],
  };

  await CandidateProfile.create(candidate1Profile);
  console.log("✓ Created Candidate Profile with all sub-documents");

  // 5. Create 6 Jobs
  const androidJobId = new mongoose.Types.ObjectId();
  const mernJobId = new mongoose.Types.ObjectId();
  const iosJobId = new mongoose.Types.ObjectId();
  const flutterJobId = new mongoose.Types.ObjectId();
  const devopsJobId = new mongoose.Types.ObjectId();
  const aimlJobId = new mongoose.Types.ObjectId();

  const jobs = [
    {
      _id: androidJobId,
      title: "Senior Android Developer",
      company: "Tech Innovators Global",
      location: "Remote",
      salary: 95000,
      experience: "3+ years",
      jobType: "Full-Time",
      description:
        "Seeking an experienced Android developer proficient in Kotlin, Java, Jetpack Compose, and RESTful API integration.",
      skills: ["Android", "Kotlin", "Java", "Jetpack Compose", "REST API", "Git"],
      status: "published",
      recruiter: recruiter1Id,
    },
    {
      _id: mernJobId,
      title: "Full Stack MERN Developer",
      company: "Tech Innovators Global",
      location: "Mumbai, India",
      salary: 90000,
      experience: "2-4 years",
      jobType: "Full-Time",
      description:
        "We are hiring a skilled MERN stack engineer with solid expertise in React, Node.js, Express, MongoDB, and TypeScript to develop scalable web applications.",
      skills: ["React", "Node.js", "MongoDB", "Express", "JavaScript", "TypeScript"],
      status: "published",
      recruiter: recruiter1Id,
    },
    {
      _id: iosJobId,
      title: "iOS Application Engineer",
      company: "Tech Innovators Global",
      location: "Hybrid",
      salary: 105000,
      experience: "3+ years",
      jobType: "Full-Time",
      description:
        "Looking for an iOS Engineer with strong Swift and SwiftUI skills to build beautiful and intuitive iOS mobile apps.",
      skills: ["Swift", "iOS", "SwiftUI", "Xcode", "CocoaPods"],
      status: "published",
      recruiter: recruiter1Id,
    },
    {
      _id: flutterJobId,
      title: "Cross-Platform Flutter Developer",
      company: "Cloud Systems AI",
      location: "Remote",
      salary: 88000,
      experience: "2+ years",
      jobType: "Full-Time",
      description:
        "Join our mobile team to develop performant cross-platform applications using Flutter and Dart with Firebase and BLoC architecture.",
      skills: ["Flutter", "Dart", "Firebase", "State Management", "BLoC"],
      status: "published",
      recruiter: recruiter2Id,
    },
    {
      _id: devopsJobId,
      title: "DevOps & Cloud Engineer",
      company: "Cloud Systems AI",
      location: "Bangalore, India",
      salary: 125000,
      experience: "4+ years",
      jobType: "Full-Time",
      description:
        "Seeking a DevOps specialist to maintain CI/CD pipelines, Docker containers, Kubernetes clusters, and AWS infrastructure.",
      skills: ["DevOps", "Docker", "Kubernetes", "AWS", "CI/CD", "Linux"],
      status: "published",
      recruiter: recruiter2Id,
    },
    {
      _id: aimlJobId,
      title: "AI / ML Research Engineer",
      company: "Cloud Systems AI",
      location: "Remote",
      salary: 135000,
      experience: "3+ years",
      jobType: "Full-Time",
      description:
        "Looking for an AI/ML Engineer to train custom machine learning and NLP models using Python, PyTorch, TensorFlow, and deploy them using FastAPI.",
      skills: ["Python", "Machine Learning", "PyTorch", "TensorFlow", "NLP", "FastAPI"],
      status: "published",
      recruiter: recruiter2Id,
    },
  ];

  await Job.insertMany(jobs);
  console.log("✓ Created 6 Jobs across Recruiters 1 & 2");

  // 6. Create 6 Applications for Candidate 1
  const androidAppId = new mongoose.Types.ObjectId();
  const mernAppId = new mongoose.Types.ObjectId();
  const iosAppId = new mongoose.Types.ObjectId();
  const flutterAppId = new mongoose.Types.ObjectId();
  const devopsAppId = new mongoose.Types.ObjectId();
  const aimlAppId = new mongoose.Types.ObjectId();

  const applications = [
    {
      _id: androidAppId,
      job: androidJobId,
      candidate: candidate1Id,
      status: "Applied",
      resumeSnapshot: {
        storageKey: "resumes/candidate1_resume.pdf",
        originalName: "Anas_Resume_Android.pdf",
        mimeType: "application/pdf",
        size: 1048576,
        text: "Anas Tai. Android developer proficient in Kotlin, Java, Jetpack Compose, Android Architecture Components, and REST APIs.",
      },
      statusHistory: [
        { status: "Applied", changedBy: candidate1Id, note: "Application submitted" },
      ],
    },
    {
      _id: mernAppId,
      job: mernJobId,
      candidate: candidate1Id,
      status: "Shortlisted",
      resumeSnapshot: {
        storageKey: "resumes/candidate1_resume.pdf",
        originalName: "Anas_Resume_FullStack.pdf",
        mimeType: "application/pdf",
        size: 1048576,
        text: "Anas Tai. Full Stack MERN Developer experienced in React, Node.js, Express, MongoDB, TypeScript, REST APIs, and scalable web apps.",
      },
      statusHistory: [
        { status: "Applied", changedBy: candidate1Id, note: "Application submitted" },
        {
          status: "Shortlisted",
          changedBy: recruiter1Id,
          note: "Candidate shortlisted for technical interview",
        },
      ],
    },
    {
      _id: iosAppId,
      job: iosJobId,
      candidate: candidate1Id,
      status: "Applied",
      resumeSnapshot: {
        storageKey: "resumes/candidate1_resume.pdf",
        originalName: "Anas_Resume_iOS.pdf",
        mimeType: "application/pdf",
        size: 1048576,
        text: "Anas Tai. iOS App developer experienced in Swift, SwiftUI, Xcode, and Apple Human Interface Guidelines.",
      },
      statusHistory: [
        { status: "Applied", changedBy: candidate1Id, note: "Application submitted" },
      ],
    },
    {
      _id: flutterAppId,
      job: flutterJobId,
      candidate: candidate1Id,
      status: "Applied",
      resumeSnapshot: {
        storageKey: "resumes/candidate1_resume.pdf",
        originalName: "Anas_Resume_Flutter.pdf",
        mimeType: "application/pdf",
        size: 1048576,
        text: "Anas Tai. Cross-platform mobile developer with Flutter and Dart, Firebase integrations, and state management.",
      },
      statusHistory: [
        { status: "Applied", changedBy: candidate1Id, note: "Application submitted" },
      ],
    },
    {
      _id: devopsAppId,
      job: devopsJobId,
      candidate: candidate1Id,
      status: "Applied",
      resumeSnapshot: {
        storageKey: "resumes/candidate1_resume.pdf",
        originalName: "Anas_Resume_DevOps.pdf",
        mimeType: "application/pdf",
        size: 1048576,
        text: "Anas Tai. DevOps & Cloud engineer skilled in Docker, Kubernetes, AWS infrastructure, Linux systems, and CI/CD pipelines.",
      },
      statusHistory: [
        { status: "Applied", changedBy: candidate1Id, note: "Application submitted" },
      ],
    },
    {
      _id: aimlAppId,
      job: aimlJobId,
      candidate: candidate1Id,
      status: "Applied",
      resumeSnapshot: {
        storageKey: "resumes/candidate1_resume.pdf",
        originalName: "Anas_Resume_AIML.pdf",
        mimeType: "application/pdf",
        size: 1048576,
        text: "Anas Tai. AI & Machine Learning engineer with Python, PyTorch, TensorFlow, NLP pipelines, and FastAPI.",
      },
      statusHistory: [
        { status: "Applied", changedBy: candidate1Id, note: "Application submitted" },
      ],
    },
  ];

  await Application.insertMany(applications);
  console.log("✓ Created 6 Applications for Candidate 1");

  // 7. Generate Fresh 30-Day Tokens
  const adminToken = genToken(adminId.toString(), "admin");
  const candidate1Token = genToken(candidate1Id.toString(), "candidate");
  const candidate2Token = genToken(candidate2Id.toString(), "candidate");
  const recruiter1Token = genToken(recruiter1Id.toString(), "recruiter");
  const recruiter2Token = genToken(recruiter2Id.toString(), "recruiter");

  const summary = {
    admin: { id: adminId.toString(), token: adminToken },
    candidate1: {
      id: candidate1Id.toString(),
      profileId: profileId.toString(),
      educationId: educationId.toString(),
      projectId: projectId.toString(),
      certificationId: certificationId.toString(),
      experienceId: experienceId.toString(),
      token: candidate1Token,
    },
    candidate2: { id: candidate2Id.toString(), token: candidate2Token },
    recruiter1: { id: recruiter1Id.toString(), token: recruiter1Token },
    recruiter2: { id: recruiter2Id.toString(), token: recruiter2Token },
    jobsAndApplications: {
      android: { jobId: androidJobId.toString(), applicationId: androidAppId.toString() },
      mern: { jobId: mernJobId.toString(), applicationId: mernAppId.toString() },
      ios: { jobId: iosJobId.toString(), applicationId: iosAppId.toString() },
      flutter: { jobId: flutterJobId.toString(), applicationId: flutterAppId.toString() },
      devops: { jobId: devopsJobId.toString(), applicationId: devopsAppId.toString() },
      aiml: { jobId: aimlJobId.toString(), applicationId: aimlAppId.toString() },
    },
  };

  console.log("\n=========================================");
  console.log("NEW SEED DATA JSON SUMMARY:");
  console.log(JSON.stringify(summary, null, 2));
  console.log("=========================================\n");

  return summary;
};

if (require.main === module) {
  seedFreshData()
    .catch((error) => {
      console.error("Seed error:", error.stack || error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { seedFreshData };
