// Phase 1: model validation and record protection that do not need a database.
// Validation runs in memory; protection hooks reject before any database command is sent.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { CompanyVerificationCase } = require("../models/CompanyVerificationCase");
const { JobModerationEvent } = require("../models/JobModerationEvent");
const { Application } = require("../models/Application");
const { Placement } = require("../models/Placement");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { Subscription } = require("../models/Subscription");
const { ALLOW_HARD_DELETE } = require("../models/plugins/protectRecords");

const oid = () => new mongoose.Types.ObjectId();
const errorFor = (doc, path) => doc.validateSync()?.errors?.[path];

const caseDoc = (overrides = {}) =>
  new CompanyVerificationCase({ organization: oid(), ...overrides });

const evidence = { type: "business_email_domain", value: "acme.example", verified: true };

test("a new verification case starts pending with an unassessed record", () => {
  const doc = caseDoc();
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.status, "pending");
  assert.equal(doc.assessment, "unassessed");
});

test("a company cannot be verified without verified evidence", () => {
  assert.ok(errorFor(caseDoc({ status: "verified", assessment: "verified_evidence" }), "status"));
  assert.ok(errorFor(caseDoc({ status: "verified", assessment: "unavailable_evidence", evidence: [evidence] }), "status"));
  assert.equal(
    caseDoc({ status: "verified", assessment: "verified_evidence", evidence: [evidence] }).validateSync(),
    undefined,
  );
});

test("evidence that is not marked verified does not support verification", () => {
  const unverified = { ...evidence, verified: false };
  assert.ok(errorFor(caseDoc({ status: "verified", assessment: "verified_evidence", evidence: [unverified] }), "status"));
});

test("rejected and suspended companies need a recorded reason", () => {
  assert.ok(errorFor(caseDoc({ status: "rejected" }), "decision.reason"));
  assert.ok(errorFor(caseDoc({ status: "suspended", decision: { reason: "   " } }), "decision.reason"));
  assert.equal(
    caseDoc({ status: "rejected", decision: { reason: "Domain does not match registration" } }).validateSync(),
    undefined,
  );
});

test("evidence types are restricted and values are bounded", () => {
  assert.ok(errorFor(caseDoc({ evidence: [{ type: "social_security_number", value: "x" }] }), "evidence.0.type"));
  assert.ok(errorFor(caseDoc({ evidence: [{ type: "website", value: "x".repeat(501) }] }), "evidence.0.value"));
});

test("moderation events accept only valid lifecycle and moderation transitions", () => {
  const base = { job: oid(), organization: oid(), actor: oid() };
  assert.equal(
    new JobModerationEvent({ ...base, area: "lifecycle", fromStatus: "draft", toStatus: "published" }).validateSync(),
    undefined,
  );
  assert.equal(
    new JobModerationEvent({ ...base, area: "moderation", fromStatus: "", toStatus: "pending" }).validateSync(),
    undefined,
    "first moderation event starts from none",
  );
  assert.ok(
    errorFor(new JobModerationEvent({ ...base, area: "lifecycle", fromStatus: "closed", toStatus: "published" }), "toStatus"),
  );
  assert.ok(
    errorFor(new JobModerationEvent({ ...base, area: "moderation", fromStatus: "none", toStatus: "approved" }), "toStatus"),
  );
  assert.ok(errorFor(new JobModerationEvent({ ...base, area: "moderation", fromStatus: "bogus", toStatus: "pending" }), "fromStatus"));
});

test("hard delete of protected records is refused without an explicit override", async () => {
  const cases = [
    () => Application.deleteOne({}).exec(),
    () => Application.deleteMany({}).exec(),
    () => Application.findOneAndDelete({}).exec(),
    () => Placement.deleteOne({}).exec(),
    () => PaymentTransaction.deleteMany({}).exec(),
    () => Subscription.findOneAndDelete({}).exec(),
    () => new Application({}).deleteOne(),
  ];
  for (const attempt of cases) {
    await assert.rejects(attempt, (error) => error.code === "RECORD_PROTECTED" && error.statusCode === 409);
  }
});

test("the override option is visible to the guard", () => {
  const query = Application.deleteMany({}).setOptions({ [ALLOW_HARD_DELETE]: true });
  assert.equal(query.getOptions()[ALLOW_HARD_DELETE], true);
  assert.equal(Application.deleteMany({}).getOptions()[ALLOW_HARD_DELETE], undefined);
});

test("moderation history cannot be edited or deleted", async () => {
  const event = new JobModerationEvent({
    job: oid(),
    organization: oid(),
    actor: oid(),
    area: "lifecycle",
    fromStatus: "draft",
    toStatus: "published",
  });
  event.isNew = false;
  await assert.rejects(() => event.save(), (error) => error.code === "RECORD_IMMUTABLE");
  await assert.rejects(
    () => JobModerationEvent.updateOne({}, { reason: "rewritten" }).exec(),
    (error) => error.code === "RECORD_IMMUTABLE",
  );
  await assert.rejects(
    () => JobModerationEvent.deleteOne({}).exec(),
    (error) => error.code === "RECORD_PROTECTED",
  );
});
