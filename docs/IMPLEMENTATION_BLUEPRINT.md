# HireSmart AI — Production Rebuild Audit and Implementation Blueprint

**Audit date:** 2026-08-18  
**Audited source:** `development` snapshot at commit `fb9b90b9ebe50165ae477a06c1fe5d7c99e51a8e` (the Arena working branch is based directly on this commit)  
**Scope:** repository-wide architecture, backend, frontend contracts, tests, configuration, containers, scripts, and documentation  
**Constraint:** this document proposes implementation; it does not add implementation code.

---

## Executive decision record

HireSmart is currently a coherent demo-sized modular Express application, not a production ATS. Its best reusable assets are the deterministic matching/analyzer functions, basic Express hardening, private download authorization, UI component library, and several ownership checks. Its principal limitations are the absence of organizations and memberships, a single long-lived bearer token in browser storage, request-thread document processing, non-versioned jobs/resumes, synchronous unpersisted matching, incomplete application snapshots, inconsistent contracts, and almost all real recruitment collaboration/interview/communication capabilities.

The target should be a **modular monolith plus asynchronous worker**, not microservices. Use one versioned REST API and one worker deployment, MongoDB as the system of record, Redis/BullMQ for queues and short-lived coordination, S3-compatible private object storage, an email provider, and provider-neutral AI/embedding adapters. This gives strong boundaries and operational realism without premature distributed-system complexity. Modules can be extracted later using the outbox events already defined here.

Key decisions:

1. **Retain and version the deterministic engine** as a safe fallback and one component of hybrid scoring; do not market TF-IDF as semantic AI.
2. **Introduce organizations and memberships before expanding recruiter features.** A global `user.role` cannot enforce tenancy.
3. **Make resumes and jobs immutable/versioned inputs.** Every application references exact resume and job versions.
4. **Move parsing, enrichment, embeddings, matching, email, and webhooks off HTTP request threads.**
5. **Use short-lived access tokens and rotating, server-stored refresh sessions in Secure/HttpOnly cookies.**
6. **Treat AI output as an untrusted proposal.** Validate schemas, attach evidence, record provenance, and require normal domain validation or human approval before state changes.
7. **Do not rank on protected/sensitive attributes.** DOB, gender, name, photo, contact details, address, and inferred demographics are excluded from model inputs.
8. **Build a stable `/api/v1` contract and preserve current routes through a temporary compatibility adapter.**

---

# A. Current-state audit

## A1. Existing architecture

### Runtime topology

- **Frontend:** React 19, React Router 7, Vite 8, Tailwind CSS 4, Axios, Recharts, Lucide. It is built to static assets and served by Nginx in Docker.
- **Backend:** CommonJS Node/Express 5 application with Mongoose 9, MongoDB, JWT, bcryptjs, Multer, `pdf-parse`, Mammoth, Nodemailer, S3 SDK, Winston/Morgan, Helmet, CORS, compression, HPP, rate limiting, and Mongo sanitization.
- **Storage:** local filesystem by default; S3-compatible storage is partially supported.
- **Deployment:** three-service Docker Compose (`web`, `api`, `mongo`), local volumes for Mongo and resumes. There is no worker, queue, cache, tracing, or production orchestrator definition.
- **Architecture style:** routes → controllers → occasional services/models. Candidate profile has a service layer; job/auth/user controllers perform business logic and persistence directly. There is no repository layer, domain event layer, transaction unit, or module-local composition.

### Actual backend request flow

1. `server/server.js` overrides DNS resolvers, validates selected environment variables, connects Mongoose, and starts HTTP.
2. `server/app.js` applies Helmet, CORS, compression, 1 MB JSON/form limits, Mongo sanitization, HPP, request logging, and a global `/api` rate limiter.
3. Routes are mounted at `/api/auth`, `/api/user`, `/api/jobs`, `/api/candidate`, and `/api/matching`.
4. Protected routes parse a bearer JWT, load the user on every request, reject inactive users, and use a global role string for RBAC.
5. Controllers validate manually, query Mongoose directly or call a service, then emit several different JSON response shapes.
6. `asyncHandler` forwards rejections to a centralized error middleware; 5xx messages are masked.

This flow is understandable, but controllers are too broad (`jobController.js` is roughly 685 lines), domain boundaries are mixed, and infrastructure concerns are not isolated.

## A2. Existing modules and functionality

| Area | Actual implementation | Assessment |
|---|---|---|
| Authentication | candidate/recruiter registration, login, email verification token, resend, forgot/reset/change password, admin-created recruiter | Basic functionality exists; session design and registration policy are not production-safe |
| Users/admin | self profile, profile update, platform totals, user list, activate/deactivate | No tenant context, permissions, audit, admin safety controls, or deletion/export |
| Candidate profile | separate profile plus embedded education, experience, projects, certifications | CRUD exists but overlaps `User`; frontend does not expose the rich profile workflow |
| Jobs | public browse/detail; recruiter CRUD; statuses and basic filters | Ownership is individual recruiter only; no organization, versions, requirements, approvals, publish workflow, salary structure, or hiring team |
| Applications | apply, withdraw, list, pipeline status, one free-text recruiter note | Basic flow exists; state machine, version integrity, events, collaboration, consent, messaging, and offers are absent |
| Saved jobs | ObjectId array on `User` | Works at demo scale; not independently queryable/auditable |
| Resume | one mutable resume stored on `User`, upload/download/delete, synchronous parsing | Not versioned; processing and security pipeline are insufficient |
| Matching | skill overlap, TF-IDF/cosine, years regex, education keywords; recruiter ranking and candidate recommendations | Deterministic and explainable, but not a real AI provider or calibrated hiring model |
| Resume analyzer | regex/dictionary checks for contact, sections, skills, achievements, writing, and length | Useful fallback, English/tech-centric heuristic rather than ATS compatibility proof |
| Analytics | simple counts/funnel totals/top job | Operationally shallow and computed on request |
| Email | SMTP or simulated transport for verification/reset only | No templates, event ledger, bounce handling, queue, provider abstraction, or candidate communication |
| Company | `Company` model exists | Unused by routes/controllers and disconnected from jobs/users |

## A3. Current database models and relationships

### `User`

Global identity and many unrelated concerns are combined: authentication, global role, activation, candidate skills, recruiter company fields, saved job IDs, current resume storage metadata/text/summary, and general profile fields. There is no session collection, organization membership, tenant scope, consent, or deletion state.

Relationships:

- one user → zero/one `CandidateProfile`
- recruiter user → many `Job`
- candidate user → many `Application`
- candidate user → many saved jobs through an embedded ID array
- candidate user → exactly one current resume pointer

### `CandidateProfile`

One-to-one with `User`; embeds education, experience, projects, and certifications. It also stores DOB, gender, location/address, languages, and social links. Skills, bio, phone, image, and location are duplicated or expected by validators/population from `User`, creating two profile concepts.

### `Job`

Contains string company, location, one numeric salary, free-text experience, a single job type, description, skill strings, status, close date, and recruiter user ID. There is no `Company`/organization reference, version, required/preferred distinction, currency/range, workplace mode, hiring team, requisition, approval, headcount, or audit state.

### `Application`

Uniquely joins a job and candidate. It embeds a resume snapshot, mutable status, free-text recruiter note, and embedded status history. It references the mutable job rather than a job version. Status history is mutable and unbounded. No organization ID is denormalized for mandatory tenant scoping.

### `Company`

Has owner and basic company metadata but is orphaned: it is not imported into app routes/controllers, jobs hold company names, and recruiter profiles duplicate company data.

## A4. Authentication, RBAC, ownership, and tenancy

What works:

- Registration ignores a caller-supplied role for candidate registration.
- Admin-only recruiter creation exists.
- Protected requests reload the user and reject inactive accounts.
- Job mutation, applicant list, matching, and candidate-resume download generally call an owner check.
- Recruiters can only view a candidate profile if that candidate applied to one of their jobs.

What is missing or weak:

- Authorization is only `candidate|recruiter|admin` on `User`; there is no hiring manager role, organization, membership, permission, invitation, team, or scoped administrator.
- Jobs belong to an individual recruiter. Teammates cannot collaborate, and moving/deactivating the recruiter compromises organization continuity.
- Admin is an unrestricted platform superuser with no step-up authentication or audit trail.
- Recruiter self-registration is public whenever `RECRUITER_INVITE_CODE` is empty (the default).
- JWTs default to 7 days in code and 30 days in `.env.example`; they are stored in `localStorage`, cannot be individually revoked, and remain valid after password changes because `passwordChangedAt` is never checked.
- No refresh tokens, sessions/device list, logout endpoint, revocation, token family reuse detection, MFA, or login security events.
- Email verification is disabled by default and in Compose.
- Password hashing uses bcrypt cost 8, below a reasonable contemporary baseline after environment benchmarking.
- Route-level role checks are not policy checks. Ownership logic is duplicated in controllers and does not establish tenant isolation by construction.

## A5. File upload and resume-processing flow

Actual flow:

`PUT /api/auth/resume` → Multer memory buffer (5 MB) → extension/MIME equality check → local/S3 write → synchronous PDF or DOCX text extraction → whitespace flattening → first 300 characters as “summary” → overwrite fields on `User` → conditionally delete old object.

Downloads stream the private object only after candidate self-auth or recruiter job-ownership plus application checks. Upload directories are not statically served, which is good.

Limitations:

- `.doc` is accepted but never parsed.
- MIME is trusted from multipart metadata and filename extension; there is no magic-byte/content verification.
- No malware scan, archive/zip-bomb defense, encrypted/password-protected detection, OCR, page limit, parser sandbox, content disarm, duplicate hash, or quarantine state.
- Entire files live in API memory and parse on the HTTP request thread.
- Parser exceptions are swallowed; upload still succeeds with empty text and no explicit partial/failure state.
- Local storage is unsuitable for horizontally scaled production; S3 writes omit content type, server-side encryption, object tags, tenant prefix, and explicit private policy controls.
- No versioning, lifecycle, retention, legal hold, signed URL strategy, processing status, retries, or provenance.
- Whitespace normalization destroys layout and line boundaries needed by section/bullet analysis.

