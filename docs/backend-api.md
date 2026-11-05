# Backend API reference

This is the reference for the HTTP API that the React client and any future integration use. It is generated from
`server/routes/v1Routes.js` (179 routes) and checked against the mounted router. Only `/api/v1` is supported.
Legacy `/api/{auth,user,jobs,candidate,matching}` routes were removed (see `docs/marketplace-blueprint.md`, phase 0).

## Conventions

- **Base URL:** `/api/v1`. Example: `POST /api/v1/auth/login`.
- **Authentication:** `Authorization: Bearer <accessToken>`. Access tokens are short-lived (`ACCESS_TOKEN_EXPIRES_IN`,
  default 15 minutes). The refresh token is an `httpOnly` cookie (`REFRESH_COOKIE_NAME`, default `hiresmart_refresh`).
- **Refresh:** `POST /auth/token` rotates the refresh token. It requires header `X-CSRF-Token` to match the
  `hiresmart_csrf` cookie (double-submit check), otherwise it returns 403 `CSRF_INVALID`. Presenting an already-rotated
  refresh token revokes the whole session family (401 `SESSION_REUSE_DETECTED`).
- **Access levels** (the "Access" column):
  - `public`: no token.
  - `signed in`: any authenticated user.
  - `candidate`: candidate accounts only.
  - `org member (permission)`: active member of the organisation in the path (`:organizationId`) who holds the named
    permission. Non-members receive 404, so company existence is not revealed. Platform admins pass.
  - `platform admin`: platform administrators only. Non-admins receive 404.
- **Organisation context:** organisation routes take the organisation id in the path. The server checks membership
  and permission on every request. It never trusts a client-supplied role.
- **Success envelope:** `{ "data": ... }`. Some responses add `meta` (for example, `source` and `computedAt` on
  snapshot-backed lists, and `count`, `hasMore`, `nextCursor` on cursor-paginated lists).
- **Error envelope:**
  ```json
  { "success": false, "status": "fail", "message": "…", "code": "APPLICATION_EXISTS", "requestId": "…" }
  ```
  `status` is `fail` for 4xx and `error` for 5xx. 5xx responses use `code: "INTERNAL_ERROR"` and a generic message.
  Validation errors add `fieldErrors`. Common codes include `VALIDATION_ERROR` (422), `RESOURCE_NOT_FOUND` (404),
  `INVALID_RANGE` (400), `INVALID_PAGINATION` (422), `INVALID_CURSOR` (422), `RATE_LIMITED` (429) and
  `EXPORT_TOO_LARGE` (413).
- **Cursor pagination:** list endpoints that paginate take `limit` (default 20, maximum 100 unless stated) and `after`
  (the `_id` of the last item from the previous page). The `meta` object contains `count`, `hasMore` and `nextCursor`.
  When a page is exactly full, `hasMore` is `true`, and the next page may then be empty.
- **Idempotency:** send `Idempotency-Key` (8–120 characters from `A-Z a-z 0-9 . _ : -`) on create operations that
  support it. A replay with the same key and body returns the stored response. The same key with a different body
  returns 409 `IDEMPOTENCY_CONFLICT`.
- **Dates and reports:** report and analytics date filters use IST calendar days (`Asia/Kolkata`). Timestamps are ISO
  8601 UTC. See `docs/REPORTS.md` and `docs/ANALYTICS.md`.
- **Rate limits:** `/api` has a general limit (300 requests per 15 minutes in production, 1000 otherwise). Login,
  refresh, registration, verification and other sensitive routes have stricter per-route limits, and return
  `429 RATE_LIMITED`.
- **Payments:** `POST /payments/webhooks/razorpay` is called by Razorpay, not by the client. It verifies the
  HMAC-SHA256 signature of the raw body. See `docs/PAYMENTS.md`.

## Specific request notes

