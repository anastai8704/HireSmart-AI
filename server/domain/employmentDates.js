// Validation of employment-status dates (Requirement 9). Pure: the controller supplies the existing start date.
const AppError = require("../utils/AppError");

/**
 * Parses an optional client date. Empty means "not supplied" (the caller decides a default).
 * Rejects anything that is not a real date, so an invalid string never reaches the database.
 */
const parseOptionalDate = (value, field) => {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${field} must be a valid date`, 422, "INVALID_DATE");
  }
  return date;
};

/**
 * An employment period cannot end before it starts. `start` is the supplied start date, or the stored one.
 */
const assertEmploymentRange = (start, end) => {
  if (start && end && end.getTime() < start.getTime()) {
    throw new AppError("endDate cannot be before startDate", 422, "INVALID_DATE_RANGE");
  }
};

module.exports = { parseOptionalDate, assertEmploymentRange };
