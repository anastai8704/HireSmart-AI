import { describe, expect, it } from "vitest";

import { formatJobSalary, formatSalary } from "./utils";

describe("formatSalary", () => {
  it("formats Indian salary bands", () => {
    expect(formatSalary(600000)).toBe("\u20b96.00 L");
    expect(formatSalary(12000000)).toBe("\u20b91.20 Cr");
    expect(formatSalary(45000)).toBe("\u20b945,000");
  });

  it("treats zero and missing as undisclosed, never \u20b90", () => {
    expect(formatSalary(0)).toBe("Not disclosed");
    expect(formatSalary(null)).toBe("Not disclosed");
    expect(formatSalary(undefined)).toBe("Not disclosed");
  });
});

describe("formatJobSalary", () => {
  it("shows a range when compensation min/max differ", () => {
    const job = { compensation: { min: 400000, max: 600000 } };
    expect(formatJobSalary(job)).toBe("\u20b94.00 L \u2013 \u20b96.00 L");
  });

  it("collapses equal min/max to a single value", () => {
    const job = { compensation: { min: 500000, max: 500000 } };
    expect(formatJobSalary(job)).toBe("\u20b95.00 L");
  });

  it("falls back to the legacy single salary field", () => {
    expect(formatJobSalary({ salary: 500000 })).toBe("\u20b95.00 L");
    expect(formatJobSalary({ salary: 0, compensation: undefined })).toBeNull();
  });
});
