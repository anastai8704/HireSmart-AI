import { describe, expect, it } from "vitest";
import {
  fmtInr,
  fmtIst,
  MODE_LABELS,
  rangeParams,
  SOURCE_LABELS,
  VERIFICATION_LABELS,
} from "./revenueFormat";

describe("revenue display helpers", () => {
  it("formats rupees with Indian grouping and no false precision", () => {
    expect(fmtInr(1000)).toBe("₹1,000");
    expect(fmtInr(1234.5)).toBe("₹1,234.5");
    expect(fmtInr(null)).toBe("—");
  });

  it("labels sandbox records so they cannot read as real charges", () => {
    expect(MODE_LABELS.simulation).toMatch(/Sandbox/);
    expect(VERIFICATION_LABELS.sandbox_excluded).toMatch(/Sandbox/);
  });

  it("shows reported sources in words, never as a verified claim", () => {
    expect(SOURCE_LABELS.candidate_reported).toBe("Reported by candidate");
    expect(SOURCE_LABELS.platform_reported).toBe("Platform");
  });

  it("formats instants in Asia/Kolkata", () => {
    // 2026-10-01T20:00:00Z is 2026-10-02 01:30 IST.
    expect(fmtIst("2026-10-01T20:00:00Z")).toMatch(/02 Oct 2026/);
    expect(fmtIst("not a date")).toBe("—");
  });

  it("builds range params and refuses an incomplete custom range", () => {
    expect(rangeParams({ preset: "7d" })).toEqual({ range: "7d" });
    expect(rangeParams({ preset: "custom", from: "2026-09-01", to: "2026-09-30" })).toEqual({
      range: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(rangeParams({ preset: "custom", from: "", to: "" })).toBeNull();
  });
});
