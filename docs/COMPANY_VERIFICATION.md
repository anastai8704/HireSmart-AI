# Company verification (Phase 2)

This document describes how a recruiter company is verified, reviewed, suspended and restored.
It covers the rules, the statuses, configuration, and the decisions that are still open.

## Principles

- **Evidence, not scores.** Approval requires passing evidence for every required check. A risk score
  never approves or rejects anything.
- **No invented external results.** Without a configured registry the registry check reports
  `unavailable`, and the case shows *Manual verification required*. Manual results are recorded as
  `manual_review` with the reviewer's note.
- **Risk is an explanation, not proof.** Each indicator has a code, severity, weight and explanation.
  A high score sends a case to manual review. It never suspends or bans a company on its own.
  Missing information is informational and carries no weight.
- **Company verification is separate from job approval.** Job moderation is Phase 3.

## Statuses

Company (`Organization.verificationStatus`) and case (`CompanyVerificationCase.status`) move together.

| From | To | Who | Notes |
| --- | --- | --- | --- |
| pending | under_review | recruiter submit | Happens on first submission. |
| under_review | verified | admin approve | Refused while any required check is missing or blocking. |
| under_review | rejected | admin reject | Reason required. Live listings are closed. |
| rejected | under_review | recruiter resubmit | Opens a new case. The old case keeps its history. |
| verified | suspended | admin suspend | Reason required. Live listings are closed, one event each. |
| suspended | verified | admin restore | Every required check is re-checked. Closed listings are **not** reopened. |

Request for changes keeps the case under review, stores the items, and notifies the owner. The recruiter
resubmits and the request is cleared.

## Required checks

Approval needs a passing record for: `business_registration`, `business_email`, `recruiter_identity`,
`duplicate_review`. Other check types (`business_identity`, `website_consistency`, `address_consistency`,
`job_policy_review`, `enforcement_history`, `document_review`) are recorded for review but do not gate approval.

- `business_email`: only the one-time code sent to the address confirms it. A reviewer cannot record it.
  The code is random, shown once in the email, stored as a SHA-256 hash, expires, is single use, and
  locks after too many wrong attempts. Free webmail domains are refused for the code step.
- `recruiter_identity`: passes when the recruiter who opened the case has a verified login email.
- `duplicate_review`: passes by default when no other company shares a registration number, GSTIN,
  website host or email domain. Otherwise a reviewer must record a result.
- `business_registration`: passes only from the registry (`external_registry`) or a documented manual review.

Records made against old identifiers (for example a changed GSTIN or email) are treated as stale and do
not count. Checks are recomputed whenever a case is refreshed.

## Risk indicators

Weights and severities are in `server/domain/verificationRules.js` (`RISK_RULES`). Codes:
`FREE_WEBMAIL_DOMAIN`, `NO_BUSINESS_EMAIL`, `BUSINESS_EMAIL_NOT_VERIFIED`, `WEBSITE_DOMAIN_MISMATCH`,
`MISSING_WEBSITE`, `INVALID_GSTIN_FORMAT`, `MISSING_REGISTRATION_IDENTIFIER`, `MISSING_VERIFICATION_DOCS`,
`DUPLICATE_REGISTRATION`, `DUPLICATE_PROFILE_OVERLAP`, `REGISTRATION_MISMATCH`, `RECRUITER_IDENTITY_PENDING`,
`PREVIOUS_ENFORCEMENT`, `REPEATED_JOB_POLICY_REJECTIONS`, `SUSPICIOUS_PAYMENT_DEMAND`, `DUPLICATE_JOB_POSTINGS`,
`UNREALISTIC_SALARY_CLAIMS`, `UNUSUAL_POSTING_VOLUME`. The `MISSING_*` codes are informational and weigh 0: missing information is not evidence of anything.
Bands: low below 25, medium 25–59, high 60 and above. High or medium
bands set *requires manual review*. Every case shows the disclaimer that indicators are not proof of fraud.

## Documents

- Accepted types: PDF, JPEG, PNG. Up to 5 MB, up to 10 per company.
- The bytes are checked (magic numbers) against the declared type. PDFs with active-content markers
  (for example `/JavaScript`, `/OpenAction`) are refused. Empty and oversized files are refused.
- The file name is reduced to a safe base name. Files are stored under `server/uploads/verification`
  (gitignored) with a random name and mode 0600. The storage key is never returned to clients.
- Only platform administrators can download, through an authenticated endpoint that verifies the stored
  SHA-256 before returning bytes. Uploaded files are not served statically.
- Malware scanning runs through `malwareScannerService` before storage.

## Access rules

- Recruiters (`organization.manage`) can read their own status, reasons, pending checks and change
  requests. They cannot read evidence, risk indicators, duplicate candidates or reviewer notes.
- Admin routes return 404 to non-admins, matching the rest of the admin API.
- A reviewer who is an active member of the company is refused with `REVIEWER_CONFLICT` on every
  decision and check.
- Organization profile updates cannot change verification fields. Unknown fields are rejected by the
  strict route schema.

## Publishing gate

Creating, publishing and receiving applications require `verificationStatus === "verified"`. Pending,
under-review, rejected and suspended companies are refused with `ORGANIZATION_NOT_VERIFIED`. Suspension
closes every published listing and records a `JobModerationEvent` (`lifecycle`, reason `company_suspended`).

## Configuration

| Variable | Purpose |
| --- | --- |
| `COMPANY_REGISTRY_URL` | Optional HTTPS endpoint of an official registry or trusted provider. Accepts POST JSON `{registrationNumber, gstin, legalName, country}` and returns `{status: "found" | "not_found", legalName?}`. Redirects are refused, timeout is 8 s. Unset means every lookup is `unavailable`. |

No registry provider is bundled or assumed. Automated tests inject a mock through
`services/registryProvider.setRegistryProvider`.

## Audit trail

Every transition writes `statusHistory` on the case (from, to, actor, reason, action, time) and an
`AuditLog` entry with the organization, actor, action and metadata. Checks record actor, method, result,
note and time. Actions include `organization.verification_submitted`,
`organization.business_email_confirmed`, `organization.document_uploaded`,
`company_verification.check_recorded`, `company_verification.registry_checked`,
`admin.organization_verified`, `admin.organization_rejected`, `admin.organization_suspended`,
`admin.organization_reactivated`, and `admin.organization_more_info_requested`.

## Backfill for existing companies

```
npm run backfill:company-verification            # dry run, prints the plan
npm run backfill:company-verification -- --apply
```

The backfill fills the normalized identity fields used by duplicate detection, and creates a case for each
company that has none, matching its current status (action `legacy_import`). Open cases are then
recomputed. It never changes a company's status.

**Open decision:** companies already marked `verified` have no evidence to back a verified case, so the
backfill lists them and creates nothing. Until a decision is made, their suspension or restoration returns
`VERIFICATION_CASE_MISSING`. Options for the team to choose from: (a) re-verify each company through the
new workflow; (b) record an explicit administrator-attested import with a stated basis; (c) keep them
verified and exempt from case-based status changes until re-verification. This decision is not made here.

## Known limits

- Suspension closes listings one by one without a database transaction. If the process stops midway, the
  company is suspended and some listings may still be open. Publishing is blocked, and a re-run of the
  restriction is needed. A transactional or sweep-based fix is a follow-up.
- Single-job approval in the admin moderation screen (Phase 3) does not check the company status.
  Published listings of suspended companies are closed, so they are not publicly visible.
- Organization hard-deletion policy is unresolved and is due before Phase 12. It is not decided here.
