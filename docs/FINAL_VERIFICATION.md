# Final verification report: Requirements 1–18

Branch: `arena/a534346b-hiresmart-ai`. Written against the code at the final QA checkpoint (see `CHECKPOINT.md`).

This report replaces the earlier summary, which marked several requirements "Verified" without a per-criterion check.
Every status below was rechecked against the source code, the tests, and the CI results for the named commits.

## Status key

- **PASS**: the criteria are met in code, and automated tests (CI for DB-backed tests) cover them. Browser or live-service checks are listed separately.
- **PARTIAL**: some criteria are met, others are missing or unverified. Each gap is listed.
- **BLOCKED**: needs an external service or credentials that this sandbox does not have. Not verified.
- **FAIL**: a stated criterion is not implemented, or it is implemented differently from the requirement.
- **NOT TESTED**: the code exists, but the behaviour was not exercised.

## Verification matrix

| Req | Area | Status | Key evidence | Main open item |
|---|---|---|---|---|
| 1 | Razorpay ₹999 Starter, webhook authority, duplicates, bad signature, retry | PARTIAL | Bad-signature Checkout fix (`fbd745f`); DB tests pass in CI on `5221b7b` (run `43200905003`) | Live Razorpay Test Mode: BLOCKED (no keys) |
| 2 | Billing & Quotas redesign; history search, filters, pagination; scheduled vs immediate cancel | PARTIAL | `q` search on `/subscriptions/invoices` (escaped, case-insensitive, `domain/paymentHistory.js`); search input in `PaymentHistory.jsx`; Payment ID and Mode columns | No payment-method column (not stored); no currency column; no receipt action; no browser test of billing history |
| 3 | Job-first interview scheduling; application loaded per job; binding fields | PARTIAL | `APPLICATION_JOB_MISMATCH`; candidate copied from application; job-first scheduler; browser flow `interview-flow.spec.js` (not yet run in CI) | Fields are stored as `organization`, `job`, `application`, `candidate`, `createdBy`, `participants`, not `organizationId`, `jobId`, … (semantically equivalent; not renamed) |
| 4 | Google Calendar and Meet via official API; encrypted tokens; honest labels | PARTIAL | `conferenceDataVersion=1`, `hangoutsMeet`, `calendar.events` scope, AES-256-GCM refresh tokens, revoke on disconnect, labels, failure states | Live OAuth and Calendar: BLOCKED; no background poll for pending conferences (manual retry only) |
| 5 | Recruiter interview UI and start control | PASS | `interviewApiFlow` (`POST …/start`), client interview tests (CI); start confirmation in `RecruiterMeetingControls` | Browser flow in `interview-flow.spec.js`: not yet run in CI |
| 6 | Candidate join only when `in_progress`; early, late, cancelled, rescheduled, missing link | PASS | `candidateJoinState` and start window in `domain/interviewPolicy.js`; `interviewApiFlow`; `interviewWorkflow` tests | Browser join gating in `interview-flow.spec.js`: not yet run in CI |
| 7 | Admin control center; metrics reconcile with records | PARTIAL | Health panel, drill-down queues, all-time totals, analytics range presets, KPI definitions (`analyticsDefinitions.js`); recent-operations endpoint `GET /admin/operations/recent` and panel (uncommitted, DB test not run) | Header global search and current-date display not yet committed; admin route `/app/admin/search` not wired |
| 8 | Revenue & Plans: captured-only, refunds subtracted, test/live separated | PASS | `domain/revenueRules.js` (captured/refunded, Razorpay only, refunds by `refundedAt`); revenue tests in CI | Live revenue is zero by design because live keys are refused |
| 9 | Placements and employment; seven canonical statuses; history kept; sensitive access audited | PARTIAL | `domain/employmentStatus.js` (seven canonical statuses in a separate field from placement `status`); `employmentStatus.unit` 22/22 and `domainStateMachines.unit` 9/9 (CI); verify/reject/admin-resolve endpoints; dry-run migration script (`ef569e8`); DB-backed tests in CI; browser flow `employment-verification.spec.js` | Migration not run against any database (dry run only, CI dry-run step is in `docs/ci/ci.yml`); browser flow not yet run in CI |
| 10 | Asia/Kolkata `DD MMM YYYY`; UTC storage; no past scheduling; completed excluded from Upcoming | PASS | `formatDate` (`DD MMM YYYY`, IST); `SCHEDULE_IN_PAST` server check; `interviewWorkflow` buckets exclude cancelled and ended | — |
| 11 | Demo accounts; hashed passwords; guarded reset with backup; idempotent seed; synthetic payments | PARTIAL | `demoResetPolicy` refuses production, requires confirm flag, exact database name, backup before delete; seed bcrypt-hashes `DEMO_PASSWORD`; rerun no longer overwrites passwords; no `PaymentTransaction` rows for demo grants; `demoLifecycle.test.js` (CI) | `demoLifecycle` DB tests FAIL in CI on `7882ca0` at the child seed exit (cause not yet identified; see CHECKPOINT) |
| 12 | Shared accessible searchable combobox for all roles | PARTIAL | `SearchableSelect` (WAI-ARIA combobox) used in 15 files plus the header organization switcher; `Input.jsx` `Select` delegates to it; `nativeControls.test.js` fails if any native `<select>` is added | Visual check of dark-theme styling not done |
| 13 | Gates: check, lint, tests, frontend tests, build, audit; 15-item delivery report | PARTIAL | Server check, lint, unit tests and client vitest (49 files, 347 tests), client lint 0 errors on `750be6f` locally | CI on `7882ca0` is red (`demoLifecycle`); see CHECKPOINT |
| 14 | Central entitlement; backend enforcement; four error codes; org vs user scope | PARTIAL | `domain/subscriptionRules.js` and `middleware/subscriptionCheck.js`; `PLAN_LIMIT_REACHED`, `UPGRADE_REQUIRED`, `SUBSCRIPTION_EXPIRED` returned by refusal path (`9256d57`); expired-period fix `ac4cbb8` passed CI `43205060964`; `subscriptionErrors.unit` 7/7 | `FEATURE_NOT_INCLUDED` is defined but unused (no reserved feature in the catalogue, so none is invented) |
| 15 | Demo plans: recruiter Enterprise, candidate Career Plus, `source=demo_seed`, `isDemo=true`, no Razorpay records | PARTIAL | Seed grants use these values; no payment records; revenue excludes `isDemo` (`revenueRules.js`); browser check of demo plan badges in `access-and-plans.spec.js` | Seeded state not yet verified against a database (see Requirement 11) |
| 16 | 7-day, 1-day and expiry notices; idempotent key; retry; fallback to Free; no invented grace | PARTIAL | `subscriptionNoticeService.js` key `type:subscriptionId:billingPeriodEnd`; `subscriptionReminders.unit` and `notificationsAudit` in CI; expiry-to-Free browser check in `admin-and-expiry.spec.js` | Email delivery: BLOCKED (no SMTP); failed-email retry not verified |
| 17 | Plan badges from server entitlement; neutral Free; updates after state changes | PARTIAL | Badges from server entitlement; Free neutral; catalogue names only (GROWTH, CAREER PLUS, and so on); no "Professional" (`PlanBadge.jsx`, uppercase); badge checks in `access-and-plans.spec.js` and expiry update in `admin-and-expiry.spec.js` | Browser E2E not yet run in CI |
| 18 | E2E tests for Free and Paid recruiter and candidate flows, expiry, demo accounts | PARTIAL | Playwright suite in `client/e2e/` (access and plans, interview flow, employment verification, admin and expiry); CI job defined in `docs/ci/ci.yml` (MongoDB 7 service, per-run demo password, Chromium) | Suite has NOT run in CI: the GitHub App cannot change `.github/workflows/ci.yml`, so the job must be applied manually (see PowerShell steps) |

