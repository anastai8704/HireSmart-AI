# Project audit: moderation count discrepancy (Phase 3)

This section records the investigation of the reported symptom: the moderation page showed a pending count of
zero while a company card was visible. It covers only the moderation area. The full project audit requested in
the Master Prompt (architecture, features, security review) is not part of this document yet.

## What was checked

| Layer | Finding |
| --- | --- |
| Database records | Pending is defined by `moderation.status` **or** `pendingChanges.status`. Publishing sets `status: "published"` and `moderation.status: "pending"`. |
| Job moderation status | Closed and draft jobs could carry a pending listing or a pending change and were still counted. |
| Company verification | Bulk approval required a verified company, but the count did not, so a count could include jobs that could never be approved. |
| API query filters | The company list was filtered on the company, not on the job; the job preview was not. |
| Aggregation | The summary `$lookup` returned jobs, but the `$project` dropped them. The page then built its job preview from a legacy list capped at 50 jobs. |
| Pagination | The legacy pending list had `limit 50` and no total. Cards that depended on it could show a count with no jobs, or no count with jobs. |
| Frontend state | The page showed the company card from the summary, and its job list from a separate query. The loading check used `&&` where `||` was intended. |
| Count calculation | The company header summed the cards' pending counts, and the cards used the summary. Both were consistent with each other but not with the records. |

## Confirmed causes

1. **Draft edits created pending changes.** `updateJob` saved a draft's edits, then did not return, and went on to write
   `pendingChanges.status = "pending"`. Drafts were then counted as pending. Fixed: the handler returns after a
   direct save. `moderation-drift-report.js` clears the stale records.
2. **Closed jobs counted but not eligible.** A job closed while pending stayed in the pending count, but bulk
   approval excluded closed jobs. Fixed: the count, the queue and the bulk action share one predicate.
3. **Job previews depended on a 50-item legacy list.** Fixed: the summary now returns its own preview of up to three
   jobs that need review.
4. **Recruiter dashboard counted pending by listing only**, so it disagreed with the admin queue when a live job had a
   pending change. Fixed: it uses the shared predicate.

## Not confirmed

I did not have access to the production database, so I could not reproduce the exact state where the header
showed **zero** with a card visible. The code paths above can produce a mismatch, but I have not proven which one
produced that screen. The drift report (`server/scripts/moderation-drift-report.js`) is read-only and shows the
records behind each mismatch. Run it against the affected database to confirm the cause for that data.

## Resolution

- One predicate (`needsReviewExpr`) drives every pending count, queue and bulk action.
- Cards show the same records their action applies to.
- The job preview comes from the summary, not from a separate capped list.
- Stale proposals are repaired by the drift script, after a dry run.
- Tests: `test/jobModeration.test.js` ("counts and queues agree", "drafts: editing a draft does not create a pending change").
