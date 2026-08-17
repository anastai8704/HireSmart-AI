# HireSmart AI Backend API

Base URL: `http://localhost:5000/api`

All JSON responses include `success`. Error responses additionally include `status` (`fail` or `error`) and `message`.

## Authentication

Pass the login token on protected requests:

```http
Authorization: Bearer <token>
```

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Create a candidate account. Supplied roles are ignored. |
| POST | `/auth/login` | Public | Obtain a JWT. |
| POST | `/auth/recruiters` | Admin | Create a recruiter account. |
| PUT | `/auth/resume` | Candidate | Upload a PDF, DOC, or DOCX resume (max 5 MB). |
| GET | `/auth/resume` | Candidate | Download the caller's current resume. |
| DELETE | `/auth/resume` | Candidate | Delete the caller's current resume. |

Create the first admin locally with `npm run bootstrap:admin` after setting the `ADMIN_*` values in `server/.env`. Do not expose this command through HTTP.

## Profiles and administration

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/user/profile` | Signed in | Get the caller's safe profile and resume metadata. |
| PUT | `/user/profile` | Signed in | Update name, contact/profile fields, skills, or recruiter company fields. |
| GET | `/user/admin` | Admin | Get platform user, job, and application status totals. |
| GET | `/user/admin/users?page=1&limit=20&role=&search=` | Admin | List safe user records. |
| PATCH | `/user/admin/users/:id/status` | Admin | Set `{ "isActive": true|false }`; admins cannot change themselves. |

## Public jobs

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/jobs?page=1&limit=12&keyword=&location=&experience=&jobType=&sort=` | Public | List open, published jobs. Sort: `newest`, `oldest`, `salary_high`, `salary_low`. |
| GET | `/jobs/:id` | Public | Get an open, published job. |

Public job responses intentionally exclude applications, candidate identities, saved-job records, and resume data.

## Candidate workflow

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/jobs/:id/apply` | Candidate | Apply using the candidate's current uploaded resume. |
| DELETE | `/jobs/:id/apply` | Candidate | Withdraw an eligible application. |
| GET | `/jobs/applied?page=1&limit=12` | Candidate | List the caller's applications. |
| POST | `/jobs/:id/save` | Candidate | Save an open job. |
| DELETE | `/jobs/:id/save` | Candidate | Remove a saved job. |
| GET | `/jobs/saved` | Candidate | List saved jobs. |
| GET | `/jobs/:id/status` | Candidate | Get saved/applied state for a job. |
| GET | `/jobs/candidate-dashboard` | Candidate | Get application and saved-job summary data. |

## Recruiter workflow

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/jobs` | Recruiter/Admin | Create a job. Required: title, company, location, salary, experience, description, skills. |
| PUT | `/jobs/:id` | Owner/Admin | Update whitelisted job fields, including `status` (`draft`, `published`, `closed`). |
| DELETE | `/jobs/:id` | Owner/Admin | Delete a job and its applications; saved-job references are cleaned up. |
| GET | `/jobs/my-jobs?page=1&limit=12` | Recruiter/Admin | List a recruiter's jobs and application counts. |
| GET | `/jobs/:id/applicants?page=1&limit=20&status=&search=&sort=` | Owner/Admin | List applicants. Sort: `newest`, `oldest`, `name`, `status`. |
| PUT | `/jobs/:jobId/applicant/:userId/status` | Owner/Admin | Change an application status and add an optional status note. |
| PUT | `/jobs/:jobId/applicant/:userId/notes` | Owner/Admin | Set private `{ "recruiterNotes": "..." }`. |
| GET | `/jobs/applicant/:id` | Recruiter/Admin | Get a candidate profile only if they applied to one of the recruiter's jobs. |
| GET | `/jobs/candidate/:candidateId/resume?jobId=:jobId` | Owner/Admin | Download the resume snapshot submitted for that application. |
| GET | `/jobs/dashboard` | Recruiter/Admin | Get recruiter summary metrics. |
| GET | `/jobs/analytics` | Recruiter | Get recruiter funnel analytics and top job. |

## AI: matching, ranking and resume analysis

All AI endpoints are pure computation - no external API key or network call is
required, so they always work offline.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/matching/resume/analyze-text` | Public | Analyse pasted resume text (50-50,000 chars). Nothing is stored. |
| GET | `/matching/resume/analysis` | Candidate | ATS health report for the caller's uploaded resume. |
| GET | `/matching/recommendations?limit=10` | Candidate | Open jobs ranked by fit. Scores below 20 are filtered out. |
| GET | `/matching/jobs/:jobId/fit` | Candidate | Gap analysis for one job: score, missing keywords, tailoring tips. |
| GET | `/matching/jobs/:jobId/ranking` | Owner/Admin | All applicants for a job, scored and ranked best-first. |
| GET | `/matching/applications/:applicationId/match` | Owner/Admin | Match score for a single application. |

### Match response shape

Every match includes a full breakdown so the score can be explained in the UI:

```json
{
  "matchScore": 90,
  "verdict": "Excellent match",
  "matchedSkills": ["react", "node", "mongodb"],
  "missingSkills": ["kubernetes"],
  "breakdown": {
    "skills":     { "score": 92,  "weight": 0.55, "applicable": true },
    "semantic":   { "score": 88,  "weight": 0.25, "applicable": true, "rawSimilarity": 0.3961 },
    "experience": { "score": 100, "weight": 0.15, "applicable": true, "requiredYears": 3, "candidateYears": 4 },
    "education":  { "score": 67,  "weight": 0.05, "applicable": true, "signals": ["master", "mca"] }
  },
  "explanation": [
    "Matched 6 of 7 required skills.",
    "Missing: kubernetes.",
    "Resume content aligns closely with the job description.",
    "Meets the 3+ year experience requirement."
  ]
}
```

Components with `applicable: false` are excluded from the final score and the
remaining weights are re-normalised, so a job that states no experience requirement
does not cap every candidate below 100.

### Resume analysis response shape

```json
{
  "atsScore": 82,
  "grade": "A",
  "wordCount": 486,
  "summary": "Strong, ATS-friendly resume...",
  "contact": { "email": "...", "phone": "...", "linkedin": "...", "github": "...", "portfolio": null },
  "sections": { "present": ["Contact", "Skills", "Experience"], "missing": ["Projects"] },
  "skills": { "all": ["react", "node"], "byCategory": { "frontend": ["react"], "backend": ["node"] } },
  "checks": [{ "key": "contact", "label": "Contact information", "score": 85, "weight": 0.15 }],
  "suggestions": [
    { "severity": "critical", "title": "Add a phone number", "detail": "Recruiters shortlist by phone first..." }
  ]
}
```

Suggestions are sorted `critical` -> `high` -> `medium` -> `low`, so the top items are
always the highest-impact fixes.

## Migration and environment

Existing deployments that use the old `Job.applicants` array must run `npm run migrate:applications` exactly once after taking a database backup. The script creates `Application` records and leaves the old arrays untouched for rollback verification.

Copy `server/.env.example` to `server/.env` and replace every placeholder. In production, `MONGO_URI`, `JWT_SECRET`, and `CORS_ORIGIN` are mandatory.
