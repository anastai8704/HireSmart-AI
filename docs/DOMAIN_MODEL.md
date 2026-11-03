# Domain model (Phase 1)

This document maps the Master Prompt's Phase 1 domain areas onto the existing MongoDB models
(Mongoose 9). The project keeps a single database (MongoDB). Existing models were extended where
they already covered an area; new models were added only where no entity existed.

## Domain areas

| # | Area | Implementation | Status |
|---|------|----------------|--------|
| 1 | Users | `User` | Existing |
| 2 | Candidate profiles | `CandidateProfile` | Existing |
| 3 | Recruiter profiles | `User` (recruiter role, department and specialization fields) | Existing. No separate model, to avoid a duplicate entity. |
| 4 | Companies | `Organization` | Existing |
| 5 | Company memberships | `Membership` | Existing |
| 6 | Company verification cases | `CompanyVerificationCase` (evidence, assessment, decision, history) | **New in Phase 1.** Business logic arrives in Phase 2. |
| 7 | Jobs | `Job` | Existing |
| 8 | Job moderation history | `JobModerationEvent` (append-only) | **New in Phase 1.** Writes from moderation endpoints arrive in Phase 3. |
| 9 | Applications | `Application` (with `statusHistory`) | Existing |
| 10 | Interview stages | `Interview`, `Recruitment` | Existing |
| 11 | Offers | Application stage `offer`; post-hire terms in `Placement.offerDetails` | **Gap.** No pre-hire offer entity. Decision needed in Phase 4. |
| 12 | Employment records | `Placement` (employment status with source and actor) | Existing, extended in Phase 0.5 |
| 13 | Subscription plans | `config/subscriptionPlans.js` | Existing (code-defined plans) |
| 14 | Company subscriptions | `Subscription` (subscriber is an organization) | Existing |
| 15 | Payments | `PaymentTransaction` (sandbox only) | Existing |
| 16 | Invoices / billing records | `PaymentTransaction.invoiceNumber` | Existing. No separate invoice model. |
| 17 | Notifications | `Notification` | Existing |
| 18 | Audit logs | `AuditLog`, `SecurityEvent` | Existing |
| 19 | Reports / report jobs | None | **Deferred** to Phase 10 (Reporting). Not required for Phase 1. |

## Status names

The Master Prompt names were adapted to the existing enums. Existing data is not renamed.

| Master Prompt | Existing value | Where |
|---|---|---|
| Company `pending_verification` | `pending` | `Organization.verificationStatus` |
| Company `under_review`, `verified`, `rejected`, `suspended` | same | same |
| Job `draft`, `approved`, `rejected`, `closed` | `status` = `draft` / `published` / `closed`; `moderation.status` = `none` / `pending` / `approved` / `rejected` | `Job` |
| Job `pending_review` | `moderation.status` = `pending` | `Job` |
| Job `changes_requested`, `suspended`, `expired` | **Missing.** Phase 3 decides whether to add them. | — |
| Application `applied` | `submitted` (and legacy `Applied`) | `Application.status` |
| Application `screening` | `under_review` | `Application.status` |
| Application `shortlisted`, `interview`, `offer`, `hired`, `rejected`, `withdrawn` | same | same |

## Transition rules

All transition rules are in `server/domain/stateMachines.js`. The recruitment controller uses the
application-stage map from that module. Its rules are identical to the previous local map, so
behaviour did not change.

Verification-related rules are enforced by the model itself:

- A company case can only be `verified` with an assessment of `verified_evidence` and at least one
  evidence item marked `verified`.
- A `rejected` or `suspended` case needs a recorded reason.
- Only one open case (`pending` or `under_review`) may exist per organization. This is a partial
  unique index, so concurrent duplicates fail at the database.

The placement employment status is governed by `placementEmployment`. Verification
(`Placement.verification.isVerified`) is a separate fact and is not part of that machine.

## Deletion and retention

Records that must not be lost are protected by `server/models/plugins/protectRecords.js`:

- **Protected from hard delete:** `Application`, `Placement`, `PaymentTransaction`, `Subscription`,
  `CompanyVerificationCase`, `JobModerationEvent`.
- **Append-only:** `JobModerationEvent`. Updates are refused.
- Hard deletes are refused with `409 RECORD_PROTECTED`. The only override is the explicit option
  `.setOptions({ allowHardDelete: true })`, which is used by the seed and cleanup scripts
  (`server/scripts/seed-data.js`, `server/scripts/professional-data.js`).

Retention policy (proposed; needs approval before Phase 12):

- Billing and placement records are retained and never hard-deleted.
- Personal data is minimized and anonymized on account closure. Billing records keep the
  organization reference.

**Open issue:** the account-deletion path (`v1AuthController`) still hard-deletes the user's
organization, memberships and user. Organizations with billing or placement history therefore
lose their parent record. This behaviour was not changed in Phase 1 because it is a policy decision.

## Data changes and migrations

- All Phase 1 schema changes are additive: new collections (`CompanyVerificationCase`,
  `JobModerationEvent`) and a plugin on existing models. Existing documents need no rewriting.
- The one new index with a uniqueness constraint (open case per organization) applies to a new
  collection, so it cannot conflict with existing data.
- `npm run indexes:create` creates indexes for every model. CI runs it on each push.
