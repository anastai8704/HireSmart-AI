# Job moderation (Phase 3)

The admin moderation page (`/app/admin/moderation`) groups job listings by company and is the only
place where an admin decides on a job. Company verification (Phase 2) and job approval are separate:
a company's verification status only decides whether an approval is *eligible*.

## States

| Field | Values | Meaning |
| --- | --- | --- |
| `status` (lifecycle) | `draft`, `published`, `closed` | Recruiter-controlled. A submitted job is `published` and awaits review. |
| `moderation.status` | `none`, `pending`, `approved`, `rejected`, `changes_requested`, `suspended` | Platform review of the listing. Only `approved` and `none` are public. |
| `pendingChanges.status` | `pending`, `approved`, `rejected` | Proposed edits to a live job. The live version stays visible until an admin approves the change. |

The moderation transitions are defined once, in `server/domain/stateMachines.js` (`jobModeration`).
The history model (`JobModerationEvent`) rejects any transition the machine does not allow.

```
none ──submit──▶ pending ──approve──▶ approved ──suspend──▶ suspended
                   │  ▲                  │   ▲                 │
                   │  └──resubmit── rejected│                 └─reinstate─▶ approved
                   ├──reject──▶ rejected   └─(closed then republished)─▶ pending
                   └──request changes──▶ changes_requested ──resubmit──▶ pending
```

A job *needs review* when it is `published` and either `moderation.status` is `pending` or
`pendingChanges.status` is `pending`. The company counts, the queues and the bulk actions all use this
single rule (`server/domain/jobModerationPolicy.js`, `needsReviewExpr`).

## Decisions and their rules

| Decision | From | To | Reason | Company must be verified |
| --- | --- | --- | --- | --- |
| Approve | pending (or a pending change) | approved | optional | yes |
| Reject | pending (or a pending change) | rejected | required (3+ chars) | no |
| Request changes | pending | changes_requested | required | no |
| Suspend | approved | suspended | required | no |
| Reinstate | suspended | approved | optional | yes |

A reviewer who belongs to the company (an active membership), or who is the job's own recruiter, cannot
decide on that job (`REVIEWER_CONFLICT`). Recruiters cannot reach any moderation endpoint: they get a 404,
as before. A suspended job cannot be resubmitted by its recruiter (`JOB_SUSPENDED`), and an edit to a
suspended job is held for review like an edit to a live job.

## Endpoints (all admin-only)

- `GET  /admin/moderation/companies` — one card per company: counts and a preview of up to three jobs that need review.
  Filters: `search`, `verificationStatus`, `riskLevel`.
- `GET  /admin/moderation/companies/:organizationId/jobs` — jobs of one company (up to 200). Filters: `status`
  (`pending`, `approved`, `rejected`, `changes_requested`, `suspended`, `draft`, `published`, `closed`), `jobStatus`,
  `search` (title), `recruiterId`, `from`, `to` (dates). Also returns the company's current verification case.
- `POST /admin/moderation/companies/:organizationId/approve-all` — approves every *eligible pending* job of a verified
  company. Returns per-job results. It never changes rejected, suspended or changes-requested jobs.
- `POST /admin/moderation/jobs/:jobId/:action` — one decision. `action`: `approve`, `reject`, `request-changes`,
  `suspend`, `reinstate`. Body: `{ "reason": "..." }`.
- `POST /admin/moderation/bulk` — `{ action: "approve" | "reject", jobIds: [...], reason?, organizationId? }`.
  Up to 200 jobs. `organizationId` scopes the request to one company.
- `GET  /admin/moderation/jobs/:jobId` — one job with its content and its moderation history.
- `GET  /admin/moderation/jobs/:jobId/history` — the append-only decision history.
- `GET  /admin/moderation/jobs?status=` — review queue (kept for compatibility).

Errors use stable codes: `REASON_REQUIRED` (422), `INVALID_TRANSITION`, `ALREADY_DECIDED`, `JOB_CLOSED`,
`JOB_NOT_SUBMITTED`, `JOB_INCOMPLETE`, `COMPANY_NOT_VERIFIED`, `STATUS_CHANGED` (409), `REVIEWER_CONFLICT` (403).

## Bulk results

A bulk request returns one result per requested job, in request order:

```json
{ "summary": { "requested": 6, "succeeded": 2, "skipped": 2, "failed": 2, "duplicatesRemoved": 1 },
  "results": [ { "jobId": "...", "title": "...", "outcome": "approved", "code": null } ] }
```

- **succeeded** — the decision was applied.
- **skipped** — not eligible under the rules: `COMPANY_NOT_VERIFIED`, `REVIEWER_CONFLICT`, `JOB_INCOMPLETE`,
  `JOB_CLOSED`, `JOB_NOT_SUBMITTED`, `DUPLICATE_IN_REQUEST`.
- **failed** — the job was not changed: `ALREADY_DECIDED`, `INVALID_TRANSITION`, `STATUS_CHANGED`, `NOT_FOUND`,
  `JOB_NOT_IN_COMPANY`, `WRITE_FAILED`.

The screen shows the summary and each job's reason. It never reports success from the browser alone:
the counts come from the server's response.

## Concurrency and transactions

- Every decision is a **compare-and-set** on the job document: it applies only if the job still has the
  `updatedAt` and moderation status that were read and checked. Two admins deciding on the same job at the
  same time cannot both succeed (`test/jobModeration.test.js` runs this against MongoDB).
- MongoDB multi-document transactions need a replica set, which the CI database does not run. Each decision
  changes a single job document. If the history write fails after the change, the change is reverted with another
  compare-and-set and the error is returned.
- For a pending *change review*, the job is changed and the audit entry is written; if the audit write fails,
  the error is returned but the change is not reverted. This is a known limitation.

## Audit

Each decision writes an `AuditLog` entry (`job.moderation.approved`, `.rejected`, `.changes_requested`,
`.suspended`, `.reinstated`, `job.changes_approved`, `job.changes_rejected`) with the reviewer, the previous and
new state, the reason and, for bulk decisions, the batch id. Bulk runs also write `job.moderation.bulk` with the
summary.

## Counts

Every count on the page uses the same predicates as the queue behind it:

- `pending` = jobs that need review (above). Closed and draft jobs are never counted.
- `eligible` = `pending` for a verified company, otherwise 0. Pending jobs of an unverified company are `blocked`.
- `approved` = published and approved. `total` = all jobs, including drafts, matching the list.

## Data repair

Before this phase, editing a draft or a rejected job also wrote a proposed change, so drafts showed up as pending.
`server/scripts/moderation-drift-report.js` reports these records (read-only by default):

```
node scripts/moderation-drift-report.js           # report
node scripts/moderation-drift-report.js --apply   # clears the stale proposals only
```

The edits themselves were already saved to the job, so clearing the proposal loses no content.

## Known limitations

- Admin single-job approval previously ignored company verification; it now checks it.
- The recruiter dashboard shows `pending` with the same rule as the admin queue.
- Public listings and company pages hide `changes_requested` and `suspended` jobs.
- Notifications are best effort and are logged on failure; they never block a decision.
