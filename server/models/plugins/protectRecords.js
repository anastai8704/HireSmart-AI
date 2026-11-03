// Record protection for recruitment, billing and audit-relevant data (Phase 1).
//
// - protectRecords: blocks hard deletes unless the caller explicitly opts in with
//   `.setOptions({ allowHardDelete: true })`. Intended for maintenance scripts only; request
//   handlers must use a retention or status change instead.
// - appendOnly: blocks updates to existing documents (history records).
//
// Both hooks run before any database command, so a rejected operation never reaches MongoDB.

const AppError = require("../../utils/AppError");

const ALLOW_HARD_DELETE = "allowHardDelete";

const protectedError = () =>
  new AppError(
    "This record is protected and cannot be deleted. Use a status change or a retention process instead.",
    409,
    "RECORD_PROTECTED",
  );

const immutableError = () =>
  new AppError("This record is append-only and cannot be changed.", 409, "RECORD_IMMUTABLE");

const isHardDeleteAllowed = (query) =>
  typeof query.getOptions === "function" && query.getOptions()[ALLOW_HARD_DELETE] === true;

// Mongoose 9 hooks are async: they receive no `next` callback. Throwing rejects the operation.
function protectRecords(schema) {
  schema.pre(
    ["deleteOne", "deleteMany", "findOneAndDelete"],
    { query: true, document: false },
    async function guardQueryDelete() {
      if (!isHardDeleteAllowed(this)) throw protectedError();
    },
  );

  schema.pre("deleteOne", { document: true, query: false }, async function guardDocumentDelete() {
    throw protectedError();
  });
}

function appendOnly(schema) {
  schema.pre("save", async function guardSave() {
    if (!this.isNew) throw immutableError();
  });

  schema.pre(
    ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"],
    async function guardQueryUpdate() {
      throw immutableError();
    },
  );
}

module.exports = { protectRecords, appendOnly, ALLOW_HARD_DELETE };