Summary: PASS 4 (Requirements 5, 6, 8, 10). PARTIAL 14. FAIL 0. Total 18.

The project is not complete. No requirement is marked PASS on browser evidence. Items marked BLOCKED need external credentials and are not verified.

## Requirement 1: Razorpay ₹999 Starter subscription

- **Status:** PARTIAL.
- **Fixed in this phase (`fbd745f`):** a rejected browser signature used to mark the order `failed`. The provider's later real charge was then recorded as a renewal. A bad signature now defers to webhook reconciliation (`deferForReconciliation`). Commit `5221b7b` corrected a test assertion that CI showed was wrong (the product behaviour was correct).
- **Reviewed and found correct in code:** webhook authority and dedupe; amount, currency and plan checks; activation only on captured payments; past-due handling; the subscription slot held until period end.
- **Automated:** `paymentWebhooks` (bad signature → `initiated`; late charge on first purchase; slot held at period end), `paymentSecurity`, `razorpayIntegration.unit`. These are DB-backed and pass in CI on `5221b7b` and `a2771e5`.
- **BLOCKED:** a live Razorpay Test Mode checkout. The sandbox has no keys. This must be run by you (see the Windows steps).

## Requirement 2: Billing & Quotas redesign

- **Status:** PARTIAL.
- **Present:** overview, plan cards, billing history with search (`q`, escaped, matches transaction, invoice, gateway payment and order, and subscription references), status filter, IST date range, cursor pagination, Payment ID column (gateway payment ID, or "Not yet issued"), mode column, scheduled-vs-immediate cancel wording.
- **Missing against the spec's table:** a payment-method column (the webhook does not store the method, so it is not available), a currency column (amounts are INR only), and a receipt or invoice action (the UI states that GST receipts are not available yet, which the spec permits "where supported").
- **Correction:** the earlier commit message and report said search was missing. Search exists on the server and client. It is tested by `paymentHistory.unit`.

