// Phase 9 unit tests: notification catalog, channel rules, and audit-entry sanitisation.
// No database and no network. Runs locally and in CI.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "unit_test_only_jwt_secret_0123456789abcdef0123456789";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const catalog = require("../config/notificationTypes");
const { resolveChannels } = require("../services/notificationService");
const { buildAuditEntry } = require("../services/auditService");

// Every event type the Phase 9 code emits, with the role it is delivered to.
const EMITTED = [
  ["company_verification_submitted", "admin"],
  ["company_verification", "recruiter"],
  ["job_moderation", "recruiter"],
  ["job_changes_submitted", "admin"],
  ["application_acknowledged", "candidate"],
  ["new_application", "recruiter"],
  ["application_status_changed", "candidate"],
  ["interview_invitation", "candidate"],
  ["interview_rescheduled", "candidate"],
  ["interview_cancelled", "candidate"],
  ["offer_issued", "candidate"],
  ["joining_status_updated", "recruiter"],
  ["subscription_activated", "recruiter"],
  ["subscription_activated", "candidate"],
  ["subscription_renewed", "recruiter"],
  ["subscription_expiring", "recruiter"],
  ["subscription_expiring", "candidate"],
  ["subscription_expiring_7d", "recruiter"],
  ["subscription_expiring_7d", "candidate"],
  ["subscription_expiring_1d", "recruiter"],
  ["subscription_expiring_1d", "candidate"],
  ["subscription_expired", "recruiter"],
  ["subscription_expired", "candidate"],
  ["subscription_payment_failed", "recruiter"],
  ["subscription_halted", "recruiter"],
  ["subscription_cancelled", "recruiter"],
  ["refund_processed", "recruiter"],
  ["refund_processed", "candidate"],
  ["security_alert", "candidate"],
  ["security_alert", "admin"],
];

test("every emitted notification type exists in the catalog for the role that receives it", () => {
  const missing = EMITTED.filter(([type, role]) => !catalog.viewFor(type, role)).map((pair) => pair.join("/"));
  assert.deepEqual(missing, [], `types missing from config/notificationTypes.js: ${missing.join(", ")}`);
});

test("every catalog view belongs to a preference group that is shown to that role", () => {
  const problems = [];
  for (const [type, views] of Object.entries(catalog.EVENTS)) {
    for (const [role, view] of Object.entries(views)) {
      const groups = (catalog.GROUPS[role] || []).map(([key]) => key);
      if (!groups.includes(view.group)) problems.push(`${type}/${role} -> ${view.group}`);
      if (!view.label || !view.description) problems.push(`${type}/${role} has no label`);
    }
  }
  assert.deepEqual(problems, []);
});

test("billing events appear in the preference template for candidates and recruiters", () => {
  for (const role of ["candidate", "recruiter"]) {
    const billing = catalog.templateForRole(role).find((group) => group.key === "billing");
    assert.ok(billing, `${role} has a billing group`);
    const keys = billing.events.map((event) => event.key);
    for (const type of ["subscription_activated", "subscription_expiring", "subscription_expiring_7d", "subscription_expiring_1d", "subscription_expired", "subscription_payment_failed", "refund_processed"]) {
      assert.ok(keys.includes(type), `${role} billing includes ${type}`);
    }
  }
});

test("security events are always delivered, whatever the preferences say", () => {
  const off = { events: { security_alert: { inApp: false, email: false } }, security: { inApp: false, email: false } };
  assert.deepEqual(resolveChannels("security_alert", "candidate", off), { inApp: true, email: true });
  assert.deepEqual(resolveChannels("security_alert", "admin", off), { inApp: true, email: true });
});

test("a user can opt out of a billing email without losing the in-app item", () => {
  const prefs = { events: { subscription_renewed: { inApp: true, email: false } } };
  assert.deepEqual(resolveChannels("subscription_renewed", "recruiter", prefs), { inApp: true, email: false });
  const silent = { events: { subscription_payment_failed: { inApp: false, email: false } } };
  assert.deepEqual(resolveChannels("subscription_payment_failed", "recruiter", silent), {
    inApp: false,
    email: false,
  });
});

test("catalog defaults apply when the user has no preference for a new event", () => {
  assert.deepEqual(resolveChannels("subscription_payment_failed", "recruiter", null), { inApp: true, email: true });
  assert.deepEqual(resolveChannels("subscription_renewed", "recruiter", null), { inApp: true, email: false });
  assert.deepEqual(resolveChannels("joining_status_updated", "recruiter", {}), { inApp: true, email: false });
});

// ---- audit entries ----------------------------------------------------------------------------------------------
const req = { user: { _id: new mongoose.Types.ObjectId() }, id: "req-1" };

test("audit entries drop credentials, tokens and payment secrets at any depth", () => {
  const entry = buildAuditEntry({
    req,
    action: "subscription.upgrade",
    resourceType: "subscription",
    resourceId: "abc",
    metadata: {
      planTier: "pro",
      password: "hunter2hunter2",
      payment: { razorpay_signature: "SIG-VALUE-7731", key_secret: "SECRET-VALUE-9042", razorpay_payment_id: "pay_1" },
      headers: { authorization: "Bearer a.b.c", cookie: "hiresmart_refresh=x" },
    },
    previousState: { status: "active", refreshToken: "r.t.k" },
    newState: { status: "expired", apiKey: "k-value-5521" },
  });
  const serialised = JSON.stringify(entry);
  for (const secret of ["hunter2hunter2", "SIG-VALUE-7731", "SECRET-VALUE-9042", "Bearer a.b.c", "hiresmart_refresh=x", "r.t.k", "k-value-5521"]) {
    assert.equal(serialised.includes(secret), false, `audit entry leaked ${secret}`);
  }
  assert.equal(entry.metadata.planTier, "pro");
  // Payment ids are identifiers, not secrets, and are kept for reconciliation.
  assert.equal(entry.metadata.payment.razorpay_payment_id, "pay_1");
  assert.equal(entry.previousState.status, "active");
  assert.equal(entry.newState.status, "expired");
});

test("audit entries record actor, action, resource, outcome, previous and new state, and reason", () => {
  const entry = buildAuditEntry({
    req,
    organization: new mongoose.Types.ObjectId(),
    action: "admin.user_suspended",
    resourceType: "user",
    resourceId: "u1",
    previousState: { accountStatus: "active" },
    newState: { accountStatus: "suspended" },
    reason: "Repeated abuse reports",
  });
  assert.equal(String(entry.actor), String(req.user._id));
  assert.equal(entry.action, "admin.user_suspended");
  assert.equal(entry.resourceType, "user");
  assert.equal(entry.resourceId, "u1");
  assert.equal(entry.outcome, "success");
  assert.equal(entry.requestId, "req-1");
  assert.deepEqual(entry.previousState, { accountStatus: "active" });
  assert.deepEqual(entry.newState, { accountStatus: "suspended" });
  assert.equal(entry.reason, "Repeated abuse reports");
});

test("audit reasons are bounded, and absent state is not stored", () => {
  const entry = buildAuditEntry({ action: "x", resourceType: "y", reason: "r".repeat(5000) });
  assert.equal(entry.reason.length, 1000);
  assert.equal("previousState" in entry, false);
  assert.equal("newState" in entry, false);
  assert.equal(entry.actor, null);
});
