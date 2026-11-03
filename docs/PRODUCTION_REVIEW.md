# HireSmart AI complete production review

**Review date:** 2026-08-18  
**Branch:** `arena/01a0154f-hiresmart-ai`  
**Scope:** frontend, backend, MongoDB models/indexes, authentication, tenancy, resume/file handling, AI, queues, notifications, deployment and tests.

## Result

The review found and fixed integration, privacy, authorization, AI reliability, session, idempotency, migration, observability, UX and deployment issues. The application compiles and its database-independent tests pass. It is materially closer to a real product, but final production approval still requires exercising the database-backed suite and external providers in a staging environment with MongoDB, S3, malware scanning, SMTP and chosen AI credentials.

## Bugs and integration issues fixed

- Corrected browser-readable CSRF cookie scope and prevented anonymous page loads from consuming refresh/login rate limits.
- Added single-flight refresh safety, private query-cache clearing on logout/session loss, URL organization synchronization and safe legacy redirects.
- Fixed recruiter login landing before asynchronous organization state was committed.
- Replaced stale legacy frontend calls and removed dead legacy pages/components.
- Added missing real v1 contracts for saved jobs, candidate interviews, assigned jobs, hiring-team assignment and job-specific resume tailoring.
- Added `resume_rewrite` and `jd_generation` structured AI capabilities rather than presenting unsupported UI.
- Added global admin AI usage and user reactivation; updated UI to actual semantics.
- Fixed application creation response to use a stable safe DTO and updated the client.
- Fixed resume deletion so the primary pointer and compatibility profile fall back to the latest ready version instead of referencing a deleted artifact.
- Added legacy-to-v1 migration for recruiter organizations/memberships, jobs, applications and supported resumes.
- Added explicit production index creation and disabled uncontrolled Mongoose auto-indexing in production.
- Added application/interview idempotency records and replay behavior; frontend keys remain stable across retries.
- Made notification enqueue failures non-destructive to accepted applications/status changes/interviews and made idempotent notification retries requeue failed delivery.
- Improved readiness output with queue backlog and stale-lock information.

## Security issues fixed

### Authentication/session

- Refresh-token rotation now stores the prior hash, detects immediate reuse, revokes the token family and records a high-severity security event.
- CSRF double-submit cookie is visible at the application path while the refresh token remains HttpOnly and narrowly scoped.
- Production environment validation now requires secure cookies, verified email, authenticated SMTP, private S3 configuration and malware scanner configuration.
- IP identifiers in audit/security records are HMACed rather than unsalted hashes.
- Legacy long-lived-token routes are disabled by default in production and explicitly disabled in Docker Compose; they remain opt-in for migration/tests only.
- Registration validates recruiter organization requirements before persistence and compensates partial user/org/member/consent creation failures.
- Forgot/resend delivery failures no longer reveal account existence through different HTTP outcomes.

### Authorization/tenant isolation

- Hiring managers/interviewers/viewers can only read jobs, candidates, matches, notes, resumes and interviews assigned through the job hiring team (or interview participant access).
- Hiring managers can perform the requested decision transition only on assigned applications; interviewers cannot manage pipeline state.
- Candidate ownership remains mandatory for resume, fit, application and interview-preparation endpoints.
- Cross-tenant queries retain organization predicates and return not-found semantics.
- Admin user listings now use explicit minimal projections and no longer expose resume text or unrelated PII.

### Input/file/privacy

- Replaced permissive candidate nested `z.any()` fields with strict bounded schemas for education, experience, projects, certifications and social links.
- Added endpoint-specific upload and AI limits with stable v1 rate-limit errors.
- Application list/detail/transition/apply responses no longer expose storage keys or full resume snapshot text.
- Interview population now selects only required application/job fields instead of embedding resume snapshots.
- Production Nginx now sends CSP, HSTS, permissions, frame, MIME and referrer defenses.
- Existing PDF/DOCX content checks, EICAR/external malware scan, random private paths, S3 encryption, 0600 local files and authorized streams remain intact.
- No committed credentials, private keys, Atlas URLs or frontend API secrets were found.

## AI quality/security issues fixed

- Strengthened the system prompt to treat resumes, JDs, notes and embedded instructions as untrusted data and reject prompt/tool/secret/state-mutation instructions.
- Made all AI response objects strict Zod schemas, including nested structures.
- Added response-size limits, malformed HTTP/JSON handling, embedding vector validation and embedding timeouts.
- Added separately configurable primary, fallback and embeddings URLs/keys/models; keys remain server-only.
- Persisted failed AI runs as failure telemetry rather than losing operational evidence.
- Added intentional malformed-output, timeout and invalid-vector tests.
- Grounded career copilot in the candidate’s authorized structured professional evidence, excluding contact data.
- Grounded recruiter copilot in authorized organization jobs and aggregate funnel data, without candidate PII.
- Candidate external AI/embedding use remains consent-gated.
- Hybrid score now excludes non-applicable preferred/education/experience/preference components instead of granting free points, then renormalizes configured weights.
- Matching uses skills extracted from the exact submitted resume version rather than mutable current-profile skills.
- Candidate matches now persist job version, resume version, score-policy version and the exact configured weights.
- Published-job changes that affect scoring increment the job version and stale prior matches.
- Frontend AI views display provider/model/prompt/fallback, confidence and limitations and never mark failed operations successful.

## UX/accessibility fixes