## A6. Current AI implementation and limitations

### Matching engine

`resumeMatchingService.js` produces a 0–100 score from:

- skills 55%
- TF-IDF/cosine text similarity 25%
- experience-year regex 15%
- education keyword presence 5%

Unavailable components are removed and remaining weights renormalized. The response includes matched/missing skills, component scores, a verdict, and simple explanations. This is pure, synchronous, deterministic, testable, and should be preserved as a fallback.

Limitations:

- TF-IDF over only the resume and JD is lexical similarity, not modern semantic embeddings.
- The synonym dictionary and skill taxonomy are small, static, English-centric, and software-role-centric.
- Skill evidence is mere token presence; it cannot distinguish “learned about Kubernetes” from production ownership, recency, duration, or proficiency.
- Experience extraction takes the first regex match and can mistake a requirement, project age, or unrelated number for total experience.
- Education scoring rewards keyword count rather than job-related qualification evidence.
- Required and preferred skills are not distinguished; no hard constraints, proficiency, recency, location/work authorization, or configurable scorecards exist.
- The 0.45 cosine calibration and verdict thresholds are hand-selected and unvalidated. Scores are not probabilities and have no measured confidence/calibration.
- Full resume text includes names/contact/demographic signals during lexical scoring. Although no explicit gender feature is used, the pipeline has no redaction/fairness boundary.
- Matches are calculated repeatedly, not persisted/versioned, and cannot be reproduced after inputs or code change.
- Ranking all applicants is synchronous and unpaginated.

### Resume analyzer

It checks regex-extracted contact details, expected headings, dictionary skills, quantified lines, action/weak phrases, and word count. It provides actionable suggestions and handles empty text. Limitations include destroyed line layout from parser normalization, false positives/negatives, no parser-quality metric, no actual ATS vendor compatibility, no multilingual support, and no AI provenance.

### Real AI status

There is no LLM, embeddings provider, vector index, provider abstraction, structured generation schema, prompt registry, usage/cost ledger, model metadata, retry/timeout/circuit breaker, content moderation, or AI evaluation framework. Current README “AI” is explainable heuristics, not an external AI integration.

## A7. Existing API contracts

Current base path is `/api` with these groups:

- `/auth`: register/login/verification/password/resume and admin recruiter creation
- `/user`: self profile, admin totals/users, placeholder role dashboards
- `/jobs`: public jobs, candidate application/saved-job/dashboard, recruiter jobs/applicants/status/notes/download/analytics
- `/candidate`: detailed profile and embedded subdocument CRUD
- `/matching`: public pasted-text analysis, candidate analysis/recommendations/fit, recruiter ranking/single match

Contract weaknesses:

- Success payloads alternate between top-level `user|job|jobs|applications|dashboard|analytics` and `data` wrappers.
- IDs alternate between `_id` and `id`; enum casing is inconsistent (`published` vs `Applied`).
- No API version, OpenAPI source, correlation ID, machine-readable error code, field-level errors, links, deprecation policy, ETag/version, or idempotency.
- Offset pagination is duplicated and absent on expensive ranking/recommendation/saved-job endpoints.
- Validation is manual and partial; schemas are not shared with documentation or AI structured output.
- `PUT` is used for partial updates in several places.
- Internal implementation names leak into routes (`/user`, `/candidate/profile`, `/matching`).

## A8. Existing recruiter workflow

Actual supported workflow:

public recruiter registration → profile/company strings → create/edit/delete own job → publish/draft/close → view simple dashboard → list or AI-rank applicants → inspect score → download application resume → change status → edit one private note → basic analytics.

Missing: real organization onboarding and verification, invitations, team roles, requisitions/approvals, JD copilot, structured requirements, job versions, publish channels, screening questions, talent pools, tags, multiple notes/mentions, communications/templates, interviews/calendars, scorecards, hiring manager review, offers, rejection reasons, compliance/consent, collaborative activity feed, candidate compare/search, rediscovery, and integrations.

## A9. Existing candidate workflow

Actual supported workflow:

register/login → edit basic profile → upload one resume → synchronous text parse → ATS analysis → browse/search jobs → fit view/recommendations → save/apply → list/withdraw applications → see status counts.

The detailed candidate profile API exists but has no corresponding complete frontend. Missing: verification/reset screens, onboarding state, resume versions, structured extraction review, consent/privacy controls, job alerts, interview preparation/scheduling, communications, feedback/results detail, profile completeness, preferences, work authorization, accessibility, account export/deletion, and career copilot.

## A10. Frontend/backend integration

Strengths:

- One Axios client uses relative `/api`, Vite proxies locally, and Nginx proxies in production.
- API calls are grouped by feature.
- Route guards correctly acknowledge that server authorization is authoritative.
- Lazy-loaded routes and reusable loading/error/empty states exist.
- Candidate/recruiter/admin demo screens consume most current APIs.

Problems:

- JWT is persisted in `localStorage`, increasing XSS token-theft impact.
- Auth comments claim registration signs in, but backend registration never returns a token. The UI falls back to a verification message even when verification is disabled.
- Recruiter form submits company fields, but backend registration discards them.
- There are no routed verify-email, forgot-password, or reset-password pages even though client API functions exist.
- No hiring-manager route or organization selector/context.
- Candidate structured profile API is effectively unused by the current `Profile` screen, which edits `User` fields.
- No frontend test setup or tests.
- The API client globally logs out on every 401, including a wrong-current-password response from change-password, because the backend uses 401 for that domain error.
- Fixed 30-second timeout is inappropriate for future async operations and currently masks slow synchronous parsing.
- Accessibility and responsive foundations are present, but complex workflow UX (autosave, unsaved changes, optimistic concurrency, background job status, notification center) is absent.

## A11. Existing tests and actual coverage

The repository contains **40 explicit `test(...)` cases**. Node’s test discovery also reports two helper files as subtests, producing the README’s “42” count. Coverage is not measured.

- 5 app/error/header tests
- 8 auth tests
- 2 job creation tests
- 12 text/matching unit tests
- 1 upload/application/download integration test
- 12 resume-analyzer unit tests

Audit execution results:

- `npm run check`: passed.
- Deterministic matching/analyzer and app tests ran successfully.
- Full backend run reported **31 pass / 11 fail**, because `mongodb-memory-server` could not download MongoDB 7.0.14 in this environment and no local test MongoDB was available. Therefore the README’s unconditional “42 passing” was not reproducible in this audit environment; this is test infrastructure fragility, not proof that all 11 product behaviors are defective.
- Frontend production build passed.
- Frontend lint failed: `client/vite.config.js` references `process` under a browser-oriented ESLint configuration (`no-undef`).
- There are no tests for tenant isolation (none exists), broad ownership abuse, recruiter registration policy, token expiry/revocation, application state transitions, deletion consistency, S3 behavior, parser failures/DOCX/DOC, uploads by content, pagination/filtering, profile CRUD, admin operations, emails, job closing, AI HTTP endpoints, frontend components, contracts, accessibility, or E2E workflows.

CI is not active in `.github/workflows`; a workflow is only stored as documentation under `docs/ci/`, while the README badge points to an expected `ci.yml`.

## A12. Configuration, secrets, and deployment

Positive elements:

- `.env` and uploads/logs are ignored.
- Production checks require Mongo URI, JWT secret, and CORS origin.
- Containers use lockfiles; backend runs as non-root; Nginx handles SPA fallback; Mongo is not host-published.
- Resume and Mongo volumes persist in Compose.

Gaps/risks:

- `.env.example` contains a predictable default admin password and 30-day JWT setting.
- Compose provides an insecure fallback JWT secret, disables email verification, has no Mongo authentication/TLS, and uses local resume storage.
- Environment validation checks only a few values and not formats, mutually dependent S3/SMTP settings, secret length, production-safe flags, or URL validity.
- No separate dev/test/staging/prod manifests, secrets manager, managed database guidance, IaC, worker, Redis, object-store service, backup/restore, disaster recovery, migrations, or index deployment process.
- `/health` is liveness only but does not say so; it exposes environment and does not check Mongo/queue/storage. No readiness or startup probe.
- Forced public DNS servers in `server.js` and `db.js` override platform DNS policy and can break private DNS/service discovery.
- Winston writes container-local files with no structured JSON, request ID, redaction, rotation, central export, metrics, traces, or alerting.
- The checked-in CI sample is not activated.
- Runtime package audit found two high-severity dependency findings in the installed backend tree: direct `nodemailer` advisories and transitive `brace-expansion`; remediation must be verified with compatibility tests. Client production dependencies audited clean at the audit date.

---

# B. Confirmed bugs and concrete code problems

Severity reflects production impact, not exploit certainty.

