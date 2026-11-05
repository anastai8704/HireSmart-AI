# Candidate Management and Recruitment Pipeline (Phase 4)

This document covers offers, candidate privacy defaults and the evidence labels used for hiring and
placement facts. It extends the application stages in `DOMAIN_MODEL.md` and the placement states in
the placement workflow.

## Stages and offers

Application stages (`applicationStage`):

`submitted → under_review | shortlisted | rejected`
`under_review → shortlisted | interview | rejected`
`shortlisted → interview | rejected`
`interview → offer | rejected`
`offer → hired | rejected`

- **Offers are issued, not moved.** `POST /organizations/:organizationId/applications/:applicationId/offer`
  (permission `application.manage`) records an offer with optional `designation`, `ctc` (annual),
  `currency`, `joiningDate` and `note`. A direct `→ offer` transition returns `409 OFFER_USE_OFFER_ENDPOINT`.
- An offer can be issued only from the `interview` or `offer` stage, and only when no offer is `issued`
  or `accepted`. A `declined` offer may be replaced by a new one.
- The candidate responds with `POST /candidates/me/applications/:applicationId/offer-response`
  (`response: accept | decline`, optional `note`). Only the candidate's response records acceptance;
  a recruiter cannot mark an offer as accepted.
- **Hiring needs an accepted offer.** `→ hired` returns `409` unless `offer.status === "accepted"`.
  `interview → hired` is still an invalid transition (`INVALID_TRANSITION`).
- Every change is compare-and-set on the application document and records `statusHistory` with
  `fromStatus`. Placement creation uses only the recorded offer data (`$setOnInsert`).

Offer states (`application.offer.status`): `none | issued | accepted | declined`.

## Recruiter views

- The applicant detail page shows the offer panel (`client/src/components/hiring/OfferPanels.jsx`).
  "Issue offer" appears at interview stage, or at offer stage after a decline. "Mark as Hired" appears
  only after the candidate accepts. The hire still goes through the confirmation dialog and the server check.
- The recruiter's candidate view includes the phone number and current employment only when the candidate
  has shared them (see privacy defaults).

## Candidate privacy and employment

Defaults are closed. A profile is created with:

| Setting | Default | Effect |
| --- | --- | --- |
| `privacy.sharePhoneWithRecruiters` | `false` | Phone number is hidden from recruiters. |
| `privacy.shareCurrentEmployment` | `false` | Current employment is hidden from recruiters. |
| `currentEmployment.disclosed` | `false` | Employment details are not stored for sharing. |
| `employmentStatus` | `unspecified` | Nothing is inferred from this value. |

- Partial updates keep sibling settings. Changes to privacy settings are audited (`candidate.privacy_updated`).
- Organization placement lists hide the candidate phone number unless it is shared.
- The candidate controls the profile page toggles in `client/src/components/hiring/CandidatePrivacyPanel.jsx`.

## Evidence labels

Placement and hiring facts are returned with a per-fact `evidence` label. Nothing is inferred
from one fact to another.

| Fact | Source label | Meaning |
| --- | --- | --- |
| `hiredByCompany` | `organization_reported` | The company marked the application as hired. |
| `offerAccepted` | `candidate_reported` | The candidate accepted the offer. Legacy placements show "not recorded". |
| `joiningReported` | `candidate_reported` | The candidate reported joining. This is separate from the company's hire record. |
| `employmentConfirmed` | `platform_verified` | Set only by an independent platform verification. Never derived from hire or joining. |

The helper is `server/domain/candidatePipeline.js` (`employmentEvidence`, `recruiterCandidateView`,
`canIssueOffer`, `canRespondToOffer`, `canHire`).

## Endpoints added or changed

- `POST /organizations/:organizationId/applications/:applicationId/offer` (new).
- `POST /candidates/me/applications/:applicationId/offer-response` (new).
- `POST /organizations/:organizationId/applications/:applicationId/transitions`: `→ offer` now
  returns `OFFER_USE_OFFER_ENDPOINT`; `→ hired` requires an accepted offer.
- `PATCH /candidates/me/profile`: accepts `employmentStatus`, `currentEmployment`, `jobPreferences`, `privacy`.
- Placement list responses (candidate and organization) include `evidence`.

## Tests

- `server/test/candidatePipeline.unit.test.js`: pure rules (offer gating, hire gating, privacy view, evidence labels).
- `server/test/candidatePipeline.test.js`: database flow (issue, accept, decline, reissue, hire gate, privacy
  redaction, cross-organization access). Requires MongoDB, so it runs in CI.
- `server/test/v1Workflow.test.js`: the hiring chain now goes through offer, accept, then hire.
- `client/src/components/hiring/*.test.jsx`: offer and privacy panels.
