# Security

This document describes the security controls in HireSmart AI, the Phase 8 review that tightened them, the dependency audit, the known limitations, and what is deliberately deferred. It is written for engineers and reviewers. It contains no secrets or environment values.

Last reviewed: 2026-11-05 (Phase 8 of the master spec).

## 1. Scope and method

The review read the actual server and client code paths: app bootstrap, configuration, authentication and session handling, the route table, the controllers that accept untrusted input, the upload pipeline, file delivery, logging, and the client's token and link handling. Every finding below was confirmed by reading the code. Where behaviour depends on a live environment (the deployed webhook, the malware scanner, an S3 bucket), it is listed as not verified.

Automated coverage added in this phase is in section 6.

## 2. Controls in place

### Transport and HTTP hardening
- `helmet` security headers; `x-powered-by` disabled.
- JSON and form bodies limited to 1 MB.
- `hpp` (parameter pollution) and `express-mongo-sanitize` (operator injection) on every request.
- Production refuses to start without `CORS_ORIGIN`, secure cookies, `REQUIRE_EMAIL_VERIFICATION=true`, S3 storage, a malware scanner URL, and SMTP settings (`server/config/env.js`, `validateEnvironment`).
- The `/test-error` route exists only outside production. Unknown routes return a JSON 404.

### Rate limiting
- API-wide limit: 300 requests per 15 minutes per IP in production.
- Auth routes: 20 per 15 minutes per IP.
- Refresh (`POST /auth/token`): 300 per 15 minutes per IP. It is keyed by IP only. The previous key read the unverified refresh-cookie payload, which a client could change on each request.
- Login: 10 per 15 minutes per account. The key is a SHA-256 hash of the trimmed, lower-cased email. It is never taken from request headers, so changing IP does not reset it.
- Forgot password: 5 per hour per account (same keying).

### Authentication and sessions
- Passwords: 12 to 128 characters, bcrypt.
- Login with an unknown email runs a bcrypt comparison against a dummy hash, so response time does not reveal whether an account exists. The response body is identical for unknown emails and wrong passwords.
- Access tokens: JWT, 15-minute lifetime, algorithm pinned to HS256, issuer `hiresmart-api`, audience `hiresmart-web`. Signing and verification live in one module (`server/utils/accessToken.js`). A token with `alg: none`, another HMAC algorithm, the wrong issuer or audience, or an expired date is rejected.
- Revocation: each user has a `tokenInvalidBefore` timestamp. Access tokens issued before it are rejected. Security-sensitive account changes, such as password reset and administrator suspension, set it.
- Refresh tokens: random, stored only as SHA-256 hashes, rotated on every use. Reuse of a rotated token revokes the whole session family.
- Refresh cookie: `httpOnly`, path `/api/v1/auth`, `Secure` in production, `SameSite` configurable.
- CSRF: double-submit cookie (`hiresmart_csrf`) on cookie-authenticated requests.
- Verification and password-reset tokens: random, hashed at rest. Password reset revokes all sessions.
- Client: the access token is held in memory only. LocalStorage holds the selected organisation ID, not tokens.

### Authorisation
- Every endpoint in the route table requires `authenticate` or `optionalAuthenticate`, except the reviewed public list in section 6.
- Platform administration: `requirePlatformAdmin` is mounted with `router.use("/admin", ...)` before the admin routes. A new admin endpoint is protected by default. Controllers keep their own checks as a second layer.
- Organisation scope: `requireOrganization(permission)` checks membership and the permission for the requested organisation. Queries also filter by `organization`, so a record from another tenant returns 404.
- Recruiter access to a candidate's submitted resume (`GET /organizations/:id/applications/:applicationId/resume`) requires the `application.review` permission, a same-organisation application, and the per-application assignment check.
- Candidate resume downloads are scoped to the owning candidate.
- Company verification documents are downloadable only by platform administrators, with `attachment` disposition, `nosniff` and `no-store` headers.

### Input validation
- Every request body is validated with a strict zod schema. Unknown fields return 422 `VALIDATION_ERROR`.
- URL fields use the shared `httpUrl` schema (`server/domain/safeUrl.js`). It accepts only `http:` and `https:`. Previously `z.string().url()` accepted `javascript:` and `data:` URLs, which were rendered as links, so this was a stored cross-site scripting vector. This covers `meetingUrl`, `website` (organisation, company verification) and `logo`.
- Client-side: `safeHttpUrl` (`client/src/lib/safeUrl.js`) guards the six places where a stored URL becomes an `href` (`PublicPages`, candidate interview links, recruiter interview links). Unsafe values render without a link.
- Regular-expression search inputs are escaped before use.
- Writes that build records from request bodies use explicit field picks (`utils/pickDefined.js`) for interview scheduling and organisation creation. Ownership, verification, risk and billing fields are set by the server only.