| Severity | Confirmed finding | Effect / required disposition |
|---|---|---|
| Critical | Application creation omits `resumeSnapshot.provider` and `resumeSnapshot.text`. | S3 applications default to `local` and fail downloads; matching silently falls back to the candidate’s mutable current resume. Snapshot provider, version ID, hash, and parsed artifact must be mandatory. |
| Critical | Deleting the current resume always deletes its object even when applications reference the same storage key. | Historical application downloads break. Use immutable `ResumeVersion` references and retention-aware deletion. |
| High | Public recruiter registration is unrestricted when invite code is blank (default). | Anyone can acquire recruiter privileges and publish jobs. Replace with organization invitation/domain/admin approval policy. |
| High | Long-lived bearer JWT in `localStorage` has no session record/revocation and ignores `passwordChangedAt`. | Stolen or pre-password-change tokens remain usable until expiry. Replace session architecture. |
| High | There is no tenant model; recruiter ownership is a user ID. | Team access cannot be represented, and cross-organization isolation cannot be guaranteed as features grow. |
| High | File validation trusts filename and client MIME; parsing is in-process with no malware scan/sandbox. | Spoofed or malicious documents can reach parsers and storage. Build quarantine pipeline. |
| High | Runtime dependency audit reports vulnerable Nodemailer and brace-expansion versions. | Upgrade through a tested dependency remediation PR; use provider SDK where appropriate. |
| High | Job deletion concurrently and permanently deletes applications without a transaction/audit record. | Partial deletion and regulatory/audit data loss are possible. Prefer archive; use transaction/outbox for destructive workflows. |
| High | Candidate withdrawal physically deletes the application. | Audit/status history is destroyed. Transition to `withdrawn` with immutable history. |
| Medium | `.doc` upload is advertised/accepted but parser only handles PDF/DOCX. | DOC uploads “succeed” with no text. Reject DOC until a sandboxed converter exists or add conversion worker. |
| Medium | Parsing failures are caught and converted into successful empty analyses. | Corrupt/password-protected/scanned files appear valid and produce misleading low scores. Persist explicit processing state/error. |
| Medium | Recruiter registration UI sends company fields, but backend `createUser` drops them. | Recruiter onboarding loses entered data. Organization creation/invite flow replaces this. |
| Medium | Auth registration never returns a token, even when verification is disabled, while frontend registration logic/comments expect optional immediate sign-in. | UI incorrectly says “verify email” then redirects to login. Define one policy and contract. |
| Medium | Change-password returns 401 for wrong current password; Axios globally logs out on any 401. | A typo signs the user out. Use an error code/400 or limit interceptor logout to invalid-session codes. |
| Medium | Password changes do not set `passwordChangedAt`; only reset does. | Even a future changed-at JWT check would miss normal password changes. |
| Medium | Recommendation query ignores `closesAt`; fit endpoint only checks `published`, not closing time. | Candidates receive recommendations/fit for expired jobs. |
| Medium | Applicant ranking is unpaginated, loads every applicant, and scores synchronously. | CPU/memory and latency grow linearly; endpoint is DoS-prone for popular jobs. |
| Medium | Applicant search fetches all records, filters in Node, then slices. | Pagination totals and resource use do not scale. Query indexed candidate projection/search server-side. |
| Medium | `CandidateProfile` validator accepts phone, image, bio, and skills that are not in its schema. | Mongoose strict mode silently drops these values, while equivalent fields live on `User`. Consolidate ownership of fields. |
| Medium | `CandidateProfile` stores DOB/gender alongside rankable professional data with no purpose/consent boundary. | Increases privacy and discrimination risk. Separate voluntary compliance data with strict access and never feed ranking. |
| Medium | Application status permits arbitrary jumps and repeated identical statuses. | Pipeline integrity and analytics are unreliable. Add explicit state machine and reason rules. |
| Medium | Public pasted-resume analyzer has only global rate limiting and accepts PII. | Enables compute abuse and undocumented PII processing. Add endpoint budget, consent/notice, no-storage guarantee, and abuse controls. |
| Medium | Admin access is global and un-audited; no MFA/step-up. | High-impact actions cannot be attributed or protected adequately. |
| Medium | Docker Compose ships an insecure fallback JWT secret and disables verification. | Accidental public deployment is unsafe. Fail closed in production profiles. |
| Medium | CI workflow is documentation only, not active. | README badge/quality claims are misleading; branches are not gated. |
| Low | `resumeService.js` contains a dead nested `deleteFile`, a duplicate outer declaration, unused config import, and console logging. | Demonstrates merge/cleanup debt; simplify during module extraction. |
| Low | `authController.js` has unused `removeResumeIfUnreferenced` referring to undefined `removeStoredResume`. | Calling it would throw; remove or replace with version service. |
| Low | Status-note length validation is duplicated. | Minor controller debt. |
| Low | Forced Google/Cloudflare DNS is duplicated. | Can violate infrastructure DNS requirements; remove. |
| Low | Frontend lint fails on `process` in Vite config. | CI sample would fail if activated. |
| Low | Resume line breaks are collapsed before analyzer checks bullets/sections. | Achievement and section analysis accuracy is reduced. Preserve layout plus normalized text separately. |
| Low | Content-Disposition uses URL encoding as a quoted filename rather than a robust `filename*` strategy. | Poor international filename behavior; centralize safe disposition generation. |

---

# C. Missing production and product capabilities

## P0 product completeness gaps

- Organization creation/verification, invitations, memberships, role assignment, team isolation
- Hiring manager role and assigned-job review
- Secure sessions, email verification, reset pages, revocation, logout, account lifecycle
- Candidate onboarding/preferences and structured profile review
- Resume versions, async parse status, PDF/DOCX security pipeline, private storage
- Versioned jobs, structured required/preferred criteria, publish/close/archive workflow
- Immutable applications and controlled status history
- Persisted explainable matching with exact input versions and deterministic fallback
- Notes/tags/activity, notifications, transactional email, interview scheduling and feedback
- Audit/security events, consent, export/deletion/retention
- Stable v1 contracts, validation, idempotency, queue, observability, CI/CD, backups

## P1 differentiators

- LLM resume/JD copilots with diff/accept workflow
- Embedding-based recommendations and semantic candidate/talent search
- Skill normalization/ontology, skill-gap analysis, evidence highlights
- Smart shortlist with human confirmation, candidate compare, duplicate detection
- Structured interview kits and evaluation assistance
- Recruiter/candidate copilots grounded in authorized tenant data
- Automated candidate communication with templates and approval rules
- Calendar/email integrations, talent pools, rediscovery, job alerts
- Conversion/time-to-stage/source/quality analytics and AI quality/cost dashboards
- Subscription/plan quotas if commercialization is intended

## P2 future capabilities

- External job boards/HRIS/background-check integrations and public webhooks
- SSO/SAML/SCIM, enterprise retention/legal holds, data residency
- Advanced workforce planning and labor-market intelligence
- Multilingual parsing/copilots and regional compliance packs
- Interview transcription only with explicit consent and jurisdiction review
- Experimentation platform, customer-specific calibrated models, federated taxonomy

---

# D. Target architecture

## D1. Deployment shape

```text
Browser / Stitch-generated UI
        |
CDN + WAF + TLS + same-origin reverse proxy
        |
Express API (/api/v1) ------------------------- Webhook ingress
        |             |             |
     MongoDB        Redis        Private object storage
        |             |
 Transactional      BullMQ queues
 outbox/events         |
                       +-- document worker (scan/parse/OCR/enrich/index)
                       +-- AI worker (LLM/embeddings/matches/copilots)
                       +-- notification worker (email/in-app/webhooks)
                       +-- maintenance worker (retention/recompute/analytics)

External: email provider, AI providers, malware scanner, OCR, calendar/ATS integrations
Telemetry: OpenTelemetry -> logs, metrics, traces, error tracking
```

Use separate API and worker processes from the same codebase/image with different entry points. Scale them independently. Do not introduce Kafka or independent microservice databases at P0; BullMQ plus a Mongo transactional outbox is sufficient.

## D2. Modular monolith boundaries

Recommended `server/src/modules/<module>` boundaries:

1. **identity** — users, credentials, sessions, verification, recovery, MFA hooks
2. **organizations** — organizations, memberships, invitations, policies
3. **candidates** — candidate profile, preferences, skills, consent-facing profile operations
4. **resumes** — resume aggregates, versions/documents, parse state, structured resume
5. **jobs** — jobs, versions, requirements/skills, publish state, hiring teams
6. **applications** — application lifecycle, history, screening answers
7. **matching** — match orchestration, deterministic engine, score policy, persistence
8. **interviews** — interviews, slots, participants, kits, feedback
9. **collaboration** — notes, tags, mentions, comparisons, talent pools
10. **notifications** — in-app notifications, templates, email events/preferences
11. **ai** — provider adapters, prompts, schemas, runs, usage, safety policies
12. **analytics** — events, aggregates, recruiter/admin reports
13. **admin/compliance** — moderation, consent, export/deletion, audit/security events
14. **integrations** — webhooks, calendar/email/job-board adapters
15. **platform** — health, config, logging, tracing, queue, object store, errors

Each module owns routes, schemas, controller, service/use-cases, repository, policies, events, and tests. Cross-module writes go through application services/events, not direct model imports scattered across controllers.

## D3. Layer responsibilities

- **Controller:** parse authenticated context, invoke schema validation, call one use case, map result/status. No business branching or direct Mongoose query.
- **Application service/use case:** transaction boundary, authorization policy invocation, state transitions, idempotency, domain events.
- **Domain policy/state machine:** pure rules (e.g., `canReviewCandidate`, application transitions, ranking input exclusions).
- **Repository:** tenant-scoped persistence and projections; every tenant collection method requires `organizationId` explicitly.
- **Infrastructure adapter:** Mongo, queue, object store, email, AI provider, calendar.
- **Presenter/serializer:** stable public DTOs, no Mongoose documents or hidden-field accidents.

## D4. Cross-cutting backend standards

- TypeScript for new backend modules; migrate incrementally behind compatibility routes.
- Zod (or JSON Schema-first equivalent) for request, response, event, env, and AI output schemas; generate OpenAPI 3.1.
- `/api/v1`; JSON camelCase; ISO-8601 UTC; string IDs; lower-case enum values.
- Standard response: `{ data, meta?, links? }`; errors use RFC 9457 Problem Details with `code`, `detail`, `fieldErrors`, `requestId`.
- Cursor pagination for feeds/jobs/applications/search: `page[limit]` (max 100), `page[after]`; stable sort with `_id` tie-breaker. Offset only for bounded admin tables if required.
- Allowlisted filters/sorts; reject unknown filters on sensitive endpoints.
- `Idempotency-Key` required for apply, invitations, AI generations that incur cost, interview scheduling, communication sends, and offer actions. Store request hash/result by actor+route for 24 hours.
- Optimistic concurrency with `version`/ETag and `If-Match` on jobs, profiles, applications, notes, and interview feedback.
- Mongo transactions for application creation + history + outbox, status change + event, invitation acceptance + membership, and destructive/privacy workflows.
- Transactional outbox written in the same transaction, then dispatched idempotently.
- Soft archive rather than hard delete for jobs/applications. Privacy deletion is a dedicated, audited workflow.