- Added global rendering error boundary with safe reload guidance.
- Added skip navigation, route-heading focus, reduced-motion behavior, keyboard-safe responsive navigation and dialog focus trapping/restoration.
- Improved applicant filtering, tag/stage filters, debounced search, fit sorting and cursor-based load-more behavior.
- Added real resume preview, version download/delete confirmation, processing/failure/retry states and stable job-specific tailoring.
- Added backend-derived candidate/recruiter attention views rather than fake KPI cards.
- Added global admin AI telemetry and honest provider/fallback reporting.
- Removed dead buttons, dead legacy screens and misleading unsupported actions.
- Updated destructive and account lifecycle confirmations and server error presentation.

## Performance improvements

- Public/auth/candidate/recruiter/system route groups remain code-split.
- Removed unused legacy pages, old score/report components and obsolete custom request-state hooks.
- TanStack Query handles caching/deduplication; tenant IDs remain in tenant query keys.
- Search requests are debounced and cancellable.
- Applicant lists use cursor pagination; match computation is bounded in groups.
- Recommendations score with bounded concurrency rather than a serial 100-job loop.
- Resume Blob preview URLs are revoked on close.
- Final production bundle has a ~92 KB gzip application entry plus lazy feature chunks (candidate ~8.8 KB gzip, recruiter ~11.1 KB gzip).

## Test/build results

Successful final checks:

- frontend ESLint: pass
- frontend Vitest: 3 files / 6 tests pass
- frontend production build: pass
- frontend production dependency audit: 0 vulnerabilities
- backend syntax check: pass
- backend ESLint: pass
- backend production dependency audit: 0 vulnerabilities
- backend database-independent suite including AI failures/security/matching: 54 tests pass
- v1 API liveness responds 200 without DB; readiness correctly responds 503 with Mongo/job-store down
- production-safe environment fixture validates; intentionally insecure fixture exits non-zero
- secret/key scan: no committed secrets found
- `git diff --check`: pass

The complete `npm test` command was also executed: 77 discovered tests, 56 pass, 21 fail. Every failure is `hookFailed` because this sandbox has no Docker or local `mongod` and the MongoDB Memory Server download receives `ECONNRESET`. No database-backed assertion ran and failed. CI is configured with a MongoDB 7 service and avoids the runtime binary download; its v1 workflow suite now includes refresh replay detection, RBAC/assignment, organization isolation, safe admin projections, account suspension/reactivation, saved jobs, resume processing/tailoring, application idempotency, matching, interview idempotency, feedback and analytics prerequisites.

## Materially changed areas

- frontend secure transport, auth/org context, route guard, system/admin/candidate/recruiter pages, product components, Nginx and tests;
- v1 auth, admin, candidate, recruitment, resume, interview and health controllers;
- membership, session, match and idempotency models;
- AI config/provider/orchestrator/schemas and hybrid matcher;
- notification/session/idempotency services;
- production env validation, database index policy, CI, migration/index scripts and API documentation.

## Remaining risks requiring staging/external systems

1. **Database execution:** the full Mongo-backed workflow must pass in CI/staging; it cannot be honestly verified in this sandbox without MongoDB.
2. **External AI quality:** real provider latency, cost, regional processing, model quality and provider-specific JSON compatibility require customer-selected credentials and evaluation datasets. Deterministic fallback is verified.
3. **Object storage/malware/email:** S3 IAM/KMS policy, scanner behavior and SMTP delivery/bounce/complaint handling require real staging services.
4. **Document isolation/OCR:** parsers run in the worker process after malware validation; high-assurance deployments should isolate parsers in a networkless resource-limited container. Scanned PDFs need an external OCR service.
5. **Calendar integration:** core scheduling is functional, but Google/Microsoft/Calendly OAuth and sync need external accounts and provider adapters.
6. **Compliance:** retention periods, legal holds, regional residency, fairness evaluation and employment-law language need organization policy and legal review.
7. **Scale:** the durable Mongo queue is appropriate for current scale; high-volume OCR/embedding workloads should move to Redis/BullMQ or a managed queue.
8. **Enterprise identity:** SAML/SCIM/MFA/WebAuthn remain planned enterprise capabilities.

These are not represented as completed or mocked in production paths.

## Exact verification commands

```bash
git status --short --branch
git log -3 --oneline --decorate

cd client
npm run lint
npm run test
npm run build
npm audit --omit=dev --audit-level=high

cd ../server
npm run check
npm run lint
NODE_ENV=test node --test --test-concurrency=1 \
  test/app.test.js test/aiProvider.test.js test/matching.test.js \
  test/resumeAnalyzer.test.js test/productionCore.test.js
npm audit --omit=dev --audit-level=high
npm test

# HTTP process/liveness/readiness check without a database
NODE_ENV=test PORT=5099 node -e 'const app=require("./app"); app.listen(5099)'
curl http://127.0.0.1:5099/api/v1/health/live
curl -i http://127.0.0.1:5099/api/v1/health/ready

# Production environment validation (dummy non-secret service coordinates)
NODE_ENV=production MONGO_URI=mongodb://db/hiresmart \
JWT_SECRET=12345678901234567890123456789012 \
CORS_ORIGIN=https://app.example.com REQUIRE_EMAIL_VERIFICATION=true \
COOKIE_SECURE=true STORAGE_PROVIDER=s3 S3_BUCKET=private-resumes \
S3_REGION=ap-south-1 MALWARE_SCANNER_URL=http://scanner:8080/scan \
SMTP_HOST=smtp.example.com SMTP_USER=user SMTP_PASS=pass \
node -e 'require("./config/env").validateEnvironment()'

git diff --check
```
