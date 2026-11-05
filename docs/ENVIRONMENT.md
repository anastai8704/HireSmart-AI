# Environment variables

Configuration is read from the process environment. In development the server also loads `server/.env` (git-ignored).
Copy `server/.env.example` to `server/.env` and fill in the values you need. Never commit real values. Keep secrets in
your environment or a secrets manager. The values below are descriptions only.

"Required" means the server refuses to start without it. Production-only rules are listed separately.

## Core

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` or `production`. Production enables stricter startup checks (below). |
| `PORT` | `5000` | HTTP port for the API. |
| `MONGO_URI` | none (required) | MongoDB connection string. Example: `mongodb://127.0.0.1:27017/hiresmart_ai`. |
| `CLIENT_URL` | `http://localhost:5173` | Public URL of the React app. Used in e-mail links. |
| `CORS_ORIGIN` | empty | Comma-separated list of allowed browser origins. Required in production. When empty in development, requests from any origin are reflected (see `docs/SECURITY.md`). |
| `LOG_LEVEL` | `info` | Logger level (`error`, `warn`, `info`, `debug`). |
| `PROCESS_JOBS_INLINE` | `false` (`true` in tests) | Run queued jobs in the API process. Use `false` when the separate `worker` process runs them. |

## Authentication and sessions

| Variable | Default | Description |
| --- | --- | --- |
| `JWT_SECRET` | none (required) | Signs access tokens. At least 32 characters in production. Generate a random value. |
| `JWT_EXPIRES_IN` | `7d` | Legacy token lifetime setting. The v1 API uses `ACCESS_TOKEN_EXPIRES_IN` and rotating refresh sessions. Currently not used by the v1 token code (see `docs/SECURITY.md`). |
| `ACCESS_TOKEN_EXPIRES_IN` | `15m` | Lifetime of access tokens. |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `30` | Lifetime of refresh sessions, in days. |
| `REFRESH_COOKIE_NAME` | `hiresmart_refresh` | Name of the httpOnly refresh-token cookie. |
| `COOKIE_SECURE` | `true` in production, otherwise `false` | Send cookies only over HTTPS. Required `true` in production. |
| `COOKIE_SAME_SITE` | `lax` | `strict`, `lax` or `none`. `none` requires `COOKIE_SECURE=true`. |
| `REQUIRE_EMAIL_VERIFICATION` | `false` (`false` in tests) | New accounts must verify their e-mail before signing in. Must be `true` in production. |
| `EMAIL_VERIFICATION_TOKEN_EXPIRES_IN` | `86400000` (24 h, in ms) | Lifetime of e-mail verification links. |
| `PASSWORD_RESET_TOKEN_EXPIRES_IN` | `3600000` (1 h, in ms) | Lifetime of password-reset links. |
| `RECRUITER_INVITE_CODE` | empty | Read into configuration, but no route enforces it today. Do not rely on it as an access control. |

## Bootstrapping an admin

| Variable | Description |
| --- | --- |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used only by `npm run bootstrap:admin` (`server/scripts/bootstrap-admin.js`). The password must be at least 8 characters. Remove it from the environment after use. |