---

# E. Target database design

## E1. Design rules

- `organizationId` is mandatory and indexed on every tenant-owned record. Repository APIs never infer or omit it.
- Immutable version records preserve decisions. Mutable aggregate roots point to current versions.
- Embed bounded values read/written together; normalize independently queried, unbounded, collaborative, or historical records.
- Store canonical skill IDs plus display snapshots so taxonomy changes do not rewrite history.
- Encrypt highly sensitive fields at application/field level where query requirements permit; use managed encryption at rest everywhere.
- Add `createdAt`, `updatedAt`, `createdBy`, and schema version where relevant.

## E2. Core collections

### Identity and tenancy

**User** (global identity)

- `_id`, normalized email, display name
- password hash/algorithm parameters; email verified at
- status: `pending_verification|active|suspended|deletion_pending|deleted`
- locale/timezone, last login, token invalid-before timestamp
- global platform role only (`platform_admin` or none)
- PII minimization/deletion metadata
- Unique normalized email index; do not put recruiter/candidate tenant roles here.

**AuthSession**

- user ID, refresh-token family ID, hashed current token, previous-token/reuse state
- user agent/device label, coarse IP/security metadata, created/last-used/expires/revoked
- TTL on expiry; user+active index.

**Organization**

- name, slug, verified domains, industry/size, branding, timezone
- status, owner membership, settings (retention, allowed AI features)
- billing customer reference (not card data)
- Unique slug; verified domain constraints.

**Membership**

- organization ID, user ID, role IDs or standard role (`org_owner|org_admin|recruiter|hiring_manager|interviewer|viewer`)
- status/invited-by/joined-at; scoped permissions if necessary
- Unique `{organizationId,userId}`; indexes by user and org/status.

Use permission constants and role templates in code/config at P0 rather than a fully dynamic `Role`/`Permission` database. Add custom role documents at P1 only if customers need them.

**RecruiterProfile**

- membership ID, title, department, contact preferences, onboarding status
- Do not duplicate organization company details.

### Candidate data

**CandidateProfile**

- user ID (unique), headline/summary, location at appropriate granularity
- employment preferences (titles, workplace modes, locations, salary range/currency, availability)
- work authorization fields with explicit purpose/access policy
- profile completeness, visibility, source
- Professional experiences, education, projects, certifications may remain bounded embedded subdocuments initially, each with stable ID and provenance (`manual|resume_version|integration`).
- Voluntary demographic/compliance data, if ever legally required, belongs in a separate encrypted collection inaccessible to matching and ordinary recruiters—not here.

**Skill**

- canonical name, normalized aliases, taxonomy/category, external ontology IDs, status/version
- Unique normalized name/aliases; search index.

**CandidateSkill**

- candidate profile ID, skill ID, display name, proficiency/self-attested status
- evidence references (resume version + section/span), duration/last used, confidence, source
- Unique candidate+skill; vector/search-friendly indexes.

### Resume aggregate

**Resume**

- candidate ID, label, current version ID, status, optional primary flag
- One candidate can own multiple resume tracks; one primary.

**ResumeVersion**

- resume ID, candidate ID, monotonically increasing version
- original filename, detected MIME, size, SHA-256, storage object ID
- upload/scan/parse/enrich/index statuses and failure codes
- parser/OCR versions, language, page count, quality/confidence
- immutable after processing except status fields; unique resume+version and candidate+hash (policy-dependent) indexes.

**ResumeDocument** is justified as storage metadata if documents can have derivatives:

- resume version ID, kind `original|sanitized|preview|ocr`, storage key, bucket/provider, encryption/checksum, scan verdict, retention state
- Never expose storage keys in public DTOs.

**ParsedResume**

- resume version ID (unique), schema version
- preserved raw/layout text references plus structured contact, summary, experience, education, projects, certifications
- extraction confidences, evidence spans/page references, warnings, candidate corrections
- Keep large layout/OCR blobs in object storage if document limits warrant.

### Jobs and applications

**Job**

- organization ID, current version ID, stable public ID/slug
- lifecycle `draft|pending_approval|published|paused|closed|archived`
- owner membership ID, hiring team membership IDs, department, headcount
- published/closed timestamps, application deadline, visibility
- Index `{organizationId,status,updatedAt}`, public status/deadline, hiring team.

**JobVersion**

- job ID/org ID/version, title, description, responsibilities
- employment/workplace type, locations, compensation range/currency/period/visibility
- experience range, education/licensing, language/work authorization requirements
- generation provenance and approval metadata
- Immutable once published or referenced by an application.

**JobSkill**

- job version ID, skill ID/display snapshot
- requirement `required|preferred`, weight, minimum proficiency/years, evidence rubric
- Unique version+skill.

**Application**

- organization ID, job ID, job version ID, candidate ID, resume version ID
- current status, source, submitted-at, withdrawal/rejection reason codes
- screening answer snapshot, consent IDs, dedupe key
- Unique job+candidate unless reapplication policy explicitly permits; indexes for org/job/status/date and candidate/date.

**ApplicationStatusHistory**

- application/org IDs, from/to status, actor/type, reason code/note, timestamp, correlation ID
- Immutable append-only. Separate collection avoids unbounded application documents and enables analytics/audit.

**CandidateMatch**

- organization/application or candidate+job version, candidate/resume version, score policy version
- overall score, confidence, component scores
- matched/missing required/preferred skills; experience/education/semantic evidence
- evidence span references, limitations, provider/model/prompt/embedding versions
- status (`pending|completed|failed|stale`), generated-at
- Unique input-version+policy; never overwrite old results.

### Interviews and collaboration

**Interview**

- organization/application IDs, stage/type/status, timezone, location/video details
- organizer and participant memberships, kit/version, scheduled time, outcome

**InterviewSlot**

- interview ID, proposed start/end/timezone, proposer, status/expiry
- Useful for candidate selection and calendar idempotency.

**InterviewFeedback**

- interview ID, evaluator membership, scorecard version, criterion ratings/evidence, recommendation
- draft/submitted timestamps; lock after submit with controlled amendment history
- Unique interview+evaluator.

**Note** (unifies RecruiterNote/CandidateNote)

- organization ID, target type/ID (`application|candidate|job|interview`), author membership
- visibility (`private|hiring_team`), body, mentions, edit/archive metadata
- Do not create separate recruiter/candidate note collections unless retention/access differs materially.

**Tag**, **EntityTag**, and **TalentPoolMembership** can be added P1 for shared taxonomy and rediscovery.

**SavedJob**

- candidate ID, job ID, created-at; unique candidate+job. Better than an unbounded user array.

### Notifications, AI, compliance, and integration

**Notification** — user, org context, type, channel, payload reference, read/delivery state; TTL/archive policy.

**EmailEvent** — provider message ID, template/version, recipient user (avoid raw address where possible), delivery/bounce/complaint events, correlation. No secret/body logging by default.

**AIAnalysis** — domain artifact/run: feature, subject/input versions, validated output, status, provider/model/prompt/schema versions, safety/fallback, latency. Large raw provider payloads encrypted/short-retained or omitted.

**AIUsage** — append-only meter: org/user/feature/provider/model, input/output tokens, embedding units, cost estimate, latency, cache/fallback, timestamp. Used for quotas and admin reports.

**AuditLog** — append-only actor, org, action, resource, timestamp, request/correlation ID, safe before/after diff metadata, IP/device context, outcome. Tamper-evident export/retention.

**SecurityEvent** — login failures, token reuse, rate-limit blocks, suspicious uploads, permission denials, admin actions; severity/state and alert correlation.

**Consent** — user, purpose, policy/version, granted/revoked timestamps, source; records AI processing, talent-pool retention, communications where required.

**WebhookEvent** — integration/org, direction, external event ID, signature status, payload object reference/hash, processing state/attempts. Unique integration+external ID for replay safety.

**Subscription** P1 — organization, plan, status, limits/entitlements, billing provider IDs. Keep payments outside HireSmart.

**OutboxEvent**, **IdempotencyRecord**, and **JobRun** are platform collections required at P0.

## E3. Index plan highlights

- Every tenant query starts with `organizationId`; compound it first in indexes.
- Partial unique active membership/invitation indexes.
- Public jobs: status + deadline + publishedAt; Atlas Search for text/facets.
- Applications: org+job+status+submittedAt, candidate+submittedAt, unique job+candidate.
- Matches: org+jobVersion+score descending, exact input-version uniqueness.
- Status history: application+createdAt and org+toStatus+createdAt.
- Resume version hash and processing state/updatedAt.
- Notifications: user+readAt+createdAt; TTL for ephemeral notifications.
- Audit/security: org+createdAt, actor+createdAt, resource+createdAt; archive old partitions.
- Vector indexes on sanitized job/candidate embeddings with model/version metadata filters.

Use an explicit index/migration runner in CI/deploy. Disable uncontrolled `autoIndex` in production.

---

# F. API specification

## F1. Contract conventions

Base: `/api/v1`. Authenticated calls receive identity plus selected organization context. Prefer an explicit `X-Organization-Id` validated against membership, or organization IDs in tenant resource routes; never trust a header without membership resolution.

Success:

```json
{
  "data": {},
  "meta": { "requestId": "...", "nextCursor": null, "hasMore": false }
}
```

Error (`application/problem+json`):

