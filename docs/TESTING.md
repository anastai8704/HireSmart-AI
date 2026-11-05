# Test suite (Phase 11)

This document records what each test covers, how the suites are classified, and which gaps remain. It is a record
of what was run, not a claim of coverage. Only CI results count as verified for database-backed tests.

## How tests run

| Suite | Command | Where it runs | Needs a database |
| --- | --- | --- | --- |
| Server syntax | `cd server && npm run check` | local and CI | no |
| Server unit | `cd server && node --test test/*.unit.test.js` | local and CI | no |
| Server integration | `cd server && npm test` (runs `scripts/run-tests.js`, which runs every `*.test.js` with a MongoDB instance) | CI service container | yes |
| Client unit and component | `cd client && npx vitest run` | local and CI | no |
| Lint | `cd server && npx eslint .`, `cd client && npx eslint .` | local and CI | no |
| Build | `cd client && npm run build` | local and CI | no |
| Dependency audit | `npm audit --omit=dev` in `server/` and `client/` | local | no |
| Migrations | `npm run migrate:v1`, `migrate:applications` | not automated | yes |

Database-backed tests cannot run in this sandbox because MongoDB cannot be downloaded here. They run in CI.

## Classification of existing tests

Every server test file was kept. None was deleted in Phase 11, because each covers a rule that is still in force.
Classes used: **valid regression** (kept as-is), **updated** (changed to match final rules), **duplicate** (overlaps
another file; kept until consolidated), **obsolete** (none found), **missing** (added in Phase 11).

| File | Class | Notes |
| --- | --- | --- |
| `*.unit.test.js` (13 files) | valid regression | Pure rules: state machines, policies, analytics definitions, subscription rules, notifications, pagination, reports, security controls |
| `authorizationBoundaries.test.js`, `securityRoutes.unit.test.js`, `securityControls.unit.test.js` | valid regression | Phase 8 authorisation boundaries; `PUBLIC_ROUTES` frozen |
| `v1Workflow.test.js` | valid regression | End-to-end API flow from resume upload to hired and admin console |
| `candidatePipeline.test.js`, `jobModeration.test.js`, `moderation.test.js` | duplicate (partly) | Both cover job moderation and transitions. Consolidation is deferred to avoid losing cases. |
| `paymentWebhooks.test.js`, `paymentSecurity.test.js`, `razorpayIntegration.unit.test.js` | valid regression | Signature, dedupe and test-mode-only rules |
| `subscriptionEnforcement.test.js`, `subscriptionRules.unit.test.js` | valid regression | Plan limits |
| `adminAnalytics.test.js`, `analyticsDefinitions.unit.test.js`, `reports.test.js`, `reports.unit.test.js` | valid regression | Dashboard and export definitions must match |
| `notificationsAudit.test.js`, `notificationAudit.unit.test.js` | updated in Phase 9 | Subscription expiry seed fixed |
| `dataIntegrity.test.js` | missing, added | Duplicate applications, concurrent duplicates, failed operations, invalid references |
| `pagination.unit.test.js` | missing, added | Cursor and limit rules |
| `client/src/**/*.test.*` (28 files) | valid regression | Component and page tests, API client, safe URLs, analytics ranges |

## Coverage by required category

