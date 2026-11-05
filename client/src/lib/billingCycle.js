// Billing-cycle helpers for the membership pages. Yearly is offered only where the server has a yearly price
// (`yearlyPriceInr` in config/subscriptionPlans.js). A plan without one shows no yearly price, never a monthly one.

export const hasYearlyPrice = (plans = []) => plans.some((p) => Number(p?.yearlyPriceInr) > 0);

export const cycleAvailable = (plan, cycle) => cycle !== "yearly" || Number(plan?.yearlyPriceInr) > 0;

export const priceForCycle = (plan, cycle) =>
  cycle === "yearly" ? Number(plan?.yearlyPriceInr) : Number(plan?.priceInr);

/** Price text for display. "—" when the plan has no price for the chosen cycle. */
export const displayPrice = (plan, cycle) => {
  if (!cycleAvailable(plan, cycle)) return "—";
  return `₹${priceForCycle(plan, cycle).toLocaleString("en-IN")}`;
};

export const cycleSuffix = (cycle) => (cycle === "yearly" ? "year" : "month");
