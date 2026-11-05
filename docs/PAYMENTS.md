# Payments (Phase 7): Razorpay recurring subscriptions, test mode

Status: implemented and covered by unit tests. The database-backed flow test (`server/test/paymentWebhooks.test.js`)
runs in CI. **Live payments are not enabled and have not been tested against live credentials.** Everything here is
verified only against Razorpay **Test Mode**, and the test suite uses an injected fake provider with no network calls.

## Scope

- Companies (recruiters) and candidates buy a plan on a **monthly** or **yearly** cycle.
- Razorpay Subscriptions authorise the recurring payment. Successful charges renew the paid period.
- Failed charges move the subscription to `past_due`, notify the subscriber, and expire it after the grace window.
- Cancellation stops renewal at the end of the paid period. Access continues until then.
- Prices come only from `server/config/subscriptionPlans.js`. The browser never sends a price.

## Modes (`PAYMENT_MODE`)

| Mode | Use | Notes |
| --- | --- | --- |
| `disabled` (default) | No payments | Checkout returns 503 and creates nothing. |
| `simulation` | Local development and tests | One-time sandbox orders. Refused unless `NODE_ENV` is `development` or `test`. |
| `razorpay_test` | Recurring subscriptions in Razorpay Test Mode | Keys must start with `rzp_test_`. Refused when `NODE_ENV=production`. |

Live keys (`rzp_live_`) are refused at startup. Live modes are not accepted in this release.

## Environment variables (no values in the repository)

Documented in `server/.env.example`:

- `PAYMENT_MODE`
- `PAYMENT_SIMULATION_SECRET`: only for `simulation`, 32+ characters.
- `RAZORPAY_KEY_ID`: test key id (`rzp_test_…`).
- `RAZORPAY_KEY_SECRET`: test key secret. Backend only. Never sent to the browser.
- `RAZORPAY_WEBHOOK_SECRET`: webhook signing secret, 16+ characters. Set the same value on the Razorpay Test Mode webhook.

## Endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/subscriptions/plans` | Plans with prices. `yearlyPriceInr` is `null` until a yearly price is configured. |
| `POST /api/v1/subscriptions/checkout` | Body `{ planTier, billingCycle? }`. Creates the Razorpay plan (once per tier, cycle and amount) and a subscription in state `created`. Returns the subscription id and public key id. Refused with 409 `ALREADY_SUBSCRIBED` if a recurring subscription is active or in grace. Yearly without a configured price returns 400 `YEARLY_PRICE_NOT_CONFIGURED`. |
| `POST /api/v1/subscriptions/verify-subscription` | Body `{ subscriptionId, paymentId, signature, planTier? }`. Verifies the Checkout signature, then fetches the subscription and payment from Razorpay, then records the charge. Returns 202 `pending` until the provider confirms. |
| `POST /api/v1/subscriptions/checkout/cancel` | Body `{ subscriptionId }` (or `{ orderId }` for sandbox). Marks an abandoned checkout `cancelled`. Nothing is charged. |
| `POST /api/v1/subscriptions/cancel` | Cancels renewal at period end at Razorpay. If the provider refuses, nothing changes locally. |
| `GET /api/v1/subscriptions/current` | Current subscription and effective entitlement (grace and expiry applied). |
| `GET /api/v1/subscriptions/invoices` | Transaction history with invoice numbers. |
| `POST /api/v1/payments/webhooks/razorpay` | Razorpay webhook receiver. Public route authenticated by HMAC, see below. |

## Activation rules

1. **Never from the browser.** Checkout's success callback starts `verify-subscription`. It does not activate anything.
2. The server checks the Checkout signature: HMAC-SHA256 of `payment_id|subscription_id` with the key secret, compared in constant time.
3. The server fetches the subscription from Razorpay. It activates only when the provider reports `active` (or `authenticated`) with at least one paid cycle.
4. The server fetches the payment. Its subscription id must match, its amount and currency must match the server-side plan, and it must be `captured`.
5. The charge is recorded by one shared function used by both the browser path and the webhook path (`recordCharge`).

## Webhooks

- The signature is HMAC-SHA256 of the **raw request body** with `RAZORPAY_WEBHOOK_SECRET`, from the `X-Razorpay-Signature` header. The raw body is captured in `server/app.js` before JSON parsing.
- Each delivery is recorded once by `X-Razorpay-Event-Id` in `PaymentWebhookEvent` (unique `eventId`). A redelivery of a processed event returns `duplicate` and changes nothing. A failed delivery releases its lock so the provider's retry is processed.
- Handled events:

