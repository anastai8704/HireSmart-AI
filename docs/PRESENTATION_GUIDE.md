# HireSmart-AI — MCA Semester 3 Project Presentation & Demo Guide

**Project Title:** HireSmart-AI (AI-Powered Intelligent Recruitment & Candidate Assessment Platform)  
**Lead Developer / Candidate Persona:** Anas Tai (MCA Student @ SRIMCA, Surat, Gujarat)  
**Repository Branch:** `arena/01a08596-hiresmart-ai`

---

## 1. Quick Start & Seeding

To run the safe, idempotent presentation demo seeder:

```bash
# In the server directory:
cd server
npm run demo
# or:
npm run seed:demo
```

Then start the application in two separate terminals:

```bash
# Terminal 1 (Backend Server on http://localhost:5000):
cd server
npm run dev

# Terminal 2 (Frontend Client on http://localhost:5173):
cd client
npm run dev
```

---

## 2. Demo Account Matrix

| Role | Email | Password | Organization / Details |
| :--- | :--- | :--- | :--- |
| **Primary Candidate** | `tanastai5018@gmail.com` | `hiresmart8704` | **Anas Tai** — MCA Student @ SRIMCA, Surat (Full 100% profile, MERN projects, processed PDF resume, 6 applications, scheduled interview) |
| **Primary Recruiter** | `2025mca150@gmail.com` | `hiresmart8704` | **Apex Innovations** (Surat/Ahmedabad) — 5 Job postings, candidate applications, interview scheduler |
| **Platform Admin** | _(Existing Admin Email)_ | _(Preserved Password)_ | Platform Moderation, AI Telemetry, User & Org Management, Security Logs |

### Additional Candidate Logins (Password for all: `hiresmart8704`)
- **Priya Sharma** (`priya.sharma@example.com`) — Frontend Engineer (React/Redux), Ahmedabad
- **Vikram Nair** (`vikram.nair@example.com`) — Backend Engineer (Node.js/PostgreSQL), Bengaluru
- **Sneha Kulkarni** (`sneha.kulkarni@example.com`) — DevOps & Cloud SRE (Kubernetes/AWS), Pune
- **Arjun Mehta** (`arjun.mehta@example.com`) — Junior Frontend Developer, Surat
- **Ishita Verma** (`ishita.verma@example.com`) — QA Automation Specialist (Playwright/Jest), Indore
- **Karan Patel** (`karan.patel@example.com`) — Full Stack Engineer (MERN/Redis), Ahmedabad
- **Ananya Iyer** (`ananya.iyer@example.com`) — Senior Frontend Architect (React/TypeScript), Ahmedabad

### Additional Recruiter / Company Logins (Password for all: `hiresmart8704`)
- **Rohit Sharma** (`rohit.sharma@nexusbyte.com`) — Nexus Byte Solutions (Bengaluru)
- **Neha Patel** (`neha.patel@cloudforge.io`) — CloudForge Systems (Pune)
- **Amit Verma** (`amit.verma@bytescale.tech`) — ByteScale Technologies (Mumbai)
- **Kavya Nair** (`kavya.nair@zenithlabs.in`) — Zenith Global Labs (Hyderabad)

---

## 3. Recommended 4-Act Live Presentation Flow

### Act 1: Candidate Experience (Anas Tai)
1. **Login:** Log in with `tanastai5018@gmail.com` / `hiresmart8704`.
2. **Dashboard & Profile:**
   - Notice the **100% Profile Completion** score.
   - Show SRIMCA education (2024-2026), BCA from VNSGU, and featured projects (*HireSmart-AI*, *HomeServeX*, *Travel Planner*).
   - View the **Resumes** tab: verified PDF resume is parsed and in `ready` state with AI skill extraction.
3. **Application Tracking:**
   - Open **Applications**: observe 6 real-world applications across various statuses:
     - `Interview` (Apex Innovations: *Software Engineer Intern - MERN*)
     - `Offer` (ByteScale Technologies: *Junior MERN Stack Engineer*)
     - `Shortlisted` (Apex Innovations: *React Frontend Developer*)
     - `Under Review` (Apex Innovations: *Junior Full Stack Developer*)
     - `Submitted` (CloudForge Systems: *Frontend Engineer*)
     - `Rejected / Talent Pool` (Zenith Global Labs: *Graduate Software Trainee*)
4. **Interview Schedule:**
   - Open **Interviews**: see the confirmed **Technical Round** with Apex Innovations on Google Meet.
5. **AI Fit Analysis & Discover:**
   - Navigate to **Discover Jobs** -> Open any job -> Click **Analyze Fit** to see instant Hybrid Match scoring with skill breakdown, strengths, and recommendations.

---

### Act 2: Recruiter Workflow (Apex Innovations)
1. **Login:** Log in with `2025mca150@gmail.com` / `hiresmart8704`.
2. **Recruiter Overview:**
   - View company dashboard for **Apex Innovations** showing applicant counts, pipeline stages, and active postings.
3. **Applicant Pipeline:**
   - Open **Applicants** for *Software Engineer Intern (MERN)*.
   - Inspect **Anas Tai**:
     - 94% Hybrid Match Score.
     - Review stage history: `Submitted -> Under Review -> Shortlisted -> Interview`.
     - Read internal hiring team notes.
4. **Interviews Hub:**
   - View scheduled upcoming technical round with Anas Tai on Google Meet.
   - Inspect completed interviews with rubric ratings (1 to 5) and evaluator recommendations (`strong_yes`).
5. **Job Management:**
   - Navigate to **Jobs**: view active published roles and the draft *Backend Developer (Node.js & Microservices)* job (show quick one-click publish).

---

### Act 3: Platform Admin Console
1. **Login:** Log in with your Platform Admin account.
2. **Admin Overview (`/app/admin`):**
   - **Users & Organizations:** View all registered organizations (Apex Innovations, Nexus Byte, CloudForge, ByteScale, Zenith Global) and user accounts.
   - **Job Moderation:** Inspect *Cloud Infrastructure Engineer* submitted for platform approval. Approve or reject with feedback.
   - **AI Usage Telemetry:** Live aggregate metrics displaying feature token counts, estimated costs, and latency averages.
   - **Security & Audit Logs:** Live event log capturing authentication, job actions, and role updates.

---

### Act 4: Viva & Technical Architecture Q&A Highlights

1. **Architecture:** Single-page frontend in React 19 / Vite / Tailwind CSS communicating via RESTful API with an Express / Node.js backend on MongoDB.
2. **Hybrid Matching Algorithm:** Combines deterministic skill extraction (TF-IDF keyword matching, experience weights, education relevance) with AI embeddings to avoid hallucinations and ensure fair assessment.
3. **Security & Data Integrity:**
   - Password hashing with `bcryptjs` (salt rounds = 10).
   - Short-lived JWT access tokens + secure rotating refresh tokens.
   - Role-Based Access Control (RBAC) with organization membership permissions.
   - Idempotent data handling and optimistic concurrency control.
4. **Real Resume Processing:** In-memory stream parser utilizing `pdf-parse` to extract structured sections, contact information, and normalized skill tokens without external dependencies.
