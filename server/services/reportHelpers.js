// Small query helpers shared by the report service. Kept separate so they can be unit-tested without models.
const ANALYTICS_TIMEZONE = "Asia/Kolkata";

/** Mongo match on a date field within a resolved range (start inclusive, end exclusive). */
const inRange = (field, range) => ({ [field]: { $gte: range.start, $lt: range.end } });

/** Day key in the reporting timezone (IST), matching the dashboard's day boundaries. */
const dayOf = (field) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: ANALYTICS_TIMEZONE } });

module.exports = { inRange, dayOf };