### Uploads
- Resumes: MIME allow-list, then content verification by magic number, with DOCX requiring the expected package structure (`resumeProcessingService.verifyContent`).
- Avatars: MIME allow-list, then the content must start with a JPEG, PNG or WebP signature (`domain/imageSignature.js`). The stored extension comes from the detected type, not the client filename. Validation happens before the old avatar is deleted, so a rejected upload cannot remove the current photo.
- Verification documents: MIME check, magic-number check (`companyVerificationPolicy`), random storage names, sanitised display names, and a malware scan call (`malwareScannerService.scan`) before storage.
- Uploaded files are stored under random names. Client filenames are never used as storage paths.

### Data protection and logging
- Logs are redacted recursively at any depth (`server/utils/redact.js`, applied in `utils/logger.js`). Keys matching password, token, secret, authorization, cookie, signature, CSRF, API key, credential, OTP, resume text, and raw-body names are replaced with `[REDACTED]`. Razorpay signature and key-secret fields are included.
- HTTP request logs record the path, not the query string or body.
- `/health` returns the environment name only outside production.

### Payments (Phase 7)
- Test Mode only. `PAYMENT_MODE=razorpay_test` with `rzp_test_` keys. Live keys are refused, and so is production (see `docs/PAYMENTS.md`).
- The webhook verifies the HMAC-SHA256 signature over the raw body and deduplicates by event ID.
- Checkout verification uses the subscription signature format `payment_id|subscription_id`.

### Operational scripts
- `server/scripts/seed-data.js` deletes every collection. It refuses to run when `NODE_ENV=production`. Its development tokens use the same pinned claims and 15-minute lifetime as real access tokens.

## 3. Audit results

| # | Area | Finding | Status |
|---|------|---------|--------|
| 1 | Rate limiting | Refresh limiter keyed on an unverified cookie payload, so it could be bypassed. | Fixed: IP-keyed refresh tier. |
| 2 | Authentication | Login skipped bcrypt for unknown emails, leaking account existence through timing. | Fixed: dummy comparison. |
| 3 | Authentication | No per-account login throttle. | Fixed: 10 per 15 minutes per account. |
| 4 | Authorisation | Admin access enforced only in controllers, not on the route table. | Fixed: prefix-level `requirePlatformAdmin`, route-table test. |
| 5 | JWT | Verification checked issuer and audience but did not pin the algorithm, and the options were duplicated across files. | Fixed: one module (`utils/accessToken.js`) used by middleware, session service and seed script, with HS256 pinned. |
| 6 | Input | `z.string().url()` accepted `javascript:` and `data:` URLs rendered as links. | Fixed: `httpUrl` schema on server and `safeHttpUrl` on client. |
| 7 | Mass assignment | Interview and organisation creation spread the raw request body into the model. Not exploitable under the strict schemas, but fragile. | Fixed: explicit field picks. |
| 8 | Uploads | Avatars were checked by MIME type only, and the extension came from the client filename. | Fixed: magic-number check, extension from content, check before delete. |
| 9 | Uploads | `uploadResume` in `resumeService` was unreferenced. | Removed after confirming no references in server, scripts, or tests. |
| 10 | Logging | Redaction covered only a few top-level keys. | Fixed: recursive redaction with a broader key set. |
| 11 | Information disclosure | `/health` returned `environment` in production. | Fixed: omitted in production. |
| 12 | Scripts | Seed script could delete a production database. | Fixed: refuses production. |
| 13 | Scripts | Seed tokens used a 30-day lifetime and claims the API does not accept. | Fixed: pinned claims, 15-minute lifetime. |
| 14 | Authorisation | Recruiter resume download scope. | Verified: permission, organisation scope, and assignment check all apply. No change. |
| 15 | Files | `/avatars/:key` is public. | Accepted: it is a capability URL with a random key (section 5). |
| 16 | Files | Company verification document download. | Verified sound. No change. |
| 17 | Client | Tokens in `localStorage`. | Verified: access token in memory only. No change. |
| 18 | Authorisation | `requireOrganizationForNonCandidate` lets candidates through on placement employment-status updates. | Verified: the controller limits a candidate to their own placements (`candidate: req.user._id`) and everyone else to their organisation. No change. |

