/**
 * Recurring billing configuration (Razorpay Subscriptions).
 *
 * Prices come only from config/subscriptionPlans.js. A yearly price is NOT set by this code: a paid
 * plan can be bought yearly only when its `yearlyPriceInr` is set by the business. Until then the
 * yearly option is refused with YEARLY_PRICE_NOT_CONFIGURED.
 *
 * total_count is the number of billing cycles Razorpay will charge before the subscription completes.
 * It is a technical ceiling, not a commitment. The subscription can be cancelled at any time.
 */
const RECURRING = Object.freeze({
  monthly: Object.freeze({ period: "monthly", interval: 1, totalCount: 120 }),
  yearly: Object.freeze({ period: "yearly", interval: 1, totalCount: 10 }),
});

const BILLING_CYCLES = Object.freeze(Object.keys(RECURRING));

module.exports = { RECURRING, BILLING_CYCLES };