## E-mail (SMTP)

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_HOST` | empty | SMTP server host. Required in production. In Docker Compose the local `mailpit` service is used. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465). |
| `SMTP_USER`, `SMTP_PASS` | empty | SMTP credentials. Required in production. |
| `EMAIL_FROM` | `no-reply@hiresmart.ai` | Sender address. |

## File storage

| Variable | Default | Description |
| --- | --- | --- |
| `STORAGE_PROVIDER` | `local` | `local` (files under `server/uploads`) or `s3`. Must be `s3` in production. |
| `S3_BUCKET`, `S3_REGION` | empty | Required when `STORAGE_PROVIDER=s3` (and in production). |
| `S3_ENDPOINT` | empty | Custom S3-compatible endpoint, if any. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | empty | S3 credentials. |
| `S3_FORCE_PATH_STYLE` | `false` | Use path-style URLs (needed by some S3-compatible services). |
| `MALWARE_SCANNER_URL` | empty | Internal scanner endpoint. It must answer `{"clean": true|false}`. Required in production. |
| `MALWARE_SCAN_TIMEOUT_MS` | `15000` | Scanner timeout. |

## AI and matching

| Variable | Default | Description |
| --- | --- | --- |
| `AI_PRIMARY_PROVIDER` | `deterministic` | `deterministic` (no external calls) or an OpenAI-compatible provider. |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Base URL of the primary provider. |
| `AI_API_KEY` | empty | Key for the primary provider. Required when the primary provider is not `deterministic`. |
| `AI_MODEL` | `gpt-4o-mini` | Model name. |
| `AI_TIMEOUT_MS` | `30000` | Request timeout. |
| `AI_MAX_RETRIES` | `2` | Retries on transient failures. |
| `AI_INPUT_COST_PER_MILLION`, `AI_OUTPUT_COST_PER_MILLION` | `0` | Price per million input and output tokens. Used to estimate the cost of each AI call. |
| `AI_FALLBACK_PROVIDER`, `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_API_KEY`, `AI_FALLBACK_MODEL` | `deterministic` / empty | Optional fallback provider. |
| `EMBEDDINGS_PROVIDER`, `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_API_KEY`, `EMBEDDINGS_MODEL` | `deterministic` / empty / empty / `text-embedding-3-small` | Embeddings for semantic matching. |
| `MATCH_WEIGHT_REQUIRED_SKILLS`, `MATCH_WEIGHT_PREFERRED_SKILLS`, `MATCH_WEIGHT_EXPERIENCE`, `MATCH_WEIGHT_EDUCATION`, `MATCH_WEIGHT_SEMANTIC`, `MATCH_WEIGHT_PREFERENCES` | `0.35`, `0.1`, `0.2`, `0.1`, `0.2`, `0.05` | Weights for candidate fit scoring. |

## Payments (Razorpay Test Mode)

See `docs/PAYMENTS.md` for the full setup. Live payments are not enabled.

| Variable | Default | Description |
| --- | --- | --- |
| `PAYMENT_MODE` | `disabled` | `disabled` (checkout returns 503), `simulation` (local sandbox only, refused outside `development` and `test`) or `razorpay_test`. |
| `PAYMENT_SIMULATION_SECRET` | empty | Secret for the simulation mode. At least 32 characters. Used only when `PAYMENT_MODE=simulation`. |
| `RAZORPAY_KEY_ID` | empty | Test key id (`rzp_test_…`). Required for `razorpay_test`. Live keys (`rzp_live_…`) are refused. |
| `RAZORPAY_KEY_SECRET` | empty | Test key secret. Required for `razorpay_test`. |
| `RAZORPAY_WEBHOOK_SECRET` | empty | Secret set on the Razorpay webhook. At least 16 characters. Required for `razorpay_test`. |

## Other

| Variable | Description |
| --- | --- |
| `COMPANY_REGISTRY_URL` | Optional endpoint of an external company-registry lookup used during company verification. Empty means no external lookup. |
| `HIRESMART_DOH_BASE_URLS` | Optional override of the DNS-over-HTTPS providers used by the SRV fallback for MongoDB connection strings (`server/utils/srvFallback.js`). |
| `SCENARIO` | Only for `npm run probe` (`stage1` or `stage3`). Not used by the app. |
| `TEST_FILE_TIMEOUT_MS` | Only for the test runner: time limit per test file (default 300000). |

## Client (Vite)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `/api/v1` | API base URL the browser calls. Use the relative default so the dev server or Nginx proxies `/api`. Do not point it at `localhost` for a deployed app. |

Set it at build time in `client/`. The Docker build passes it as a build argument (see `docker-compose.yml`).

## Production startup checks

When `NODE_ENV=production`, the server refuses to start unless:

- `MONGO_URI`, `JWT_SECRET` (32+ characters) and `CORS_ORIGIN` are set.
- `REQUIRE_EMAIL_VERIFICATION=true` and `COOKIE_SECURE=true`.
- `STORAGE_PROVIDER=s3`, with `S3_BUCKET` and `S3_REGION`.
- `MALWARE_SCANNER_URL` is set.
- `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are set.
- `COOKIE_SAME_SITE` is `strict`, `lax` or `none`.
- If a non-deterministic AI provider is configured, `AI_API_KEY` is set.
- Payment settings are valid. Live keys are refused.

`npm run seed` (`scripts/seed-data.js`) deletes every collection and refuses to run when `NODE_ENV=production`. Run it only against a local or test database.
