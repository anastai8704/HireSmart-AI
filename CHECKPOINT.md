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
| 6 | next commit | feat(billing): 7-day and 1-day expiry reminders, expiry notice and lapse processing. Decision: Razorpay subscription.completed keeps the internal status and sets cancelAtPeriodEnd, so access lasts to the period end; the provider status is stored. Renewal failures expire only after PAYMENT_GRACE_DAYS (3, unchanged). Reminder idempotency key: type:subscriptionId:billingPeriodEnd, per recipient. Audit action subscription.expired. | Unit suite incl. 8 new reminder/lapse tests; lint. DB-backed idempotency test NOT RUN. |

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
