# HireSmart AI — Domain Model & Data Architecture

This document describes the core domain areas, data entities, status state machines, and data protection policies implemented in HireSmart AI using MongoDB and Mongoose.

---

## 1. Core Entities & Collections

| Domain Area | Primary Model | Purpose & Relationships |
| :--- | :--- | :--- |
| **Users** | `User` | Global user identity (`candidate`, `recruiter`, `admin`), password hashes, verification flags, tokens. |
| **Candidate Profiles** | `CandidateProfile` | Education, experience, skills, social links, bio, and location (1:1 with `User`). |
| **Resumes & ATS** | `Resume`, `ResumeVersion`, `ParsedResume` | Immutable resume storage versions (PDF/DOCX), SHA-256 hashes, parsed text, and normalized skill taxonomy. |
| **Organizations** | `Organization` | Companies posting jobs, verification status, website, industry, and workspace settings. |
| **Memberships** | `Membership` | Recruiter-to-organization multi-tenancy mappings with roles (`owner`, `hiring_manager`, `interviewer`, etc.). |
| **Company Verification** | `CompanyVerificationCase` | Review workflows for GSTIN, CIN, domain ownership, and risk indicators. |
| **Jobs & Requisitions** | `Job` | Structured job postings, compensation, required/preferred skills, location, and workplace mode. |
| **Job Moderation** | `JobModerationEvent` | Append-only audit history of job moderation lifecycle and state transitions. |
| **Applications** | `Application` | Candidate applications tied to exact job and resume versions with status history and pre-hire offer subdocument. |
| **Candidate Matching** | `CandidateMatch` | Hybrid match scoring (skills, experience, education, semantic similarity) with explainable component breakdowns. |
| **Interviews** | `Interview` | Scheduled interview rounds, calendar integration (Google Meet / manual), evaluator scorecards, and ratings. |
| **Placements & Employment**| `Placement` | Canonical employment records, offer details, joining confirmations, and verification status. |
| **Subscriptions & Billing**| `Subscription`, `PaymentTransaction`, `RazorpayPlan` | Entitlement limits (active jobs, team seats, AI quota) and transaction ledger (Test Mode & Simulation). |
| **Governance & Security** | `AuditLog`, `SecurityEvent`, `Consent` | Immutable system audit trails, suspicious auth detections, and user DPDP/GDPR consent records. |
| **Notifications & Alerts** | `Notification`, `JobAlert` | In-app alerts, saved search alerts, and queued notification deliveries. |

---

## 2. Status Enums & State Machines

All status transitions are centralized in `server/domain/stateMachines.js` to guarantee deterministic business rules across controllers.

### 2.1 Job Lifecycle & Moderation

- **Job Lifecycle (`Job.status`):**
  - `draft` → `published`, `closed`
  - `published` → `closed`
  - `closed` (terminal)

- **Job Moderation (`Job.moderation.status`):**
  - `none` → `pending`
  - `pending` → `approved`, `rejected`, `changes_requested`
  - `rejected` → `pending`
  - `changes_requested` → `pending`
  - `approved` → `suspended`, `pending`, `rejected`
  - `suspended` → `approved`

### 2.2 Company Verification (`Organization.verificationStatus`)

- `pending` → `under_review`, `rejected`
- `under_review` → `verified`, `rejected`
- `verified` → `suspended`
- `suspended` → `verified`
- `rejected` → `under_review`

### 2.3 Application Stages (`Application.status`)

- `submitted` → `under_review`, `shortlisted`, `rejected`
- `under_review` → `shortlisted`, `interview`, `rejected`
- `shortlisted` → `interview`, `rejected`
- `interview` → `offer`, `rejected`
- `offer` → `hired`, `rejected`
- `hired` (terminal)

### 2.4 Canonical Employment (`Placement.employment.status`)

1. `offer_accepted` → `pending_joining`, `joined_pending_verification`
2. `pending_joining` → `joined_pending_verification`
3. `joined_pending_verification` → `active_verified`, `offer_accepted`, `pending_joining`
4. `active_verified` → `employment_end_pending_verification`
5. `employment_end_pending_verification` → `employment_ended_verified`, `active_verified`
6. `employment_ended_verified` (terminal)
7. `status_unconfirmed` → `offer_accepted`, `pending_joining`, `active_verified`, `employment_ended_verified`

---

## 3. Data Protection & Append-Only Guarantees

Critical business records are protected by Mongoose plugins in `server/models/plugins/protectRecords.js`:

- **Protected against accidental hard deletion:** `Application`, `Placement`, `PaymentTransaction`, `Subscription`, `CompanyVerificationCase`, and `JobModerationEvent`.
- **Append-Only History:** `JobModerationEvent` documents cannot be updated or mutated after insertion.
- **Deletions Refused:** Any standard `deleteOne` or `findByIdAndDelete` on protected entities returns `409 RECORD_PROTECTED`. Only guarded seed or administrative migration scripts with `.setOptions({ allowHardDelete: true })` can bypass this check.

---

## 4. Indexing & Multi-Tenant Scoping

- **Tenant Isolation:** Every multi-tenant collection (`jobs`, `applications`, `interviews`, `memberships`, `placements`) indexes `{ organization: 1 }` to enforce isolation.
- **Partial Unique Indexes:** Prevent race conditions (e.g. only one open verification case per organization, unique active primary resumes per candidate, unique application per job-candidate pair).
- **Index Generation:** Run `npm run indexes:create` in `server/` to verify and register all schema indexes.
