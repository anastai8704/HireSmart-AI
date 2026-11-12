// Billing attempt state for the plan badges (Requirement 17). The entitlement says what is in force;
// this says whether a payment is in progress or has failed since the last successful capture.
// A checkout that never finished is not "pending" forever: it counts for PENDING_WINDOW_MS only.
const PENDING_WINDOW_MS = 30 * 60 * 1000;

/**
 * @param {object} input
 * @param {Date|null} input.initiatedAt  creation time of the latest initiated (unfinished) checkout
 * @param {*} input.failedId             _id of the latest failed attempt (ObjectIds sort by time)
 * @param {*} input.capturedId           _id of the latest captured or refunded payment
 * @param {Date} input.now
 */
const billingStateFrom = ({ initiatedAt = null, failedId = null, capturedId = null, now = new Date() }) => {
  const pendingCheckout = Boolean(initiatedAt) && now.getTime() - new Date(initiatedAt).getTime() <= PENDING_WINDOW_MS;
  const lastPaymentFailed = Boolean(failedId) && (!capturedId || String(failedId) > String(capturedId));
  return { pendingCheckout, lastPaymentFailed };
};

module.exports = { billingStateFrom, PENDING_WINDOW_MS };