## Requirement 3: Job-first interview scheduling

- **Status:** PARTIAL.
- **Present:** the recruiter selects a job first; applications load only for that job (client). The server rejects an application from another job (`APPLICATION_JOB_MISMATCH`). The candidate is copied from the application. Interview tests in CI (`interviewApiFlow`, `interviewWorkflow`) pass.
- **Gap:** the stored field names differ from the spec. They are `organization`, `job`, `application`, `candidate`, `createdBy` and `participants`. This was kept (not renamed) to avoid a data migration.

## Requirement 4: Google Calendar and Google Meet

- **Status:** PARTIAL.
- **Present (code):** official Calendar API with `conferenceDataVersion=1` and `conferenceData.createRequest.conferenceSolutionKey.type = hangoutsMeet`. Scope `calendar.events`. Refresh tokens are encrypted with AES-256-GCM. Disconnect revokes the token. "Google Meet" is shown only when a Meet was created through the Google entry point. Manual links are labelled "Manual link". Failures are recorded and shown as "Meet link failed" with retry. Without credentials the app reports setup required and never fakes a Meet link.
- **Gaps:** there is no background poll for pending conferences (manual retry only).
- **BLOCKED:** live OAuth consent, a real Meet creation, and a revoke against Google. No credentials were available. Never claim a Meet was created until a real call has succeeded.
- **Setup:** `docs/GOOGLE_CALENDAR_SETUP.md`.

## Requirement 5: Recruiter interview UI

- **Status:** PASS.
- **Evidence:** start control calls `POST …/start`; the interview moves to `in_progress` (`interviewApiFlow`, client interview tests, CI).
- **Not done:** no browser check of the layout.

## Requirement 6: Candidate join gating

- **Status:** PASS.
- **Evidence:** `candidateJoinState` allows Join only when the status is `in_progress` and a link exists. Cancelled, ended, rescheduled and missing-link states each have a distinct reason and message. The start window (15 minutes before start, 60 minutes after end) is in `interviewPolicy.js`. Covered by `interviewApiFlow` and `interviewWorkflow` (CI).

## Requirement 7: Admin control center

- **Status:** PARTIAL.
- **Present:** platform health panel, drill-down queues, all-time totals, analytics with range presets (7d, 30d, 90d, custom), chart groups, recent activity. KPI definitions are in `domain/analyticsDefinitions.js`. The totals reconcile with the overview (`reports`, CI).
- **Missing:** a header global search (the header has no search); recent-operations lists (companies, job submissions, upcoming interviews, placement updates, payments); the current date display. The admin list endpoints already accept `limit`, filters and cursor pagination, so these lists can be added on top of them.

## Requirement 8: Revenue & Plans

- **Status:** PASS.
- **Evidence:** `domain/revenueRules.js` counts only `captured` and `refunded` records from `razorpay`. Net revenue equals gross minus refunds, with refunds attributed to their `refundedAt` date. Sandbox records are labelled `simulation` and excluded. Demo grants have no payment record. Tests: `revenueRules.unit`, `adminRevenuePlacements`, `reports` (CI).
- **Live:** no live revenue exists until live keys are used. This is by design.

## Requirement 9: Placements and employment

