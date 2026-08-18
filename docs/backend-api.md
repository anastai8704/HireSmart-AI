# HireSmart Backend API

The production contract is **`/api/v1`**. Legacy `/api/auth`, `/api/user`, `/api/jobs`, `/api/candidate`, and `/api/matching` routes are available only when `ENABLE_LEGACY_API=true` for migration/testing. They are disabled by default in production and the React client uses only `/api/v1`.

## Contract

Successful v1 requests return `{ "data": ..., "meta": ...? }`. Errors return:

```json
{
  "success": false,
  "status": "fail",
  "message": "Safe message",
  "code": "MACHINE_READABLE_CODE",
  "requestId": "uuid",
  "fieldErrors": []
}
```

Use `Authorization: Bearer <short-lived-access-token>`. Login and token rotation set a Secure/HttpOnly refresh cookie plus a readable `hiresmart_csrf` cookie. Send that CSRF value in `X-CSRF-Token` when calling `/auth/token`. Organization routes validate membership and permission; cross-tenant resources return 404. List endpoints accept `limit` (1–100), `after`, and the documented filters. Timestamps are UTC ISO-8601.

## Authentication and account

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public, limited | Candidate or recruiter registration; recruiter registration atomically creates an organization owner membership |
| POST | `/auth/verify-email` | Public, limited | Consume one-time email token |
| POST | `/auth/verification-emails` | Public, limited | Resend without account enumeration |
| POST | `/auth/login` | Public, limited | Issue access token and rotating refresh cookie |
| POST | `/auth/token` | Refresh cookie, limited | Rotate refresh session and access token |
| POST | `/auth/logout` | Authenticated | Revoke current session |
| GET/DELETE | `/auth/sessions[/:sessionId]` | Self | List/revoke sessions |
| POST | `/auth/password/forgot` | Public, limited | Generic reset request |
| POST | `/auth/password/reset` | Public, limited | Reset password and revoke sessions |
| PATCH | `/auth/password` | Self | Change password and revoke other sessions |
| GET | `/users/me` | Self | Identity/onboarding status |
| GET | `/users/me/export` | Self | Export safe account/profile/application data |
| DELETE | `/users/me` | Self | Revoke sessions and start account deletion lifecycle |

Passwords are 12–128 characters on v1. Production requires verified email. Refresh tokens are stored only as hashes.

## Organizations and team

| Method | Route | Permission |
|---|---|---|
| GET/POST | `/organizations` | Authenticated / verified user |
| GET/PATCH | `/organizations/:organizationId` | member / `organization.manage` |
| GET/POST | `/organizations/:organizationId/members` | `member.manage` |
| PATCH | `/organizations/:organizationId/members/:membershipId` | `member.manage`; last owner protected |

Roles: `owner`, `admin`, `recruiter`, `hiring_manager`, `interviewer`, `viewer`. Permissions are enforced by the API, not frontend routes.

## Candidate profile and versioned resumes

| Method | Route | Access |
|---|---|---|
| GET/PATCH | `/candidates/me/profile` | Candidate self |
| POST/GET | `/candidates/me/resumes` | Candidate self; multipart field `resume` for upload |
| GET | `/candidates/me/resumes/versions/:versionId` | Owner |
| GET | `/candidates/me/resumes/versions/:versionId/download` | Owner; private no-store stream |
| DELETE | `/candidates/me/resumes/versions/:versionId` | Owner; referenced artifacts retained privately |
| POST | `/candidates/me/resumes/versions/:versionId/retry` | Owner, failed state only |
| POST | `/candidates/me/resumes/versions/:versionId/analysis` | Owner, AI-limited |
| POST | `/candidates/me/resumes/versions/:versionId/tailor` | Owner, AI-limited; body contains published `jobId` |
| GET | `/job-runs/:jobRunId` | Job owner |

Uploads accept actual PDF and DOCX content up to 10 MB. Filename, declared MIME, and magic/container content must agree. Files receive random private keys, SHA-256 duplicate detection, processing state, retries, parsing, structured extraction, AI/rule analysis, and immutable versions. Legacy DOC is deliberately rejected because it cannot be parsed safely by the current worker.

## Jobs, applications, matching, collaboration

Public:

- `GET /jobs` and `GET /jobs/:jobId`
- `POST /jobs/:jobId/fit` (candidate; exact ready resume version)
- `POST /jobs/:jobId/applications` (candidate; supports replay-safe `Idempotency-Key`)
- `GET /candidates/me/recommendations`
- `GET/POST/DELETE /candidates/me/saved-jobs[/:jobId]`
- `GET /candidates/me/applications[/:applicationId]`
- `POST /candidates/me/applications/:applicationId/withdraw`