```json
{
  "type": "https://api.hiresmart.ai/problems/validation-error",
  "title": "Request validation failed",
  "status": 422,
  "code": "VALIDATION_ERROR",
  "detail": "One or more fields are invalid.",
  "fieldErrors": [{ "path": "email", "code": "invalid_email", "message": "..." }],
  "requestId": "..."
}
```

Common errors: 400 malformed request, 401 invalid/expired session, 403 policy denial, 404 (also used to conceal cross-tenant resources), 409 state/version/idempotency conflict, 413 body/file too large, 415 unsupported media, 422 schema/domain validation, 429 limit/quota, 503 dependency unavailable.

All list endpoints define allowlisted `filter[...]`, `sort`, `page[limit]`, and `page[after]`. Mutations return updated DTO and emit audit/outbox events. Async starts return `202` with a `jobRun` resource/status URL.

## F2. Endpoint inventory

### Auth and sessions

| Method/route | Auth/role | Request | Response / side effects |
|---|---|---|---|
| `POST /auth/register` | public, strict IP/email limit | `{email,password,displayName,accountIntent,termsConsent}` | 202/201 user with `pendingVerification`; queues verification; generic duplicate behavior where appropriate |
| `POST /auth/verify-email` | public | `{token}` | activates user, consumes one-time hashed token, records audit |
| `POST /auth/verification-emails` | public | `{email}` | 202 generic response; cooldown/idempotent send |
| `POST /auth/login` | public, brute-force protected | `{email,password}` | user + short access token; sets rotating refresh cookie; records session/security event |
| `POST /auth/token` | refresh cookie + CSRF/origin | none | rotates refresh token and returns access token; reuse revokes family |
| `POST /auth/logout` | session | optional all-devices flag | revokes current/all sessions and clears cookie |
| `GET /auth/sessions` / `DELETE /auth/sessions/:id` | self | — | list/revoke devices |
| `POST /auth/password/forgot` | public | `{email}` | always 202; queues reset |
| `POST /auth/password/reset` | public | `{token,newPassword}` | consumes token, invalidates all sessions, security event |
| `PATCH /auth/password` | self + recent auth | `{currentPassword,newPassword}` | changes hash, invalidates other sessions |
| `POST /auth/mfa/*` | P1 | setup/challenge schemas | MFA enrollment/challenge |

Cookies: refresh token `HttpOnly; Secure; SameSite=Lax/Strict; Path=/api/v1/auth`; use a CSRF token/custom header plus exact origin checks for cookie-authenticated mutations. Access token stays in memory and is sent as bearer. Do not put refresh tokens in browser storage.

### Users and organizations

| Method/route | Policy | Core schema/behavior |
|---|---|---|
| `GET /users/me` | self | identity, onboarding, memberships, capabilities; no secret fields |
| `PATCH /users/me` | self, `If-Match` | allowlisted locale/name/timezone fields |
| `POST /users/me/export` | self + recent auth | 202 privacy export job |
| `DELETE /users/me` | self + recent auth | 202 deletion workflow with impact/waiting period |
| `POST /organizations` | verified user | `{name,slug?,industry,size,timezone}`; transaction creates owner membership |
| `GET/PATCH /organizations/:orgId` | member / `organization.manage` | tenant-scoped DTO/update |
| `GET /organizations/:orgId/members` | `member.read` | cursor, role/status/search filters |
| `POST /organizations/:orgId/invitations` | `member.invite`, idempotent | `{email,role,expiresIn}`; queues email |
| `POST /organization-invitations/:token/accept` | verified invitee | creates membership transactionally |
| `PATCH/DELETE /organizations/:orgId/members/:id` | `member.manage` | role/status change; prevent last-owner removal |

### Candidate profiles and skills

| Method/route | Policy | Core schema/behavior |
|---|---|---|
| `GET/PATCH /candidates/me/profile` | candidate self | structured profile DTO; patch sections with version check |
| `GET /organizations/:orgId/candidates/:candidateId` | hiring-team policy and legitimate-purpose relation | redacted recruiter view; 404 across tenant/no relation |
| `GET/POST/PATCH/DELETE /candidates/me/profile/{experiences|education|projects|certifications}/:id?` | self | strongly validated subresource schemas; source/provenance returned |
| `GET/PUT /candidates/me/preferences` | self | titles, locations, workplace, salary/currency, alerts, visibility |
| `GET /skills?query=` | authenticated/public-limited | canonical skill suggestions, cursor |
| `PUT /candidates/me/skills/:skillId` | self | proficiency/evidence/source; optimistic concurrency |

### Resumes

| Method/route | Policy | Core schema/behavior |
|---|---|---|
| `POST /candidates/me/resumes/uploads` | candidate, upload quota, idempotent | validates metadata and returns short-lived presigned **private quarantine** upload plus upload ID; alternatively multipart API for initial compatibility |
| `POST /candidates/me/resumes/uploads/:uploadId/complete` | owner | verifies object size/hash, creates version, returns 202 processing run |
| `GET /candidates/me/resumes` | owner | resume tracks/versions/statuses, cursor |
| `GET /candidates/me/resumes/:resumeId/versions/:versionId` | owner | metadata, processing status/warnings, parsed-summary links |
| `GET .../parsed` | owner | validated structured extraction, confidence/evidence |
| `PATCH .../parsed` | owner, `If-Match` | candidate corrections; never alters raw artifact; emits re-index/re-match |
| `POST .../reanalyze` | owner, quota/idempotent | 202 AI analysis job |
| `POST .../download-url` | owner | very short signed URL or authorized stream |
| `DELETE .../versions/:versionId` | owner + retention policy | tombstones; refuses/de-identifies if legally referenced by applications |
| `POST /organizations/:orgId/applications/:id/resume-download-url` | authorized hiring team | short signed URL, audit log; references submitted version only |

### Jobs

| Method/route | Policy | Core schema/behavior |
|---|---|---|
| `GET /jobs` | public | published/open only; cursor, query/location/workplace/type/skills/salary filters and allowlisted sort |
| `GET /jobs/:publicId` | public | public current published version; no internal IDs/team data |
| `POST /organizations/:orgId/jobs` | `job.create`, idempotent | structured draft `{title,requirements,location,employment,compensation,...}` |
| `GET /organizations/:orgId/jobs` | member with `job.read` | status/owner/team/search filters; tenant scope |
| `GET/PATCH /organizations/:orgId/jobs/:jobId` | assigned/read or edit | internal aggregate; `If-Match` required to edit draft |
| `POST .../versions` | `job.edit` | creates draft version from current or payload |
| `POST .../submit-approval` / `POST .../approve` | configured policies | state transition + audit/notification |
| `POST .../publish` | `job.publish`, idempotent | freezes current version, publishes, indexes, emits event |
| `POST .../pause|close|archive` | `job.publish/manage` | validated state transitions; closing does not delete applications |
| `PUT .../hiring-team` | `job.manage_team` | membership IDs and responsibilities |

Job mutation schema distinguishes required/preferred skills, compensation min/max/currency/period, workplace mode, locations, experience min/max, screening questions, deadline, and legal text. Validation rejects contradictory ranges and stale membership IDs.

### Applications and pipeline

| Method/route | Policy | Core schema/behavior |
|---|---|---|
| `POST /jobs/:jobId/applications` | verified candidate, idempotent | `{resumeVersionId,screeningAnswers,consentIds}`; transaction freezes job/resume versions, creates history/outbox; 409 duplicate/closed |
| `GET /candidates/me/applications` | self | cursor; status/job/date filters; candidate-safe timeline |
| `GET /candidates/me/applications/:id` | self | detail; internal notes/feedback excluded |
| `POST /candidates/me/applications/:id/withdraw` | self, idempotent | state transition with reason; no deletion |
| `GET /organizations/:orgId/jobs/:jobId/applications` | hiring-team policy | cursor; status, tags, match range, search/sort; no fetch-all |
| `GET /organizations/:orgId/applications/:id` | legitimate hiring-team access | application, submitted versions, match evidence, activity/capabilities |
| `POST .../transitions` | `application.transition`, idempotent | `{toStatus,reasonCode,note?}`; state machine validates from/to and writes immutable history |
| `GET .../history` | candidate-safe or hiring-team projection | cursor append-only events |
| `POST .../reject` / `POST .../offer` | elevated policy | structured reason/offer workflow; communication is separate/transactional |

Possible P0 states: `submitted → under_review → shortlisted → interview → offer → hired`; terminal `rejected|withdrawn|closed`. Explicit exceptions are policy-controlled and recorded.

### Matching, AI, and search

| Method/route | Policy | Core schema/behavior |
|---|---|---|
| `POST /candidates/me/job-fits` | self, quota/idempotent | `{jobId,resumeVersionId}` → cached result or 202; never mutates application |
| `GET /candidates/me/recommendations` | self | cursor; filters; persisted scores with freshness metadata |
| `POST /organizations/:orgId/jobs/:jobId/matches/recompute` | authorized recruiter, quota | 202 batch run; exact job version/score policy |
| `GET /organizations/:orgId/jobs/:jobId/matches` | hiring team | cursor; score/status/skill filters; explanation summary |
| `GET /organizations/:orgId/matches/:id` | legitimate access | full evidence, confidence, limitations, versions |
| `POST /organizations/:orgId/candidate-search` | talent-search permission | structured filters + sanitized semantic query; cursor and explanation |
| `POST /ai/resume-improvements` | candidate | `{resumeVersionId,targetJobId?,focus}` → 202/validated suggestions |
| `POST /organizations/:orgId/ai/jd-drafts` | `job.create`, quota | structured brief → 202 draft, bias/safety checks; user must accept into job draft |
| `POST .../interview-kits` | hiring-team policy | requirement-grounded structured kit proposal |
| `POST .../copilot/messages` | scoped policy | conversation input + authorized context references; streaming optional; no direct state mutation |

### Interviews, notes, notifications

