# Backend Implementation Report

Date: 2026-08-18

## Delivered

A production-oriented `/api/v1` backend was added alongside the legacy `/api` contract used by the current React frontend. The implementation retains the deterministic analyzer/matcher and existing UI compatibility while adding secure sessions, organizations, tenant policies, versioned resumes, structured jobs/applications, hybrid matching, interviews, notifications, analytics, audit/security events, configurable AI providers, background jobs, validation, tests, CI, and deployment hardening.

## Main file groups

- Entry/config: `server/app.js`, `server/server.js`, `server/worker.js`, `server/config/*`, `server/.env.example`
- V1 routes/controllers: `server/routes/v1Routes.js`, `server/controllers/v1*.js`
- Auth/security middleware: `server/middleware/v1Auth.js`, `validate.js`, `requestContext.js`, `uploadResumeV1.js`
- Domain models: `Organization`, `Membership`, `AuthSession`, `Resume/ResumeVersion/ParsedResume`, `Recruitment` (matches/notes), `Interview`, `Notification`, `AIAnalysis`, `AuditLog`, `SecurityEvent`, `Consent`, `JobRun`; legacy `User`, `Job`, and `Application` were extended compatibly
- Services: session, audit, notification, Mongo-backed background queue, malware scanner, resume processing, hybrid matching, and `services/ai/*`
- Data access: tenant-scoped base repository
- Tests: `productionCore.test.js`, `v1Workflow.test.js`, plus fixes to isolated DB setup
- Delivery/docs: active `.github/workflows/ci.yml`, Docker API/worker/Mailpit topology, backend API and environment documentation

## Implemented workflow

### Candidate

Registration and verification; short access/rotating refresh session; consent management; profile/onboarding; secure PDF/DOCX upload; malware/content checks; SHA-256 duplicate detection; immutable versions; asynchronous parse/extraction/analysis; job discovery; hybrid fit and recommendations; immutable application submission/tracking/withdrawal; notifications; interview confirmation/reschedule/preparation; account export/deletion.

### Recruiter and hiring team

Recruiter registration with organization ownership; organization members and permission templates; structured draft jobs; AI JD parse/improvement; publication/closure; tenant-scoped applications; exact submitted resume download; persisted explainable ranking; shortlist/state machine; tags, notes, comparison, search, communication; interview scheduling/questions/feedback; recruitment and AI analytics; audit/security views.

## AI and matching

- OpenAI-compatible provider adapter configurable by base URL, key, model, primary and fallback provider.
- Configurable embeddings provider with deterministic TF-IDF fallback.
- Strict Zod outputs for resume extraction/improvement, JD parsing/improvement, interview questions/preparation, recruiter copilot, and career copilot.
- Timeouts, bounded retry, provider fallback, schema fallback, confidence, uncertainty, evidence, provider/model/prompt metadata, token/latency/cost accounting.
- Candidate consent gates external resume/embedding processing.
- Hybrid deterministic score covers required/preferred skills, experience, explicit education, semantic relevance and preferences.
- Protected/contact fields are removed from ranker text. Results state limitations and cannot change hiring state automatically.

## Security fixes

- Replaced v1 long-lived browser bearer sessions with 15-minute configurable access tokens and hashed rotating refresh sessions.
- Secure/HttpOnly refresh cookie, double-submit CSRF token, session listing/revocation, password-change/reset revocation.
- Bcrypt cost increased from 8 to 12; production verifies secret length and secure configuration.
- Organization membership and permission checks scope every v1 tenant route.
- Candidate-only server policies on candidate operations.
- Strict Zod validation, unknown-key rejection, request/body limits, NoSQL sanitization, CORS allowlist, Helmet, per-auth/per-AI limits.
- PDF/DOCX content verification, EICAR baseline plus required production malware scanner, random private storage keys, mode 0600 local files, S3 encryption, no public static files.
- Request IDs, PII-safe paths, production JSON logs, audit and security records.
- Fixed legacy application snapshots to retain provider and parsed text.
- Fixed legacy resume deletion from breaking application-held files.
- Fixed password-change invalidation, closed-job recommendations/fit, forced DNS, frontend lint, vulnerable backend dependency tree, and misleading test documentation.

## API surface

`server/routes/v1Routes.js` contains more than 80 versioned operations across:

- auth/sessions/passwords
- users/consents/export/deletion
- organizations/members
- candidate profile/resumes/job runs
- public and organization jobs
- applications/transitions/shortlist/tags/notes/messages/resume access
- fit/ranking/comparison/search/recommendations
- interviews/feedback/preparation/questions
- AI feature execution
- notifications
- recruitment and AI analytics
- organization/platform audit/security/admin
- liveness/readiness

The exact route and policy reference is in `docs/backend-api.md`.

## Verification

Successful commands:

```bash
cd server && npm run check
cd server && npm run lint
cd server && npm audit --omit=dev --audit-level=high
cd server && NODE_ENV=test node --test --test-concurrency=1 \
  test/app.test.js test/matching.test.js test/resumeAnalyzer.test.js test/productionCore.test.js
cd client && npm run lint
cd client && npm run build
```

The verified no-database subset has 48 passing tests. It includes headers/errors, validation, upload spoofing, EICAR rejection, protected-data redaction, hybrid scoring, all deterministic AI schemas, permission templates, and brute-force limiting.

`npm test` was also run. Database-independent tests passed, but this Arena environment has neither Docker nor `mongod`, and its network repeatedly reset the MongoDB binary download used by `mongodb-memory-server`; database suites therefore fail in their setup hook rather than in assertions. CI now supplies a pinned MongoDB 7 service directly and the test setup prefers that isolated `hiresmart_test` database without downloading a binary. `v1Workflow.test.js` covers the complete candidate/recruiter workflow and cross-organization denial in that environment. The test safety guard still rejects Atlas/production cleanup.

## Remaining non-critical limitations

- Legacy `/api` remains until the current frontend migrates to `/api/v1`; it retains legacy token semantics for compatibility.
- The durable worker queue uses MongoDB rather than Redis/BullMQ. It supports retry, backoff, stale-lock recovery, ownership and status, but Redis is preferable at high throughput.
- Uploads pass through API memory (10 MB cap). Direct quarantine-bucket presigned uploads should be the next scale improvement.
- Scanned PDFs return an explicit unreadable/failed state; OCR is not bundled because no OCR service is configured.
- Calendar-neutral interview fields/lifecycle are implemented, but Google/Microsoft/Calendly adapters and OAuth setup remain integration work.
- External AI/embedding quality depends on configured provider/model and organization evaluation data. Deterministic fallbacks remain the default and are not represented as LLM output.
- Custom organization roles, SSO/SCIM, job-board/HRIS webhooks, subscription billing, and vector-database candidate search remain P1/P2 capabilities.