Organization:

| Method | Route | Permission |
|---|---|---|
| GET/POST | `/organizations/:organizationId/jobs` | `job.read` / `job.manage` |
| GET/PATCH | `/organizations/:organizationId/jobs/:jobId` | `job.read` / `job.manage` |
| POST | `.../jobs/:jobId/publish` or `/close` | `job.manage` |
| GET | `/organizations/:organizationId/assigned-jobs` | active member with `job.read` |
| PUT | `.../jobs/:jobId/hiring-team` | `job.manage` |
| GET | `.../jobs/:jobId/applications` | `application.review` |
| GET | `.../applications/:applicationId` | `application.review` |
| POST | `.../applications/:applicationId/transitions` | `application.manage` |
| POST | `.../applications/:applicationId/shortlist` | `application.manage` |
| GET | `.../applications/:applicationId/match` | `application.review` |
| GET | `.../jobs/:jobId/ranking` | `application.review` |
| GET | `.../applications/:applicationId/resume` | `application.review`, audited |
| PUT | `.../applications/:applicationId/tags` | `application.manage` |
| POST | `.../applications/:applicationId/messages` | `application.manage`, idempotency key supported |
| POST | `.../applications/compare` | `application.review` |
| GET/POST | `.../applications/:applicationId/notes` | `application.review` |
| GET | `.../candidates/search` | `application.review`; skill/location/status/tag/experience filters |

The application state machine prevents arbitrary jumps. Withdrawal changes state instead of deleting history. Each application references and snapshots its exact resume version. Hybrid matches persist required/preferred skill, experience, education, semantic and preference components plus confidence, evidence, concerns and limitations. Protected identifiers are removed before matching.

## Interviews

- `GET/POST /organizations/:organizationId/interviews` (`POST` supports replay-safe `Idempotency-Key`)
- `PATCH /organizations/:organizationId/interviews/:interviewId`
- `POST .../:interviewId/cancel`, `/complete`, `/feedback`, `/questions`
- `GET /candidates/me/interviews`
- `POST /interviews/:interviewId/confirm`, `/reschedule`, `/preparation` for the application candidate

Lifecycle: draft → invited → confirmed/reschedule requested → completed/cancelled. Feedback is one immutable submission per evaluator and uses criterion ratings plus evidence.

## AI

`POST /api/v1/ai/:feature` for candidate-safe use and `POST /api/v1/organizations/:organizationId/ai/:feature` for authorized organization use.

Features:

- `resume_extraction`
- `resume_rewrite`
- `resume_improvement`
- `jd_generation`
- `jd_parse`
- `jd_improvement`
- `interview_questions`
- `interview_preparation`
- `recruiter_copilot`
- `career_copilot`

Body: `{ "input": {}, "subjectType": "optional", "subjectId": "optional" }`. Providers are configured by environment and use an OpenAI-compatible structured JSON API. Outputs pass strict Zod schemas; malformed/timeout/provider failures retry safely and fall back to deterministic grounded logic. Every persisted run records provider, model, prompt version, confidence, fallback, tokens and latency. AI cannot mutate hiring state.

## Notifications, analytics, audit, admin, health

- `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`
- `GET /organizations/:organizationId/analytics/recruitment`
- `GET /organizations/:organizationId/analytics/ai-usage`
- `GET /organizations/:organizationId/audit-logs` and `/security-events`
- Platform admin: `GET /admin/users|organizations|ai-usage|audit-logs|security-events`, `POST /admin/users/:id/suspend|reactivate`
- `GET /health/live` and `GET /health/ready`

Recruitment analytics report funnel, shortlist/interview/hire rates, time-to-stage, and AI score generation separately from human outcomes.

## Environment and processes

Copy `server/.env.example`; production startup rejects missing Mongo/JWT/CORS, short JWT secrets, disabled verification, and external AI providers without a key. Main processes:

```bash
npm start          # HTTP API
npm run worker     # durable Mongo-backed background worker
npm run migrate:v1 # idempotently migrate legacy recruiters/jobs/apps/resumes
npm run verify     # syntax, lint and tests
```

Docker Compose starts Mongo, API, worker, private shared resume storage, frontend, and Mailpit. It requires an explicit `JWT_SECRET`; Mailpit UI is at port 8025 for local verification/reset messages.
