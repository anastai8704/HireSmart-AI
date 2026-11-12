// Requirement 10: Asia/Kolkata display, DD MMM YYYY dates, explicit AM/PM, correct datetime-local -> UTC,
// and day boundaries that follow IST rather than the browser zone.
import { describe, expect, it } from "vitest";
import { dayKey, formatDate, formatDateTime, formatTime, istDayBounds, istHour } from "./utils";
import { formatInZone, toZonedLocalInput, zonedLocalToUtc } from "./interviewWorkflow";

describe("Asia/Kolkata display", () => {
  it("formats dates as DD MMM YYYY with a zero-padded day", () => {
    expect(formatDate("2026-11-05T12:00:00Z")).toBe("05 Nov 2026");
    expect(formatDate("2026-09-08T10:00:00Z")).toBe("08 Sep 2026");
  });

  it("always shows AM or PM and renders midnight and noon correctly", () => {
    expect(formatTime("2026-11-20T04:30:00Z")).toBe("10:00 AM");
    expect(formatTime("2026-11-20T06:30:00Z")).toBe("12:00 PM");
    expect(formatTime("2026-11-19T18:30:00Z")).toBe("12:00 AM");
    expect(formatTime("2026-11-20T09:45:00Z")).toBe("03:15 PM");
  });

  it("combines date and time in IST", () => {
    expect(formatDateTime("2026-11-20T04:30:00Z")).toBe("20 Nov 2026, 10:00 AM");
  });

  it("uses the requested zone when one is given", () => {
    expect(formatTime("2026-11-20T04:30:00Z", "UTC")).toBe("04:30 AM");
  });

  it("returns a dash for missing or invalid values, never 'Invalid Date'", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("garbage")).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
  });

  it("gives the same wall clock regardless of DST in other zones (IST has no DST)", () => {
    // Instants either side of US and EU DST changes, all 10:00 AM in IST on the given day.
    expect(formatTime("2026-03-08T04:30:00Z")).toBe("10:00 AM");
    expect(formatTime("2026-03-29T04:30:00Z")).toBe("10:00 AM");
    expect(formatTime("2026-10-25T04:30:00Z")).toBe("10:00 AM");
    expect(formatTime("2026-07-01T04:30:00Z")).toBe("10:00 AM");
  });
});

describe("day boundaries follow IST", () => {
  it("23:30 UTC is already the next IST day", () => {
    expect(dayKey("2026-11-20T23:30:00Z")).toBe("2026-11-21");
    expect(dayKey("2026-11-20T18:29:00Z")).toBe("2026-11-20");
  });

  it("'today' runs from IST midnight to the next IST midnight", () => {
    const now = new Date("2026-11-20T20:00:00Z"); // 21 Nov 01:30 IST
    const { start, end } = istDayBounds(now);
    expect(start.toISOString()).toBe("2026-11-20T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-11-21T18:30:00.000Z");
    expect(now >= start && now < end).toBe(true);
  });

  it("istHour reads the hour in Asia/Kolkata", () => {
    expect(istHour(new Date("2026-11-20T04:30:00Z"))).toBe(10);
    expect(istHour(new Date("2026-11-19T18:30:00Z"))).toBe(0);
  });
});

describe("datetime-local to UTC conversion", () => {
  it("converts an IST wall clock to the correct UTC instant", () => {
    expect(zonedLocalToUtc("2026-11-20T10:00", "Asia/Kolkata").toISOString()).toBe("2026-11-20T04:30:00.000Z");
  });

  it("does not depend on the browser zone (the same result for any process TZ)", () => {
    // Asia/Kolkata has a fixed +05:30 offset, so this holds whatever the machine's zone is.
    expect(zonedLocalToUtc("2026-03-08T09:15", "Asia/Kolkata").toISOString()).toBe("2026-03-08T03:45:00.000Z");
  });

  it("round-trips: a stored instant is shown as the same wall clock it was entered as", () => {
    const utc = zonedLocalToUtc("2026-11-20T15:30", "Asia/Kolkata");
    expect(toZonedLocalInput(utc, "Asia/Kolkata")).toBe("2026-11-20T15:30");
  });

  it("applies the interview's own timezone, not the default, when it is set", () => {
    // 10:00 in New York (EST, UTC-5 in November) is 15:00 UTC.
    expect(zonedLocalToUtc("2026-11-20T10:00", "America/New_York").toISOString()).toBe("2026-11-20T15:00:00.000Z");
  });

  it("returns null for malformed input, never a guessed instant", () => {
    expect(zonedLocalToUtc("20/11/2026 10:00", "Asia/Kolkata")).toBeNull();
    expect(zonedLocalToUtc("2026-11-20T10:00", "Not/AZone")).toBeNull();
  });
});

describe("interview display", () => {
  it("formatInZone shows AM/PM and the IST label by default", () => {
    expect(formatInZone("2026-11-20T04:30:00Z")).toBe("20 Nov 2026, 10:00 AM IST");
  });

  it("formatInZone names a non-IST interview zone", () => {
    expect(formatInZone("2026-11-20T04:30:00Z", "UTC")).toBe("20 Nov 2026, 04:30 AM UTC");
  });

  it("formatInZone says Not scheduled for a missing time", () => {
    expect(formatInZone(null)).toBe("Not scheduled");
  });
});