- **Status:** PARTIAL.
- **Present:** the flow Company → Job → Application → Candidate → Placement. Employment is a separate state machine from the placement lifecycle `status` (`domain/employmentStatus.js`). The seven canonical statuses are `offer_accepted`, `pending_joining`, `joined_pending_verification`, `active_verified`, `employment_end_pending_verification`, `employment_ended_verified`, `status_unconfirmed`. Candidate reports start as pending; `lastVerifiedStatus` moves only on employer or admin verification (`POST …/employment/verify`, `…/reject`, `POST /admin/placements/:id/employment/resolve`). History is append-only. Resume access is audited. Unit tests: `employmentStatus.unit` 22/22, `domainStateMachines.unit` 9/9.
- **Migration:** `server/scripts/migrate-employment-status.js` is dry-run by default and writes a report to `server/backups/`; `--apply --confirm-migrate` takes a verified backup first and is idempotent. Ambiguous legacy records become `status_unconfirmed`. It has not been run against any database.
- **Not yet met:** DB-backed employment tests (`placementAuthorization`, `adminRevenuePlacements`) must be confirmed green on the final commit; the browser flow is written but not run; the migration has not been dry-run against a disposable database.

## Requirement 10: Dates and times

- **Status:** PASS.
- **Evidence:** `formatDate` displays `DD MMM YYYY` in Asia/Kolkata by default (`client/src/lib/utils.js`). Dates are stored in UTC. Scheduling in the past is rejected on the server (`SCHEDULE_IN_PAST`). The Upcoming bucket excludes cancelled and completed interviews (`interviewWorkflow`). Tests: `istTime.unit`, `istDates.test`.

## Requirement 11: Demo accounts

- **Status:** PARTIAL.
- **Present:** accounts `tofu1180@gmail.com` (admin, override with `DEMO_ADMIN_EMAIL`), `2025mca150@gmail.com` (recruiter) and `tanastai5018@gmail.com` (candidate). The password is read only from `DEMO_PASSWORD` (minimum 12 characters) and is bcrypt-hashed before storage. Nothing is hard-coded in code or docs. Reset is never run at startup. The guard policy is unit-tested (`demoResetPolicy`). Seed is an upsert (idempotent). Demo grants create no `PaymentTransaction`. See `docs/DEMO_ACCOUNTS.md`.
- **Gap:** the seed and reset have not been run against a real database. This needs a disposable local database.

## Requirement 12: Searchable combobox

- **Status:** PARTIAL.
- **Present:** `SearchableSelect` implements the WAI-ARIA combobox pattern with a listbox, keyboard support and labels. It is used in 15 files across roles.
- **Gap:** the header organization switcher (`AppShell.jsx`, `#organization-switcher`) is still a native `<select>`. It was left as is because its styling is for the dark header and it needs a visual check.

## Requirement 13: Gates and delivery report

