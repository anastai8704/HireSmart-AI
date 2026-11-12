# HireSmart-AI — MCA Semester 3 Project Presentation & Demonstration Guide

**Project Title:** HireSmart-AI (AI-Powered Intelligent Recruitment, Platform Governance & Candidate Assessment Ecosystem)  
**Lead Developer / Candidate Persona:** Anas Tai (MCA Student @ SRIMCA, Surat, Gujarat)  
**Repository Branch:** `arena/01a08596-hiresmart-ai`

---

## 1. Quick Start & Presentation Seeder

To run the safe, repeatable, idempotent presentation demo seeder:

```bash
# In the server directory:
cd server
npm run demo
# or:
npm run seed:demo
```

Start the application services:

```bash
# Terminal 1 (Backend API on http://localhost:5000):
cd server
npm run dev

# Terminal 2 (Frontend Client on http://localhost:5173):
cd client
npm run dev
```

---

## 2. Demo Account Matrix

| Role | Email | Password | Details & Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Primary Candidate** | `tanastai5018@gmail.com` | the value of `DEMO_PASSWORD` in `server/.env` | **Anas Tai** — MCA Student @ SRIMCA, Surat (100% profile, MERN projects, processed PDF resume, 6 applications, scheduled interview, Career Plus active plan, verified placement record) |
| **Primary Recruiter** | `2025mca150@gmail.com` | the value of `DEMO_PASSWORD` in `server/.env` | **Apex Innovations** (Surat) — Verified company status (GSTIN: `24AAACA1234A1Z5`), Growth Tier Plan, 5 Job postings, candidate review pipeline, Google Meet scheduler |
| **Platform Admin** | _(Existing Admin Email)_ | _(Preserved Password)_ | Platform Analytics Overview, Company Verification & Risk Assessment, Job Moderation, Subscriptions & Revenue Dashboard (MRR/ARR), AI Telemetry, Security Logs |

### Additional Candidate Logins (Password for all: the value of `DEMO_PASSWORD` in `server/.env`)
- **Priya Sharma** (`priya.sharma@example.com`) — Frontend Engineer (React/Redux), Ahmedabad (Hired & Verified Placement at Apex Innovations)
- **Vikram Nair** (`vikram.nair@example.com`) — Backend Engineer (Node.js/PostgreSQL), Bengaluru
- **Sneha Kulkarni** (`sneha.kulkarni@example.com`) — DevOps & Cloud SRE (Kubernetes/AWS), Pune (Currently Working at CloudForge Systems)
- **Arjun Mehta** (`arjun.mehta@example.com`) — Junior Frontend Developer, Surat
- **Ishita Verma** (`ishita.verma@example.com`) — QA Automation Specialist (Playwright/Jest), Indore
- **Karan Patel** (`karan.patel@example.com`) — Full Stack Engineer (MERN/Redis), Ahmedabad
- **Ananya Iyer** (`ananya.iyer@example.com`) — Senior Frontend Architect (React/TypeScript), Ahmedabad

### Additional Recruiter & Company Logins (Password for all: the value of `DEMO_PASSWORD` in `server/.env`)
- **Rohit Sharma** (`rohit.sharma@nexusbyte.com`) — Nexus Byte Solutions (Bengaluru) [Verified, Growth Plan]
- **Neha Patel** (`neha.patel@cloudforge.io`) — CloudForge Systems (Pune) [Verified, Starter Plan]
- **Amit Verma** (`amit.verma@bytescale.tech`) — ByteScale Technologies (Mumbai) [Verified, Enterprise Plan]
- **Kavya Nair** (`kavya.nair@zenithlabs.in`) — Zenith Global Labs (Hyderabad) [Verified, Growth Plan]

---

## 3. Recommended 5-Act Live Presentation Flow

### Act 1: Candidate Experience (Anas Tai)
1. **Login:** Log in with `tanastai5018@gmail.com` / the value of `DEMO_PASSWORD` in `server/.env`.
2. **Dashboard & Profile Completion:**
   - Observe **100% Profile Completion** score.
   - Point out SRIMCA education (2024-2026), BCA from VNSGU, and featured projects (*HireSmart-AI*, *HomeServeX*, *Travel Planner*).
   - View the **Resumes** tab: verified PDF resume in `ready` state with AI skill extraction.
3. **Application Tracking:**
   - Open **Applications**: observe 6 real-world applications across various statuses:
     - `Interview` (Apex Innovations: *Software Engineer Intern - MERN*)
     - `Hired / Joining Confirmed` (ByteScale Technologies: *Junior MERN Stack Engineer*)
     - `Shortlisted` (Apex Innovations: *Junior Full Stack Developer*)
     - `Under Review` (Nexus Byte Solutions: *Backend Engineer*)
     - `Submitted` (CloudForge Systems: *Frontend Engineer*)
     - `Rejected / Talent Network` (Zenith Global Labs: *Graduate Software Trainee*)
