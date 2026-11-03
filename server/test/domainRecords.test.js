// Phase 1: database-level guarantees (indexes, uniqueness, append-only history, protected deletes).
// Runs against the test database (CI service container).
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const { CompanyVerificationCase } = require("../models/CompanyVerificationCase");
const { JobModerationEvent } = require("../models/JobModerationEvent");
const { ALLOW_HARD_DELETE } = require("../models/plugins/protectRecords");

const oid = () => new mongoose.Types.ObjectId();

test.before(async () => {
  await startDatabase();
});

test.after(async () => {
  await stopDatabase();
});

test("the open-case index is unique per organization and partial to open statuses", async () => {
  await clearDatabase();
  await CompanyVerificationCase.createIndexes();
  const indexes = await CompanyVerificationCase.collection.indexes();
  const openCaseIndex = indexes.find((index) => index.name === "organization_1");
  assert.ok(openCaseIndex, "organization index exists");
  assert.equal(openCaseIndex.unique, true);
  assert.deepEqual(openCaseIndex.partialFilterExpression, { status: { $in: ["pending", "under_review"] } });
});

test("a duplicate open case for the same company is rejected; a closed one does not block a new case", async () => {
  await clearDatabase();
  await CompanyVerificationCase.createIndexes();
  const organization = oid();

  const first = await CompanyVerificationCase.create({ organization });
  await assert.rejects(
    () => CompanyVerificationCase.create({ organization }),
    (error) => error.code === 11000,
  );

  // Close the first case with a reason; a new open case is then allowed.
  first.status = "rejected";
  first.decision = { reason: "Registration number does not match" };
  await first.save();
  const second = await CompanyVerificationCase.create({ organization });
  assert.equal(second.status, "pending");
});

test("verification cases cannot be hard-deleted, and an explicit override removes them", async () => {
  await clearDatabase();
  await CompanyVerificationCase.createIndexes();
  const created = await CompanyVerificationCase.create({ organization: oid() });

  await assert.rejects(
    () => CompanyVerificationCase.deleteOne({ _id: created._id }).exec(),
    (error) => error.code === "RECORD_PROTECTED",
  );
  assert.equal(await CompanyVerificationCase.countDocuments({ _id: created._id }), 1);

  const result = await CompanyVerificationCase.deleteOne({ _id: created._id })
    .setOptions({ [ALLOW_HARD_DELETE]: true })
    .exec();
  assert.equal(result.deletedCount, 1);
});

test("job moderation history is append-only in the database", async () => {
  await clearDatabase();
  await JobModerationEvent.createIndexes();
  const event = await JobModerationEvent.create({
    job: oid(),
    organization: oid(),
    actor: oid(),
    area: "moderation",
    fromStatus: "",
    toStatus: "pending",
    reason: "Submitted for review",
  });

  await assert.rejects(
    () => JobModerationEvent.updateOne({ _id: event._id }, { reason: "rewritten" }).exec(),
    (error) => error.code === "RECORD_IMMUTABLE",
  );
  const stored = await JobModerationEvent.findById(event._id).lean();
  assert.equal(stored.reason, "Submitted for review", "history is unchanged");

  await assert.rejects(
    () => JobModerationEvent.deleteOne({ _id: event._id }).exec(),
    (error) => error.code === "RECORD_PROTECTED",
  );
  assert.equal(await JobModerationEvent.countDocuments({ _id: event._id }), 1);
});
