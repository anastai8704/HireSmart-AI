# Reports and CSV exports (Phase 10)

Reports reuse the dashboard definitions in `server/domain/analyticsDefinitions.js`: IST day boundaries, cash-basis
revenue (captured minus refunds), and lifecycle stage names. An export total must equal the dashboard figure for the
same range. The CI test `server/test/reports.test.js` checks this for revenue, successful payments and failed payments.

## Endpoints

| Endpoint | Who | Notes |
| --- | --- | --- |
| `GET /api/v1/admin/reports/:reportType` | Platform administrators | Non-admins receive 404. `/admin` is already gated. |
| `GET /api/v1/organizations/:organizationId/reports/:reportType` | Members with `analytics.read` | Company-scoped reports only, for the member's own organisation. Platform-only types return 404. |

Query parameters: `range=7d|30d|90d|custom` (default `30d`), `from` and `to` (`YYYY-MM-DD`, IST, inclusive,
used with `range=custom`), and `format=json|csv` (default `json`).

## Catalogue

| Report | Audience | Rows |
| --- | --- | --- |
| `candidate_registrations` | admin | One row per IST day: new candidate accounts |
| `company_verification` | admin | One row per company created in range (status, risk score) |
| `job_moderation` | admin | One row per job submitted for moderation in range |
| `job_postings` | admin, company | One row per job created in range |
| `applications` | admin, company | One row per application applied in range (no candidate identity) |
| `hiring_pipeline` | admin, company | Applications in range by current stage (legacy stages folded) |
| `employment_records` | admin, company | One row per placement created in range (no candidate identity) |
| `subscriptions` | admin, company | Subscriptions whose current period started in range |
| `payments` | admin, company | One row per payment transaction created in range |
| `revenue` | admin | One row per IST day plus a `TOTAL` row (gross captured, refunds, net, counts) |
| `platform_activity` | admin | Audit events per IST day and category |

## Personal data

No export contains candidate names, e-mail addresses, phone numbers, addresses, resume content, or payment secrets.
Candidates are represented by record ids only. The company name is included in company-level reports because it is
part of the employer record. A unit test fails if a column named like personal or secret data is added.

## CSV safety

- Text cells that start with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with an apostrophe, which stops
  spreadsheet formula injection. Numbers are written unchanged.
- Fields containing commas, quotes or line breaks are quoted (RFC 4180). Lines end with CRLF.
- Responses set `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.

## Limits, time and async

- Date ranges use the existing limit of 366 days.
- Each export is limited to 10,000 rows. A larger request returns 413 `EXPORT_TOO_LARGE` with guidance to narrow the
  range. Results are never truncated silently.
- Timestamps are ISO-8601 UTC. Date-bucketed columns and the range are IST (`Asia/Kolkata`). The JSON response includes
  `timezone`, `range` and `generatedAt`. CSV responses include `X-Report-Timezone`.
- Exports run synchronously and are bounded by the row cap. An asynchronous job workflow is not implemented. It is
  needed only if a report can exceed the cap or take too long in a request. Revisit before launch.
- PDF output is not provided. Tabular data is served as CSV only.

## Audit

Every CSV export writes an `AuditLog` entry with action `report.exported`. The entry records the actor, the report
type as the resource, the organisation (null for platform exports), the format, the audience, the range, and the row
count. It contains no row data and no personal data.

## Client

The admin analytics page has a report selector and an "Export CSV" button. It uses the date range currently selected
on the page. The company analytics page does not yet have an export button. Company members can call the company
endpoint directly with an authenticated request. Adding the button is a small follow-up.

## Known gaps

- The payment-based revenue report counts refunds by their last status update (`updatedAt`), as the dashboard does.
  A dedicated refund date is not stored.
- Subscription rows use the current period as the date filter. A subscription that started before the range and is
  still active does not appear in a range that does not cover its current period.