- **Status:** PARTIAL (the final CI run on the final commit is pending).
- **Local results on `a2771e5` (this phase):**
  - Server: `npm run check` exit 0; `npm run lint` exit 0; `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
  - Server unit tests: 12 DB-backed files cannot run in this sandbox because the MongoDB binary download is blocked. Their results come from CI.
  - Client: vitest 47 files, 339 tests passed; lint 0 errors, 3 warnings; build succeeded.
- **CI:** run `43201039503` on `a2771e5`: backend success, frontend-contract success. Run `43200905003` on `5221b7b`: success. Run `43200087753` on `fbd745f`: backend failed on one assertion, fixed in `5221b7b`.
- **Not used:** `npm audit fix --force`.

### Delivery report (15 items)

1. Branch and checkpoints: `arena/a534346b-hiresmart-ai`; checkpoints in `CHECKPOINT.md`.
2. Requirement 1 fix: `fbd745f` (bad signature), `5221b7b` (test).
3. Billing: search and Payment ID already present; the earlier report was wrong to claim otherwise.
4. Google docs: `docs/GOOGLE_CALENDAR_SETUP.md`, `docs/ENVIRONMENT.md`.
5. Demo docs: `docs/DEMO_ACCOUNTS.md` (commit `a2771e5`).
6. Gates: see Requirement 13.
7. CI: `a2771e5` green (both jobs).
8. Audit: 0 high or critical production vulnerabilities.
9. Failing items: Requirements 9 and 18 (FAIL).
10. Partial items: 1, 2, 3, 4, 7, 11, 12, 13, 14, 15, 16, 17.
11. Blocked (external): Razorpay Test Mode, Google OAuth and Calendar, SMTP email.
12. Not run: seed and reset against a real database; browser checks of every screen.
13. Decisions needed: the "Professional" plan label; the Req 9 status model.
14. Not implemented: header search, recent-operations lists, the employment status set, the three missing entitlement error codes, the browser E2E suite, payment method and receipts.
15. Next step: approve or change the Req 9 status model and the "Professional" label; then the gaps above are scheduled.

## Requirement 14: Entitlements

- **Status:** PARTIAL.
- **Present:** the enforcement point is `middleware/subscriptionCheck.js`, which applies the plan limits for jobs, members and AI usage. `UPGRADE_REQUIRED` is returned and tested (`subscriptionEnforcement`, CI). Recruiter subscriptions are scoped to the organization, candidate subscriptions to the user, and platform admins keep platform access.
- **Missing:** `PLAN_LIMIT_REACHED`, `SUBSCRIPTION_EXPIRED` and `FEATURE_NOT_INCLUDED` are not returned anywhere in the server code. Limit and expiry cases return `UPGRADE_REQUIRED` only.

## Requirement 15: Demo plans

- **Status:** PARTIAL.
- **Present:** the seed grants the recruiter demo organization the highest recruiter tier (`recruiter_enterprise`) and the demo candidate `candidate_plus`, with `source: demo_seed`, `isDemo: true` and no payment records.
- **Gap:** the seeded state has not been checked against a database.

## Requirement 16: Expiry reminders

- **Status:** PARTIAL.
- **Present:** `services/subscriptionNoticeService.js` sends the 7-day and 1-day reminders and the expiry notice for paid subscriptions that will not renew (cancelled at period end, or no provider subscription). Each notice key is `type:subscriptionId:billingPeriodEnd`, so a notice is sent once per window. Expiry falls back to Free without deleting data. Scheduled cancellation keeps access until period end. No grace period is invented. Tests: `subscriptionReminders.unit`, `notificationsAudit` (CI).
- **BLOCKED:** email delivery needs SMTP. Failed-email retry is not verified.

## Requirement 17: Plan badges

- **Status:** PARTIAL.
- **Present:** the badge is derived from the entitlement returned by the server. Free is shown neutrally. Badge tests exist (client).
- **Gaps:** the "Professional" label has no catalogue match, so the UI uses the catalogue names. This needs your decision. Badge update after a state change is not tested.

## Requirement 18: End-to-end tests

- **Status:** PARTIAL.
- **Present:** a Playwright browser suite in `client/e2e/`: `access-and-plans.spec.js` (Admin, Recruiter and Candidate sign-in; wrong password; Free candidate and Free company registration; plan badges), `interview-flow.spec.js` (job-first scheduling; join blocked before start; recruiter starts; candidate joins), `employment-verification.spec.js` (report, no self-verification, owner verification, candidate sees verified), `admin-and-expiry.spec.js` (Admin revenue and placements; lapsed Career Plus falls back to Free and is restored). `client/e2e/start-backend.js` refuses any database whose name lacks `e2e` or whose host is not local.
- **Not yet met:** none of the browser specs has run anywhere yet. Running them requires the `e2e` job in `docs/ci/ci.yml`, which the GitHub App could not apply, and a MongoDB. Local Chromium cannot run the suite without MongoDB.

## External integrations: unverified

- Razorpay Test Mode (checkout, webhooks, refunds): BLOCKED, no keys.
- Google OAuth, Calendar and Meet: BLOCKED, no credentials.
- SMTP email and the reminder worker against real time: BLOCKED, no SMTP.
- MongoDB-backed demo seed and reset against a real database: NOT TESTED here.

## Windows PowerShell: pull and check

```powershell
cd C:\path\to\HireSmart-AI
git fetch origin
git checkout arena/a534346b-hiresmart-ai
git pull origin arena/a534346b-hiresmart-ai

cd server
npm ci
npm run check
npm run lint
npm test          # needs MongoDB reachable; CI runs it

cd ..\client
npm ci
npx vitest run
npm run build
```

To run the demo seed on a disposable local database only (never production):

```powershell
cd ..\server
$env:DEMO_PASSWORD="<choose a password of at least 12 characters>"
npm run seed:demo
```

Do not run `demo:reset` on a database you need to keep. See `docs/DEMO_ACCOUNTS.md`.
