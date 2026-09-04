const mongoose = require("mongoose");
const AppError = require("./AppError");
const parse = (query, max = 100) => {
  const limit = Number(query.limit || query["page[limit]"] || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > max)
    throw new AppError(`limit must be an integer between 1 and ${max}`, 422, "INVALID_PAGINATION");
  const after = query.after || query["page[after]"];
  if (after && !mongoose.isValidObjectId(after))
    throw new AppError("after cursor is invalid", 422, "INVALID_CURSOR");
  return { limit, after };
};
const applyCursor = (filter, after) => (after ? { ...filter, _id: { $lt: after } } : filter);
const meta = (items, limit) => ({
  count: items.length,
  hasMore: items.length === limit,
  nextCursor: items.length === limit ? String(items[items.length - 1]._id) : null,
});
module.exports = { parse, applyCursor, meta };
