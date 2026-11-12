# CHECKPOINT: HireSmart-AI Requirements 1–18

Branch: `arena/a534346b-hiresmart-ai` (only this branch is used). Pushes are normal fast-forward pushes; no force-push, no `main` or `development` changes.

Last verified checkpoint: see `git log --oneline -1` on the branch.

## Checkpoint history

| # | Commit | Summary | Verified |
| --- | --- | --- | --- |
| 0 | `e9fcd4b` | Remote base before this work | — |
| 1 | `c7cbe75` | fix(payments): log sanitized Razorpay failure details. A failed provider call logs the operation, provider HTTP status and error code. Keys and raw messages are never logged. | Server unit suite, lint |
| 2 | `d4359bd` | fix(payments): create the subscriber record before the first charge | Server unit suite (167/167), lint, `check`; mutation check (see below) |
| 3 | `cd731cd` | fix(payments): accept an absent payment subscription_id only under the verified Checkout signature | Server unit suite (168/168), lint, `check` |
| 4 | `bdb99d6` | fix(demo): harden presentation seeder and remove fake transactions. `DEMO_PASSWORD` from env (min 12 chars, bcrypt-hashed, never printed, refused in production); fixed plan imports; removed hard-coded password from code and docs; removed fabricated captured PaymentTransaction records. | Server unit suite (168/168), lint, `check`; seeder guard checks (no DB) |
| 5 | `28f5b87` | fix(payments): reconcile captured payments instead of failing them. A verify request that the provider data does not match (subscription mismatch, unknown or amount-mismatched record) no longer marks the order failed; it is audited as subscription.verification_deferred and stays initiated so the webhook can complete it. Signature failures and provider-declared failures are unchanged. | Server unit suite (168/168), lint. DB-backed tests NOT RUN (no MongoDB). |
| 6 | `ed5a785` | feat(billing): 7-day and 1-day expiry reminders, expiry notice and lapse processing. Decision: Razorpay subscription.completed keeps the internal status and sets cancelAtPeriodEnd, so access lasts to the period end; the provider status is stored. Renewal failures expire only after PAYMENT_GRACE_DAYS (3, unchanged). Reminder idempotency key: type:subscriptionId:billingPeriodEnd, per recipient. Audit action subscription.expired. | Unit suite incl. 8 new reminder/lapse tests; lint. DB-backed idempotency test NOT RUN. |
| 7 | `916978e` | feat(demo): demo grants labelled source=demo_seed/isDemo, create-only demo admin, Apex on the highest recruiter tier, and a guarded reset with verified backup. New Subscription fields source (razorpay default) and isDemo (false default). npm run demo:reset requires --confirm-reset, DEMO_RESET_DATABASE equal to the connected database, a local host and a dev-like name; backs up every collection (EJSON, verified) to server/backups/ (git-ignored) before deleting. | Unit suite 183/183 (incl. 7 reset-policy tests), lint, check. Reset run against a database: NOT RUN (no MongoDB); without a DB it stops safely with no changes. |
| 8 | next commit | feat(interviews): job-first binding, start state, candidate join gating, Google Calendar/Meet and recruiter OAuth (backend). Application must belong to the selected job (422 APPLICATION_JOB_MISMATCH); job, candidate and round stored from the application; interview past-date check (422 SCHEDULE_IN_PAST); POST .../start (start window 15 min before to 60 min after end; MEETING_LINK_REQUIRED if no link); GET /interviews/:id/join for the candidate (409 JOIN_<reason> until started); staff join; POST .../meeting/retry; candidate views never include feedback and show the meeting link only once started. Google: OAuth with calendar.events scope only, state signed and expiring, refresh token encrypted (AES-256-GCM), Calendar event with conferenceDataVersion=1 and hangoutsMeet, meeting labelled google_meet only when Google returns a video entry point; manual links labelled manual; setup_required otherwise. | Unit suite 210/210 (incl. 9 meeting, 10 policy, 14 Google/policy, 4 token tests), lint, check. NOT VERIFIED: DB-backed API flows, live Google OAuth and Calendar (no credentials). FRONTEND NOT YET CHANGED (recruiter job-first picker, candidate join UI, Google settings page). |
| 9 | `ef569e8` | feat(employment): canonical employment workflow (Requirement 9). Seven statuses in a separate field from placement `status`; candidate reports pending; verification and admin resolution; migration script dry-run by default. | Unit 22/22 and 9/9; client placement tests; CI `43203778956` success. The migration has NOT been run against any database. |
| 10 | `9256d57` | feat(entitlements): PLAN_LIMIT_REACHED, SUBSCRIPTION_EXPIRED, FEATURE_NOT_INCLUDED (Requirement 14). | `subscriptionErrors.unit` 7/7; CI `43203787729` failed on the expired-period test. |
| 11 | `4ef681f` | feat(admin): recent operations, global search and IST date header (Requirement 7); catalogue-only plan badge (Requirement 17); workspace switcher as searchable combobox (Requirement 12). | Client tests; CI `43204575397` failed on the same expired-period test (`subscriptionEnforcement.test.js`). |
| 12 | `ac4cbb8` | fix(entitlements): keep a lapsed paid plan reported as SUBSCRIPTION_EXPIRED after the first read. | CI `43205060964` success (backend and frontend). |
| 13 | `5aa5622` | test(demo,employment): DB-backed demo lifecycle and employment migration tests (Requirements 9, 11, 15). | CI `43205349173` FAILED (`demoLifecycle.test.js`). |
| 14 | `73c3c5c` | test(e2e,req12,seed): browser E2E suite (Requirement 18); native dropdowns removed (Requirement 12); seed interview spec fixed to the real schema (Requirements 9, 11, 15). The CI workflow change is NOT applied: the GitHub App cannot update `.github/workflows/ci.yml`; the workflow is in `docs/ci/ci.yml`. | CI `43206533140` FAILED (`demoLifecycle.test.js`). Local: server check, lint and unit tests pass; client vitest 49 files / 347 tests; client eslint 0 errors. |
| 15 | `b5ddc56` | test(demo): fix demoLifecycle test wiring (Subscription import; DB connection per test; one-line failure messages). | CI `43207354077` FAILED (same five tests; seed child exits 1). |
| 16 | `750be6f` | test(demo): give demo lifecycle children the JWT secret; child logs kept in `server/test-results/`. | CI `43208432880` FAILED (same). |
| 17 | `7882ca0` | test(demo): report the first error line from a failed child in the test message. | CI `43209502480` FAILED (same). Cause of the child seed exit is NOT yet identified. |

