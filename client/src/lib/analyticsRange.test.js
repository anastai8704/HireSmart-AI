import { describe, expect, it } from "vitest";
import { istToday, validateCustomRange } from "./analyticsRange";

describe("validateCustomRange", () => {
  const today = "2026-11-05";
  it("accepts a valid inclusive range", () => {
    expect(validateCustomRange("2026-10-01", "2026-10-31", today)).toBeNull();
  });
  it("asks for both dates", () => {
    expect(validateCustomRange("", "2026-10-31", today)).toMatch(/both a start and an end/);
  });
  it("refuses reversed dates", () => {
    expect(validateCustomRange("2026-11-01", "2026-10-01", today)).toMatch(/on or before/);
  });
  it("caps the span at 366 days", () => {
    expect(validateCustomRange("2025-01-01", "2026-11-05", today)).toMatch(/at most 366/);
    expect(validateCustomRange("2025-11-05", "2026-11-05", today)).toBeNull();
  });
  it("refuses future end dates", () => {
    expect(validateCustomRange("2026-11-01", "2026-11-06", today)).toMatch(/future/);
  });
});

describe("istToday", () => {
  it("uses the IST calendar day, not UTC", () => {
    expect(istToday(new Date("2026-11-05T18:45:00Z"))).toBe("2026-11-06");
    expect(istToday(new Date("2026-11-05T18:00:00Z"))).toBe("2026-11-05");
  });
});
