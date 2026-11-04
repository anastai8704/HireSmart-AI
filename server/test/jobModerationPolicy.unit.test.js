// Pure job moderation rules (Phase 3). No database: the HTTP and concurrency behaviour is covered by
// test/jobModeration.test.js, which runs in CI against MongoDB.
const assert = require("node:assert/strict");
const test = require("node:test");
const policy = require("../domain/jobModerationPolicy");

const verified = { verificationStatus: "verified" };
const reviewer = "66a000000000000000000001";
const recruiter = "66a000000000000000000002";
const live = (moderation, extra = {}) => ({
  status: "published",
  recruiter,
  description: "A complete job description with enough text to pass.",
  requiredSkills: ["Node.js"],
  moderation: { status: moderation },
  ...extra,
});
const decide = (job, action, extra = {}) =>
  policy.evaluateDecision({ job, action, org: verified, actorId: reviewer, isReviewerConflict: false, reason: "Clear reason", ...extra });

test("a pending listing can be approved, rejected or sent back for changes", () => {
  assert.equal(decide(live("pending"), "approve").ok, true);
  assert.equal(decide(live("pending"), "reject").to, "rejected");
  assert.equal(decide(live("pending"), "request_changes").to, "changes_requested");
});

test("a live listing can be suspended, and a suspended listing reinstated", () => {
  assert.equal(decide(live("approved"), "suspend").to, "suspended");
  assert.equal(decide(live("suspended"), "reinstate").to, "approved");
});

test("invalid transitions are refused with a stable code", () => {
  assert.equal(decide(live("pending"), "suspend").code, "INVALID_TRANSITION", "a pending job cannot be suspended");
  assert.equal(decide(live("approved"), "reinstate").code, "ALREADY_DECIDED", "an approved job is already in the reinstated state");
  assert.equal(decide(live("rejected"), "approve").code, "INVALID_TRANSITION");
  assert.equal(decide(live("changes_requested"), "reject").code, "INVALID_TRANSITION");
  // Admin takedown of an approved listing is allowed and records approved as the source state.
  assert.equal(decide(live("approved"), "reject").to, "rejected");
  assert.equal(decide(live("approved"), "reject").from, "approved");
  assert.equal(decide(live("approved"), "request_changes").code, "INVALID_TRANSITION");
});

test("a repeated decision is reported as already decided, not as a new change (duplicate requests)", () => {
  const approved = decide(live("approved"), "approve");
  assert.equal(approved.code, "ALREADY_DECIDED");
  assert.equal(decide(live("rejected"), "reject").code, "ALREADY_DECIDED");
  assert.equal(decide(live("suspended"), "suspend").code, "ALREADY_DECIDED");
});

test("rejecting, requesting changes and suspending need a reason of at least 3 characters", () => {
  for (const action of ["reject", "request_changes", "suspend"]) {
    const source = action === "suspend" ? "approved" : "pending";
    assert.equal(decide(live(source), action, { reason: "  a " }).code, "REASON_REQUIRED", action);
    assert.equal(decide(live(source), action, { reason: "" }).code, "REASON_REQUIRED", action);
  }
  assert.equal(decide(live("pending"), "approve", { reason: "" }).ok, true, "approval needs no reason");
});

test("an unverified company blocks approval and reinstatement only", () => {
  const notVerified = { org: { verificationStatus: "under_review" } };
  assert.equal(decide(live("pending"), "approve", notVerified).code, "COMPANY_NOT_VERIFIED");
  assert.equal(decide(live("suspended"), "reinstate", { org: { verificationStatus: "suspended" } }).code, "COMPANY_NOT_VERIFIED");
  assert.equal(decide(live("pending"), "reject", notVerified).ok, true, "rejecting is always allowed");
  assert.equal(decide(live("approved"), "suspend", notVerified).ok, true, "suspending is always allowed");
});

test("a reviewer from the company, or the job's own recruiter, cannot decide on it", () => {
  assert.equal(decide(live("pending"), "approve", { isReviewerConflict: true }).code, "REVIEWER_CONFLICT");
  assert.equal(decide(live("pending"), "approve", { actorId: recruiter }).code, "REVIEWER_CONFLICT");
});

test("closed and draft jobs are not moderated", () => {
  assert.equal(decide(live("pending", { status: "closed" }), "approve").code, "JOB_CLOSED");
  assert.equal(decide(live("none", { status: "draft" }), "approve").code, "JOB_NOT_SUBMITTED");
});

test("an incomplete job cannot be approved", () => {
  assert.equal(decide(live("pending", { description: "short" }), "approve").code, "JOB_INCOMPLETE");
});

test("a suspended job with an edit is reinstated first, then its edit is reviewed as a change", () => {
  const suspendedWithEdit = live("suspended", { pendingChanges: { status: "pending", fields: { title: "New title" } } });
  const reinstated = decide(suspendedWithEdit, "reinstate");
  assert.equal(reinstated.ok, true, JSON.stringify(reinstated));
  assert.equal(reinstated.target, "listing");
  assert.equal(reinstated.to, "approved");
});

test("a pending change is reviewed as a change, and only approved or rejected", () => {
  const withChange = live("approved", {
    pendingChanges: { status: "pending", fields: { title: "New title" } },
  });
  const approved = decide(withChange, "approve");
  assert.equal(approved.ok, true);
  assert.equal(approved.target, "changes");
  assert.equal(approved.to, "approved");
  assert.equal(decide(withChange, "reject").to, "rejected");
  assert.equal(decide(withChange, "suspend").code, "INVALID_TRANSITION");
});

test("the review predicate matches a published job that needs review, and nothing else", () => {
  const expr = policy.needsReviewExpr((path) => `$${path}`);
  const text = JSON.stringify(expr);
  assert.ok(text.includes('"$status"') && text.includes('"published"'), "only published jobs need review");
  assert.ok(text.includes('"$moderation.status"') && text.includes('"$pendingChanges.status"'));
});

test("unknown actions are refused", () => {
  assert.equal(decide(live("pending"), "delete").code, "INVALID_ACTION");
  const mapped = policy.decisionError({ code: "ALREADY_DECIDED", message: "x" });
  assert.equal(mapped.statusCode, 409);
  assert.equal(mapped.code, "ALREADY_DECIDED");
  assert.equal(policy.decisionError({ code: "REVIEWER_CONFLICT", message: "x" }).statusCode, 403);
  assert.equal(policy.BULK_ACTIONS.includes("suspend"), false, "bulk covers approve and reject only");
});
