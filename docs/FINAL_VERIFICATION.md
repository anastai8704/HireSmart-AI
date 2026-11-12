# Final verification report (Phase 13)

This report records what was checked, how, and what is still open. It does not claim that every vulnerability has
been eliminated. "CI" means the GitHub Actions run for the commit named in the row. Database-backed tests run only in
CI, because this sandbox has no MongoDB.

Commits covered: Phase 12 at `2a74677` (CI run `42069765305`, backend and frontend-contract both green). Phase 13 changes
are listed in the last section.

## 1. Implemented and tested

| Area | Evidence |
| --- | --- |
| Authentication, sessions, refresh rotation, CSRF on refresh, reuse detection | `server/test/*` (CI, DB-backed); Phase 8 notes in `docs/SECURITY.md` |
| Role permissions and route access | `server/test/securityRoutes.unit.test.js` freezes the public route list and checks every `/admin` route (CI and local `node --test`) |
| Company verification and job moderation | `server/test/jobModeration.test.js` (CI), including "counts and queues agree" and draft-edit regression |
| Candidate workflow (apply, duplicate, resume state, draft/missing job, concurrency, idempotency) | `server/test/dataIntegrity.test.js` (CI); `docs/TESTING.md` |
| Pagination | `server/test/pagination.unit.test.js` (local 7/7; CI) |
| Analytics and reports, CSV formula-injection protection, export row cap, audit of exports | `server/test/reports.unit.test.js` (local 6/6), `reports.test.js` (CI); `docs/REPORTS.md` |
| Subscriptions and payment state machine (test mode only) | Phase 6/7 suites (CI); `docs/PAYMENTS.md` |
| Notifications, audit log fields, redaction | Phase 9 suites (CI); `docs/SECURITY.md` |
| Error handling (typed errors, validation 422, `CODE` fields) | Covered by the API suites above (CI) |
| Frontend unit and component tests | Client `npx vitest run`: 28 files, 148 tests passing (local, this session) |
| Production frontend build | `npm run build` in `client/` succeeds (local, this session) |
| Server lint | `npm run lint` in `server/`: 0 errors, 0 warnings (local, after Phase 13 cleanup) |
| Client lint | `npm run lint` in `client/`: 0 errors, 3 warnings (see section 4) |
| Dependency audit | `npm audit --omit=dev`: 0 vulnerabilities for server and client (Phase 11, unchanged since) |
| Unused dependencies | Every declared dependency is referenced in non-test source (Phase 12 scan) |

## 2. Implemented, awaiting external credentials or configuration

- **Razorpay Test Mode checkout** against a real Razorpay Test Mode account: not run. Code path and signature checks are
  covered by tests only. Requires `RAZORPAY_KEY_ID` (`rzp_test_...`), `RAZORPAY_KEY_SECRET`, and a test plan created in
  the Razorpay dashboard.
- **Deployed webhook URL** (`POST /api/v1/payments/webhooks/razorpay`): not registered or verified in any deployed
  environment. Requires `RAZORPAY_WEBHOOK_SECRET` and a public HTTPS URL.
- **Real e-mail delivery**: templates and queueing are tested. Delivery through a real SMTP provider is not verified.
- **Yearly plan prices**: not set. All plans keep `yearlyPriceInr: null`. Pricing has not been finalised, so none was
  invented.

## 3. Partially implemented

- **Browser end-to-end tests**: none. Workflows are tested at the API level (`docs/TESTING.md`, coverage matrix shows
  workflows 2, 8, 14, 15 partially).
- **Responsive interface**: not verified in a real browser at mobile and desktop widths. Not claimed.
- **Migrations**: `migrate:v1` and `migrate:applications` scripts exist but are not run by CI. They have not been rehearsed
  against a restored copy of a real database.
- **Dashboard metrics versus database records**: the report and analytics tests check that summary totals agree with
  the underlying records for the cases they cover. Not every dashboard widget is cross-checked against raw records.
- **Company analytics page**: has no CSV export button yet. The server endpoints support it (`docs/REPORTS.md`).

## 4. Not implemented