- **Candidate application:** `POST /jobs/:jobId/applications` with `{ "resumeVersionId", "source" }`. Returns 201. The
  job must be published, approved, and belong to a verified company. The resume must be `ready` and owned by the
  candidate. A second application to the same job returns 409 `APPLICATION_EXISTS`.
- **Reports:** `GET /admin/reports/:reportType` and `GET /organizations/:organizationId/reports/:reportType` accept
  `range` (`7d`, `30d`, `90d`, `custom`), `from`, `to` (`YYYY-MM-DD`), and `format` (`json` or `csv`). CSV responses
  are attachments. The full catalogue is in `docs/REPORTS.md`.

## Routes

Access is taken from the route's middleware in `server/routes/v1Routes.js`. Routes under `/api/v1/admin` are all
behind the platform-admin guard. Paths are shown with their parameters (`:name`).


### `/api/v1/health`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/health/live` | public |
| GET | `/api/v1/health/ready` | public |

### `/api/v1/auth`

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | public |
| POST | `/api/v1/auth/verify-email` | public |
| POST | `/api/v1/auth/verification-emails` | public |
| POST | `/api/v1/auth/login` | public |
| POST | `/api/v1/auth/token` | public |
| POST | `/api/v1/auth/password/forgot` | public |
| POST | `/api/v1/auth/password/reset` | public |
| POST | `/api/v1/auth/logout` | signed in |
| POST | `/api/v1/auth/change-email` | signed in |
| POST | `/api/v1/auth/confirm-email-change` | public |
| GET | `/api/v1/auth/security` | signed in |
| GET | `/api/v1/auth/sessions` | signed in |
| DELETE | `/api/v1/auth/sessions/:sessionId` | signed in |
| POST | `/api/v1/auth/sessions/revoke-others` | signed in |
| PATCH | `/api/v1/auth/password` | signed in |

### `/api/v1/invitations`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/invitations/:token` | public |
| POST | `/api/v1/invitations/:token/accept` | public |
| POST | `/api/v1/invitations/:token/accept-existing` | signed in |

### `/api/v1/users`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/users/me` | signed in |
| PATCH | `/api/v1/users/me` | signed in |
| PATCH | `/api/v1/users/me/notification-prefs` | signed in |
| POST | `/api/v1/users/me/avatar` | signed in |
| DELETE | `/api/v1/users/me/avatar` | signed in |
| GET | `/api/v1/users/me/avatar` | signed in |
| GET | `/api/v1/users/me/export` | signed in |
| DELETE | `/api/v1/users/me` | signed in |
| GET | `/api/v1/users/me/consents` | signed in |
| PUT | `/api/v1/users/me/consents/:purpose` | signed in |

### `/api/v1/avatars`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/avatars/:key` | public |