| Method/route | Policy | Core schema/behavior |
|---|---|---|
| `POST /organizations/:orgId/applications/:id/interviews` | `interview.schedule`, idempotent | participants/type/duration/proposed slots; queues notifications/calendar sync |
| `GET/PATCH /organizations/:orgId/interviews/:id` | participant/hiring team | status-safe edits with version check |
| `POST /interviews/:id/slots/:slotId/accept` | candidate/participant token or auth | reserves slot transactionally |
| `POST /organizations/:orgId/interviews/:id/feedback` | assigned interviewer | draft scorecard; no protected attributes |
| `POST .../feedback/:id/submit` | author | locks submission and emits review event |
| `GET/POST /organizations/:orgId/{applications|candidates|jobs}/:id/notes` | allowed team | cursor/create; visibility and mentions validated |
| `PATCH/DELETE /organizations/:orgId/notes/:id` | author/admin policy | optimistic edit/archive; audit |
| `GET /notifications` | self | cursor/type/read filters |
| `POST /notifications/:id/read` / `POST /notifications/read-all` | self, idempotent | update read state |
| `GET/PATCH /users/me/notification-preferences` | self | transactional/marketing/channel preferences |
| `POST /organizations/:orgId/applications/:id/messages` | communication permission | template or validated content; queues send, records EmailEvent; approval rules |

### Analytics, admin, health, integrations

| Method/route | Policy | Core schema/behavior |
|---|---|---|
| `GET /organizations/:orgId/analytics/funnel` | `analytics.read` | date/job/source filters; aggregate not raw PII |
| `GET /organizations/:orgId/analytics/time-to-stage` | same | bounded time range and timezone |
| `GET /organizations/:orgId/analytics/ai-usage` | org admin | feature/model/cost/failure aggregate |
| `GET /admin/users|organizations|security-events|audit-logs|ai-usage` | platform admin + MFA/step-up | cursor/filter; every access audited |
| `POST /admin/users/:id/suspend` | platform admin, idempotent | reason required, revoke sessions, security/audit events |
| `GET /health/live` | public/internal | process liveness only, no environment/secrets |
| `GET /health/ready` | orchestrator/internal | Mongo/Redis/queue critical dependency checks with timeout |
| `GET /health/startup` | orchestrator | migrations/index readiness |
| `POST /webhooks/:provider` | signed provider request | raw-body signature, replay window, durable WebhookEvent, 2xx fast acknowledgment |
| `GET/POST/DELETE /organizations/:orgId/integrations` | integration admin | OAuth/setup state; secrets encrypted; no tokens in DTO |
| `POST /organizations/:orgId/webhook-endpoints` | integration admin | target validation/SSRF controls, signing secret shown once |

## F3. Compatibility strategy

- Freeze existing `/api` routes and map them to new use cases where semantics match.
- Add deprecation headers and documentation; do not extend old DTOs indefinitely.
- Provide adapters for current top-level payload shapes while new UI uses `/api/v1`.
- Migrate users, jobs, applications, and current resumes with reconciliation reports before removing legacy fields.
- Preserve deterministic score display but label algorithm/version and avoid equating old/new score scales.

---

# G. AI architecture

## G1. Provider-neutral interfaces

Create adapters behind these capabilities:

- `LanguageModel.generateStructured(schema, messages, options)`
- `EmbeddingProvider.embedDocuments/embedQuery(modelVersion)`
- `DocumentExtractor.extract(document, schema)`
- `ModerationProvider.classify(content)` if provider/use case requires it

Adapters may support OpenAI, Azure OpenAI, Anthropic, Google, or self-hosted providers; business modules only depend on interfaces. Configuration selects primary/fallback by feature, not a global hard-coded provider.

## G2. Orchestrator workflow

For every AI feature:

1. Authorize actor and resolve tenant/feature entitlement.
2. Load exact immutable input versions and redact/exclude prohibited attributes.
3. Check consent, retention, region/provider policy, cache, quota, and rate limit.
4. Build prompt from a versioned registry; delimit untrusted resume/JD text and instruct against prompt injection.
5. Call provider with deadline, abort signal, bounded retries only for retryable failures, jitter, and circuit breaker.
6. Require JSON/structured output against a strict schema; reject unknown fields and invalid ranges/references.
7. Ground evidence references against source spans. Discard fabricated evidence.
8. Run domain/fairness/safety validators and deterministic cross-checks.
9. If invalid/unavailable, retry repair once if safe, then use deterministic fallback or mark failure.
10. Persist `AIAnalysis`, `AIUsage`, provider/model/prompt/schema versions, latency, token counts, fallback, and limitations.
11. Return proposal/artifact; a normal domain command with human confirmation performs any critical mutation.

Never let generated text set application status, reject a candidate, send an offer, publish a job, schedule an interview, or overwrite a profile automatically.

## G3. Hybrid explainable matching

Suggested initial score policy (config/versioned, then calibrated with evaluation data):

- required skill evidence: 35%
- preferred skill evidence: 10%
- relevant experience evidence/recency: 20%
- embedding semantic relevance: 15%
- requirement-specific education/license evidence: 10%
- structured screening answers: 10%

Do not score a category not relevant to that job; record applicability and normalization. Hard requirements are displayed separately and are not silently compensated by unrelated semantic similarity. The LLM may extract and summarize evidence, but arithmetic is deterministic.

Match output schema includes:

- score and score-policy version (explicitly “decision support,” not probability)
- confidence and data-quality confidence
- required/preferred matched and missing skills
- each component raw value, normalized score, weight, applicability
- experience/education/screening evidence spans with resume page/section
- embedding model and similarity evidence summary
- reasons, limitations, stale/input versions, fallback/provider state
- excluded data declaration

Store both sanitized embeddings and model version. Recompute when job/resume/taxonomy/score policy changes; mark prior results stale rather than overwrite.

## G4. Feature schemas

- Resume extraction: contact, summary, experiences, education, projects, certifications, skills, languages; confidence/evidence for each field.
- JD extraction/generation: title, outcomes, responsibilities, required/preferred skills, experience, location, compensation, screening rubric, inclusive-language warnings.
- Resume/JD improvement: array of `{issue,severity,suggestion,rationale,evidenceRef?}`; never invent credentials.
- Interview kit: competencies, questions, follow-ups, anchored rubric, prohibited-question warnings.
- Interview evaluation assistance: summarize submitted scorecards/evidence only; never infer emotion/personality from video/voice.
- Copilots: retrieval-augmented responses with citations to authorized records; tool calls map to read-only operations by default and proposed commands for confirmation.

## G5. Reliability and cost controls

- Feature-specific timeouts (e.g., embeddings 10s, structured LLM 30–60s in workers).
- Exponential backoff with jitter for 429/5xx; no retry on schema/domain/safety failure except one bounded repair.
- Per-user/org/IP rate limits, concurrent run caps, daily token/cost budgets, plan quotas.
- Cache by sanitized input hash + provider/model/prompt/schema version.
- Bulk embedding, queue priority, dead-letter queues, provider circuit breakers.
- Admin visibility into cost, latency, failure, fallback, and schema rejection rates.
- Golden datasets and offline evaluation gates before prompt/model/score-policy rollout; canary and rollback.

## G6. Fairness, privacy, and safety constraints

- Strip names, honorifics, photo, email, phone, exact address, DOB/age, gender/pronouns where possible, marital/family status, nationality/ethnicity/religion, disability/health, and other protected proxies before ranking.
- Do not infer protected traits. Do not use school prestige, employment gaps, or name/location proxies without a documented job-related justification and review.
- Keep work authorization as an explicit lawful eligibility gate only where required, not a hidden score booster.
- Human review is mandatory; no automatic rejection solely from AI score.
- Show limitations and permit recruiters/candidates to report incorrect extraction/evidence.
- Evaluate subgroup outcomes only using legally collected, segregated, access-controlled audit data and appropriate counsel—not ranker inputs.
- Publish model/score cards, retention, provider data-use settings, and appeal/correction process.

---

# H. Security architecture

## H1. Identity and session security

- Argon2id preferred, or bcrypt cost selected by startup benchmark/security policy; rehash on login.
- Password length 12–128 recommendation, compromised-password screening, no arbitrary composition rules.
- Verify email before privileged use. Recruiters join through organization invitations/approval, not a public role toggle.
- Access JWT 5–15 minutes with issuer/audience/key ID; asymmetric signing or managed key rotation preferred.
- Opaque rotating refresh tokens stored hashed in `AuthSession`; HttpOnly/Secure cookie, family reuse detection, revoke all on reset/suspicion.
- MFA/step-up for platform admins and sensitive org actions; P1 WebAuthn/TOTP for recruiters.
- Generic login/recovery responses, escalating IP+account limits, safe lockout, security notifications.

## H2. Authorization and tenancy

- Resolve `AuthContext(userId, sessionId, organizationId, membershipId, permissions)` centrally.
- Policy functions combine permission, membership status, assigned hiring team, candidate ownership, and resource organization.
- Repositories require organization scope and include it in every query, including update/delete selectors.
- Return 404 for cross-tenant resource probes where existence disclosure is unnecessary.
- Add automated negative authorization matrix tests for every resource/action/role.
- Audit all candidate PII views/downloads, exports, role changes, job publishing, status/offer actions, and admin reads.

## H3. HTTP/input defenses

- Helmet with production CSP, HSTS at proxy, frame ancestors, referrer and permissions policies.
- Exact CORS allowlist; no reflection/wildcards with credentials.
- CSRF token + same-site/origin validation for refresh-cookie endpoints; bearer APIs remain CSRF-resistant but XSS-sensitive.
- Body limits by endpoint, parameter pollution rejection, content-type enforcement.
- Schema validation with unknown-key rejection and normalized values. Avoid generic “sanitization” as a substitute for allowlists.
- NoSQL injection prevention through typed schemas and repository-built queries; never spread client objects into Mongo filters/updates.
- Render user/AI text as text or sanitized Markdown; no unsanitized HTML. CSP and Trusted Types where feasible.
- URL fields use a strict URL parser and scheme/host policy. Server-side fetches pass centralized SSRF protection: deny loopback/private/link-local/metadata ranges after DNS resolution, block redirects/rebinding, allowlist providers, cap size/time.
- Per-endpoint user/org/IP rate limits and AI/storage quotas; Redis-backed shared counters.
- Safe errors and structured redacted logs; request IDs, no tokens/passwords/resume text/email query strings.