## Checkpoint 2 details: first-charge subscription record

**Root cause (from code, not yet from your logs):** `recordCharge` looks up the internal `Subscription` for the subscriber. It returned `unknown_subscription` when no record existed. Checkout created the `PaymentTransaction` but never created the `Subscription`. The verify path then called `failTransaction`, which marks the purchase failed and writes the "Subscription Payment Verification Failed" activity entry. This matches the reported symptom, but it is still a hypothesis until your server logs confirm it.

**Fix:**
- `startSubscriptionCheckout` ensures the subscriber's record exists (Free plan) before creating the provider subscription.
- `linkedSubscription` creates the Free record when the transaction exists but the record does not, using the existing `getOrCreateOrgSubscription` and `getOrCreateCandidateSubscription`.

**Tests:**
- `test/recurringBilling.unit.test.js` (4 tests, no database): creates the record for an organization and for a candidate, reuses an existing record, and returns null with no transaction.
- Mutation check: with the fix reverted in a temporary copy, the test fails (3 pass, 1 fail). The copy was deleted afterwards.
- Not run: the database-backed `test/paymentWebhooks.test.js` needs MongoDB, which is not available in this environment.

## Checkpoint 3 details: payment-to-subscription link

- `verifySubscription` required `payment.subscription_id` to equal the subscription id. The Razorpay documentation pages checked do not confirm that the payment entity always carries that field. If it is absent, the purchase was failed as `subscription_mismatch`, which is one candidate for the reported failure.
- The Checkout signature (HMAC of `payment_id|subscription_id`) is verified before this check, so an absent field is accepted. A present, different value is still rejected.
- Helper `paymentBelongsToSubscription` (unit-tested: absent, null, empty, matching, conflicting).
- Not confirmed: whether a real subscription payment entity includes `subscription_id`. The runtime log line from checkpoint 1 will show `subscription_mismatch` only if the id is present and different, so it cannot distinguish the two cases on its own. Confirm from your records (`paymenttransactions.status` and the `verify` response).

## Still unverified

