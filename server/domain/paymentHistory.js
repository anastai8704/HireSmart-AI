// Payment history filters (Requirement 2). Pure functions so the rules are unit tested without a database.
const { istDayBounds } = require("../utils/istTime");

// Payment states shown to a subscriber. "initiated" (abandoned checkouts) is not history and is never listed.
const HISTORY_FILTERS = Object.freeze({
  all: Object.freeze(["captured", "refunded", "failed"]),
  captured: Object.freeze(["captured"]),
  refunded: Object.freeze(["refunded"]),
  failed: Object.freeze(["failed"]),
});

/** Statuses for a filter value. Unknown filters are rejected by the caller, never widened. */
const historyStatusesFor = (filter) => (filter ? HISTORY_FILTERS[filter] || null : HISTORY_FILTERS.all);

/**
 * Inclusive IST day range: `from` is the first IST day included, `to` the last. Returns null when a
 * supplied day is malformed or the range is reversed.
 * @returns {{start: Date|null, end: Date|null}|null}
 */
const historyWindow = ({ from, to } = {}) => {
  let start = null;
  let end = null;
  if (from) {
    const bounds = istDayBounds(from);
    if (!bounds) return null;
    start = bounds.start;
  }
  if (to) {
    const bounds = istDayBounds(to);
    if (!bounds) return null;
    end = bounds.end; // exclusive upper bound: the whole `to` day is included
  }
  if (start && end && end <= start) return null;
  return { start, end };
};

/** Mongo filter fragment for a window. Empty object when no bound was supplied. */
const createdAtFilter = (window) => {
  if (!window || (!window.start && !window.end)) return {};
  const range = {};
  if (window.start) range.$gte = window.start;
  if (window.end) range.$lt = window.end;
  return { createdAt: range };
};

// Fields a subscriber can search by: their own references (internal, invoice, gateway payment and order, subscription).
const SEARCH_FIELDS = Object.freeze(["transactionNumber", "invoiceNumber", "gatewayPaymentId", "gatewayOrderId", "providerSubscriptionId"]);
const MAX_SEARCH_LENGTH = 64;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Mongo filter for a free-text reference search. Literal, case-insensitive substring match: user input is escaped, so
 * it cannot form a pattern. Returns {} when no search term is given, and null when the term is too long.
 */
const searchFilter = (q) => {
  const term = String(q ?? "").trim();
  if (!term) return {};
  if (term.length > MAX_SEARCH_LENGTH) return null;
  const pattern = new RegExp(escapeRegex(term), "i");
  return { $or: SEARCH_FIELDS.map((field) => ({ [field]: pattern })) };
};

module.exports = { HISTORY_FILTERS, historyStatusesFor, historyWindow, createdAtFilter, searchFilter, SEARCH_FIELDS };