- **PDF invoice generation**: pending.
- **Malware scanning** for uploaded files: pending.
- **Data retention and hard-delete policy**: deliberately deferred by the product owner. Current protections are kept
  and the gap is documented in `docs/SECURITY.md`. Revisit before launch.
- **Live payment mode**: not enabled and not authorised. The server refuses live keys and `NODE_ENV=production`
  payments.
- **Client lint warnings**: 3 warnings in `client/src/pages/auth/AuthPages.jsx` (`react-hooks/incompatible-library`,
  from `react-hook-form`'s `watch()`). Left as-is; they are library compatibility warnings, not errors.

## 5. Known risks (accepted or open)

- Dev-only CORS reflects any origin when `CORS_ORIGIN` is empty. Production must set `CORS_ORIGIN`.
- `/avatars/:key` is a public capability URL (accepted).
- Per-account login throttling can temporarily lock an account (accepted trade-off).
- `JWT_EXPIRES_IN` is read but unused.
- `payment.captured` handling depends on `subscription_id` being present on the payment entity. Not yet confirmed against
  a real Razorpay Test Mode payload.
- A dismissed subscription Checkout is cancelled locally only. The provider-side subscription stays `created` until it
  expires.
- Refunds are counted in revenue by `updatedAt`.
- The demo seed (`npm run seed:demo`) creates accounts with one known demo password. It now refuses
  `NODE_ENV=production`, but the password is still in source. Do not use that dataset outside local or test databases.
- Historical study and planning documents in `docs/` (for example `LEARN.md`, `VIVA.md`, `RESUME.md`,
  `PROJECT_AUDIT.md`) may contain outdated statements. They are not product documentation.

## 6. Manual configuration required before any deployment

1. Set `NODE_ENV=production`, a strong `JWT_SECRET`, `CORS_ORIGIN`, and SMTP settings (`SMTP_HOST`, `SMTP_USER`,
   `SMTP_PASS`). Production startup validation refuses unsafe values (`docs/ENVIRONMENT.md`).
2. Keep `PAYMENT_MODE=disabled` until Razorpay Test Mode checkout and the deployed webhook have been verified.
3. Run `npm run migrate:v1` (and `migrate:applications` if legacy data exists), then `npm run indexes:create`, then
   `npm run bootstrap:admin`, against the target database. Do not run any seed script there.
4. Register the webhook URL in the Razorpay dashboard and use the matching webhook secret.

## 7. Remaining production blockers

1. Data retention and hard-delete policy (deferred decision; must be made before launch).
2. Razorpay Test Mode checkout verified end-to-end, including the `payment.captured` payload check and the
   dismissed-Checkout provider state.
3. Deployed webhook URL configured and verified.
4. Yearly pricing decision (or a decision to launch monthly only).
5. PDF invoices, if they are part of launch scope.
6. Browser end-to-end and responsive checks.
7. Migration rehearsal on a restored database copy.

## 8. Moderation-count discrepancy: re-investigation

The original symptom was a zero pending count shown next to a visible company card. The full analysis is in
`docs/PROJECT_AUDIT.md`.

- **Confirmed causes (code, fixed and tested):**
  1. Saving a draft's edits wrote a pending change, so drafts were counted as pending.
  2. Closed jobs stayed in the pending count but were excluded from bulk approval.
  3. The job preview depended on a legacy list capped at 50 jobs.
  4. The recruiter dashboard counted pending by listing only, not by pending change.
- **Resolution:** one shared predicate (`needsReviewExpr`) now drives every pending count, queue, and bulk action.
  Regression tests: `server/test/jobModeration.test.js`, "drafts: editing a draft does not create a pending change"
  and "counts and queues agree: the summary matches the company's records".
- **Not confirmed:** the exact production data state that produced the zero-count screen. No production database
  was available. To confirm it for affected data, run the read-only drift report, then apply it after reviewing the
  dry run:
  `cd server && node scripts/moderation-drift-report.js` (dry run), then `--apply` (clears stale draft proposals only).

## 9. Production paths: no dummy analytics or hardcoded payment success

- Searched `server/` and `client/src/` for `Math.random`, `mock`, `dummy`, and `fake` in production code. None
  found in server code. The landing page's product-preview data is labelled as demo UI in its own comment.
- Every write that sets a payment to `captured` happens after a payment-signature check (`verify-payment`) or a verified
  webhook. The `simulation` payment mode is allowed only when `NODE_ENV` is `development` or `test`.

## 10. Review scans (Phase 13)

- **Hardcoded secrets** (`rzp_live_`, `rzp_test_` literals, AWS key, OpenAI-style key, private key blocks) in tracked
  non-test, non-document files: none found. The demo password in `seed-presentation-demo.js` is the exception noted in
  section 5.
- **Debug statements**: no `console.log`/`console.debug` in production server code (scripts excluded) or client source.
  No `debugger` statements.
- **TODO / FIXME / XXX** in server and client source: none.
- **Focused or skipped tests** (`.only`, `.skip`, `xit`): none.
- **Hardcoded localhost in client source**: none (only a code comment). API calls use `/api/v1` unless
  `VITE_API_URL` is set.
- **Unused code**: 13 unused identifiers were flagged by ESLint in `server/controllers/v1PlacementController.js` and
  `server/scripts/seed-presentation-demo.js`. Unused names were removed. In the placement controller, the model modules
  are kept as side-effect-only requires, so Mongoose model registration does not change. The unused `notify` import was
  removed.
- **Duplicate or stray files**: none tracked (no backup, copy, log, or env files; no `node_modules` or `dist`).
- **Unprotected admin routes**: `/api/v1/admin/*` is guarded as a prefix (`requirePlatformAdmin`). The two
  organisation-scoped audit endpoints require `audit.read`. Public mutating routes are only auth flows, the invitation
  accept link, and the Razorpay webhook (signature-checked).
- **Stale documentation**: README, `docs/backend-api.md`, `docs/ENVIRONMENT.md` rewritten in Phase 12 and checked
  against code; relative links verified. Other feature documents were kept (see section 5).

## 11. Commands run in Phase 13 (local)

- `cd server && npm run lint` → 0 errors, 0 warnings
- `cd server && node --test test/reports.unit.test.js test/pagination.unit.test.js test/securityRoutes.unit.test.js` → 17 pass, 0 fail
- `cd server && NODE_ENV=production node scripts/seed-presentation-demo.js` → refuses with an error and exit code 1
- `cd client && npx eslint .` → 0 errors, 3 warnings
- `cd client && npx vitest run` → 28 files, 148 tests passing
- `cd client && npm run build` → success

CI for the Phase 13 commit is listed in the final report. Database-backed suites run only in CI.

---

# Final QA report: Requirements 1–18 (branch `arena/a534346b-hiresmart-ai`)

Status key: **Verified** means automated tests ran and passed (CI DB-backed tests count as verified). **Code-checked** means
the code was read against the requirement but has no dedicated automated test. **Not verified** means it needs a live
external service or credentials that the sandbox does not have. Nothing is marked Verified without a test result.

CI evidence: run `43197411278` on `a305f46`. Backend job: `npm ci`, `npm run check`, `npm run lint`, `npm run indexes:create`
(32 collections), `npm test` (63/63 DB-backed files pass against MongoDB 7), `npm audit --omit=dev --audit-level=high` (0).
Frontend-contract job: `npm ci`, lint, `vitest` (334 tests), build. Both green.

| Req | Area | Status | Evidence / open item |
|---|---|---|---|
| 1 | Razorpay ₹999 Starter, webhook authority, duplicates, invalid signature, retry | Verified (test mode) | `paymentWebhooks`, `paymentSecurity`, `razorpayIntegration.unit` in CI. Not verified: a live Razorpay Test Mode checkout (needs keys). |
| 2 | Billing & Quotas redesign, history filters, cancel scheduled vs immediate | Verified (client) | Client billing helper tests; `GET /subscriptions/invoices` filters (`domain/paymentHistory.js`). Visual check in a browser not done. |
| 3 | Job-first interview scheduling, binding fields | Verified | `interviewApiFlow`, `interviewWorkflow` (CI). `APPLICATION_JOB_MISMATCH` covered. |
| 4 | Google Calendar/Meet, encrypted tokens, honest labels | Partly verified | Unit: `googleCalendar`, token encryption. Not verified: live OAuth and Calendar (no credentials). Without credentials the app reports `setup_required`, never a fake Meet. |
| 5 | Recruiter interview UI, start control | Verified (client) | Client tests; `POST .../start` covered in `interviewApiFlow`. |
| 6 | Candidate join gating (`in_progress` only), early/late/cancelled/rescheduled/missing link | Verified | `interviewApiFlow` join gating and start window; candidate view fix in `5408122`. |
| 7 | Admin control center, metrics reconcile | Verified (CI) / partly | `adminAnalytics`, `reports` (totals match overview, fixed in `3cb0b86`). Overview endpoint has no dedicated integration test. Readiness covers DB and job store only, not payments or email. |
| 8 | Revenue & Plans: captured-only, refunds subtracted, test/live separated | Verified | `adminRevenuePlacements`, `reports` (CI), `revenueRules.unit` (refund attribution, `ea8673d`). |
| 9 | Placements and employment statuses, history kept, sensitive access audited | Verified (CI) | `placementAuthorization`, `employmentDates.unit`; resume access audited (`admin.candidate_resumes_viewed`). Placement rule decision: see CHECKPOINT (rule reverted). |
| 10 | Asia/Kolkata display, UTC storage, no past interviews, completed excluded from Upcoming | Verified | `istTime.unit`, `istDates.test` (client), `interviewWorkflow` (past-date check). |
| 11 | Demo accounts, hashed passwords, development-only reset with backup, idempotent seed | Verified (guards); seed run not verified in CI | `demoResetPolicy.unit` (refuses production, requires confirm, exact database name, local host, backup before delete). `DEMO_PASSWORD` comes from env (min 12 chars); nothing hardcoded. Not verified: running `seed:demo` against a real database. |
| 12 | Shared accessible searchable combobox | Verified (client) | Client combobox tests (`acf6450`). |
| 13 | Full gate run and this report | Verified | Gates above. `npm audit` fixed by a semver-compatible update, not `--force`. |
| 14 | Free vs Paid central entitlement, backend enforcement, error codes | Verified | `subscriptionEnforcement` (CI), `subscriptionCheck` middleware. |
| 15 | Demo plans: recruiter Enterprise, candidate Career Plus, `source=demo_seed`, `isDemo=true`, no Razorpay transactions | Code-checked + seed guards | Seed grants use `recruiter_enterprise`, `candidate_plus`, `source: demo_seed`, `isDemo: true`. No dedicated automated test of the seeded state yet. |
| 16 | Expiry reminders (7d, 1d, expiry), idempotent, in-app and email, fallback to Free without deletion, no invented grace | Verified (CI) / partly | `notificationsAudit` (CI), `subscriptionReminders.unit`, `notificationAudit.unit` (types registered in `7d852ee`). Email delivery not verified (no SMTP). |
| 17 | Plan badges from server entitlement, neutral Free badge | Verified (client) | Badge tests (`55a74c9`). Open decision: the "Professional" label has no catalogue match; the UI uses the catalogue names (Free, Starter, Growth, Enterprise, Career Plus). |
| 18 | End-to-end tests for Free and Paid recruiter and candidate flows, expiry, demo accounts | Partly verified | Route-level and workflow tests in CI cover these flows. There is no browser-level E2E suite; that is a stated gap. |

## Open items (not fixed in this phase)

1. Live external services: Razorpay Test Mode end to end, Google OAuth and Calendar, SMTP delivery, and the reminder worker against real time. These need your own credentials. Set them in `server/.env` (see `docs/ENVIRONMENT.md`) and test in that order.
2. Requirement 17 "Professional" label: needs your decision (rename or map to a catalogue plan).
3. No browser-level E2E suite (Requirement 18). The current coverage is API and component level.
4. Demo seed and reset have not been run against a real database in this environment. CI covers the guards only.
5. Readiness endpoint does not check payment or email providers.

## Integrity checks performed

- No hard deletes in payment, subscription, placement or job code. The only deletes are account registration rollback, user-initiated removals, and the development-only reset (which backs up first).
- All `/admin` routes sit behind `requirePlatformAdmin`.
- Candidate-facing interview responses omit feedback and meeting links until the interview starts.
- Sandbox (`simulation`) records are excluded from revenue, which is now covered by `reports.test.js`.