| Event | Effect |
| --- | --- |
| `subscription.authenticated`, `subscription.updated`, `subscription.paused`, `subscription.resumed` | Provider status recorded. |
| `subscription.activated` | Provider status recorded. Clears `past_due` only when a paid cycle exists. |
| `subscription.charged` | `recordCharge`: first charge activates, later charges renew the period. |
| `subscription.pending` | Failed renewal: `past_due`, `renewalFailures` incremented, subscriber notified. Repeats on each failed retry. |
| `subscription.halted` | Retries exhausted: `past_due`, subscriber notified. Access ends after the grace window. |
| `subscription.cancelled` | Cancel at period end is recorded. Access continues until the period ends. |
| `subscription.completed` | Final cycle reached: cancel at period end. |
| `payment.captured` | Only when the payment belongs to a subscription. Routed to `recordCharge`. |
| `payment.failed` | Only when the payment belongs to a subscription. Failed attempt recorded in the history. |
| `refund.processed` | Full refund of a charge expires the plan it paid for. Partial refund is audited for review, not modelled. |
| Any other event | Recorded and ignored. |

Charges are idempotent per provider payment id (`gatewayPaymentId`). Out-of-order events do not move the period backwards. An amount or currency mismatch changes no state and writes an audit entry.

## Lifecycle

| State | Meaning | Access |
| --- | --- | --- |
| `active` | Paid and in period | Full plan |
| `past_due` (`pastDueSince` set) | Renewal failed, or the period ended without a confirmed renewal | Grace for `PAYMENT_GRACE_DAYS` (3) after the period end |
| `expired` | Grace ended, or a full refund was processed | Free plan limits |
| `canceled` | Provider ended the subscription | Free plan limits after the period |

Grace is applied to provider-managed subscriptions only: when the period ends and Razorpay has not yet sent its renewal, the subscription is treated as `past_due`, not expired. A subscription that is past its grace window is also expired in the record, with the audit action `subscription.expired`.

## Yearly billing

Yearly billing is wired end to end but **not offered yet**. Each plan in `subscriptionPlans.js` has `yearlyPriceInr: null`. The UI shows the Monthly/Yearly toggle only when at least one plan has a yearly price. Setting a yearly price in config enables it (checkout then uses a yearly Razorpay plan with 10 cycles). No price has been invented.

## Cycle counts

Razorpay requires a `total_count` for each subscription. Monthly subscriptions use 120 cycles (10 years), yearly use 10 cycles (`server/config/recurringBilling.js`). When the count is reached, the provider completes the subscription and the plan moves to the free tier at period end.

## Invoices

Every charge creates a transaction with an invoice number. The invoice history is available through `GET /subscriptions/invoices`. PDF invoices are not generated.

## Testing

- Locally: `npm run check` (from `server/`) for syntax, then `node --test test/*.unit.test.js` for unit tests. `npm test` also runs the database tests, which need MongoDB and run in CI.
- `server/test/razorpayIntegration.unit.test.js` covers config, key refusal, signatures, provider error mapping, pricing, and the cycle table.
- `server/test/paymentWebhooks.test.js` covers the HTTP flow against MongoDB: checkout, forged and valid signatures, pending authorisation, activation, replay refusal, renewal, duplicate event ids, wrong amount, failed renewal, halt and recovery, cancellation (including provider failure), abandoned checkout, full refund, and yearly once priced. It runs in CI, where MongoDB is available.
- No test calls the Razorpay network API. Nothing has been run against a real Razorpay test account from this environment.

## Known gaps

- **Not verified end to end against Razorpay Test Mode.** Webhook delivery from Razorpay needs a public HTTPS URL configured in the Razorpay Test dashboard. This has not been set up or exercised.
- Live payments are not enabled. Enabling them needs a separate review, live credentials, and a rotated secret.
- A failed verification ends that checkout attempt. The user starts a new checkout.
- Data retention and hard-delete policy are deferred (Phase 12). Current protections stay in place. The only hard delete is the webhook processing lock of a failed delivery (`PaymentWebhookEvent`), which is removed so the provider's retry can run. Transaction and audit records are never hard-deleted by any route.
