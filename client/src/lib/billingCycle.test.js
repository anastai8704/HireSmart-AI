import { describe, it, expect } from "vitest";
import { hasYearlyPrice, cycleAvailable, displayPrice, cycleSuffix } from "./billingCycle";

const plusNoYearly = { priceInr: 149, yearlyPriceInr: null };
const plusYearly = { priceInr: 149, yearlyPriceInr: 1490 };

describe("billing cycle helpers", () => {
  it("shows the yearly option only when at least one plan has a yearly price", () => {
    expect(hasYearlyPrice([plusNoYearly])).toBe(false);
    expect(hasYearlyPrice([plusNoYearly, plusYearly])).toBe(true);
    expect(hasYearlyPrice([])).toBe(false);
  });

  it("never shows a monthly price as a yearly price", () => {
    expect(cycleAvailable(plusNoYearly, "yearly")).toBe(false);
    expect(displayPrice(plusNoYearly, "yearly")).toBe("—");
    expect(displayPrice(plusNoYearly, "monthly")).toBe("₹149");
  });

  it("formats the chosen cycle's price in en-IN style", () => {
    expect(displayPrice({ priceInr: 2499, yearlyPriceInr: 24990 }, "yearly")).toBe("₹24,990");
    expect(cycleSuffix("yearly")).toBe("year");
    expect(cycleSuffix("monthly")).toBe("month");
  });
});