### `/api/v1/organizations`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/organizations` | signed in |
| POST | `/api/v1/organizations` | signed in |
| GET | `/api/v1/organizations/:organizationId` | signed in |
| PATCH | `/api/v1/organizations/:organizationId` | org member (organization.manage) |
| PUT | `/api/v1/organizations/:organizationId/settings` | org member (organization.manage) |
| GET | `/api/v1/organizations/:organizationId/members` | org member (member.manage) |
| POST | `/api/v1/organizations/:organizationId/members` | org member (member.manage) |
| PATCH | `/api/v1/organizations/:organizationId/members/:membershipId` | org member (member.manage) |
| GET | `/api/v1/organizations/:organizationId/invitations` | org member (member.manage) |
| POST | `/api/v1/organizations/:organizationId/invitations` | org member (member.manage) |
| GET | `/api/v1/organizations/:organizationId/invitations/:invitationId/link` | org member (member.manage) |
| DELETE | `/api/v1/organizations/:organizationId/invitations/:invitationId` | org member (member.manage) |
| GET | `/api/v1/organizations/:organizationId/assigned-jobs` | org member (job.read) |
| GET | `/api/v1/organizations/:organizationId/jobs` | org member (job.read) |
| POST | `/api/v1/organizations/:organizationId/jobs` | org member (job.manage) |
| GET | `/api/v1/organizations/:organizationId/jobs/:jobId` | org member (job.read) |
| PUT | `/api/v1/organizations/:organizationId/jobs/:jobId/hiring-team` | org member (job.manage) |
| PATCH | `/api/v1/organizations/:organizationId/jobs/:jobId` | org member (job.manage) |
| POST | `/api/v1/organizations/:organizationId/jobs/:jobId/publish` | org member (job.manage) |
| POST | `/api/v1/organizations/:organizationId/jobs/:jobId/close` | org member (job.manage) |
| GET | `/api/v1/organizations/:organizationId/jobs/:jobId/applications` | org member (application.review) |
| POST | `/api/v1/organizations/:organizationId/applications/:applicationId/transitions` | org member (application.manage) |
| POST | `/api/v1/organizations/:organizationId/applications/:applicationId/shortlist` | org member (application.manage) |
| GET | `/api/v1/organizations/:organizationId/applications/:applicationId` | org member (application.review) |
| POST | `/api/v1/organizations/:organizationId/applications/:applicationId/offer` | org member (application.manage) |
| GET | `/api/v1/organizations/:organizationId/applications/:applicationId/resume` | org member (application.review) |
| PUT | `/api/v1/organizations/:organizationId/applications/:applicationId/tags` | org member (application.manage) |
| POST | `/api/v1/organizations/:organizationId/applications/:applicationId/messages` | org member (application.manage) |
| POST | `/api/v1/organizations/:organizationId/applications/compare` | org member (application.review) |
| GET | `/api/v1/organizations/:organizationId/applications/:applicationId/match` | org member (application.review) |
| GET | `/api/v1/organizations/:organizationId/jobs/:jobId/ranking` | org member (application.review) |
| GET | `/api/v1/organizations/:organizationId/applications/:applicationId/notes` | org member (application.review) |
| POST | `/api/v1/organizations/:organizationId/applications/:applicationId/notes` | org member (application.review) |
| GET | `/api/v1/organizations/:organizationId/candidates/search` | org member (application.review) |
| GET | `/api/v1/organizations/:organizationId/interviews` | org member (interview.feedback) |
| POST | `/api/v1/organizations/:organizationId/interviews` | org member (interview.manage) |
| GET | `/api/v1/organizations/:organizationId/interviews/:interviewId` | org member (interview.feedback) |
| PATCH | `/api/v1/organizations/:organizationId/interviews/:interviewId` | org member (interview.manage) |
| POST | `/api/v1/organizations/:organizationId/interviews/:interviewId/cancel` | org member (interview.manage) |
| POST | `/api/v1/organizations/:organizationId/interviews/:interviewId/complete` | org member (interview.manage) |
| POST | `/api/v1/organizations/:organizationId/interviews/:interviewId/feedback` | org member (interview.feedback) |
| POST | `/api/v1/organizations/:organizationId/interviews/:interviewId/questions` | org member (interview.feedback) |
| POST | `/api/v1/organizations/:organizationId/ai/:feature` | org member (job.manage) |
| GET | `/api/v1/organizations/:organizationId/analytics/recruitment` | org member (analytics.read) |
| GET | `/api/v1/organizations/:organizationId/reports/:reportType` | org member (analytics.read) |
| GET | `/api/v1/organizations/:organizationId/analytics/ai-usage` | org member (analytics.read) |
| GET | `/api/v1/organizations/:organizationId/audit-logs` | org member (audit.read) |
| GET | `/api/v1/organizations/:organizationId/security-events` | org member (audit.read) |
| GET | `/api/v1/organizations/:organizationId/verification` | org member (organization.manage) |
| POST | `/api/v1/organizations/:organizationId/verification` | org member (organization.manage) |
| POST | `/api/v1/organizations/:organizationId/verification/business-email` | org member (organization.manage) |
| POST | `/api/v1/organizations/:organizationId/verification/business-email/confirm` | org member (organization.manage) |
| POST | `/api/v1/organizations/:organizationId/verification/documents` | org member (organization.manage) |
| GET | `/api/v1/organizations/:organizationId/placements` | org member (application.manage) |