- The ₹999 live failure. Root cause must be confirmed from the logs and records described in the payments section of the final report.
- Razorpay API calls, webhooks and Checkout (external network; not reachable from this environment).
- All database-backed suites.
- Google Calendar and Google Meet (not started).

## Remaining phases (not started)

1. Payment lifecycle: map subscription and payment events, check webhook idempotency, and confirm the activation path.
2. Subscription entitlements, Free plan, backend enforcement, expiry reminders (3-day grace kept as in the base).
3. Demo accounts and seeding from `DEMO_PASSWORD` (no password in code, no overwrite of existing accounts).
4. Interview workflow: job first, then applications; Google Calendar and Meet through OAuth.
5. Recruiter and candidate interview pages; candidate join gated on recruiter start; feedback.
6. Admin dashboard, revenue reporting, placement and employment tracking.
7. Dates in Asia/Kolkata, searchable dropdowns, plan badges.
8. Documentation and final QA report.

## Continuation note (resume from the latest remote commit on arena/a534346b-hiresmart-ai)

Status at this checkpoint:

- Done and unit-tested: payment reconciliation (no failing captured payments), expiry reminders (7d/1d), expiry notice and lapse processing, demo grants labelled `source=demo_seed`/`isDemo`, guarded demo reset with verified backup.
- Existing in the base and verified by reading the code (not re-implemented): server-side job/team/AI quota enforcement (`middleware/subscriptionCheck.js`, `domain/subscriptionRules.js`), 3-day grace period (`PAYMENT_GRACE_DAYS = 3`), webhook signature check on the raw body, idempotent webhook events, refunds (full revoke, partial review).
- Decision: no paid-only feature flags exist in the plan catalogue (limits are numeric quotas, features are display text). No `FEATURE_NOT_INCLUDED` gate was added, to avoid inventing features. `SUBSCRIPTION_EXPIRED` is not returned: an expired paid plan falls back to Free, as Requirement 16 specifies, and existing data is kept.

Not yet implemented (in suggested order):