## H4. File and PII security

- Quarantine bucket/prefix → type sniff → malware scan → safe parser/converter → private clean bucket.
- Random object keys; original names metadata only after control-character normalization.
- SSE-KMS, bucket public access block, least-privilege IAM per API/worker, short signed URLs, access logs.
- Parser containers/processes have no network, read-only root, CPU/memory/time/page limits, seccomp where available.
- Retention scheduler and reference-aware deletion; candidate export/correction/deletion workflow.
- Minimize stored raw provider requests. Contractually disable AI provider training/logging where available.
- Consent/purpose records for AI processing, talent-pool retention, and communication.

## H5. Operational security

- Secrets from cloud secret manager/workload identity, never build args or Git; rotation runbooks.
- SAST, dependency review, lockfile audit, secret scanning, container scan, SBOM, signed images, Renovate/Dependabot.
- Separate least-privilege staging/prod accounts/databases/buckets/keys.
- WAF/CDN limits, DDoS protection, alerting on token reuse, upload threats, permission-denial spikes, admin changes.
- Incident response, breach notification, backup restore, key/session mass-revocation runbooks.

---

# I. File-processing architecture

## I1. State machine

`initiated → uploaded → quarantined → scanning → validated → parsing → extracted → enriching → indexed → ready`

Failure/branch states: `rejected`, `infected`, `unsupported`, `password_protected`, `parse_failed`, `partial`, `ocr_required`, `ocr_failed`. Every transition is idempotent and records attempt/error metadata.

## I2. Pipeline

1. API checks candidate, quota, declared extension/size and creates upload intent.
2. Browser uploads directly to a private quarantine key using constrained presigned fields (size/content type/checksum).
3. Completion command performs `HEAD`, verifies checksum/ownership, creates immutable `ResumeVersion`, and emits `resume.uploaded`.
4. Worker streams object, checks magic bytes/container structure, page count/archive limits, and SHA-256 duplicate.
5. Malware scanner; infected object remains quarantined for short forensic retention then deletes per policy.
6. Detect PDF/DOCX. Reject legacy DOC at P0 unless a sandboxed LibreOffice conversion worker is deliberately supported.
7. Detect encryption/password protection. Return actionable status; never request/store document passwords in logs.
8. Parse in an isolated worker. Preserve line/layout/page data and separately create normalized text.
9. If PDF text quality is low, render safely and OCR with page/time/cost limits; mark OCR confidence.
10. Validate structured extraction; enrich/normalize skills; candidate can correct extracted profile suggestions.
11. Generate sanitized embeddings; index only after valid parse.
12. Persist ready/partial artifact, emit events for analysis/match/recommendation refresh, notify candidate.

## I3. Edge handling

- **Corrupt:** `parse_failed`, safe error, retry only if parser/transient—not repeatedly for deterministic corruption.
- **Scanned:** OCR path, explicit confidence/cost; partial text allowed with warning.
- **DOCX:** unzip bomb protections and external relationship/macro handling; no remote resource fetching.
- **Unsupported/DOC:** 415 before clean storage, unless converter policy exists.
- **Oversized/pages:** reject at presign and verify again server-side.
- **Password protected:** explicit non-retryable state and replacement prompt.
- **Duplicate:** reuse extraction only for the same owner/policy and encryption boundary; never reveal cross-user duplicate existence.
- **Malicious:** quarantine, security event, no parser, rate/account review.
- **Partial:** retain warnings/evidence confidence; prevent high-confidence matching claims.
- **Retries:** exponential bounded attempts; DLQ and operator replay with idempotent run IDs.

---

# J. Async/background-job architecture

## J1. Queues

BullMQ/Redis queues:

- `documents.scan` (highest security priority)
- `documents.parse`, `documents.ocr`, `documents.enrich`, `documents.index`
- `ai.structured`, `ai.embeddings`, `matching.single`, `matching.batch`
- `notifications.email`, `notifications.inapp`, `integrations.webhook`, `integrations.calendar`
- `analytics.aggregate`, `privacy.export`, `privacy.delete`, `retention.cleanup`

Use separate worker concurrency/timeouts per queue; parsing/OCR workers need strict resource isolation.

## J2. Delivery semantics

- At-least-once delivery; every handler idempotent by `eventId`/domain version.
- Mongo transaction writes business state and `OutboxEvent`; dispatcher publishes and marks delivery.
- Worker stores `JobRun` status/progress/attempt/error; API exposes status and UI receives polling initially, SSE/WebSocket P1.
- Retry only classified transient failures; exponential backoff+jitter; DLQ after bounded attempts.
- Unique job keys coalesce match/index recomputations for identical versions.
- Graceful shutdown stops intake and extends/finishes locks safely.

## J3. Domain events

Examples: `user.verified`, `membership.invited`, `resume.version.ready`, `resume.parse.failed`, `job.published`, `job.version.changed`, `application.submitted`, `application.status.changed`, `interview.scheduled`, `feedback.submitted`, `match.completed`, `notification.requested`, `consent.revoked`, `user.deletion.requested`.

Events contain IDs/versions, not raw resume text or unnecessary PII.

---

# K. Frontend/backend contract for the future Stitch UI

The backend contract must expose **capabilities and workflow state**, not force the UI to reconstruct policy.

## K1. Required DTO principles

- Stable string IDs and lower-case enums.
- Resource DTOs include `version`, timestamps, processing state, and `capabilities` such as `canEdit`, `canPublish`, `canDownloadResume`, `allowedTransitions`.
- Include display-safe denormalized snapshots (job title/org name) while preserving canonical IDs.
- Never expose storage keys, hashes, password/token fields, raw provider output, internal prompt text, internal/private notes to candidates, or protected demographic data to ranking views.
- Match DTO includes score components, evidence snippets/page references, confidence, limitations, input versions, and stale state.
- Async mutation DTO includes `{runId,status,statusUrl,estimatedStage}`; UI does not wait on parsing/LLM.
- List metadata includes cursor/hasMore and applied filter/sort echo.
- OpenAPI is the source of truth; generate a typed TypeScript client and mock server for Stitch integration.

## K2. UI state requirements

- Auth bootstrap can refresh silently; organization switch re-resolves permissions and invalidates tenant caches.
- Resume upload shows direct-upload progress separately from scan/parse/enrich progress and actionable failure states.
- Structured resume extraction is a reviewable diff; user confirmation updates profile through normal APIs.
- Job editing is autosave-friendly but guarded by ETag conflict UX; AI JD output is a proposal/diff.
- Applicant lists use cursor pagination/server filtering, persisted match states, and skeletons—not synchronous full ranking.
- Status transitions use server-provided allowed transitions and reason requirements.
- Notifications link to resources using typed action payloads.
- Accessibility: semantic forms, keyboard flow, live async status, reduced motion, high contrast, screen-reader score explanations; never communicate ranking only by color.
- Date/time responses are UTC plus source timezone; UI localizes. Money always carries currency/period.

## K3. Migration of current UI

Retain current design-system components where useful. Replace direct token storage, current API wrappers, and role-only route maps first. Build flows in this sequence: auth/organization shell → candidate onboarding/resumes → jobs/applications → recruiter pipeline → hiring-manager/interviews → admin. Do not generate the Stitch UI against legacy `/api` contracts.

---

# L. Testing strategy

## L1. Test pyramid and gates

### Unit

- State machines, permission policies, score arithmetic, skill normalization, redaction, validators, serializers, retry classification.
- Deterministic engine golden cases remain fast and provider-free.
- Property tests: score bounds, tenant query scope, parser input bounds, transition invariants.

### Service/repository integration

- Real MongoDB and Redis containers pinned in test tooling; no runtime downloads and no fallback to any non-test database.
- Transactions, unique/index behavior, outbox delivery, idempotency replay, optimistic concurrency.
- S3-compatible MinIO and malware scanner test doubles; fixture-based PDF/DOCX/scanned/encrypted/corrupt/malicious files.

### API integration/contract

- Every endpoint: success, schema error, unauthenticated, each disallowed role, wrong organization, unassigned hiring manager, owner/non-owner, stale ETag, duplicate idempotency key, pagination/filter/sort, safe error.
- OpenAPI response validation in tests and consumer contract tests for generated frontend client.
- Auth: verification expiry/reuse, brute force, refresh rotation/reuse, revocation, password reset invalidates sessions, inactive membership, CSRF/origin.

### AI tests

- JSON schema conformance and rejection/repair/fallback.
- Prompt injection fixtures from resumes/JDs; evidence references must resolve to source spans.
- Provider timeout/429/5xx/circuit-breaker/cost-limit tests using adapters, never live provider in normal CI.
- Golden extraction/matching/JD/interview sets; model/prompt changes require quality, hallucination, latency, and cost thresholds.
- Fairness tests confirm protected fields are removed and score is invariant when excluded identity fields change.

### Security

- NoSQL/operator injection, mass assignment, XSS/Markdown sanitization, SSRF DNS/redirect/rebinding, CORS/CSRF, request smuggling proxy settings, file spoofing/zip bombs/parser timeouts, rate limits, signed URL expiry, audit coverage.
- SAST/dependency/secret/container/IaC scans and SBOM in CI.

### Frontend