4. **Interview Schedule:**
   - Open **Interviews**: see confirmed **Technical Round** on Google Meet.
5. **Career Plus Membership (`/app/candidate/plans`):**
   - View active Career Plus membership status with unlimited applications and AI Career Assistant features.

---

### Act 2: Recruiter Workflow & Workspace (Apex Innovations)
1. **Login:** Log in with `2025mca150@gmail.com` / the value of `DEMO_PASSWORD` in `server/.env`.
2. **Recruiter Overview & Pipelines:**
   - View company dashboard for **Apex Innovations** showing applicant counts, pipeline stages, and active postings.
3. **Applicant Review:**
   - Open **Applicants** for *Software Engineer Intern (MERN)*.
   - Inspect **Anas Tai**:
     - 94% Hybrid Match Score with radar breakdown.
     - Review stage history: `Submitted -> Under Review -> Shortlisted -> Interview`.
     - Read internal hiring team notes.
4. **Subscription & Quota Management (`/app/o/:orgId/billing`):**
   - Open **Billing & Quotas**: observe live quota progress bars (Active Jobs `5/10`, Team Seats `3/5`, Monthly AI Matches `28/150`).
   - Showcase plan options (Starter ₹999/mo, Growth ₹2,499/mo, Enterprise ₹7,999/mo) and interactive upgrade modal with simulation support.
   - View previous GST invoice receipts.

---

### Act 3: Platform Governance & Admin Control Center (`/app/admin`)
1. **Login:** Log in with your Platform Admin account.
2. **Overview & Hiring Analytics (`/app/admin`):**
   - KPI metrics: Total Users, Verified Companies, Active Openings, Verified Placements.
   - **Company Deep-Dive Selector**: Select *Apex Innovations* or *ByteScale Technologies* to view isolated company statistics.
   - **12-Month Hiring & Placement Trends Chart**: Interactive area & line chart showing applications vs. hires vs. verified placements.
   - Platform Recruitment Pipeline Funnel.
3. **Company Verification & Trust Drawer (`/app/admin/organizations`):**
   - Filter by verification status (`pending`, `verified`, `rejected`) and risk score.
   - Inspect *Apex Innovations* (Low Risk: 5/100, verified GSTIN/CIN, certificate attachments).
   - Inspect *CryptoPay Global Network* (Pending Review: High Risk 72/100 due to free webmail domain and missing tax IDs).
   - Demonstrate admin moderation controls: **Approve**, **Reject** (with reason), **Request More Info**, and **Suspend**.
4. **Job Moderation (`/app/admin/moderation`):**
   - Review incoming job postings with employer trust badges and fraud indicators.
5. **Financial Revenue & MRR Dashboard (`/app/admin/subscriptions`):**
   - View real-time Monthly Recurring Revenue (MRR: ~₹34,990), Annual Run Rate (ARR: ~₹4,19,880), Lifetime Revenue, and active subscriber metrics.
   - Visual monthly revenue trend chart and plan distribution breakdown.
   - Recent payment transaction log with invoice numbers and status indicators.

---

### Act 4: Placement Lifecycle & Employment Tracking
1. **6-Stage Lifecycle:**
   - `offer_extended` -> `offer_accepted` -> `joining_confirmed` -> `joined` -> `verified_placement` -> `currently_working`.
2. **Automatic Synchronization:**
   - When recruiter marks candidate as hired, a `Placement` record is created.
   - Candidate confirms joining, and candidate's `CandidateProfile.employmentStatus` automatically transitions to `placed` / `employed`.
   - Admin verifies official employment on platform.

---

### Act 5: Technical Architecture & Viva Q&A Highlights

1. **Full-Stack Architecture:**
   - Frontend: React 19, Vite, Tailwind CSS v4, Lucide Icons, Recharts, React Router v7, TanStack Query.
   - Backend: Node.js, Express, MongoDB with Mongoose, JWT authentication with rotating cookies, and Winston logging.
2. **Fraud Prevention & Verification Engine:**
   - Heuristic risk scoring (0-100) scanning business email domains (flagging free webmails), GSTIN format validation, incorporation document verification, and scam keyword detection (upfront deposits, training fees).
3. **Monetization Architecture:**
   - Supports live Razorpay integration with HMAC-SHA256 signature verification alongside instant simulation sandbox mode for zero-risk demonstration.
   - Quota enforcement middleware blocking over-limit job creation and candidate AI runs.
4. **Security & Data Integrity:**
   - Multi-tenant isolation through organization-scoped queries and middleware.
   - Role-Based Access Control (RBAC) separating candidates, recruiter roles (`owner`, `hiring_manager`, `interviewer`, `viewer`), and platform administrators.
   - Sanitization against NoSQL injection and XSS.
