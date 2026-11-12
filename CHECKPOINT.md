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