- Vitest + Testing Library for auth refresh, organization switching, capability rendering, error/empty/loading states, forms, async resume progress, ETag conflict, accessible score evidence.
- Mock Service Worker generated from OpenAPI.
- Playwright E2E: complete candidate, recruiter, hiring-manager, and admin journeys; multi-tenant denial; email links via test inbox; upload fixtures; interview feedback.
- Axe accessibility and key viewport checks; visual regression for critical screens.

## L2. Coverage policy

Do not use a single percentage as quality proof. Set module thresholds (e.g., 90% branches for authorization/state machines, 80% for services) and require 100% action/role matrix coverage for P0 endpoints. Track mutation testing for policies/scoring later.

## L3. Fix current test infrastructure

- Activate `.github/workflows/ci.yml` rather than documenting it only.
- Use service containers for Mongo/Redis/MinIO; remove internet binary download dependency.
- Restrict Node discovery to `*.test.js` so helpers are not counted as tests.
- Add frontend test scripts and fix lint before branch protection.
- Publish coverage/JUnit/artifacts and run migration/index checks.

---

# M. Deployment architecture

## M1. Environments

- **Development:** Docker Compose with API, worker, Mongo, Redis, MinIO, Mailpit, malware scanner, and optional stub AI provider. Seed is non-destructive unless explicit.
- **Test:** ephemeral isolated services per CI job; fake email/AI; fixed clock and deterministic IDs where useful.
- **Staging:** production-like managed services, separate accounts/keys/domains, synthetic data only, provider low quotas.
- **Production:** CDN/WAF/load balancer → stateless API; autoscaled workers; managed Mongo replica set/Atlas, managed Redis, private object storage/KMS, managed email/AI providers.

## M2. Containers and delivery

- Pin supported Node LTS image by digest; multi-stage build; non-root, read-only filesystem, dropped capabilities, tmpfs for temporary parsing.
- Separate general workers from hardened document/OCR workers.
- CI: install locked dependencies → lint/typecheck/unit → integration/contract/security → build → scan/SBOM/sign → deploy staging → migration/index job → smoke/E2E → approval/canary production.
- Blue/green or canary with backward-compatible expand/migrate/contract database changes.
- Feature flags for AI providers, prompt versions, score policies, and new workflows.

## M3. Configuration and secrets

Typed startup schema validates every field and production invariant. Groups include DB, Redis, object storage/KMS, email, AI provider/model per feature, auth issuers/keys/cookie domains, allowed origins, rate limits, retention, telemetry, integrations. Secret manager injects references at runtime. Fail startup when insecure defaults or incomplete provider tuples appear.

## M4. Observability

- Structured JSON logs with service/environment/version/request/trace/org-safe IDs; redact PII/secrets and avoid raw text.
- OpenTelemetry traces across API, Mongo, queue, worker, provider calls; correlation flows through outbox/jobs.
- Metrics: request rate/latency/error, auth failures, queue age/depth/failures, parser outcomes, malware detections, AI latency/tokens/cost/schema rejection/fallback, match freshness, email delivery, DB pool/index latency.
- SLO examples: API availability 99.9%, p95 non-AI read <300 ms, queue ready-resume p95 <2 min excluding OCR/provider incidents, no lost accepted jobs.
- Alerts on readiness, error budget burn, queue age, DLQ, DB saturation, token reuse, scan threats, provider spend spikes.

## M5. Backups, migration, and recovery

- Managed Mongo continuous backup/PITR; object versioning and lifecycle; Redis is not system of record.
- Encryption and separate backup access; quarterly restore drills with measured RPO/RTO.
- Versioned data migrations and index manifests with dry-run/progress/reconciliation/rollback strategy.
- Resume/job/application legacy migration runs in batches, records checkpoints, and verifies object references before cutover.

---

# N. Prioritized roadmap

## P0 — complete, secure working recruitment platform

1. Platform foundation, TypeScript modules, schemas/OpenAPI, errors/logging/request IDs
2. Secure auth sessions, verification/recovery, organization/membership/policies
3. Candidate profile consolidation and onboarding
4. Private versioned resume upload/scan/parse pipeline and worker infrastructure
5. Versioned structured jobs and organization hiring teams
6. Immutable application lifecycle/history and idempotent apply
7. Persisted deterministic/hybrid matching with evidence and protected-field redaction
8. Recruiter pipeline, notes/tags basics, hiring-manager assigned review
9. Interviews/slots/structured feedback
10. In-app/email notifications and candidate communication basics
11. Audit/security/consent/export/deletion/retention
12. Admin health/security/AI usage basics, production CI/CD/observability/backups

## P1 — high-value differentiation

- LLM resume and JD copilots
- Embedding recommendations/search, skill ontology, smart shortlist
- Candidate comparison, talent pools, duplicate detection, rediscovery
- Interview kit/evaluation assistance
- Recruiter and career copilots with citations/confirmed actions
- Calendar/email integrations and communication automation
- Advanced analytics, alerts, plan quotas/subscription
- MFA/WebAuthn, SSO readiness, custom organization roles

## P2 — advanced/future

- Job-board/HRIS ecosystem, external webhooks marketplace
- SAML/SCIM, regional residency/compliance controls
- Multilingual models and parsing
- Calibrated customer-specific matching and experimentation
- Workforce/labor intelligence
- Consent-heavy interview transcription where lawful

---

# O. Exact implementation order

Each step has an exit gate; do not start with AI UI or broad model creation.

1. **Baseline and ADRs:** freeze legacy contract snapshots; record modular-monolith, Mongo, queue, storage, auth, versioning, and fairness decisions. Activate CI and make current syntax/lint/build/deterministic tests green.
2. **Project foundation:** introduce TypeScript incrementally, typed env validation, structured errors/response presenters, request IDs, OpenAPI generation, test containers, and module skeletons. No behavior rewrite yet.
3. **Identity migration:** add `AuthSession`, short access/rotating refresh, verified email, recovery, logout/revoke, token invalidation, brute-force controls. Migrate frontend to memory access token/cookie refresh. Preserve legacy login temporarily.
4. **Organizations/authorization:** add Organization, Membership, invitations, standard permissions, organization context, policy/repository tenant guards, and exhaustive negative tests. Migrate recruiter company strings/unused Company data with reconciliation.
5. **Candidate profile consolidation:** define canonical fields, migrate duplicates from `User`/`CandidateProfile`, add provenance/preferences, segregate or remove DOB/gender unless justified, and build onboarding contract.
6. **Async platform/storage:** deploy Redis/BullMQ, outbox, JobRun, private object-store adapter, worker entry points, malware scanner, and observability. Prove idempotent retry/DLQ behavior.
7. **Resume aggregate/pipeline:** add Resume/Version/Document/ParsedResume; migrate current files; support PDF/DOCX with content checks, parse/OCR states, candidate extraction review, retention-safe delete. Reject DOC until safe support exists.
8. **Skill taxonomy:** add canonical skills/aliases and candidate skill evidence; migrate string skills without deleting originals until verified.
9. **Versioned jobs:** add JobVersion/JobSkill, organization/hiring-team ownership, structured compensation/requirements, publish state machine and ETags. Build legacy Job adapter.
10. **Applications:** migrate to org/job-version/resume-version references; immutable history, valid transitions, idempotent apply/withdraw, archival, transactions/outbox. Repair/flag old snapshots lacking provider/text.
11. **Matching v1:** wrap current deterministic engine with score-policy versioning, protected-field redaction, evidence schema, persisted CandidateMatch, async recompute, pagination/cache/staleness. Do not change score silently.
12. **Core workflow UI contract:** release generated v1 client and mock server; build candidate job/application and recruiter pipeline against v1. Keep compatibility routes for old screens.
13. **Collaboration and hiring manager:** assigned jobs, notes/tags/mentions, candidate compare basics, review capabilities, audit activity.
14. **Interviews:** slots, calendar-neutral scheduling, structured kits/scorecards/feedback, candidate notifications, status integration.
15. **Notifications/email:** provider abstraction, templates/versioning, queue, preferences, EmailEvent delivery/bounce handling, approved candidate communication.
16. **AI provider layer:** adapters, prompt/schema registry, usage ledger, quotas, retries/timeouts/circuits, safety/evaluation harness. Begin with resume/JD extraction suggestions—not autonomous actions.
17. **Embeddings/hybrid matching:** sanitized embeddings/vector index, semantic search/recommendations, calibrated hybrid components, confidence/limitations and evaluation gate. Run shadow comparison before enabling ordering.
18. **Copilots/differentiators:** resume/JD copilot, interview kit, recruiter/career copilot, smart shortlist as proposals with citations and confirmation.
19. **Admin/compliance:** audit/security views, AI usage/cost, moderation, consent, export/deletion/retention, step-up auth, incident controls.
20. **Production hardening/cutover:** load/chaos/security/accessibility/E2E tests, dependency remediation, backups/restore drill, canary, monitor SLOs, then deprecate and remove legacy routes/fields only after usage and migration reconciliation reach zero.

---

## Final acceptance criteria for P0

A P0 release is not complete until:

- a verified candidate can review a safely parsed resume version, receive an explainable fit, apply with exact immutable versions, track status, schedule an interview, and receive communications;
- an invited recruiter can operate only inside their organization, publish a versioned job, review paginated candidates and evidence, collaborate, schedule interviews, and progress applications through a valid state machine;
- a hiring manager can access only assigned jobs/candidates, compare evidence, and submit locked structured feedback;
- a step-up-authenticated admin can inspect users/orgs/audit/security/AI health without bypassing logging;
- cross-tenant and protected-attribute tests pass, AI failure falls back safely, file threats cannot reach parsers, critical writes are idempotent/transactional, and accepted async work is recoverable;
- OpenAPI and generated client match production responses; CI, observability, restore drills, retention, and incident runbooks are operational.

The rebuild should preserve the current deterministic analyzer as a clearly labeled fallback and retain functioning UI primitives, but replace the current identity/tenant, resume snapshot, synchronous processing, and unversioned recruitment foundations before adding sophisticated AI features.
