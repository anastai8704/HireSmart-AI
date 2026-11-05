# Admin Analytics and Metric Definitions (Phase 5)

The admin dashboard (`/app/admin`) and `GET /api/v1/admin/analytics/overview` show the metrics below.
Every value is a MongoDB aggregation over stored records. Nothing is fetched record-by-record into the
browser, and nothing is hardcoded. Each KPI is also returned in the API response under `definitions`,
and the UI shows the same text on hover.

## Dates, timezone and ranges

- Reporting timezone: **Asia/Kolkata (IST, UTC+05:30)**. Day boundaries are IST midnight. Stored times are UTC.
- Presets: `range=7d`, `range=30d` (default), `range=90d`. Each is the last N IST calendar days, including today.
- Custom: `range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`. Both are inclusive IST days. The maximum span is 366 days.
  `from` after `to`, a future `to`, an invalid date, or a missing bound returns `400 INVALID_RANGE`.
- Each metric has a **period**:
  - `range`: counted inside the selected dates.
  - `as_of_now`: a current total. It does not depend on the dates.
  - `all_time`: no date filter (not currently used by KPIs).
- The response includes `range` (`preset`, `timezone`, `from`, `to`, `days`) and one series point per IST day.

## Metric definitions

| Metric (API key) | Period | Definition |
| --- | --- | --- |
| Registered candidates (`candidatesTotal`) | as of now | `User` with role `candidate`. |
| New candidate registrations (`candidatesNew`) | range | Candidate accounts with `createdAt` in range. |
| Registered recruiters (`recruitersTotal`), new (`recruitersNew`) | as of now / range | Same rules, role `recruiter`. |
| Total companies (`companiesTotal`) | as of now | `Organization` records. |
| Verified companies (`companiesVerified`) | as of now | `verificationStatus = verified`. Verification is evidence-based (Phase 2). |
| Awaiting verification (`companiesAwaitingVerification`) | as of now | `verificationStatus` is `pending` or `under_review`. |
| Active job listings (`activeJobs`) | as of now | `status = published` and `moderation.status` is `approved` or `none`. |
| Pending job approvals (`pendingJobApprovals`) | as of now | `moderation.status = pending`. |
| Job postings (`jobPostings`) | range | Jobs created in range, any status. |
| Applications (`applications`) | range | Applications with `appliedAt` in range, **excluding withdrawn**. This is the eligible cohort. |
| Interviews created (`interviewsScheduled`) | range | Interview records created in range, excluding cancelled. |
| Offers issued (`offersIssued`) | range | Applications with `offer.issuedAt` in range. |
| Candidates marked hired (`candidatesHired`) | range | Distinct applications with a `statusHistory` entry to `hired`, changed in range. |
| Confirmed employment (`confirmedEmployment`) | range | Placements with `verification.isVerified = true` and `verification.verifiedAt` in range. Candidate-reported or company-reported joinings are **not** counted. Legacy records without `verifiedAt` are excluded. |
| Hiring conversion (`hiringConversion`) | range | Eligible applications in range that **reached hired** ÷ eligible applications in range × 100. Null (shown as "—") when there are no eligible applications. |
| Active paid subscriptions (`activePaidSubscriptions`) | as of now | `status = active` and `priceInr > 0`. Free plans are excluded. |
| Subscription conversion (`subscriptionConversion`) | as of now | Active paid **organization** subscriptions ÷ total organizations × 100. Null when there are no organizations. |
| Successful payments (`successfulPayments`) | range | Transactions in `captured` or `refunded` status created in range (INR). |
| Net revenue (`revenue`) | range | Gross captured payments created in range, minus refunds processed in range. Cash basis, INR. |
| Refunds (`refunds`) | range | Transactions in `refunded` status whose last update falls in range. |
| Failed payments (`failedPayments`) | range | Transactions in `failed` status created in range. |
| Suspended accounts (`suspendedAccounts`) | as of now | `accountStatus = suspended`. |
| Fraud-risk review queue (`fraudReviewQueue`) | as of now | Organizations awaiting verification that carry at least one risk flag. Risk flags route a company to review. They never ban or block on their own. |

Attempts that are `initiated` or `failed` never count as revenue or as successful payments.

## Series and breakdowns

- Daily series (one point per IST day, zero-filled): candidate and recruiter registrations, job postings,
  applications, interviews, hires, paid subscriptions started, gross captured revenue, refunds, failed payments.
- Breakdowns: application funnel (candidates who *reached* each stage, from status history),
  current stage distribution, hiring outcomes (hired / not selected / withdrawn for applications in range),
  company verification status, job approval status.
- Stage names: legacy values (`Applied`, `Shortlisted`, `Interview`, `Selected`, `Rejected`, `Withdrawn`)
  are mapped to lifecycle names inside the query, so one application is never counted twice.

## Known limitations

- **Refund date.** Refunds are attributed to the transaction's last update (`updatedAt`) because no
  `refundedAt` is recorded yet. Phase 7 (payments) should record it.
- **Payment capture date.** Captured payments are dated by `createdAt`, since no `capturedAt` field exists.
- **Revenue is INR only.** Mixed currencies are not converted.
- **No fee or hosting estimates.** The previous "estimated net profit" (2% gateway fee and a hosting
  guess) was removed because it was not based on stored facts. The revenue endpoint returns `netRevenue`
  and `totalRefunds` instead.
- **Application drill-downs.** There is no admin-level application list yet, so application and hiring
  cards are not linked.
- **Legacy fields.** `users`, `companies`, `jobs`, `applications`, `placements`, `monthlyTrends` and
  `companyWiseStats` in the same response keep their previous all-time meaning for the existing page.
  Use `kpis` and `series` for range-aware figures.
- **Organization filter.** `organizationId` still applies only to the legacy company deep dive, not to `kpis`.

## Where it lives

- `server/domain/analyticsDefinitions.js`: range resolution, rates, revenue arithmetic, metric definitions.
- `server/services/adminAnalyticsService.js`: aggregations.
- `server/controllers/v1AdminController.js` (`overviewAnalytics`) and `server/controllers/v1SubscriptionController.js` (`adminRevenueAnalytics`).
- `client/src/pages/admin/AdminPages.jsx` (`AdminHome`), `AdminAnalyticsPanel.jsx`, `client/src/lib/analyticsRange.js`.
- Tests: `server/test/analyticsDefinitions.unit.test.js`, `server/test/adminAnalytics.test.js` (CI, MongoDB),
  `client/src/pages/admin/AdminAnalyticsPanel.test.jsx`, `client/src/lib/analyticsRange.test.js`.
