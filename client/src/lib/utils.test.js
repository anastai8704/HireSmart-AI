import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatJobSalary,
  formatSalary,
  formatTime,
  generateIcsContent,
  isValidMeetingUrl,
} from "./utils";

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

describe("Interview Date, Time & Duration Helpers", () => {
  it("formats date, time, and duration accurately", () => {
    const start = new Date("2026-09-15T10:00:00Z");
    const end = new Date("2026-09-15T10:45:00Z");
    expect(formatDuration(start, end)).toBe("45 mins");

    const endHour = new Date("2026-09-15T11:00:00Z");
    expect(formatDuration(start, endHour)).toBe("1 hour");

    const endHourHalf = new Date("2026-09-15T11:30:00Z");
    expect(formatDuration(start, endHourHalf)).toBe("1.5 hours");

    expect(formatDuration(start, start)).toBeNull();
    expect(formatDuration(null, end)).toBeNull();

    expect(formatDate(start)).toContain("2026");
    expect(formatDateTime(start, "UTC")).toContain("2026");
    expect(formatTime(start, "UTC").toUpperCase()).toContain("AM");
  });

  it("validates meeting URLs correctly", () => {
    expect(isValidMeetingUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isValidMeetingUrl("http://zoom.us/j/123456789")).toBe(true);
    expect(isValidMeetingUrl("ftp://invalid.com")).toBe(false);
    expect(isValidMeetingUrl("not a url")).toBe(false);
    expect(isValidMeetingUrl("")).toBe(false);
    expect(isValidMeetingUrl(null)).toBe(false);
  });

  it("generates valid RFC 5545 iCalendar content", () => {
    const ics = generateIcsContent({
      title: "Technical Round",
      jobTitle: "Lead Full Stack Engineer",
      company: "Acme Corp",
      scheduledStart: new Date("2026-09-15T10:00:00Z"),
      scheduledEnd: new Date("2026-09-15T11:00:00Z"),
      timezone: "UTC",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      location: "Room 101",
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//HireSmart AI//Interview Calendar//EN");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Technical Round: Lead Full Stack Engineer at Acme Corp");
    expect(ics).toContain("DTSTART:20260915T100000Z");
    expect(ics).toContain("DTEND:20260915T110000Z");
    expect(ics).toContain("LOCATION:https://meet.google.com/abc-defg-hij");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });
});