## 4. Dependency audit

Run on 2026-11-05 with `npm audit`:

- `server`: 0 vulnerabilities in production dependencies (230 packages), and 0 in the full tree.
- `client`: 0 vulnerabilities in production dependencies.

CI runs `npm audit --omit=dev --audit-level=high` in the backend job. A high or critical advisory fails the build. Re-run the audit before each release and after any dependency change.

## 5. Known limitations

- **Development CORS.** When `CORS_ORIGIN` is empty and `NODE_ENV` is not `production`, CORS reflects any origin. Development only. Production requires `CORS_ORIGIN`.
- **Malware scanning.** Verification documents call the scanner service. Production requires `MALWARE_SCANNER_URL`, but the scanner integration has not been tested against a live service. Treat the scanner as pending until it is verified in a deployed environment.
- **Public avatar URLs.** `/avatars/:key` requires no session. The key is a random UUID-based name, so the URL acts as a capability. Anyone holding the link can view the photo.
- **Login throttle side effect.** The per-account login limit can be used to make one account temporarily unavailable from any IP. This is accepted for a 15-minute window in exchange for not depending on client-controlled keys.
- **Payment gaps (Phase 7).** `payment.captured` depends on the payment entity carrying `subscription_id`. A dismissed subscription Checkout is cancelled locally only, so the provider subscription stays `created` until it expires. Live-mode payments are not enabled.
- **Unused configuration.** `JWT_EXPIRES_IN` (default `7d`) is parsed but unused. Access token lifetime is `ACCESS_TOKEN_EXPIRES_IN`. Remove the unused variable before launch.
- **Database tests in CI only.** The database-backed suites (including `test/authorizationBoundaries.test.js`) need MongoDB, which is provided by the CI service container. They were not run in the development sandbox for this phase.

## 6. Automated security tests

| File | Runs | Covers |
|------|------|--------|
| `server/test/securityControls.unit.test.js` | Locally and in CI | JWT pinning (alg none, HS512, issuer, audience, secret, expiry), recursive redaction, image magic numbers, `saveImage` rejecting non-images before any write, `httpUrl` schemes, `requirePlatformAdmin` (401, 403, allowed). |
| `server/test/securityRoutes.unit.test.js` | Locally and in CI | Every route except a reviewed public allowlist requires authentication. The allowlist names only real routes. `/admin` is guarded at the prefix, before any admin route. |
| `server/test/authorizationBoundaries.test.js` | CI only (database) | Admin access for anonymous, candidate and recruiter callers; cross-tenant organisation reads; 401 on protected endpoints; forged and wrong-audience tokens; refresh without cookie; mass-assignment refusal; unsafe website URLs; non-image avatar upload (415); PNG avatar upload; identical login errors for unknown email and wrong password. |

The public route allowlist (`securityRoutes.unit.test.js`) is: health checks, auth entry points (register, verify, login, token refresh, forgot and reset password, confirm email change), invitation view and accept, the avatar capability URL, public job and company pages, plans, and the Razorpay webhook (authenticated by HMAC over the raw body). Adding an endpoint to this list requires a review.

## 7. Deferred: retention and hard delete (Phase 12)

The user chose to defer the retention and hard-delete policy. The current protections remain:

- Model-level protection blocks hard deletes unless the code explicitly opts in with `allowHardDelete`.
- Audit log entries are written for administrative and account actions (`audit()` helper).

Gap: there is no automated retention schedule, no scheduled purge of expired sessions, verification tokens, or stale uploads, and no process for erasing a user's data on request. This must be decided before launch and implemented in Phase 12.

## 8. Backup and recovery

The repository contains no backup or restore automation. Backups of the MongoDB database and of the object store (S3 bucket, if versioning is not enabled) are operator responsibilities. Before launch:

- Enable managed daily backups with point-in-time recovery for the database.
- Enable S3 versioning and a lifecycle rule for the upload bucket.
- Document the restore procedure and rehearse it in a non-production environment.
- Confirm that a restored database invalidates active sessions. Refresh tokens are stored hashed, so a restore may bring back older sessions. Consider bumping `tokenInvalidBefore` for all users after a restore.

None of these steps has been tested in this repository.

## 9. Reporting

Report suspected vulnerabilities to the project maintainers directly. Do not open a public issue. Do not test against production systems, and do not use real payment credentials.