### `/api/v1/candidates`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/candidates/me/profile` | candidate |
| PATCH | `/api/v1/candidates/me/profile` | candidate |
| POST | `/api/v1/candidates/me/resumes` | candidate |
| GET | `/api/v1/candidates/me/resumes` | candidate |
| GET | `/api/v1/candidates/me/resumes/versions/:versionId` | candidate |
| GET | `/api/v1/candidates/me/resumes/versions/:versionId/download` | candidate |
| DELETE | `/api/v1/candidates/me/resumes/versions/:versionId` | candidate |
| POST | `/api/v1/candidates/me/resumes/versions/:versionId/retry` | candidate |
| POST | `/api/v1/candidates/me/resumes/versions/:versionId/analysis` | candidate |
| POST | `/api/v1/candidates/me/resumes/versions/:versionId/tailor` | candidate |
| GET | `/api/v1/candidates/me/recommendations` | candidate |
| GET | `/api/v1/candidates/me/saved-jobs` | candidate |
| POST | `/api/v1/candidates/me/saved-jobs/:jobId` | candidate |
| DELETE | `/api/v1/candidates/me/saved-jobs/:jobId` | candidate |
| GET | `/api/v1/candidates/me/alerts` | candidate |
| POST | `/api/v1/candidates/me/alerts` | candidate |
| PATCH | `/api/v1/candidates/me/alerts/:alertId` | candidate |
| DELETE | `/api/v1/candidates/me/alerts/:alertId` | candidate |
| GET | `/api/v1/candidates/me/search-history` | candidate |
| DELETE | `/api/v1/candidates/me/search-history` | candidate |
| GET | `/api/v1/candidates/me/applications` | candidate |
| GET | `/api/v1/candidates/me/applications/:applicationId` | candidate |
| POST | `/api/v1/candidates/me/applications/:applicationId/withdraw` | candidate |
| POST | `/api/v1/candidates/me/applications/:applicationId/offer-response` | candidate |
| GET | `/api/v1/candidates/me/interviews` | candidate |
| GET | `/api/v1/candidates/me/placements` | candidate |
| POST | `/api/v1/candidates/me/placements/:placementId/confirm-joining` | candidate |

### `/api/v1/job-runs`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/job-runs/:jobRunId` | signed in |

### `/api/v1/jobs`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/jobs` | public |
| GET | `/api/v1/jobs/:jobId` | public |
| GET | `/api/v1/jobs/:jobId/related` | public |
| POST | `/api/v1/jobs/:jobId/fit` | candidate |
| POST | `/api/v1/jobs/:jobId/applications` | candidate |

### `/api/v1/companies`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/companies` | public |
| GET | `/api/v1/companies/:slug` | public |
| GET | `/api/v1/companies/:slug/jobs` | public |

### `/api/v1/interviews`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/interviews/:interviewId` | candidate |
| POST | `/api/v1/interviews/:interviewId/confirm` | candidate |
| POST | `/api/v1/interviews/:interviewId/reschedule` | candidate |
| POST | `/api/v1/interviews/:interviewId/preparation` | candidate |

### `/api/v1/notifications`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/notifications` | signed in |
| GET | `/api/v1/notifications/preferences` | signed in |
| GET | `/api/v1/notifications/unread-count` | signed in |
| POST | `/api/v1/notifications/:notificationId/read` | signed in |
| POST | `/api/v1/notifications/:notificationId/unread` | signed in |
| POST | `/api/v1/notifications/read-all` | signed in |