1. Req 1/2 remainder: DB-backed webhook tests for deferral, duplicate and replayed events (need MongoDB).
2. Req 2 (billing UI): redesign `client` Billing & Quotas page (overview, plan cards, billing history with search/filter/pagination, subscription actions incl. scheduled vs immediate cancel).
3. Req 3: job-first interview scheduling. Interview model needs jobId, applicationId, candidateId, recruiterId, organizationId, interviewerIds; reject candidates from other jobs; list only the selected job's applications.
4. Req 4: Google Calendar/Meet via official API. Needs OAuth settings (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`), encrypted token storage, `conferenceDataVersion=1`, `hangoutsMeet`, pending/success/failure handling. Test with mocks only until credentials exist.
5. Req 5/6: recruiter and candidate interview UI; lifecycle draft/scheduled/in_progress/completed/cancelled/rescheduled/no_show; candidate join only when `in_progress`.
6. Req 7/8/9: admin dashboard reorganisation with metric definitions; Revenue & Plans with captured-only revenue and test/live separation; Placements & Employment navigation and audited employment changes.
7. Req 10/12: Asia/Kolkata date formatting (`DD MMM YYYY`) and a shared searchable combobox replacing native selects.
8. Req 14–18 UI: plan badges (server-derived tier), upgrade messages, E2E tests (`test/planEntitlements.test.js` and `test/demoSeed.test.js` exist but are DB-backed and NOT RUN).
9. Req 13: documentation (payment, webhook, Google setup, interview workflow, placement workflow, demo credentials, reset safety, env example) and final QA report.

Verification still needed: `npm test` (DB-backed suites need MongoDB), frontend `npm test` and `npm run build`, `npm audit`, real Razorpay Test Mode checkout and webhook, real Google Calendar/Meet with credentials.

Demo password: never stored in code or docs. Set `DEMO_PASSWORD` (min 12 characters) in `server/.env` and use the same value for the three demo accounts. Requirement 11 names the password for local demo only; do not commit it.

## Continuation note after checkpoint 8 (resume from the latest remote commit)

Done (backend, unit-tested): job-first binding, start state and window, candidate join gating and view filtering,
Google OAuth connect/callback/status/disconnect, Calendar event create/patch/delete with conferenceDataVersion=1,
honest meeting states, retry endpoint, `interview_started` notice (in-app only).

Still to do, in order:

1. Frontend for Requirements 3–6 (not started):
   - Recruiter interview scheduling: company -> job -> applications for that job -> candidate -> schedule. Use the
     existing `/organizations/:id/jobs/:jobId/applications` list. Send `jobId` with `applicationId`.
   - Recruiter dashboard: upcoming/today/week/past/cancelled, filters, Start, Open Meet (staff join), feedback view.
   - Candidate interview page: use `joinState` from the API. Join disabled with "Waiting for recruiter to start" until
     `canJoin`. Never show feedback.
   - Google settings page at `/app/settings/integrations` (the OAuth callback redirects there with `?google=`).
     The page does not exist yet; the callback currently lands on a missing route.
2. DB-backed API tests for start/join/cross-org/job mismatch/candidate view (write, then run with MongoDB). Not run.
3. Requirements 7–9 (admin dashboard, Revenue & Plans, placements/employment), 10 (Asia/Kolkata), 12 (searchable
   combobox), 17 (plan badges), 2 (billing UI), 13 (docs), 18 (E2E).

Google status: NOT verified live. Needs GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI
and GOOGLE_TOKEN_ENCRYPTION_KEY (32 bytes, base64 or hex). Consent screen and test users must be set in Google Cloud.
The calendar.events scope is a sensitive scope and may need Google verification for non-test users.

## Checkpoint 9: interview frontend (Requirements 3–6)

| Item | Result |
|---|---|
| Backend refactor (candidate view in `domain/interviewViews.js`, `jobId` filter) | server unit suite 214/214; lint 0 |
| DB-backed `interviewApiFlow.test.js` | NOT RUN (mongodb-memory-server cannot download mongod here) |
| Client full suite | 33 files, 204 tests pass |
| Client lint | 0 errors (3 pre-existing warnings in AuthPages.jsx) |
| Client production build | passes |
| Routes | `/app/settings/integrations`, `/app/o/:id/interviews/schedule`, recruiter dashboard wired in App.jsx |

Not verified live: Google Calendar/Meet (no credentials), Razorpay, email delivery.

Remaining, in order: Requirements 7–9, 10, 12, 17, 2, then 13 and 18 (docs, tests, final QA). Run DB-backed tests once mongod is available.

## Checkpoint 10: admin dashboard, Revenue & Plans, placements and employment (Requirements 7–9)

Server commit `dbe4c6e`; client commit follows in the same push.

| Item | Result |
|---|---|
| Server unit suite | 223/223 pass (includes 9 revenue rule tests) |
| Server lint | 0 errors |
| Client suite | 37 files, 233 tests pass |
| Client lint | 0 errors (3 pre-existing warnings in AuthPages.jsx) |
| Client production build | passes |
| DB-backed `adminRevenuePlacements.test.js` | NOT RUN (no MongoDB: fastdl.mongodb.org unreachable from the sandbox) |
| DB-backed `adminAnalytics.test.js` | NOT RUN (same reason); fixtures switched from sandbox to razorpay test records |
| DB-backed `interviewApiFlow.test.js` | NOT RUN (same reason) |

What changed:
- Revenue: one rule (captured or refunded, razorpay only). Sandbox, failed, pending and demo grants are never revenue.
  Refunds are counted by `refundedAt` (set by the refund webhook). Test and live are reported separately.
  `GET /admin/revenue` powers the Revenue & Plans page. The analytics overview and `/admin/analytics/revenue` use the same service.
  User invoices use the same records; sandbox captures are labelled and marked not eligible for revenue.
- Seed: demo subscriptions wrote an invalid `subscriberType` and no `subscriberId`. Fixed.
- Dashboard: new KPIs (test and live revenue, verified placements, upcoming interviews); chart drill-downs to filtered pages.
- Placements: append-only `employmentHistory`; company → jobs → placements → candidate; audited candidate profile
  (contact, address and gender withheld; resume file download stays on the candidate route).
- Candidate "Employment" page (confirm joining, report started, report left) and company "Placements" page (confirm working, record ended).
  Reported and verified state are shown separately everywhere.

Not verified: DB-backed behaviour (above). Not included: admin download of candidate resume files; live Razorpay (no live billing in this release).

Next: Requirement 10 (Asia/Kolkata everywhere), 12 (searchable dropdowns), 17 (plan badges), 2 (billing UI), 13 and 18 (docs, QA).

## Checkpoint 11: date and time correctness, Asia/Kolkata (Requirement 10)

| Item | Result |
|---|---|
| Server unit suite | 235/235 pass (new: `istTime.unit.test.js`, 12 tests) |
| Server lint | 0 errors |
| Client suite | 38 files, 250 tests pass (new: `istDates.test.js`, 17 tests) |
| Client lint | 0 errors (3 pre-existing warnings in AuthPages.jsx) |
| Client production build | passes |
| DB-backed tests | NOT RUN (no MongoDB in the sandbox). Changed DB-backed files: none in this checkpoint. |

What changed:
- One shared rule set. Server: `server/utils/istTime.js` (IST day keys, wall-clock ↔ UTC, half-open day bounds, `DD MMM YYYY`, explicit AM/PM). Client: `utils.js` `formatDate`, `formatTime`, `formatDateTime`, `dayKey`, `istDayBounds`, `istHour`, all defaulting to Asia/Kolkata.
- Dates are `DD MMM YYYY` (e.g. `05 Nov 2026`); times are `hh:mm AM/PM`. Month names are fixed English, so output does not depend on the browser's ICU build.
- Browser-zone bugs fixed:
  - Recruiter reschedule form prefilled and saved times in the browser's zone. Now both use the interview's own timezone (`toZonedLocalInput` / `zonedLocalToUtc`).
  - Candidate "today" used the browser's midnight. Now IST midnight.
  - Recruiter greeting used the browser hour. Now IST.
  - Notification tooltip, offer dates, and `formatInZone` (now `… 10:00 AM IST`) use the shared formatters.
- Candidate interview buckets no longer overlap. "Upcoming" holds active interviews until their scheduled end. "Past" holds completed interviews and active ones whose end has passed. "Cancelled" is unchanged.
- Server dates: interview invitation, reschedule, and confirmation messages show IST times. Email date/time helpers default to Asia/Kolkata (an explicit interview timezone is still honoured and labelled). Subscription expiry text uses the IST calendar day, so a plan ending 20:00 UTC on 20 Nov shows 21 Nov. Admin monthly labels and keys use IST. The recruiter analytics `from` filter treats `YYYY-MM-DD` as the start of that IST day, not UTC midnight.
- Interview model default timezone is now `Asia/Kolkata` (new records only).

Tests cover: IST↔UTC conversion, round trips, DST-independence (checked against the zone database), day boundaries at 18:30 UTC, expiry day, invalid input never rendering "Invalid Date", buckets, and the reschedule conversion.

Known limitations:
- The reschedule form's timezone is free text. If it is invalid, the conversion returns null and the time is left unchanged silently. Validate the timezone against the list before saving.
- Existing interview records keep their stored timezone (`UTC` for old records). Display follows that stored value.
- Placement and employment timestamps were not audited field by field in this pass. They use the shared formatters where displayed.

Still open (not started in this checkpoint): Requirement 7 control-center redesign, Requirement 12 searchable dropdowns, Requirement 17 plan badges, Requirement 2 billing UI redesign, and Requirements 13 and 18 (docs, DB-backed tests, final QA).

## Checkpoint 12: searchable dropdowns (Requirement 12)

Working clone re-created from `origin/arena/a534346b-hiresmart-ai` after a sandbox reset (`/home/user/reapply-review/impl`).

| Item | Result |
|---|---|
| Client suite | 39 files, 272 tests pass |
| Client lint | 0 errors (3 pre-existing warnings) |
| Client production build | passes |

What changed:
- `components/ui/SearchableSelect.jsx`: WAI-ARIA combobox with listbox. Search on by default (`searchable={false}` for fixed lists).
  Keyboard: ArrowUp/Down, Home/End (non-search), Enter/Space, Escape (stops propagation so dialogs stay open), Tab closes, Backspace removes the last chip.
  Single and multi select, clear button, loading, empty, disabled, error and hint states, native validity for `required`.
  Mobile: 44px rows, 16px input text, popup capped at 60vh. Option normalisation lives in `lib/selectOptions.js`.
- Same API as the native `Select` it replaces (`options`, `placeholder` as a selectable "" option, `<option>` children, event-style `onChange`), so callers did not change behaviour.
- Migrated (Admin, Recruiter, Candidate): all `Select` uses in CandidatePrivacyPanel, RecruiterScheduleActions, AdminPages, AdminModeration, AdminVerificationReview, InterviewScheduler, RecruiterInterviewDashboard, CompanyVerificationCard, RecruiterPages; raw selects in AdminAnalyticsPanel, AdminPlacements, AdminRevenue, CandidatePages.
- Not migrated, by decision: public pages (LandingPage, PublicPages, outside the three roles) and the dark sidebar workspace switcher in AppShell (a native select is already accessible and mobile-friendly with a few workspaces).
- Tests: `SearchableSelect.test.jsx` (22 tests: keyboard, search, single/multi, clear, loading, empty, disabled, Escape vs dialog, form submit and validation). Existing revenue and team tests updated to open and pick options like a user.

Next: Requirement 17 (plan badges), then Requirement 2 (billing UI).

## Checkpoint 17: plan badges from the real entitlement (Requirement 17)

| Item | Result |
|---|---|
| Client suite | 42 files, 297 tests pass (25 new for Req 17) |
| Client lint | 0 errors (3 pre-existing warnings) |
| Client production build | passes |
| Server unit suite | 239 pass, 0 fail |
| Server lint (touched files) | clean |

What changed:
- Server: `GET /subscriptions/current` also returns `billingState` (`pendingCheckout`, `lastPaymentFailed`). Derived in `server/domain/billingState.js`. A checkout is pending for 30 minutes from `initiated`. A failed attempt only counts if it is newer than the latest captured or refunded payment.
- Client: `lib/planStatus.js` (`planBadgeFor`) maps entitlement and billing state to a label, status, and tone. Only `active`, paid, not scheduled to cancel is tone `paid`. Scheduled cancellation shows "Ends <date>" as a warning. Expired, canceled, and missing entitlement never show as paid.
- `hooks/usePlanEntitlement.js`: one query keyed by the active workspace (candidates have no workspace). No request for platform admins.
- `components/billing/PlanBadge.jsx` and `PlanSummaryCard.jsx`: shown in the AppShell account menu and workspace switcher, Settings (Plan card), My Profile (candidate Onboarding header and recruiter Company profile card), and both billing pages. Compact chips link to billing.

Decision still open: the required "Professional" label has no catalogue equivalent. The UI uses the real catalogue names (Free, Starter, Growth, Enterprise, Career Plus). Mapping to "Professional" needs a user decision.

Next: Requirement 2 (billing UI redesign).

## Checkpoint 2: recruiter and candidate billing redesign (Requirement 2)

| Item | Result |
|---|---|
| Client suite | 45 files, 322 tests pass (new: billing model, payment history, recruiter billing page) |
| Client lint | 0 errors (3 pre-existing warnings) |
| Client production build | passes |
| Server unit suite | 245 pass, 0 fail (6 new for payment history filters) |

What changed:
- Server: `GET /subscriptions/invoices` takes an allow-listed `status` (`all`, `captured`, `refunded`, `failed`) and an IST `from`/`to` day range (inclusive; reversed or malformed days return 422). Default is all three states, never abandoned `initiated` checkouts. Rules are in `domain/paymentHistory.js`.
- Client, shared: `lib/billingModel.js` (status wording, quota rows from real limits only, plan-card actions, history labels), `hooks/useSubscriptionCheckout.js` (checkout and verification logic moved out of both pages, behaviour unchanged), `components/billing/CurrentPlanPanel.jsx` (status, renewal or expiry, quota meters, cancel renewal behind a confirmation), `PlanComparison.jsx`, `CheckoutDialog.jsx`, `PaymentHistory.jsx` (status and IST date filters, cursor "Load more", Test Mode, Live Mode and sandbox labels).
- Pages: `RecruiterBilling.jsx` and `CandidateBilling.jsx` rebuilt on the shared pieces. Removed the hardcoded "Active" badge, the invented quota fallbacks (3, 2, 50), and the PDF button that only showed a success toast.
- Plan card actions: current, renew (lapsed paid plan), upgrade or switch, and "Payment pending" (no second checkout while one is pending).

Limitations, documented not hidden:
- GST PDF receipts are not implemented. The history says so and points to support. No download control is shown.
- Failed payments are now listed in the history (they are real payment states). The default filter changed accordingly; only billing pages consume this endpoint.
- The DB-backed invoice endpoint is not covered by an executed integration test (no MongoDB in this sandbox yet). Covered by pure unit tests of the filter rules only.
- Admin subscription fixtures were updated to the server's real response shape (entitlement and billing state included).

Next: Requirement 7 (control-center redesign).

## Checkpoint 13: admin control center (Requirement 7)

| Item | Result |
|---|---|
| Client suite | 46 files, 330 tests pass (new: control-center queues, health states, queue drill-down) |
| Client lint | 0 errors (3 pre-existing warnings) |
| Client production build | passes |
| Server unit suite | 245 pass, 0 fail |

What changed:
- Platform health is now real. The hardcoded "Operational" badges are gone. `components/admin/PlatformHealthPanel.jsx` reads `/health/ready` (database, job store, queued runs, runs stuck over 15 minutes). A failing or unreachable check is shown as down or unavailable, never as operational. The API client now keeps the response body on errors (`problem.data`), so a 503's per-service checks are visible.
- Operational queues with live counts and drill-down (`lib/controlCenter.js`): job approvals, company verification (pending plus under review), fraud-risk review, placements to verify, subscriptions past due, failed payments (selected range), suspended accounts. A missing count shows "—", never 0.
- Server: `GET /admin/analytics/overview` adds `queues.placementsAwaitingVerification` (joining confirmed, not platform-verified) and `queues.subscriptionsPastDue`. Both are live DB counts.
- Layout: header with company drill-down, health, queues, all-time totals (users, AI runs, verified placements), the range-filtered analytics panel with export, deep dive, 12-month trend and pipeline, job approvals waiting, recent activity. The duplicate top KPI row and duplicate funnel card were removed.

Limitations:
- The readiness check covers the database and background job store only. It does not probe the payment gateway or email provider, and the UI does not claim it does.
- "Awaiting platform verification" for placements is defined as `joining_confirmed` with `verification.isVerified` not set. This follows the existing placement verification model.
- The overview endpoint is DB-backed and is not covered by an executed integration test yet (no MongoDB in this sandbox). Covered by unit and component tests only.

Next: open limitations, then Requirement 13 and 18 with the final QA phase.

## Checkpoint: open limitations (Requirements 9 and 1–18 follow-ups)

| Item | Result |
|---|---|
| Client suite | 47 files, 334 tests pass |
| Client lint | 0 errors (3 pre-existing warnings) |
| Client production build | passes |
| Server unit suite | 253 pass, 0 fail |
| Server lint | clean |

Closed in this checkpoint:
- Revenue reports (`reportService.js`) were checked against the rules. Gross uses the capture day, refunds use `refundedAt`, and only Razorpay `captured` and `refunded` records count. Simulation, grants and failed attempts are excluded. No change needed.
- Admin candidate resume visibility (Req 9): `GET /admin/candidates/:id/resumes` and `.../versions/:versionId/download`, platform admins only. Each list and download is audited before anything is returned, so a failed audit blocks the access. UI: "Resumes" on candidate rows in Admin Users, with a warning that access is audited. Tests: `CandidateResumesModal.test.jsx`.
- Employment-status payloads are validated server-side (`domain/employmentDates.js`). An invalid date is 422 `INVALID_DATE` (it used to be stored as Invalid Date). An end before the start is 422 `INVALID_DATE_RANGE`. Unit tests included.
- Placement verification: the stricter rule that refused `selected` and `hired` placements (`NOT_VERIFIABLE_YET`) was reverted in the final QA phase. It contradicted the existing contract in `test/placementAuthorization.test.js`, which requires an admin to verify a hired placement. The original behaviour is kept.
- AppShell admin nav: added the Subscriptions entry (the page and route already existed).
- `PlacementsPages.test.jsx` exists with 5 behaviour tests, all passing.

Still open: DB-backed server tests (`adminRevenuePlacements`, `adminAnalytics`, the new admin endpoints and the placement verification rules) need a running MongoDB and have not been executed yet. See the final phase.

## Final QA phase (Requirements 13 and 18)

Ran the full gates on the branch and fixed the defects that CI found. CI run `43197411278` on `a305f46`:
backend and frontend-contract both succeeded. The backend job ran `npm test` against MongoDB 7 (63/63 test files pass).

| Commit | Summary |
|---|---|
| `7f0ae7d` | fix(payments): `PaymentTransaction` validate hook is async (Mongoose 9 passes no `next`); fixes `next is not a function` on every checkout |
| `5408122` | fix(interviews): candidate confirm and reschedule return the candidate view (no feedback, no event id); interviews expose `id` |
| `6cc8d4a` | fix(placements): restore admin verification of pre-joining placements (see the note above) |
| `ea8673d` | fix(revenue): one refund rule (`refundsInRange`) for overview, report and daily chart |
| `7d852ee` | fix(notifications): register `subscription_expiring_7d`, `subscription_expiring_1d`, `subscription_expired` |
| `e418d73` | test(email): date-format assertion matches DD MMM YYYY |
| `3cb0b86` | test(reports): revenue fixture uses Razorpay captured records (sandbox records are never revenue) |
| `a305f46` | deps(server): mongoose 9.8.0 to 9.12.1 for critical advisories (`npm audit` now 0) |

Gates (local and CI):

| Gate | Result |
|---|---|
| Server `npm run check`, `npm run lint` | pass |
| Server unit suite | 251/251 |
| Server `npm test` (DB-backed, CI, MongoDB 7) | 63/63 files pass |
| Server `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities (CI and local) |
| Client `vitest` | 47 files, 334 tests pass |
| Client `eslint .` | 0 errors, 3 pre-existing warnings |
| Client `npm run build` | passes |
| Client `npm audit --omit=dev` | 0 vulnerabilities |

See `docs/FINAL_VERIFICATION.md` for the Requirement 1–18 status table and the open items.

## Final QA phase: audit restart (Requirements 1–18)

Earlier QA summaries marked several requirements "Verified" without a per-criterion check. This phase rechecked each requirement against the code, tests and CI. The authoritative result is the matrix in `docs/FINAL_VERIFICATION.md` (18 requirement sections).

Commits in this phase (branch `arena/a534346b-hiresmart-ai`):

| Commit | Summary | Verified |
| --- | --- | --- |
| `fbd745f` | fix(billing): bad Checkout signature defers to webhook reconciliation (Req 1) | CI run `43200087753`: backend failed on one test assertion in `paymentWebhooks` (count of orders). Not a product failure. |
| `5221b7b` | test(billing): slot-hold assertion counts orders before and after the refused checkout; Google Calendar setup guide and Google/demo env variables (Req 4, 11, 13) | CI run `43200905003`: success |
| `a2771e5` | docs: demo accounts guide (Req 11) | CI run `43201039503`: backend success, frontend-contract success |
| (final) | docs: final verification matrix (18 requirements) and this checkpoint | See the CI run on the final SHA (below) |

Corrections to the earlier record:

- The `fbd745f` commit message said billing search was added. Search already existed on the server (`q` on `/subscriptions/invoices`) and in the client. The commit did not add it.
- Earlier notes said there was no Payment ID column. The column exists and shows the gateway payment ID.
- Requirement 14 was marked Verified in the previous report, but `PLAN_LIMIT_REACHED`, `SUBSCRIPTION_EXPIRED` and `FEATURE_NOT_INCLUDED` are not implemented.
- Requirement 9 was marked Verified, but the spec's seven employment statuses are not implemented.

Local gates on `a2771e5`: server `check` and `lint` exit 0; `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities. Client vitest 339/339, lint 0 errors (3 warnings), build passes. The 12 DB-backed server test files cannot run in this sandbox (MongoDB download blocked); CI runs them and passed on `5221b7b`.

Open items (the matrix lists the full set):

- Req 9: implement the spec's employment statuses, or agree a mapping. Decision needed.
- Req 18: no browser E2E suite.
- Req 14: add the three missing error codes.
- Req 7: header search, recent-operations lists, current-date display.
- Req 2: payment-method column (method not stored), currency column, receipts.
- Req 12: header organization switcher still native `<select>`.
- Req 4: background poll for pending conferences.
- Req 17: "Professional" label decision.
- BLOCKED: Razorpay Test Mode, Google OAuth/Calendar/Meet, SMTP.

Checkpoint numbering note: the table above is the authoritative checkpoint list. Body headings are named by requirement and are not renumbered. "Checkpoint 13: admin control center (Requirement 7)" is commit `550e1da`. The table's checkpoint 7 is `916978e` (demo and reset). Two body headings used the label "Checkpoint 7"; both are kept as written, and this table is the reference.

No pull request has been opened. Waiting for your approval before any PR.