| Category | Where it is covered | Gaps |
| --- | --- | --- |
| A. Unit: business rules, state transitions, validation | domain state machines, job moderation policy, company verification policy, candidate pipeline, subscription rules, analytics definitions, notification rules | Not every transition in every module is listed. |
| A. Unit: subscription limits | `subscriptionRules.unit.test.js`, `subscriptionEnforcement.test.js` | |
| A. Unit: revenue calculation | `analyticsDefinitions.unit.test.js`, `reports.test.js` (totals match the dashboard) | |
| A. Unit: risk indicators | `companyVerificationPolicy.unit.test.js` | Risk scoring is covered as rules, not as a full model. |
| B. Integration: authentication | `accounts.test.js`, `authSecurityUX.test.js`, `v1Workflow.test.js` | |
| B. Integration: company verification | `companyVerification.test.js` | |
| B. Integration: job creation, approval, bulk moderation | `jobModeration.test.js`, `moderation.test.js`, `v1Workflow.test.js` | |
| B. Integration: candidate applications | `v1Workflow.test.js`, `dataIntegrity.test.js` | |
| B. Integration: recruitment stages | `candidatePipeline.test.js`, `interviewWorkflow.test.js`, `v1Workflow.test.js` | |
| B. Integration: payments and webhooks | `paymentWebhooks.test.js`, `paymentSecurity.test.js` | Razorpay Test Mode checkout is not run (see below). |
| B. Integration: reporting | `reports.test.js`, `adminAnalytics.test.js` | |
| C. Authorisation: candidate and tenant isolation | `authorizationBoundaries.test.js`, `v1Workflow.test.js` (cross-organisation), `placementAuthorization.test.js` | |
| C. Authorisation: recruiter cannot approve own jobs through admin endpoints | `jobModeration.test.js`, `moderation.test.js` | |
| C. Authorisation: admin routes | `authorizationBoundaries.test.js`, `securityRoutes.unit.test.js` | |
| C. Authorisation: subscription limits cannot be bypassed | `subscriptionEnforcement.test.js` | |
| D. Data integrity: duplicate payment events | `paymentWebhooks.test.js` (event-id dedupe) | |
| D. Data integrity: duplicate applications | `dataIntegrity.test.js` (added) | |
| D. Data integrity: invalid transitions and references | `candidatePipeline.test.js`, `domainStateMachines.unit.test.js`, `dataIntegrity.test.js` | |
| D. Data integrity: concurrent moderation | `jobModeration.test.js` (parallel requests) | |
| D. Data integrity: failed operations leave no partial records | `dataIntegrity.test.js` (refused applications create nothing) | |
| E. Frontend: loading, empty, error, validation, filtering, pagination, bulk selection, success and failure | Component tests across 28 files | Not every state of every page is asserted. Responsive layouts are not tested. |
| F. End-to-end (browser) | **Not implemented.** The repository has no browser E2E framework. | See gaps. |

## Workflow coverage (F, API level)

| # | Workflow | Covered at API or unit level by | Status |
| --- | --- | --- | --- |
| 1 | Candidate registration and login | `accounts.test.js`, `v1Workflow.test.js` | covered |
| 2 | Candidate profile creation | `candidatePipeline.test.js` (partial) | partial |
| 3 | Recruiter registration | `v1Workflow.test.js`, `marketplace.test.js` | covered |
| 4 | Company verification submission | `companyVerification.test.js` | covered |
| 5 | Admin company review | `companyVerification.test.js` | covered |
| 6 | Job posting | `v1Workflow.test.js`, `jobModeration.test.js` | covered |
| 7 | Admin job approval | `jobModeration.test.js`, `moderation.test.js` | covered |
| 8 | Candidate job search | `marketplace.test.js` | partial (search filters are not exhaustively tested) |
| 9 | Candidate application | `v1Workflow.test.js`, `dataIntegrity.test.js` | covered |
| 10 | Recruiter application review | `candidatePipeline.test.js`, `v1Workflow.test.js` | covered |
| 11 | Interview and offer | `interviewWorkflow.test.js`, `candidatePipeline.test.js` | covered |
| 12 | Joining-status update | `placementAuthorization.test.js`, `candidatePipeline.test.js` | covered |
| 13 | Subscription purchase (test mode or mock) | `paymentWebhooks.test.js`, `subscriptionEnforcement.test.js` (mock provider) | covered with mocks. Real Test Mode checkout not run. |
| 14 | Payment failure and retry | `paymentWebhooks.test.js` (halted and pending states) | partial |
| 15 | Subscription expiry | `subscriptionRules.unit.test.js`, `notificationsAudit.test.js` | partial (expiry reminders are tested. Automated plan downgrade after expiry is not tested end to end.) |
| 16 | Report generation | `reports.test.js` | covered |

## Gaps and decisions

- **No browser end-to-end tests.** Workflows 1–16 are covered at the API and unit level. A browser suite (for example
  Playwright against a seeded test database) is a follow-up. It was not added in Phase 11 because it needs a database
  and browser binaries that this sandbox cannot provide, and results cannot be verified here.
- **Razorpay Test Mode checkout and the deployed webhook URL** are not exercised. They are external integrations and
  remain pending (see `docs/PAYMENTS.md`). Automated tests make no external network calls.
- **Migrations** (`migrate:v1`, `migrate:applications`, `migrate-default-recruiter-plans`) are not run by CI. They need a
  database. Run them against a restored copy before any production use.
- **Responsive layouts** are not tested.
- **Partial workflows** (2, 8, 14, 15) are listed above with what is missing.

## Results for this phase

Commands run locally on the Phase 11 branch: `npm run check` (exit 0), `npx eslint .` in `server/` (0 errors) and in
`client/` (0 errors, 3 pre-existing warnings), `npm audit --omit=dev` in both (0 vulnerabilities), `node --test` on
all `*.unit.test.js` files, `npx vitest run` in `client/` (148 passing), `npm run build` in `client/` (ok). The
database-backed suites, including the new `dataIntegrity.test.js`, were run in CI. The CI run for each commit is
recorded in the phase report.