### `/api/v1/ai`

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/v1/ai/:feature` | signed in |

### `/api/v1/admin`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/admin/users` | platform admin |
| GET | `/api/v1/admin/organizations` | platform admin |
| GET | `/api/v1/admin/analytics/overview` | platform admin |
| GET | `/api/v1/admin/reports/:reportType` | platform admin |
| GET | `/api/v1/admin/analytics/revenue` | platform admin |
| GET | `/api/v1/admin/organizations/:organizationId/verification` | platform admin |
| POST | `/api/v1/admin/organizations/:organizationId/verify` | platform admin |
| POST | `/api/v1/admin/organizations/:organizationId/reject` | platform admin |
| POST | `/api/v1/admin/organizations/:organizationId/request-info` | platform admin |
| POST | `/api/v1/admin/organizations/:organizationId/suspend` | platform admin |
| POST | `/api/v1/admin/organizations/:organizationId/reactivate` | platform admin |
| GET | `/api/v1/admin/verification/cases` | platform admin |
| GET | `/api/v1/admin/verification/cases/:caseId` | platform admin |
| POST | `/api/v1/admin/verification/cases/:caseId/checks` | platform admin |
| POST | `/api/v1/admin/verification/cases/:caseId/registry-check` | platform admin |
| POST | `/api/v1/admin/verification/cases/:caseId/request-changes` | platform admin |
| POST | `/api/v1/admin/verification/cases/:caseId/approve` | platform admin |
| POST | `/api/v1/admin/verification/cases/:caseId/reject` | platform admin |
| POST | `/api/v1/admin/verification/cases/:caseId/suspend` | platform admin |
| POST | `/api/v1/admin/verification/cases/:caseId/restore` | platform admin |
| GET | `/api/v1/admin/verification/documents/:documentId` | platform admin |
| GET | `/api/v1/admin/placements` | platform admin |
| POST | `/api/v1/admin/placements/:placementId/verify` | platform admin |
| GET | `/api/v1/admin/moderation/companies` | platform admin |
| GET | `/api/v1/admin/moderation/companies/:organizationId/jobs` | platform admin |
| POST | `/api/v1/admin/moderation/companies/:organizationId/approve-all` | platform admin |
| POST | `/api/v1/admin/moderation/bulk` | platform admin |
| GET | `/api/v1/admin/moderation/jobs` | platform admin |
| GET | `/api/v1/admin/moderation/jobs/:jobId` | platform admin |
| GET | `/api/v1/admin/moderation/jobs/:jobId/history` | platform admin |
| POST | `/api/v1/admin/moderation/jobs/:jobId/:action` | platform admin |
| GET | `/api/v1/admin/ai-usage` | platform admin |
| GET | `/api/v1/admin/ai-activity` | platform admin |
| GET | `/api/v1/admin/audit-logs` | platform admin |
| GET | `/api/v1/admin/security-events` | platform admin |
| POST | `/api/v1/admin/users/:userId/suspend` | platform admin |
| POST | `/api/v1/admin/users/:userId/reactivate` | platform admin |

### `/api/v1/placements`

| Method | Path | Access |
| --- | --- | --- |
| PATCH | `/api/v1/placements/:placementId/employment-status` | signed in |

### `/api/v1/subscriptions`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/subscriptions/plans` | public |
| GET | `/api/v1/subscriptions/current` | signed in |
| POST | `/api/v1/subscriptions/checkout` | signed in |
| POST | `/api/v1/subscriptions/verify-payment` | signed in |
| POST | `/api/v1/subscriptions/verify-subscription` | signed in |
| POST | `/api/v1/subscriptions/checkout/cancel` | signed in |
| POST | `/api/v1/subscriptions/cancel` | signed in |
| GET | `/api/v1/subscriptions/invoices` | signed in |

### `/api/v1/payments`

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/v1/payments/webhooks/razorpay` | public |

## Root endpoints (outside `/api/v1`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Service banner |
| GET | `/health` | Basic health |
| GET | `/test-error` | Only when `NODE_ENV` is not `production`. Used by tests to check the error handler. |
