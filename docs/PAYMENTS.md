# Payments (Phase 7)

## Provider decision

- **Razorpay**, test mode only in this release. Reasons: the platform sells in INR to an India-based
  market; Razorpay offers Orders, Checkout, signed webhooks and refunds; and it has an official Node.js SDK
  (`razorpay`, pinned to 2.9.8 in `server/package.json`).
- There is no second gateway. The `simulation` mode remains a local sandbox for development and tests.
- **Live payments are not enabled.** No live credentials were available, so no live payment has been tested.
  Enabling live mode needs a separate, approved change: live keys, a live-mode review, and end-to-end testing
  with those keys.

## Modes (`PAYMENT_MODE`)

| Mode | Behaviour | Allowed when |
| --- | --- | --- |
| `disabled` (default) | Checkout returns 503. Nothing is created. | always |
| `simulation` | Server-issued sandbox proof. Sandbox only. | `NODE_ENV` is `development` or `test` |
| `razorpay_test` | Real Razorpay test-mode orders via the SDK. | `NODE_ENV` is not `production`; `RAZORPAY_KEY_ID` starts with `rzp_test_` |

Startup validation (`validatePaymentConfig`) refuses any `rzp_live_` key, any `RAZORPAY_*` variable when the
mode is not `razorpay_test`, and a `razorpay_test` configuration with a missing secret or a webhook secret
shorter than 16 characters.

## Environment variables (names only; never commit values)

- `PAYMENT_MODE`: one of the modes above.
- `RAZORPAY_KEY_ID`: test key id (`rzp_test_...`). Public to the browser; the server returns it with the order.
- `RAZORPAY_KEY_SECRET`: test key secret. Server only. Never returned to clients.
- `RAZORPAY_WEBHOOK_SECRET`: secret set on the webhook in the Razorpay test dashboard. At least 16 characters.
- `PAYMENT_SIMULATION_SECRET`: only for `simulation`.

See `server/.env.example`.

## Workflow

1. The authorised user selects a plan. `POST /api/v1/subscriptions/checkout` takes only `planTier`. The
   server sets the price from the plan definition; a client-supplied `amount` is rejected by schema.
2. The server creates the provider order (amount in paise) and a `PaymentTransaction` with `status=initiated`.
   Only the order id and public key are returned.
3. The browser opens Razorpay Checkout (`client/src/lib/razorpayCheckout.js`).
4. On success the browser posts `orderId`, `paymentId`, `signature` to `POST /subscriptions/verify-payment`.
   The server:
   - verifies the Checkout signature (HMAC-SHA256 of `order_id|payment_id` with the key secret);
   - fetches the payment from Razorpay;
   - requires `payment.order_id` to match, and the amount and currency to match the stored order;
   - activates the plan only when the provider reports `captured`.
   - A payment that is still `authorized` returns **202 `pending`**. The plan is not activated.
   - A `failed` payment marks the order failed.
5. `POST /api/v1/payments/webhooks/razorpay` receives provider events. It is authenticated by the
   `X-Razorpay-Signature` HMAC over the **raw** request body (captured by `express.json`'s `verify` hook).
   The event id from `X-Razorpay-Event-Id` makes each delivery idempotent.
6. Closing the Checkout window calls `POST /subscriptions/checkout/cancel`. Only an `initiated` order can be
   cancelled. Nothing is charged.

The frontend's success callback is never treated as proof. A subscription changes only through
`captureTransaction` (`server/services/paymentProcessingService.js`), which claims the order atomically.

## Webhook events handled

| Event | Effect |
| --- | --- |
| `payment.captured` | Activates the plan for an `initiated`, `failed` or `cancelled` order (the provider's capture is the source of truth). Amount or currency mismatch: no state change, audit entry. Already captured: no change. |
| `payment.failed` | Marks an `initiated` order `failed`. |
| `refund.processed` | Full refund: transaction becomes `refunded`; the subscription it paid for becomes `expired`. Partial refund: no state change; audit entry `subscription.partial_refund_review` for manual review. |
| anything else | Recorded as `ignored`. |

Redelivery: a processed event returns `200 {status:"duplicate"}` without state change. A delivery that fails is
removed from the event log, so the provider's retry is processed. A delivery that arrives while another copy is
processing returns `409`, so the provider retries later.

## Statuses

`PaymentTransaction.status`: `initiated` → `captured` | `failed` | `cancelled`; `captured` → `refunded`
(full refund only). Only `captured` orders count as revenue (Phase 5 analytics).

## Refund and expiry policy

- A full refund ends the plan it paid for: the subscription becomes `expired` and the entitlement falls back
  to the free plan. Expiry and refunds **never delete jobs or other records**; they only block new actions
  (Phase 6 rule).
- Partial refunds are not modelled. They are recorded for review.
- Revocation applies only while the subscription still has the same plan tier. Renewal is not implemented yet.

## Tests

- `server/test/razorpayIntegration.unit.test.js`: configuration rules, Checkout and webhook signatures,
  paise conversion, provider error handling, using an injected fake client.
- `server/test/paymentWebhooks.test.js` (database, runs in CI): checkout price, client-supplied amount refused,
  bad signature, pending `authorized` payment, amount mismatch, activation once with replay refused, webhook
  signature, webhook activation and duplicate redelivery, amount mismatch via webhook, full refund and duplicate
  refund, checkout cancellation, `payment.failed`, unknown events.
- `server/test/paymentConfig.unit.test.js`: simulation and live-key rules.
- The database tests use a fake provider client. **No test calls the network.**
- Client: `client/src/lib/razorpayCheckout.test.js` covers options, the dismiss-after-success guard, and failure messages.

## Not verified

- No live payments. Razorpay test-mode API calls were not made from this sandbox (the provider host is not in
  the sandbox allowlist), so the SDK calls are verified only against the injected fake client.
- No browser run of Razorpay Checkout against the test API.
- Webhook delivery from Razorpay to a deployed URL has not been tested. For manual testing, expose the
  server with a tunnel and register the URL with the test webhook secret.

## Manual test-mode checklist

1. Create a Razorpay test-mode key pair and a webhook (events: `payment.captured`, `payment.failed`,
   `refund.processed`) with a secret of your choice.
2. Set `PAYMENT_MODE=razorpay_test`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` in
   the environment (not in files under version control).
3. Buy a plan with a Razorpay test card. Confirm the plan activates after the verify call and again via the webhook.
4. Repeat with a failed test card and confirm the order is marked failed.
5. Refund the test payment from the dashboard and confirm the webhook marks the transaction `refunded`.
